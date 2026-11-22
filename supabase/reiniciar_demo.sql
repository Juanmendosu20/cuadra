-- Deja la base como recién sembrada (antes de una demo o de una prueba con tenderos).
-- Ejecutar en el editor SQL de Supabase y después correr de nuevo 003_datos_demo.sql.
truncate public.auditoria, public.participaciones, public.pedidos, public.sesiones,
         public.escalas_precio, public.productos, public.proveedores, public.tiendas
         restart identity cascade;
