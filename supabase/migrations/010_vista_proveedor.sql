-- Cuadra · Vista de proveedor para la demostración (sin clave)
--
-- Permite mostrar el otro lado del modelo: qué ve un mayorista cuando las tiendas
-- de un barrio juntan su demanda, y cómo publica una oferta con precios por volumen.
--
-- Es una VITRINA de demostración, no un acceso real de proveedores:
--   · Actúa siempre sobre el proveedor de ejemplo «Mayorista Central S.A.S.».
--   · Solo crea y borra sus propias ofertas nuevas (origen = 'vitrina'), máximo 5.
--   · No toca los productos base ni los pedidos; el reinicio de la demo las borra.
--   · Ve los pedidos de sus productos en agregado: cajas, tiendas y valor de la orden,
--     nunca cuántas cajas pidió cada tienda.

alter table public.productos add column if not exists origen text not null default 'base'
  check (origen in ('base', 'vitrina'));

create or replace function interno.proveedor_vitrina() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.proveedores
   where nombre in ('Mayorista Central S.A.S.', 'Mayorista Demo S.A.S. (ficticio)')
   order by creado limit 1
$$;

-- Panel del proveedor: sus productos y la demanda agregada de cada pedido
create or replace function public.vitrina_proveedor() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_pv uuid := interno.proveedor_vitrina();
begin
  if v_pv is null then raise exception 'La demo no tiene proveedor de ejemplo. Reinicia la demo.'; end if;
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
                                              'cobertura', pv.cobertura, 'flete_por_entrega', pv.flete_por_entrega)
                      from public.proveedores pv where pv.id = v_pv),
      'productos', (select coalesce(jsonb_agg(jsonb_build_object(
                       'id', p.id, 'nombre', p.nombre, 'empaque', p.empaque, 'precio_lista_caja', p.precio_lista_caja,
                       'origen', p.origen, 'objetivo_minimo', interno.objetivo_minimo(p.id),
                       'pedidos', (select count(*) from public.pedidos x where x.producto_id = p.id),
                       'escalas', (select coalesce(jsonb_agg(jsonb_build_object('cajas_min', e.cajas_min,
                                                    'descuento_pct', e.descuento_pct) order by e.cajas_min), '[]'::jsonb)
                                     from public.escalas_precio e where e.producto_id = p.id))
                     order by (p.origen = 'vitrina') desc, p.nombre), '[]'::jsonb)
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

-- Publicar una oferta nueva (mismas reglas que el panel de administración)
create or replace function public.vitrina_crear_oferta(
  p_nombre text, p_empaque text, p_precio numeric, p_escalas jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_pv    uuid := interno.proveedor_vitrina();
  v_id    uuid;
  v_n     int;
  v_malas int;
  v_min   int;
begin
  if v_pv is null then raise exception 'La demo no tiene proveedor de ejemplo. Reinicia la demo.'; end if;
  if (select count(*) from public.productos where proveedor_id = v_pv and origen = 'vitrina') >= 5 then
    raise exception 'La demo admite hasta 5 ofertas nuevas. Borra una o reinicia la demo.';
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

-- Retirar una oferta creada en la vitrina, si ninguna tienda la ha usado
create or replace function public.vitrina_eliminar_oferta(p_producto_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.productos
                  where id = p_producto_id and origen = 'vitrina' and proveedor_id = interno.proveedor_vitrina()) then
    raise exception 'Solo se pueden retirar las ofertas creadas en esta demo.';
  end if;
  if exists (select 1 from public.pedidos where producto_id = p_producto_id) then
    raise exception 'Esta oferta ya tiene pedidos de tiendas: no se puede retirar.';
  end if;
  delete from public.productos where id = p_producto_id;
  perform interno.notificar(null);
end $$;

revoke all on all functions in schema interno from public, anon, authenticated;
revoke all on function public.vitrina_proveedor(), public.vitrina_crear_oferta(text, text, numeric, jsonb),
  public.vitrina_eliminar_oferta(uuid) from public;
grant execute on function public.vitrina_proveedor(), public.vitrina_crear_oferta(text, text, numeric, jsonb),
  public.vitrina_eliminar_oferta(uuid) to anon, authenticated;
