-- Cuadra · Datos sintéticos de demostración
-- Tiendas, proveedor y precios son FICTICIOS (valores de referencia, no cotizaciones reales).
-- PIN de todas las tiendas demo: 1234

do $$
declare
  v_prov uuid;
  arroz uuid; aceite uuid; gaseosa uuid; azucar uuid; huevo uuid;
  t_rosa uuid; t_vecino uuid; t_jorge uuid; t_pinos uuid; t_judas uuid;
  t_economia uuid; t_barrio uuid; t_carmen uuid; t_paisa uuid; t_38 uuid;
  t_suba1 uuid; t_suba2 uuid;
  p uuid;
  pin text := extensions.crypt('1234', extensions.gen_salt('bf'));
begin
  -- Tiendas: 10 en Timiza (Kennedy) a pocas cuadras entre sí, 2 en Suba (fuera de zona)
  insert into public.tiendas (nombre, barrio, lat, lng, pin_hash) values
    ('Tienda Doña Rosa',            'Timiza', 4.60705, -74.15010, pin) returning id into t_rosa;
  insert into public.tiendas (nombre, barrio, lat, lng, pin_hash) values
    ('Autoservicio El Vecino',      'Timiza', 4.60820, -74.14890, pin) returning id into t_vecino;
  insert into public.tiendas (nombre, barrio, lat, lng, pin_hash) values
    ('La Esquina de Don Jorge',     'Timiza', 4.60590, -74.15120, pin) returning id into t_jorge;
  insert into public.tiendas (nombre, barrio, lat, lng, pin_hash) values
    ('Minimercado Los Pinos',       'Timiza', 4.60910, -74.15200, pin) returning id into t_pinos;
  insert into public.tiendas (nombre, barrio, lat, lng, pin_hash) values
    ('Tienda San Judas',            'Timiza', 4.60480, -74.14950, pin) returning id into t_judas;
  insert into public.tiendas (nombre, barrio, lat, lng, pin_hash) values
    ('Granero La Economía',         'Timiza', 4.61030, -74.15050, pin) returning id into t_economia;
  insert into public.tiendas (nombre, barrio, lat, lng, pin_hash) values
    ('Tienda Mi Barrio',            'Timiza', 4.60650, -74.14780, pin) returning id into t_barrio;
  insert into public.tiendas (nombre, barrio, lat, lng, pin_hash) values
    ('Tienda Carmencita',           'Timiza', 4.60770, -74.15330, pin) returning id into t_carmen;
  insert into public.tiendas (nombre, barrio, lat, lng, pin_hash) values
    ('Tienda El Paisa',             'Timiza', 4.60390, -74.15180, pin) returning id into t_paisa;
  insert into public.tiendas (nombre, barrio, lat, lng, pin_hash) values
    ('Supertienda La 38',           'Timiza', 4.61120, -74.14830, pin) returning id into t_38;
  insert into public.tiendas (nombre, barrio, lat, lng, pin_hash) values
    ('Tienda El Rincón de Suba',    'Suba',   4.74210, -74.08390, pin) returning id into t_suba1;
  insert into public.tiendas (nombre, barrio, lat, lng, pin_hash) values
    ('Autoservicio La Gaitana',     'Suba',   4.74350, -74.08250, pin) returning id into t_suba2;

  insert into public.proveedores (nombre, flete_por_entrega)
  values ('Mayorista Demo S.A.S. (ficticio)', 40000) returning id into v_prov;

  insert into public.productos (proveedor_id, nombre, empaque, precio_lista_caja) values
    (v_prov, 'Arroz blanco 500 g',     'caja x 24 und.', 62400)   returning id into arroz;
  insert into public.productos (proveedor_id, nombre, empaque, precio_lista_caja) values
    (v_prov, 'Aceite vegetal 1 L',     'caja x 12 und.', 118800)  returning id into aceite;
  insert into public.productos (proveedor_id, nombre, empaque, precio_lista_caja) values
    (v_prov, 'Gaseosa 1,5 L',          'paca x 12 und.', 54000)   returning id into gaseosa;
  insert into public.productos (proveedor_id, nombre, empaque, precio_lista_caja) values
    (v_prov, 'Azúcar refinada 1 kg',   'paca x 25 und.', 97500)   returning id into azucar;
  insert into public.productos (proveedor_id, nombre, empaque, precio_lista_caja) values
    (v_prov, 'Huevo AA',               'caja x 12 bandejas de 30', 192000) returning id into huevo;

  insert into public.escalas_precio (producto_id, cajas_min, descuento_pct) values
    (arroz, 10, 3), (arroz, 20, 6), (arroz, 40, 10), (arroz, 60, 12),
    (aceite, 8, 3), (aceite, 15, 6), (aceite, 30, 9), (aceite, 50, 12),
    (gaseosa, 15, 4), (gaseosa, 30, 7), (gaseosa, 60, 11),
    (azucar, 10, 3), (azucar, 20, 6), (azucar, 35, 9),
    (huevo, 5, 3), (huevo, 10, 6), (huevo, 20, 8);

  -- Pedido abierto 1: arroz, 18 de 30 cajas
  insert into public.pedidos (producto_id, anfitrion_id, punto_acopio, cajas_objetivo, cajas_maximas,
                              fecha_cierre, flete_total, creado)
  values (arroz, t_rosa, 'Tienda Doña Rosa · Cra 74 # 42-15 Sur (dirección ficticia)', 30, 60,
          now() + interval '48 hours', 40000, now() - interval '5 hours') returning id into p;
  insert into public.participaciones (pedido_id, tienda_id, cajas, monto_reservado, creada) values
    (p, t_rosa,   6, 6 * 62400, now() - interval '5 hours'),
    (p, t_vecino, 5, 5 * 62400, now() - interval '4 hours'),
    (p, t_pinos,  4, 4 * 62400, now() - interval '3 hours'),
    (p, t_judas,  3, 3 * 62400, now() - interval '1 hour');

  -- Pedido abierto 2: aceite, 10 de 20 cajas
  insert into public.pedidos (producto_id, anfitrion_id, punto_acopio, cajas_objetivo, cajas_maximas,
                              fecha_cierre, flete_total, creado)
  values (aceite, t_economia, 'Granero La Economía · Cl 41 Sur # 75-08 (dirección ficticia)', 20, 40,
          now() + interval '20 hours', 40000, now() - interval '2 hours') returning id into p;
  insert into public.participaciones (pedido_id, tienda_id, cajas, monto_reservado, creada) values
    (p, t_economia, 4, 4 * 118800, now() - interval '2 hours'),
    (p, t_38,       3, 3 * 118800, now() - interval '90 minutes'),
    (p, t_barrio,   3, 3 * 118800, now() - interval '30 minutes');

  -- Histórico 1: gaseosa, se cerró con 34 de 30 → confirmado
  insert into public.pedidos (producto_id, anfitrion_id, punto_acopio, cajas_objetivo, cajas_maximas,
                              fecha_cierre, flete_total, creado)
  values (gaseosa, t_vecino, 'Autoservicio El Vecino (dirección ficticia)', 30, 60,
          now() - interval '2 days', 40000, now() - interval '4 days') returning id into p;
  insert into public.participaciones (pedido_id, tienda_id, cajas, monto_reservado, creada) values
    (p, t_vecino, 10, 10 * 54000, now() - interval '4 days'),
    (p, t_rosa,    7,  7 * 54000, now() - interval '3 days 20 hours'),
    (p, t_jorge,   6,  6 * 54000, now() - interval '3 days 12 hours'),
    (p, t_carmen,  6,  6 * 54000, now() - interval '3 days 6 hours'),
    (p, t_paisa,   5,  5 * 54000, now() - interval '3 days');
  perform interno.cerrar(p);

  -- Histórico 2: azúcar, se cerró con 12 de 20 → anulado, nadie paga
  insert into public.pedidos (producto_id, anfitrion_id, punto_acopio, cajas_objetivo, cajas_maximas,
                              fecha_cierre, flete_total, creado)
  values (azucar, t_jorge, 'La Esquina de Don Jorge (dirección ficticia)', 20, 40,
          now() - interval '1 day', 40000, now() - interval '3 days') returning id into p;
  insert into public.participaciones (pedido_id, tienda_id, cajas, monto_reservado, creada) values
    (p, t_jorge, 5, 5 * 97500, now() - interval '3 days'),
    (p, t_rosa,  4, 4 * 97500, now() - interval '2 days'),
    (p, t_paisa, 3, 3 * 97500, now() - interval '2 days');
  perform interno.cerrar(p);

  -- Pedido en Suba: no debe aparecer para tiendas de Timiza (filtro por zona)
  insert into public.pedidos (producto_id, anfitrion_id, punto_acopio, cajas_objetivo, cajas_maximas,
                              fecha_cierre, flete_total)
  values (huevo, t_suba1, 'Tienda El Rincón de Suba (dirección ficticia)', 10, 20,
          now() + interval '30 hours', 40000) returning id into p;
  insert into public.participaciones (pedido_id, tienda_id, cajas, monto_reservado) values
    (p, t_suba1, 3, 3 * 192000), (p, t_suba2, 2, 2 * 192000);
end $$;
