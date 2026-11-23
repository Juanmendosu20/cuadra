-- Cuadra · La vista de proveedor permite elegir el proveedor
--
-- Requiere 010_vista_proveedor.sql. Cambia las funciones de la vitrina para recibir el
-- proveedor (si no se indica, sigue siendo Mayorista Central S.A.S.):
--   · Se puede VER la demanda de cualquier proveedor.
--   · Solo se PUBLICAN o retiran ofertas en los proveedores de la demo (origen = 'demo').
--     Los que carga el equipo en /admin no se tocan desde aquí, y así el reinicio de la
--     demo siempre borra lo que se creó en la vitrina.
--   · Cualquier oferta de un proveedor de demo se puede retirar (deja de ofrecerse) y volver a publicar.
-- Al final avisa a la API que recargue las funciones (notify pgrst).


-- Retirar una oferta = dejar de ofrecerla: no aparece en el directorio ni en el catálogo y
-- no se pueden abrir pedidos nuevos con ella; los pedidos que ya existen siguen su curso.
alter table public.productos add column if not exists activo boolean not null default true;

drop function if exists public.vitrina_proveedor();
drop function if exists public.vitrina_crear_oferta(text, text, numeric, jsonb);

create or replace function public.vitrina_proveedor(p_proveedor_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_pv uuid := coalesce(p_proveedor_id, interno.proveedor_vitrina());
begin
  if v_pv is null or not exists (select 1 from public.proveedores where id = v_pv) then
    raise exception 'No se encontró el proveedor. Reinicia la demo.';
  end if;
  perform interno.cerrar_vencidos();
  return (
    with ped as (
      select pe.id, pe.estado, pr.nombre as producto, pr.empaque, pr.precio_lista_caja,
             pe.cajas_objetivo, pe.fecha_cierre, pe.cerrado_en, pe.entregado_en, pe.punto_acopio,
             an.nombre as anfitriona, an.barrio, pe.flete_total, pe.precio_caja_final,
             coalesce(pe.descuento_final, interno.descuento(pe.producto_id,
               (select coalesce(sum(cajas), 0)::int from public.participaciones x where x.pedido_id = pe.id))) as descuento,
             (select coalesce(sum(cajas), 0)::int from public.participaciones x where x.pedido_id = pe.id) as total_cajas,
             (select count(*)::int from public.participaciones x where x.pedido_id = pe.id) as tiendas,
             (select count(retirado_en)::int from public.participaciones x where x.pedido_id = pe.id) as retirados
        from public.pedidos pe
        join public.productos pr on pr.id = pe.producto_id
        join public.tiendas an on an.id = pe.anfitrion_id
       where pr.proveedor_id = v_pv
    ),
    ped2 as (
      select p.*,
             case when p.precio_caja_final is not null then p.total_cajas * p.precio_caja_final end as valor_mercancia,
             case when p.precio_caja_final is not null then p.total_cajas * p.precio_caja_final + p.flete_total end as valor_orden,
             case when p.precio_caja_final is not null then round(p.total_cajas * p.precio_caja_final * 0.03) end as comision
        from ped p
    )
    select jsonb_build_object(
      'proveedor', (select jsonb_build_object('id', pv.id, 'nombre', pv.nombre, 'categoria', pv.categoria,
                                              'cobertura', pv.cobertura, 'flete_por_entrega', pv.flete_por_entrega,
                                              'editable', pv.origen = 'demo')
                      from public.proveedores pv where pv.id = v_pv),
      'proveedores', (select coalesce(jsonb_agg(jsonb_build_object('id', pv.id, 'nombre', pv.nombre,
                                                 'categoria', pv.categoria)
                                       order by (pv.id = interno.proveedor_vitrina()) desc, pv.nombre), '[]'::jsonb)
                        from public.proveedores pv),
      'productos', (select coalesce(jsonb_agg(jsonb_build_object(
                       'id', p.id, 'nombre', p.nombre, 'empaque', p.empaque, 'precio_lista_caja', p.precio_lista_caja,
                       'origen', p.origen, 'activo', p.activo, 'objetivo_minimo', interno.objetivo_minimo(p.id),
                       'pedidos', (select count(*) from public.pedidos x where x.producto_id = p.id),
                       'escalas', (select coalesce(jsonb_agg(jsonb_build_object('cajas_min', e.cajas_min,
                                                    'descuento_pct', e.descuento_pct) order by e.cajas_min), '[]'::jsonb)
                                     from public.escalas_precio e where e.producto_id = p.id))
                     order by p.activo desc, (p.origen = 'vitrina') desc, p.nombre), '[]'::jsonb)
                      from public.productos p where p.proveedor_id = v_pv),
      'pedidos', (select coalesce(jsonb_agg(to_jsonb(x) order by
                     case x.estado when 'abierto' then 1 when 'confirmado' then 0 when 'entregado' then 2 else 3 end,
                     x.fecha_cierre desc), '[]'::jsonb) from ped2 x),
      'resumen', (select jsonb_build_object(
                     'abiertos', count(*) filter (where estado = 'abierto'),
                     'por_despachar', count(*) filter (where estado = 'confirmado'),
                     'entregados', count(*) filter (where estado = 'entregado'),
                     'cajas_vendidas', coalesce(sum(total_cajas) filter (where estado in ('confirmado', 'entregado')), 0),
                     'ventas', coalesce(sum(valor_mercancia) filter (where estado in ('confirmado', 'entregado')), 0),
                     'comision', coalesce(sum(comision) filter (where estado in ('confirmado', 'entregado')), 0),
                     'tiendas_en_curso', coalesce(sum(tiendas) filter (where estado = 'abierto'), 0))
                    from ped2)
    )
  );
end $$;

create or replace function public.vitrina_crear_oferta(
  p_nombre text, p_empaque text, p_precio numeric, p_escalas jsonb, p_proveedor_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_pv    uuid := coalesce(p_proveedor_id, interno.proveedor_vitrina());
  v_id    uuid;
  v_n     int;
  v_malas int;
  v_min   int;
begin
  if not exists (select 1 from public.proveedores where id = v_pv) then
    raise exception 'No se encontró el proveedor. Reinicia la demo.';
  end if;
  if not exists (select 1 from public.proveedores where id = v_pv and origen = 'demo') then
    raise exception 'Este proveedor lo administra el equipo en /admin: desde la demo solo se publican ofertas de los proveedores de demostración.';
  end if;
  if (select count(*) from public.productos where proveedor_id = v_pv and origen = 'vitrina') >= 5 then
    raise exception 'La demo admite hasta 5 ofertas nuevas por proveedor. Borra una o reinicia la demo.';
  end if;
  if length(trim(coalesce(p_nombre, ''))) not between 3 and 60 then
    raise exception 'El nombre del producto debe tener entre 3 y 60 caracteres.';
  end if;
  if exists (select 1 from public.productos where proveedor_id = v_pv and lower(nombre) = lower(trim(p_nombre))) then
    raise exception 'Ya tienes un producto con ese nombre.';
  end if;
  if length(trim(coalesce(p_empaque, ''))) not between 3 and 40 then
    raise exception 'Indica el empaque (ej. «caja x 24 und.»).';
  end if;
  if coalesce(p_precio, 0) < 1000 or p_precio > 5000000 then
    raise exception 'El precio de lista por caja debe estar entre $1.000 y $5.000.000.';
  end if;
  if jsonb_typeof(p_escalas) <> 'array' or jsonb_array_length(p_escalas) not between 1 and 4 then
    raise exception 'Agrega entre 1 y 4 escalones de descuento.';
  end if;

  with e as (
    select (x->>'cajas_min')::int c, (x->>'descuento_pct')::numeric d from jsonb_array_elements(p_escalas) x
  )
  select count(*), count(*) filter (where c is null or d is null or c < 2 or c > 1000 or d < 0.5 or d > 60)
    into v_n, v_malas from e;
  if v_malas > 0 then
    raise exception 'Cada escalón necesita cajas (2 a 1000) y un descuento entre 0,5 %% y 60 %%.';
  end if;
  if (select count(distinct (x->>'cajas_min')::int) from jsonb_array_elements(p_escalas) x) <> v_n then
    raise exception 'Hay dos escalones con las mismas cajas.';
  end if;
  if exists (
    select 1 from (
      select d, lag(d) over (order by c) prev
        from (select (x->>'cajas_min')::int c, (x->>'descuento_pct')::numeric d
                from jsonb_array_elements(p_escalas) x) s
    ) t where d < prev
  ) then
    raise exception 'El descuento no puede bajar cuando sube el número de cajas.';
  end if;

  insert into public.productos (proveedor_id, nombre, empaque, precio_lista_caja, origen)
  values (v_pv, trim(p_nombre), trim(p_empaque), round(p_precio), 'vitrina')
  returning id into v_id;
  insert into public.escalas_precio (producto_id, cajas_min, descuento_pct)
  select v_id, (x->>'cajas_min')::int, round((x->>'descuento_pct')::numeric, 2)
    from jsonb_array_elements(p_escalas) x;

  v_min := interno.objetivo_minimo(v_id);
  if v_min is null then
    raise exception 'Con estas escalas ningún pedido ahorra de verdad: se necesita al menos un 5 %% de descuento, un pedido de $1.500.000 o más y que el flete quepa en el ahorro.';
  end if;

  perform interno.notificar(null);
  return jsonb_build_object('id', v_id, 'objetivo_minimo', v_min);
end $$;

-- Retirar una oferta: si es nueva y nadie la ha usado, se borra; si no, se deja de ofrecer.
create or replace function public.vitrina_eliminar_oferta(p_producto_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_p public.productos%rowtype;
begin
  select p.* into v_p from public.productos p join public.proveedores pv on pv.id = p.proveedor_id
   where p.id = p_producto_id and pv.origen = 'demo';
  if v_p.id is null then
    raise exception 'Solo se pueden retirar ofertas de los proveedores de demostración.';
  end if;
  if v_p.origen = 'vitrina' and not exists (select 1 from public.pedidos where producto_id = p_producto_id) then
    delete from public.productos where id = p_producto_id;
  else
    update public.productos set activo = false where id = p_producto_id;
  end if;
  perform interno.notificar(null);
end $$;

-- Volver a publicar una oferta retirada
create or replace function public.vitrina_publicar_oferta(p_producto_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.productos p set activo = true
    from public.proveedores pv
   where pv.id = p.proveedor_id and p.id = p_producto_id and pv.origen = 'demo';
  if not found then
    raise exception 'Solo se pueden publicar ofertas de los proveedores de demostración.';
  end if;
  perform interno.notificar(null);
end $$;

-- Las tiendas solo ven y piden productos en oferta
create or replace function interno.vista_proveedores() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', pv.id,
           'nombre', pv.nombre,
           'categoria', pv.categoria,
           'cobertura', pv.cobertura,
           'flete_por_entrega', pv.flete_por_entrega,
           'origen', pv.origen,
           'productos', (select coalesce(jsonb_agg(jsonb_build_object(
                                  'id', p.id, 'nombre', p.nombre, 'empaque', p.empaque,
                                  'precio_lista_caja', p.precio_lista_caja,
                                  'objetivo_minimo', interno.objetivo_minimo(p.id),
                                  'pedidos', (select count(*) from public.pedidos pe where pe.producto_id = p.id),
                                  'escalas', (select coalesce(jsonb_agg(jsonb_build_object(
                                                         'cajas_min', e.cajas_min, 'descuento_pct', e.descuento_pct)
                                                       order by e.cajas_min), '[]'::jsonb)
                                                from public.escalas_precio e where e.producto_id = p.id))
                                order by p.nombre), '[]'::jsonb)
                           from public.productos p where p.proveedor_id = pv.id and p.activo))
         order by pv.categoria, pv.nombre), '[]'::jsonb)
    from public.proveedores pv
$$;

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
     where p.activo
  );
end $$;

-- Abrir un pedido exige que el producto siga en oferta (resto igual a 007)
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
  if not v_prod.activo then raise exception 'Este producto ya no está en oferta.'; end if;

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

revoke all on all functions in schema interno from public, anon, authenticated;
revoke all on function public.vitrina_proveedor(uuid), public.vitrina_crear_oferta(text, text, numeric, jsonb, uuid),
  public.vitrina_eliminar_oferta(uuid), public.vitrina_publicar_oferta(uuid) from public;
grant execute on function public.vitrina_proveedor(uuid), public.vitrina_crear_oferta(text, text, numeric, jsonb, uuid),
  public.vitrina_eliminar_oferta(uuid), public.vitrina_publicar_oferta(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
