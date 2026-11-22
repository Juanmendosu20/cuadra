-- Cuadra · Entrega en el punto de acopio, control de retención y transparencia del cobro
-- Requiere 006_estado_entregado.sql ya ejecutada.
--
-- 1. Ciclo completo del pedido: abierto → confirmado → entregado (o anulado).
--    La anfitriona marca qué vecinas ya recogieron sus cajas; cuando todas lo
--    hicieron, el pedido pasa a «entregado».
-- 2. Control de retención: lo que se cobra al cerrar nunca puede superar lo
--    retenido al reservar (cajas × precio de lista).
--      · Al abrir: el flete por caja debe caber en el ahorro por caja de la meta,
--        con un peso de margen por el redondeo del mayor residuo.
--      · Al cerrar: si aun así algún cobro superara lo retenido, el pedido se
--        anula y se devuelve todo (regla de todo o nada).
-- 3. Transparencia: la vista del pedido incluye el valor de la orden y la suma de
--    los cobros, para mostrarle al tendero que el reparto cuadra al peso.

alter table public.pedidos       add column if not exists entregado_en timestamptz;
alter table public.participaciones add column if not exists retirado_en  timestamptz;

-- ---------------------------------------------------------------------------
-- Cierre con control de retención
-- ---------------------------------------------------------------------------
create or replace function interno.cerrar(p_pedido uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ped     public.pedidos%rowtype;
  v_lista   numeric;
  v_total   int;
  v_desc    numeric;
  v_precio  numeric;
  v_excede  int;
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

    -- Ningún cobro puede superar lo retenido. Si pasara, todo o nada: se anula.
    select count(*) into v_excede
      from public.participaciones
     where pedido_id = p_pedido and monto_final > monto_reservado;

    if v_excede = 0 then
      update public.pedidos
         set estado = 'confirmado', descuento_final = v_desc,
             precio_caja_final = v_precio, cerrado_en = now()
       where id = p_pedido;

      perform interno.auditar(p_pedido, null, 'pedido_confirmado',
        jsonb_build_object('cajas', v_total, 'descuento_pct', v_desc, 'precio_caja', v_precio));
      perform interno.notificar(p_pedido);
      return;
    end if;

    perform interno.auditar(p_pedido, null, 'retencion_insuficiente',
      jsonb_build_object('tiendas_afectadas', v_excede));
  end if;

  -- Anulación: no se llegó a la meta (o la retención no alcanzaba). Se devuelve todo.
  update public.participaciones
     set estado_pago = 'devuelto', monto_final = 0,
         valor_mercancia = null, flete_asignado = null, actualizada = now()
   where pedido_id = p_pedido;
  update public.pedidos set estado = 'anulado', cerrado_en = now() where id = p_pedido;
  perform interno.auditar(p_pedido, null, 'pedido_anulado',
    jsonb_build_object('cajas', v_total, 'objetivo', v_ped.cajas_objetivo));
  perform interno.notificar(p_pedido);
end $$;

-- ---------------------------------------------------------------------------
-- Abrir: el flete tiene que caber en el ahorro de la meta
-- ---------------------------------------------------------------------------
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
  v_precio numeric;
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

  -- Retención suficiente: cada tienda paga como máximo cajas × precio de lista.
  -- Como el descuento solo sube con el volumen y el flete por caja solo baja,
  -- basta comprobarlo en la meta: flete ≤ meta × (ahorro por caja − 1 peso de redondeo).
  v_precio := round(v_prod.precio_lista_caja * (1 - interno.descuento(p_producto_id, p_cajas_objetivo) / 100));
  if v_flete > p_cajas_objetivo * (v_prod.precio_lista_caja - v_precio - 1) then
    raise exception 'Con esa meta el flete no cabe en el ahorro. Sube la meta del pedido.';
  end if;

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

-- ---------------------------------------------------------------------------
-- Vista del pedido: + valor de la orden, suma de cobros, entrega y retiro
-- ---------------------------------------------------------------------------
create or replace function interno.vista_pedido(p_pedido uuid, p_tienda uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with yo as (select lat, lng from public.tiendas where id = p_tienda),
  agg as (
    select coalesce(sum(cajas), 0)::int as total, count(*)::int as participantes,
           count(retirado_en)::int as retirados,
           sum(monto_final) filter (where estado_pago = 'liberado') as suma_cobros
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
    'entregado_en', pe.entregado_en,
    'flete_total', pe.flete_total,
    'total_cajas', agg.total,
    'participantes', agg.participantes,
    'retirados', agg.retirados,
    'descuento_actual', coalesce(pe.descuento_final, interno.descuento(pe.producto_id, agg.total)),
    'precio_caja_final', pe.precio_caja_final,
    'valor_orden', case when pe.precio_caja_final is not null
                        then agg.total * pe.precio_caja_final + pe.flete_total end,
    'suma_cobros', agg.suma_cobros,
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
                            'retirado_en', m.retirado_en,
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

-- ---------------------------------------------------------------------------
-- Lista de entrega: SOLO la anfitriona, SOLO con el pedido confirmado.
-- Es la única vista con cajas por tienda: quien entrega necesita saber
-- cuántas cajas recoge cada vecina.
-- ---------------------------------------------------------------------------
create or replace function public.lista_entrega(p_token uuid, p_pedido_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tienda uuid := interno.tienda_de(p_token);
  v_ped    public.pedidos%rowtype;
begin
  select * into v_ped from public.pedidos where id = p_pedido_id;
  if v_ped.id is null or v_ped.anfitrion_id <> v_tienda then
    raise exception 'Solo la tienda anfitriona puede ver la lista de entrega.';
  end if;
  if v_ped.estado not in ('confirmado', 'entregado') then
    raise exception 'La lista de entrega aparece cuando el pedido se confirma.';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'participacion_id', p.id,
             'tienda', t.nombre,
             'es_mia', p.tienda_id = v_tienda,
             'cajas', p.cajas,
             'retirado_en', p.retirado_en)
           order by (p.tienda_id = v_tienda) desc, t.nombre), '[]'::jsonb)
      from public.participaciones p join public.tiendas t on t.id = p.tienda_id
     where p.pedido_id = p_pedido_id
  );
end $$;

-- Marca (o desmarca) que una vecina recogió sus cajas. Cuando todas las recogieron,
-- el pedido pasa a «entregado»; si se desmarca alguna, vuelve a «confirmado».
create or replace function public.marcar_retiro(p_token uuid, p_participacion_id uuid, p_retirado boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tienda    uuid := interno.tienda_de(p_token);
  v_par       public.participaciones%rowtype;
  v_ped       public.pedidos%rowtype;
  v_nombre    text;
  v_pendientes int;
begin
  select * into v_par from public.participaciones where id = p_participacion_id;
  if v_par.id is null then raise exception 'Participación no encontrada.'; end if;

  select * into v_ped from public.pedidos where id = v_par.pedido_id for update;
  if v_ped.anfitrion_id <> v_tienda then
    raise exception 'Solo la tienda anfitriona puede marcar las entregas.';
  end if;
  if v_ped.estado not in ('confirmado', 'entregado') then
    raise exception 'Solo se marcan entregas de pedidos confirmados.';
  end if;

  update public.participaciones
     set retirado_en = case when p_retirado then coalesce(retirado_en, now()) end,
         actualizada = now()
   where id = p_participacion_id;

  select nombre into v_nombre from public.tiendas where id = v_par.tienda_id;
  perform interno.auditar(v_ped.id, v_tienda, 'entrega_marcada',
    jsonb_build_object('tienda', v_nombre, 'cajas', v_par.cajas, 'retirado', p_retirado));
  if p_retirado and v_par.tienda_id <> v_tienda then
    perform interno.auditar(v_ped.id, v_par.tienda_id, 'retiro_confirmado',
      jsonb_build_object('cajas', v_par.cajas));
  end if;

  select count(*) into v_pendientes
    from public.participaciones where pedido_id = v_ped.id and retirado_en is null;

  if v_pendientes = 0 and v_ped.estado = 'confirmado' then
    update public.pedidos set estado = 'entregado', entregado_en = now() where id = v_ped.id;
    perform interno.auditar(v_ped.id, v_tienda, 'pedido_entregado', '{}'::jsonb);
  elsif v_pendientes > 0 and v_ped.estado = 'entregado' then
    update public.pedidos set estado = 'confirmado', entregado_en = null where id = v_ped.id;
  end if;

  perform interno.notificar(v_ped.id);
  return interno.vista_pedido(v_ped.id, v_tienda);
end $$;

-- Permisos
revoke all on all functions in schema interno from public, anon, authenticated;
revoke all on function public.lista_entrega(uuid, uuid), public.marcar_retiro(uuid, uuid, boolean),
  public.abrir_pedido(uuid, uuid, int, int, text, int) from public;
grant execute on function public.lista_entrega(uuid, uuid), public.marcar_retiro(uuid, uuid, boolean),
  public.abrir_pedido(uuid, uuid, int, int, text, int) to anon, authenticated;
