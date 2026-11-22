-- Cuadra · Nuevo estado del pedido: entregado
-- Va en un archivo aparte porque Postgres no deja usar un valor nuevo de un enum
-- en la misma transacción en que se agrega. Ejecutar ANTES de 007.

alter type public.estado_pedido add value if not exists 'entregado' after 'confirmado';
