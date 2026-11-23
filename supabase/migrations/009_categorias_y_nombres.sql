-- Cuadra · Categorías administrables y nombres limpios de proveedores
--
-- 1. Las categorías ya no son texto libre: viven en su propia tabla y el
--    administrador puede agregar nuevas desde /admin.
-- 2. La cobertura se arma en /admin con localidad → barrio de Bogotá
--    (lib/bogota.ts); en la base sigue siendo texto.
-- 3. Los nombres de los proveedores ya no llevan «(ejemplo)» ni «(ficticio)»:
--    todo el prototipo es simulado y eso se declara en el informe, no en cada pantalla.

create table if not exists public.categorias (
  nombre text primary key check (length(trim(nombre)) between 3 and 40),
  creado timestamptz not null default now()
);
alter table public.categorias enable row level security;
revoke all on public.categorias from anon, authenticated;

insert into public.categorias (nombre)
values ('Abarrotes'), ('Granos'), ('Aseo'), ('Lácteos'), ('Bebidas'), ('Panadería'), ('Carnes frías'), ('Huevos')
on conflict do nothing;
insert into public.categorias (nombre) select distinct categoria from public.proveedores on conflict do nothing;

create or replace function public.admin_categorias(p_clave text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform interno.exigir_admin(p_clave);
  return (select coalesce(jsonb_agg(nombre order by nombre), '[]'::jsonb) from public.categorias);
end $$;

create or replace function public.admin_crear_categoria(p_clave text, p_nombre text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v text := initcap(trim(coalesce(p_nombre, '')));
begin
  perform interno.exigir_admin(p_clave);
  if length(v) not between 3 and 40 then
    raise exception 'La categoría debe tener entre 3 y 40 caracteres.';
  end if;
  if exists (select 1 from public.categorias where lower(nombre) = lower(v)) then
    raise exception 'Esa categoría ya existe.';
  end if;
  insert into public.categorias (nombre) values (v);
  return jsonb_build_object('nombre', v);
end $$;

-- Crear proveedor: la categoría debe existir y la cobertura es obligatoria
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
  if not exists (select 1 from public.categorias where nombre = p_categoria) then
    raise exception 'Elige una categoría de la lista (o créala primero).';
  end if;
  if length(trim(coalesce(p_cobertura, ''))) not between 3 and 600 then
    raise exception 'Agrega al menos una zona de cobertura.';
  end if;
  if coalesce(p_flete, -1) < 0 or p_flete > 1000000 then
    raise exception 'El flete por entrega debe estar entre $0 y $1.000.000.';
  end if;
  insert into public.proveedores (nombre, categoria, cobertura, flete_por_entrega, origen)
  values (trim(p_nombre), p_categoria, trim(p_cobertura), round(p_flete), 'admin')
  returning id into v_id;
  perform interno.notificar(null);
  return v_id;
end $$;

-- Proveedores adicionales de la demo, con nombres limpios
create or replace function interno.sembrar_proveedores_ejemplo() returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid; p uuid;
begin
  update public.proveedores
     set nombre = 'Mayorista Central S.A.S.', categoria = 'Abarrotes', cobertura = 'Kennedy, Bosa y Suba'
   where nombre in ('Mayorista Demo S.A.S. (ficticio)', 'Mayorista Central S.A.S.');

  insert into public.proveedores (nombre, categoria, cobertura, flete_por_entrega)
  values ('Distribuidora Granos del Sur', 'Granos', 'Kennedy y Bosa', 35000) returning id into v;
  insert into public.productos (proveedor_id, nombre, empaque, precio_lista_caja)
  values (v, 'Lenteja 500 g', 'paca x 25 und.', 112500) returning id into p;
  insert into public.escalas_precio values (p, 15, 5), (p, 30, 8), (p, 50, 11);
  insert into public.productos (proveedor_id, nombre, empaque, precio_lista_caja)
  values (v, 'Fríjol bola roja 500 g', 'paca x 25 und.', 147500) returning id into p;
  insert into public.escalas_precio values (p, 12, 5), (p, 25, 9);

  insert into public.proveedores (nombre, categoria, cobertura, flete_por_entrega)
  values ('Aseo Hogar Zonal', 'Aseo', 'Kennedy', 30000) returning id into v;
  insert into public.productos (proveedor_id, nombre, empaque, precio_lista_caja)
  values (v, 'Jabón en barra 300 g', 'caja x 40 und.', 96000) returning id into p;
  insert into public.escalas_precio values (p, 18, 6), (p, 35, 10);
  insert into public.productos (proveedor_id, nombre, empaque, precio_lista_caja)
  values (v, 'Papel higiénico x 4', 'paca x 12 und.', 84000) returning id into p;
  insert into public.escalas_precio values (p, 20, 5), (p, 40, 8);
end $$;

-- Renombra lo que ya está en la base
update public.proveedores set nombre = 'Mayorista Central S.A.S.' where nombre = 'Mayorista Demo S.A.S. (ficticio)';
update public.proveedores set nombre = trim(replace(replace(nombre, '(ejemplo)', ''), '(ficticio)', ''))
 where nombre like '%(ejemplo)%' or nombre like '%(ficticio)%';

revoke all on all functions in schema interno from public, anon, authenticated;
revoke all on function public.admin_categorias(text), public.admin_crear_categoria(text, text),
  public.admin_crear_proveedor(text, text, text, text, numeric) from public;
grant execute on function public.admin_categorias(text), public.admin_crear_categoria(text, text),
  public.admin_crear_proveedor(text, text, text, text, numeric) to anon, authenticated;
