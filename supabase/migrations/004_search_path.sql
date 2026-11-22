-- Fija search_path en funciones auxiliares (recomendación del asesor de seguridad de Supabase)
alter function interno.radio_km() set search_path = '';
alter function interno.descuento_minimo() set search_path = '';
alter function interno.valor_minimo_pedido() set search_path = '';
alter function interno.distancia_km(float8, float8, float8, float8) set search_path = '';
