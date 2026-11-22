-- Cuadra · Lógica del pedido conjunto
-- Funciones internas en el esquema "interno" (no expuesto por la API) y
-- funciones RPC públicas con SECURITY DEFINER que validan la sesión de la tienda.

create schema if not exists interno;
revoke all on schema interno from public, anon, authenticated;

-- Parámetros del modelo (Entrega 1, secciones 4.2 y 9.4)
create or replace function interno.radio_km() returns numeric
language sql immutable as $$ select 1.5 $$;
create or replace function interno.descuento_minimo() returns numeric
language sql immutable as $$ select 5.0 $$;          -- ahorro neto mínimo (%)
create or replace function interno.valor_minimo_pedido() returns numeric
language sql immutable as $$ select 1500000 $$;      -- COP

-- Sesión → tienda
create or replace function interno.tienda_de(p_token uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid;
begin
  select s.tienda_id into v from public.sesiones s
   where s.token = p_token and s.expira > now();
  if v is null then
    raise exception 'Sesión vencida. Vuelve a entrar.' using errcode = '28000';
  end if;
  return v;
end $$;

-- Distancia Haversine en km
create or replace function interno.distancia_km(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns numeric language sql immutable as $$
  select round((2 * 6371 * asin(sqrt(
           power(sin(radians(lat2 - lat1) / 2), 2) +
           cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
         )))::numeric, 2)
$$;

-- Descuento vigente para un volumen dado
create or replace function interno.descuento(p_producto uuid, p_cajas int) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((select e.descuento_pct from public.escalas_precio e
                    where e.producto_id = p_producto and e.cajas_min <= p_cajas
                    order by e.cajas_min desc limit 1), 0)
$$;

-- Volumen mínimo que cumple la regla de ahorro neto y el valor mínimo de pedido
create or replace function interno.objetivo_minimo(p_producto uuid) returns int
language sql stable security definer set search_path = '' as $$
  select min(c)::int from generate_series(1, 1000) c, public.productos p
   where p.id = p_producto
     and interno.descuento(p_producto, c) >= interno.descuento_minimo()
     and c * p.precio_lista_caja * (1 - interno.descuento(p_producto, c) / 100) >= interno.valor_minimo_pedido()
$$;

-- Aviso en tiempo real: solo viaja el id del pedido; cada cliente vuelve a consultar
create or replace function interno.notificar(p_pedido uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('pedido_id', p_pedido), 'cambio', 'pedidos', false);
exception when others then
  null;  -- el aviso nunca debe tumbar la transacción del pedido
end $$;

create or replace function interno.auditar(p_pedido uuid, p_tienda uuid, p_accion text, p_detalle jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.auditoria (pedido_id, tienda_id, accion, detalle)
  values (p_pedido, p_tienda, p_accion, coalesce(p_detalle, '{}'::jsonb))
$$;

-- Cierre de un pedido: regla todo-o-nada + prorrateo
create or replace function interno.cerrar(p_pedido uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ped    public.pedidos%rowtype;
  v_lista  numeric;
  v_total  int;
  v_desc   numeric;
  v_precio numeric;
begin
  select * into v_ped from public.pedidos where id = p_pedido for update;
  if v_ped.estado <> 'abierto' then return; end if;

  select precio_lista_caja into v_lista from public.productos where id = v_ped.producto_id;
  select coalesce(sum(cajas), 0) into v_total from public.participaciones where pedido_id = p_pedido;

  if v_total >= v_ped.cajas_objetivo then
    v_desc   := interno.descuento(v_ped.producto_id, v_total);
    v_precio := round(v_lista * (1 - v_desc / 100));

    -- Flete repartido por cajas con el método del mayor residuo:
    -- la suma de las partes es exactamente el flete total, en pesos enteros.
    -- Desempate determinista: quien se sumó primero.
    with base as (
      select p.id, p.creada,
             floor(v_ped.flete_total * p.cajas / v_total::numeric) as piso,
             (v_ped.flete_total * p.cajas / v_total::numeric)
               - floor(v_ped.flete_total * p.cajas / v_total::numeric) as resto
        from public.participaciones p where p.pedido_id = p_pedido
    ),
    faltan as (select v_ped.flete_total - sum(piso) as n from base),
    reparto as (
      select b.id,
             b.piso + case when row_number() over (order by b.resto desc, b.creada asc, b.id)
                               <= (select n from faltan) then 1 else 0 end as flete
        from base b
    )
    update public.participaciones p
       set valor_mercancia = p.cajas * v_precio,
           flete_asignado  = r.flete,
           monto_final     = p.cajas * v_precio + r.flete,
           estado_pago     = 'liberado',
           actualizada     = now()
      from reparto r
     where r.id = p.id;

    update public.pedidos
       set estado = 'confirmado', descuento_final = v_desc,
           precio_caja_final = v_precio, cerrado_en = now()
     where id = p_pedido;

    perform interno.auditar(p_pedido, null, 'pedido_confirmado',
      jsonb_build_object('cajas', v_total, 'descuento_pct', v_desc, 'precio_caja', v_precio));
  else
    update public.participaciones
       set estado_pago = 'devuelto', monto_final = 0, actualizada = now()
     where pedido_id = p_pedido;
    update public.pedidos set estado = 'anulado', cerrado_en = now() where id = p_pedido;
    perform interno.auditar(p_pedido, null, 'pedido_anulado',
      jsonb_build_object('cajas', v_total, 'objetivo', v_ped.cajas_objetivo));
  end if;

  perform interno.notificar(p_pedido);
end $$;

-- Cierra los pedidos cuya ventana ya venció (se llama al consultar)
create or replace function interno.cerrar_vencidos() returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select id from public.pedidos
            where estado = 'abierto' and fecha_cierre <= now()
            for update skip locked loop
    perform interno.cerrar(r.id);
  end loop;
end $$;

-- Vista de un pedido para una tienda: agregados + solo SU propia participación
create or replace function interno.vista_pedido(p_pedido uuid, p_tienda uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with yo as (select lat, lng from public.tiendas where id = p_tienda),
  agg as (
    select coalesce(sum(cajas), 0)::int as total, count(*)::int as participantes
      from public.participaciones where pedido_id = p_pedido
  ),
  mia as (select * from public.participaciones where pedido_id = p_pedido and tienda_id = p_tienda)
  select jsonb_build_object(
    'id', pe.id,
    'estado', pe.estado,
    'producto', pr.nombre,
    'producto_id', pr.id,
    'empaque', pr.empaque,
    'proveedor', pv.nombre,
    'precio_lista_caja', pr.precio_lista_caja,
    'punto_acopio', pe.punto_acopio,
    'anfitrion', an.nombre,
    'soy_anfitrion', pe.anfitrion_id = p_tienda,
    'distancia_km', interno.distancia_km(yo.lat, yo.lng, an.lat, an.lng),
    'cajas_objetivo', pe.cajas_objetivo,
    'cajas_maximas', pe.cajas_maximas,
    'fecha_cierre', pe.fecha_cierre,
    'cerrado_en', pe.cerrado_en,
    'flete_total', pe.flete_total,
    'total_cajas', agg.total,
    'participantes', agg.participantes,
    'descuento_actual', coalesce(pe.descuento_final, interno.descuento(pe.producto_id, agg.total)),
    'precio_caja_final', pe.precio_caja_final,
    'siguiente_escalon', (select jsonb_build_object('cajas_min', e.cajas_min, 'descuento_pct', e.descuento_pct)
                            from public.escalas_precio e
                           where e.producto_id = pe.producto_id and e.cajas_min > agg.total
                           order by e.cajas_min limit 1),
    'escalas', (select jsonb_agg(jsonb_build_object('cajas_min', e.cajas_min, 'descuento_pct', e.descuento_pct)
                                 order by e.cajas_min)
                  from public.escalas_precio e where e.producto_id = pe.producto_id),
    'mi_participacion', (select jsonb_build_object(
                            'cajas', m.cajas,
                            'estado_pago', m.estado_pago,
                            'monto_reservado', m.monto_reservado,
                            'valor_mercancia', m.valor_mercancia,
                            'flete_asignado', m.flete_asignado,
                            'monto_final', m.monto_final,
                            'costo_comprando_solo', m.cajas * pr.precio_lista_caja,
                            'ahorro', case when m.monto_final > 0
                                           then m.cajas * pr.precio_lista_caja - m.monto_final end)
                           from mia m)
  )
  from public.pedidos pe
  join public.productos pr on pr.id = pe.producto_id
  join public.proveedores pv on pv.id = pr.proveedor_id
  join public.tiendas an on an.id = pe.anfitrion_id
  cross join yo cross join agg
  where pe.id = p_pedido
$$;

-- =====================================================================
-- RPC públicas
-- =====================================================================

create or replace function public.listar_tiendas()
returns table (id uuid, nombre text, barrio text)
language sql stable security definer set search_path = '' as $$
  select t.id, t.nombre, t.barrio from public.tiendas t order by t.barrio, t.nombre
$$;

create or replace function public.iniciar_sesion(p_tienda_id uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_t public.tiendas%rowtype;
  v_token uuid;
begin
  select * into v_t from public.tiendas where id = p_tienda_id;
  if v_t.id is null or v_t.pin_hash <> extensions.crypt(p_pin, v_t.pin_hash) then
    raise exception 'Tienda o PIN incorrecto.' using errcode = '28000';
  end if;
  delete from public.sesiones where tienda_id = v_t.id and expira < now();
  insert into public.sesiones (tienda_id) values (v_t.id) returning token into v_token;
  return jsonb_build_object('token', v_token,
    'tienda', jsonb_build_object('id', v_t.id, 'nombre', v_t.nombre, 'barrio', v_t.barrio));
end $$;

create or replace function public.catalogo(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform interno.tienda_de(p_token);
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id, 'nombre', p.nombre, 'empaque', p.empaque,
             'proveedor', pv.nombre, 'precio_lista_caja', p.precio_lista_caja,
             'objetivo_minimo', interno.objetivo_minimo(p.id),
             'escalas', (select jsonb_agg(jsonb_build_object('cajas_min', e.cajas_min,
                                                              'descuento_pct', e.descuento_pct)
                                          order by e.cajas_min)
                           from public.escalas_precio e where e.producto_id = p.id)
           ) order by p.nombre), '[]'::jsonb)
      from public.productos p join public.proveedores pv on pv.id = p.proveedor_id
  );
end $$;

create or replace function public.listar_pedidos(p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_tienda uuid := interno.tienda_de(p_token);
begin
  perform interno.cerrar_vencidos();
  return (
    select coalesce(jsonb_agg(interno.vista_pedido(pe.id, v_tienda)
                              order by (pe.estado = 'abierto') desc, pe.fecha_cierre), '[]'::jsonb)
      from public.pedidos pe
      join public.tiendas an on an.id = pe.anfitrion_id
      join public.tiendas yo on yo.id = v_tienda
     where interno.distancia_km(yo.lat, yo.lng, an.lat, an.lng) <= interno.radio_km()
       and (pe.estado = 'abierto'
            or pe.anfitrion_id = v_tienda
            or exists (select 1 from public.participaciones x
                        where x.pedido_id = pe.id and x.tienda_id = v_tienda))
  );
end $$;

create or replace function public.abrir_pedido(
  p_token uuid, p_producto_id uuid, p_cajas_objetivo int, p_horas int,
  p_punto_acopio text, p_mis_cajas int
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tienda uuid := interno.tienda_de(p_token);
  v_prod   public.productos%rowtype;
  v_flete  numeric;
  v_min    int;
  v_id     uuid;
begin
  select * into v_prod from public.productos where id = p_producto_id;
  if v_prod.id is null then raise exception 'Producto no encontrado.'; end if;

  v_min := interno.objetivo_minimo(p_producto_id);
  if v_min is null or p_cajas_objetivo < v_min then
    raise exception 'El objetivo debe ser de al menos % cajas para que el pedido ahorre de verdad.', v_min;
  end if;
  if p_horas not between 1 and 168 then
    raise exception 'La ventana debe durar entre 1 hora y 7 días.';
  end if;
  if p_mis_cajas < 1 or p_mis_cajas > p_cajas_objetivo * 2 then
    raise exception 'Tus cajas deben estar entre 1 y %.', p_cajas_objetivo * 2;
  end if;
  if coalesce(trim(p_punto_acopio), '') = '' then
    raise exception 'Indica el punto de acopio.';
  end if;

  select flete_por_entrega into v_flete from public.proveedores where id = v_prod.proveedor_id;

  insert into public.pedidos (producto_id, anfitrion_id, punto_acopio, cajas_objetivo,
                              cajas_maximas, fecha_cierre, flete_total)
  values (p_producto_id, v_tienda, trim(p_punto_acopio), p_cajas_objetivo,
          p_cajas_objetivo * 2, now() + make_interval(hours => p_horas), v_flete)
  returning id into v_id;

  insert into public.participaciones (pedido_id, tienda_id, cajas, monto_reservado)
  values (v_id, v_tienda, p_mis_cajas, p_mis_cajas * v_prod.precio_lista_caja);

  perform interno.auditar(v_id, v_tienda, 'pedido_abierto',
    jsonb_build_object('objetivo', p_cajas_objetivo, 'horas', p_horas, 'cajas', p_mis_cajas));
  perform interno.notificar(v_id);
  return interno.vista_pedido(v_id, v_tienda);
end $$;

-- Sumarse / cambiar cajas / retirarse (p_cajas = 0). Atómico: bloquea el pedido.
create or replace function public.sumarse(p_token uuid, p_pedido_id uuid, p_cajas int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tienda uuid := interno.tienda_de(p_token);
  v_ped    public.pedidos%rowtype;
  v_lista  numeric;
  v_otros  int;
  v_dist   numeric;
begin
  -- El bloqueo de fila serializa las uniones simultáneas al mismo pedido
  select * into v_ped from public.pedidos where id = p_pedido_id for update;
  if v_ped.id is null then raise exception 'Pedido no encontrado.'; end if;
  if v_ped.estado <> 'abierto' or v_ped.fecha_cierre <= now() then
    raise exception 'Este pedido ya cerró.';
  end if;

  select interno.distancia_km(yo.lat, yo.lng, an.lat, an.lng) into v_dist
    from public.tiendas yo, public.tiendas an
   where yo.id = v_tienda and an.id = v_ped.anfitrion_id;
  if v_dist > interno.radio_km() then
    raise exception 'Este pedido está fuera de tu zona.';
  end if;

  if p_cajas < 0 then raise exception 'Cantidad inválida.'; end if;
  if p_cajas = 0 and v_ped.anfitrion_id = v_tienda then
    raise exception 'La tienda anfitriona no puede retirarse de su propio pedido.';
  end if;

  select coalesce(sum(cajas), 0) into v_otros
    from public.participaciones where pedido_id = p_pedido_id and tienda_id <> v_tienda;
  if v_otros + p_cajas > v_ped.cajas_maximas then
    raise exception 'Solo quedan % cajas disponibles en este pedido.', v_ped.cajas_maximas - v_otros;
  end if;

  select precio_lista_caja into v_lista from public.productos where id = v_ped.producto_id;

  if p_cajas = 0 then
    delete from public.participaciones where pedido_id = p_pedido_id and tienda_id = v_tienda;
    perform interno.auditar(p_pedido_id, v_tienda, 'retiro', '{}'::jsonb);
  else
    insert into public.participaciones (pedido_id, tienda_id, cajas, monto_reservado)
    values (p_pedido_id, v_tienda, p_cajas, p_cajas * v_lista)
    on conflict (pedido_id, tienda_id) do update
      set cajas = excluded.cajas, monto_reservado = excluded.monto_reservado, actualizada = now();
    perform interno.auditar(p_pedido_id, v_tienda, 'reserva', jsonb_build_object('cajas', p_cajas));
  end if;

  perform interno.notificar(p_pedido_id);
  return interno.vista_pedido(p_pedido_id, v_tienda);
end $$;

-- Solo para demostración: la anfitriona puede cerrar la ventana ya mismo
create or replace function public.cerrar_ahora(p_token uuid, p_pedido_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_tienda uuid := interno.tienda_de(p_token);
begin
  if not exists (select 1 from public.pedidos where id = p_pedido_id and anfitrion_id = v_tienda) then
    raise exception 'Solo la tienda anfitriona puede cerrar el pedido.';
  end if;
  update public.pedidos set fecha_cierre = now() where id = p_pedido_id and estado = 'abierto';
  perform interno.auditar(p_pedido_id, v_tienda, 'cierre_manual', '{}'::jsonb);
  perform interno.cerrar(p_pedido_id);
  return interno.vista_pedido(p_pedido_id, v_tienda);
end $$;

-- Movimientos propios (trazabilidad para el tendero)
create or replace function public.mis_movimientos(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_tienda uuid := interno.tienda_de(p_token);
begin
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'accion', a.accion, 'detalle', a.detalle, 'creado', a.creado, 'producto', pr.nombre)
           order by a.creado desc), '[]'::jsonb)
      from (select * from public.auditoria where tienda_id = v_tienda order by creado desc limit 30) a
      left join public.pedidos pe on pe.id = a.pedido_id
      left join public.productos pr on pr.id = pe.producto_id
  );
end $$;

-- Permisos: solo las RPC públicas son ejecutables por el cliente
revoke all on all functions in schema interno from public, anon, authenticated;
revoke all on function public.listar_tiendas(), public.iniciar_sesion(uuid, text),
  public.catalogo(uuid), public.listar_pedidos(uuid),
  public.abrir_pedido(uuid, uuid, int, int, text, int), public.sumarse(uuid, uuid, int),
  public.cerrar_ahora(uuid, uuid), public.mis_movimientos(uuid) from public;
grant execute on function public.listar_tiendas(), public.iniciar_sesion(uuid, text),
  public.catalogo(uuid), public.listar_pedidos(uuid),
  public.abrir_pedido(uuid, uuid, int, int, text, int), public.sumarse(uuid, uuid, int),
  public.cerrar_ahora(uuid, uuid), public.mis_movimientos(uuid) to anon, authenticated;
