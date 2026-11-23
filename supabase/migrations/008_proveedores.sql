-- Cuadra · Directorio de proveedores y panel de administración
--
-- Los proveedores NO se registran solos: Cuadra retiene dinero del tendero mientras
-- se completa el pedido, así que cada proveedor lo da de alta el equipo, que verifica
-- la cotización escrita con las escalas de precio por volumen (hipótesis H3).
--
--   · Las tiendas ven el directorio con listar_proveedores(token): proveedor, categoría,
--     cobertura, flete, productos, escalas y la meta mínima viable de cada producto.
--   · El administrador usa /admin con la misma clave del modo entrevistador.
--   · Los proveedores de la demo son de EJEMPLO: nombres y precios no son de empresas reales.

alter table public.proveedores add column if not exists categoria text not null default 'Abarrotes';
alter table public.proveedores add column if not exists cobertura text not null default 'Kennedy y Bosa';
alter table public.proveedores add column if not exists creado    timestamptz not null default now();
-- 'admin' = lo cargó el equipo desde /admin: sobrevive al «Reiniciar la demo»
alter table public.proveedores add column if not exists origen    text not null default 'demo'
  check (origen in ('demo', 'admin'));

-- ---------------------------------------------------------------------------
-- Clave de administración (la misma del entrevistador, guardada como hash)
-- ---------------------------------------------------------------------------
create or replace function interno.exigir_admin(p_clave text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_hash text;
begin
  select valor into v_hash from public.config where clave = 'clave_facilitador';
  if v_hash is null or coalesce(p_clave, '') = '' or v_hash <> extensions.crypt(p_clave, v_hash) then
    perform pg_sleep(1);  -- frena intentos de adivinar la clave
    raise exception 'Clave incorrecta.' using errcode = '28000';
  end if;
end $$;

-- Proveedores con sus productos (lo usan tanto el directorio como el panel)
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
                           from public.productos p where p.proveedor_id = pv.id))
         order by pv.categoria, pv.nombre), '[]'::jsonb)
    from public.proveedores pv
$$;

-- Directorio para las tiendas (requiere sesión)
create or replace function public.listar_proveedores(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform interno.tienda_de(p_token);
  return interno.vista_proveedores();
end $$;

-- ---------------------------------------------------------------------------
-- Panel de administración
-- ---------------------------------------------------------------------------
create or replace function public.admin_listar_proveedores(p_clave text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform interno.exigir_admin(p_clave);
  return interno.vista_proveedores();
end $$;

create or replace function public.admin_crear_proveedor(
  p_clave text, p_nombre text, p_categoria text, p_cobertura text, p_flete numeric
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform interno.exigir_admin(p_clave);
  if length(trim(coalesce(p_nombre, ''))) not between 3 and 80 then
    raise exception 'El nombre del proveedor debe tener entre 3 y 80 caracteres.';
  end if;
  if exists (select 1 from public.proveedores where lower(nombre) = lower(trim(p_nombre))) then
    raise exception 'Ya existe un proveedor con ese nombre.';
  end if;
  if coalesce(p_flete, -1) < 0 or p_flete > 1000000 then
    raise exception 'El flete por entrega debe estar entre $0 y $1.000.000.';
  end if;
  insert into public.proveedores (nombre, categoria, cobertura, flete_por_entrega, origen)
  values (trim(p_nombre), coalesce(nullif(trim(p_categoria), ''), 'Abarrotes'),
          coalesce(nullif(trim(p_cobertura), ''), 'Sin definir'), round(p_flete), 'admin')
  returning id into v_id;
  perform interno.notificar(null);
  return v_id;
end $$;

-- p_escalas: [{"cajas_min": 20, "descuento_pct": 5}, ...]
create or replace function public.admin_crear_producto(
  p_clave text, p_proveedor_id uuid, p_nombre text, p_empaque text, p_precio numeric, p_escalas jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id    uuid;
  v_n     int;
  v_malas int;
  v_min   int;
begin
  perform interno.exigir_admin(p_clave);
  if not exists (select 1 from public.proveedores where id = p_proveedor_id) then
    raise exception 'Proveedor no encontrado.';
  end if;
  if length(trim(coalesce(p_nombre, ''))) not between 3 and 80 then
    raise exception 'El nombre del producto debe tener entre 3 y 80 caracteres.';
  end if;
  if length(trim(coalesce(p_empaque, ''))) not between 3 and 40 then
    raise exception 'Indica el empaque (ej. «caja x 24 und.»).';
  end if;
  if coalesce(p_precio, 0) < 1000 or p_precio > 5000000 then
    raise exception 'El precio de lista por caja debe estar entre $1.000 y $5.000.000.';
  end if;
  if jsonb_typeof(p_escalas) <> 'array' or jsonb_array_length(p_escalas) not between 1 and 6 then
    raise exception 'Agrega entre 1 y 6 escalones de descuento.';
  end if;

  -- Escalones: cajas enteras ≥ 2, descuento entre 0,5 % y 60 %, sin repetir cajas,
  -- y el descuento nunca baja cuando sube el volumen (de eso depende el control de retención).
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

  insert into public.productos (proveedor_id, nombre, empaque, precio_lista_caja)
  values (p_proveedor_id, trim(p_nombre), trim(p_empaque), round(p_precio))
  returning id into v_id;
  insert into public.escalas_precio (producto_id, cajas_min, descuento_pct)
  select v_id, (x->>'cajas_min')::int, round((x->>'descuento_pct')::numeric, 2)
    from jsonb_array_elements(p_escalas) x;

  -- Si con estas escalas ninguna meta ahorra de verdad (−5 %, $1.500.000 y flete cubierto),
  -- el producto no se publica: no tendría sentido abrir pedidos con él.
  v_min := interno.objetivo_minimo(v_id);
  if v_min is null then
    raise exception 'Con estas escalas ningún pedido ahorra de verdad: se necesita al menos un 5 %% de descuento, un pedido de $1.500.000 o más y que el flete quepa en el ahorro.';
  end if;

  perform interno.notificar(null);
  return jsonb_build_object('id', v_id, 'objetivo_minimo', v_min);
end $$;

-- Solo se pueden borrar productos o proveedores que nunca se han usado en un pedido
create or replace function public.admin_eliminar_producto(p_clave text, p_producto_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform interno.exigir_admin(p_clave);
  if exists (select 1 from public.pedidos where producto_id = p_producto_id) then
    raise exception 'Este producto ya tiene pedidos: no se puede borrar.';
  end if;
  delete from public.productos where id = p_producto_id;
  perform interno.notificar(null);
end $$;

create or replace function public.admin_eliminar_proveedor(p_clave text, p_proveedor_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform interno.exigir_admin(p_clave);
  if exists (select 1 from public.productos where proveedor_id = p_proveedor_id) then
    raise exception 'Borra primero los productos de este proveedor.';
  end if;
  delete from public.proveedores where id = p_proveedor_id;
  perform interno.notificar(null);
end $$;

-- ---------------------------------------------------------------------------
-- Proveedores de ejemplo adicionales (se siembran también al reiniciar la demo)
-- ---------------------------------------------------------------------------
create or replace function interno.sembrar_proveedores_ejemplo() returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid; p uuid;
begin
  update public.proveedores set categoria = 'Abarrotes', cobertura = 'Kennedy, Bosa y Suba'
   where nombre = 'Mayorista Demo S.A.S. (ficticio)';

  insert into public.proveedores (nombre, categoria, cobertura, flete_por_entrega)
  values ('Distribuidora Granos del Sur (ejemplo)', 'Granos', 'Kennedy y Bosa', 35000) returning id into v;
  insert into public.productos (proveedor_id, nombre, empaque, precio_lista_caja)
  values (v, 'Lenteja 500 g', 'paca x 25 und.', 112500) returning id into p;
  insert into public.escalas_precio values (p, 15, 5), (p, 30, 8), (p, 50, 11);
  insert into public.productos (proveedor_id, nombre, empaque, precio_lista_caja)
  values (v, 'Fríjol bola roja 500 g', 'paca x 25 und.', 147500) returning id into p;
  insert into public.escalas_precio values (p, 12, 5), (p, 25, 9);

  insert into public.proveedores (nombre, categoria, cobertura, flete_por_entrega)
  values ('Aseo Hogar Zonal (ejemplo)', 'Aseo', 'Kennedy', 30000) returning id into v;
  insert into public.productos (proveedor_id, nombre, empaque, precio_lista_caja)
  values (v, 'Jabón en barra 300 g', 'caja x 40 und.', 96000) returning id into p;
  insert into public.escalas_precio values (p, 18, 6), (p, 35, 10);
  insert into public.productos (proveedor_id, nombre, empaque, precio_lista_caja)
  values (v, 'Papel higiénico x 4', 'paca x 12 und.', 84000) returning id into p;
  insert into public.escalas_precio values (p, 20, 5), (p, 40, 8);
end $$;

create or replace function public.reiniciar_demo(p_clave text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform interno.exigir_admin(p_clave);

  -- Guarda lo que cargó el administrador para volver a ponerlo después del reinicio
  create temp table _pv on commit drop as select * from public.proveedores where origen = 'admin';
  create temp table _pr on commit drop as
    select * from public.productos where proveedor_id in (select id from pg_temp._pv);
  create temp table _es on commit drop as
    select * from public.escalas_precio where producto_id in (select id from pg_temp._pr);

  truncate public.auditoria, public.participaciones, public.pedidos, public.sesiones,
           public.escalas_precio, public.productos, public.proveedores, public.tiendas
           restart identity cascade;
  perform interno.sembrar_demo();
  perform interno.sembrar_proveedores_ejemplo();

  insert into public.proveedores select * from pg_temp._pv;
  insert into public.productos select * from pg_temp._pr;
  insert into public.escalas_precio select * from pg_temp._es;

  perform interno.notificar(null);
  return jsonb_build_object('ok', true, 'reiniciado_en', now());
end $$;

-- Siembra los de ejemplo en la base actual si aún no están
do $$
begin
  if not exists (select 1 from public.proveedores where nombre like '%(ejemplo)') then
    perform interno.sembrar_proveedores_ejemplo();
  end if;
end $$;

-- Permisos
revoke all on all functions in schema interno from public, anon, authenticated;
revoke all on function public.listar_proveedores(uuid), public.admin_listar_proveedores(text),
  public.admin_crear_proveedor(text, text, text, text, numeric),
  public.admin_crear_producto(text, uuid, text, text, numeric, jsonb),
  public.admin_eliminar_producto(text, uuid), public.admin_eliminar_proveedor(text, uuid),
  public.reiniciar_demo(text) from public;
grant execute on function public.listar_proveedores(uuid), public.admin_listar_proveedores(text),
  public.admin_crear_proveedor(text, text, text, text, numeric),
  public.admin_crear_producto(text, uuid, text, text, numeric, jsonb),
  public.admin_eliminar_producto(text, uuid), public.admin_eliminar_proveedor(text, uuid),
  public.reiniciar_demo(text) to anon, authenticated;
