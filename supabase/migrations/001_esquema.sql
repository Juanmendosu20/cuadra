-- Cuadra · Esquema base
-- Todas las tablas quedan cerradas al cliente (RLS sin políticas + REVOKE).
-- El acceso es solo por funciones RPC (ver 002_logica.sql), que devuelven
-- agregados: ninguna tienda puede leer los volúmenes individuales de sus vecinas.

create table public.tiendas (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  barrio      text not null,
  lat         double precision not null,
  lng         double precision not null,
  pin_hash    text not null,
  creada      timestamptz not null default now()
);

create table public.sesiones (
  token      uuid primary key default gen_random_uuid(),
  tienda_id  uuid not null references public.tiendas(id) on delete cascade,
  creada     timestamptz not null default now(),
  expira     timestamptz not null default now() + interval '12 hours'
);

create table public.proveedores (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null,
  flete_por_entrega numeric(12,0) not null default 40000
);

create table public.productos (
  id                 uuid primary key default gen_random_uuid(),
  proveedor_id       uuid not null references public.proveedores(id),
  nombre             text not null,
  empaque            text not null,           -- ej. "caja x 24 und."
  precio_lista_caja  numeric(12,0) not null check (precio_lista_caja > 0)
);

-- Escalones de precio por volumen del proveedor
create table public.escalas_precio (
  producto_id    uuid not null references public.productos(id) on delete cascade,
  cajas_min      int  not null check (cajas_min >= 1),
  descuento_pct  numeric(5,2) not null check (descuento_pct >= 0 and descuento_pct < 100),
  primary key (producto_id, cajas_min)
);

create type public.estado_pedido as enum ('abierto', 'confirmado', 'anulado');
create type public.estado_pago   as enum ('reservado', 'liberado', 'devuelto');

create table public.pedidos (
  id                 uuid primary key default gen_random_uuid(),
  producto_id        uuid not null references public.productos(id),
  anfitrion_id       uuid not null references public.tiendas(id),
  punto_acopio       text not null,
  cajas_objetivo     int  not null check (cajas_objetivo > 0),
  cajas_maximas      int  not null,
  fecha_cierre       timestamptz not null,
  estado             public.estado_pedido not null default 'abierto',
  descuento_final    numeric(5,2),
  precio_caja_final  numeric(12,0),
  flete_total        numeric(12,0) not null,
  cerrado_en         timestamptz,
  creado             timestamptz not null default now(),
  check (cajas_maximas >= cajas_objetivo)
);

create table public.participaciones (
  id                uuid primary key default gen_random_uuid(),
  pedido_id         uuid not null references public.pedidos(id) on delete cascade,
  tienda_id         uuid not null references public.tiendas(id),
  cajas             int  not null check (cajas > 0),
  monto_reservado   numeric(12,0) not null,
  estado_pago       public.estado_pago not null default 'reservado',
  valor_mercancia   numeric(12,0),
  flete_asignado    numeric(12,0),
  monto_final       numeric(12,0),
  creada            timestamptz not null default now(),
  actualizada       timestamptz not null default now(),
  unique (pedido_id, tienda_id)
);

-- Registro auditable de cada acto (Ley 527: trazas íntegras y atribuibles)
create table public.auditoria (
  id         bigint generated always as identity primary key,
  pedido_id  uuid references public.pedidos(id) on delete cascade,
  tienda_id  uuid references public.tiendas(id),
  accion     text not null,
  detalle    jsonb not null default '{}'::jsonb,
  creado     timestamptz not null default now()
);

create index on public.participaciones (pedido_id);
create index on public.participaciones (tienda_id);
create index on public.pedidos (estado, fecha_cierre);
create index on public.pedidos (producto_id);
create index on public.pedidos (anfitrion_id);
create index on public.productos (proveedor_id);
create index on public.sesiones (tienda_id);
create index on public.auditoria (pedido_id);
create index on public.auditoria (tienda_id);

-- Cerrar todo al cliente
do $$
declare t text;
begin
  foreach t in array array['tiendas','sesiones','proveedores','productos','escalas_precio',
                           'pedidos','participaciones','auditoria'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
