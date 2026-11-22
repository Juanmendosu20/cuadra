// Pruebas de la lógica en Postgres: cierre, control de retención, entrega y privacidad.
// Corre las migraciones reales sobre una base en memoria (ver tests/base.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarBase, valor, rpc, entrar } from './base.ts';

const pedidoDe = async (db: Awaited<ReturnType<typeof montarBase>>, producto: string) =>
  valor<string>(db, `select pe.id from public.pedidos pe join public.productos p on p.id = pe.producto_id
                     where p.nombre = $1 order by pe.creado desc limit 1`, [producto]);

test('la demo confirmada cuadra al peso: suma de cobros = valor de la orden', async () => {
  const db = await montarBase();
  const t = await entrar(db, 'Autoservicio El Vecino');
  const pedidos = await rpc(db, 'listar_pedidos', { p_token: t });
  const gaseosa = pedidos.find((p: any) => p.producto === 'Gaseosa 1,5 L');
  assert.equal(gaseosa.estado, 'confirmado');
  assert.equal(gaseosa.valor_orden, 34 * 50220 + 40000);
  assert.equal(gaseosa.suma_cobros, gaseosa.valor_orden);
  const fletes = await db.query<{ f: number }>(
    `select flete_asignado::int f from public.participaciones where pedido_id = $1 order by creada`, [gaseosa.id]);
  assert.deepEqual(fletes.rows.map((r) => r.f), [11765, 8235, 7059, 7059, 5882]);
});

test('no deja abrir un pedido cuyo flete no cabe en el ahorro', async () => {
  const db = await montarBase();
  await db.exec(`update public.proveedores set flete_por_entrega = 500000`);
  const t = await entrar(db, 'Tienda Carmencita');
  const arroz = await valor<string>(db, `select id from public.productos where nombre = 'Arroz blanco 500 g'`);
  await assert.rejects(
    rpc(db, 'abrir_pedido', { p_token: t, p_producto_id: arroz, p_cajas_objetivo: 30, p_horas: 24,
                              p_punto_acopio: 'Aquí', p_mis_cajas: 3 }),
    /flete no cabe/,
  );
  // Con una meta mayor el ahorro por caja sube (−12 % desde 60) y el flete sí cabe
  await rpc(db, 'abrir_pedido', { p_token: t, p_producto_id: arroz, p_cajas_objetivo: 80, p_horas: 24,
                                  p_punto_acopio: 'Aquí', p_mis_cajas: 3 });
});

test('si un cobro superara lo retenido, el pedido se anula y se devuelve todo', async () => {
  const db = await montarBase();
  const id = await pedidoDe(db, 'Arroz blanco 500 g');
  // Forzamos un flete imposible saltándonos la validación de apertura
  await db.exec(`update public.pedidos set flete_total = 900000 where id = '${id}'`);
  await db.exec(`insert into public.participaciones (pedido_id, tienda_id, cajas, monto_reservado)
                 select '${id}', id, 12, 12 * 62400 from public.tiendas where nombre = 'Tienda El Paisa'`);
  await valor(db, `select interno.cerrar($1)`, [id]);
  assert.equal(await valor(db, `select estado::text from public.pedidos where id = $1`, [id]), 'anulado');
  assert.equal(await valor(db, `select count(*)::int from public.participaciones
                                 where pedido_id = $1 and estado_pago <> 'devuelto'`, [id]), 0);
  assert.equal(await valor(db, `select count(*)::int from public.auditoria
                                 where pedido_id = $1 and accion = 'retencion_insuficiente'`, [id]), 1);
});

test('ciclo completo: abierto → confirmado → entregado, y la lista es solo de la anfitriona', async () => {
  const db = await montarBase();
  const rosa = await entrar(db, 'Tienda Doña Rosa');      // anfitriona del arroz (18 de 30)
  const paisa = await entrar(db, 'Tienda El Paisa');
  const id = await pedidoDe(db, 'Arroz blanco 500 g');

  // Antes de confirmar no hay lista de entrega
  await assert.rejects(rpc(db, 'lista_entrega', { p_token: rosa, p_pedido_id: id }), /cuando el pedido se confirma/);

  await rpc(db, 'sumarse', { p_token: paisa, p_pedido_id: id, p_cajas: 12 });
  const cerrado = await rpc(db, 'cerrar_ahora', { p_token: rosa, p_pedido_id: id });
  assert.equal(cerrado.estado, 'confirmado');
  assert.equal(cerrado.suma_cobros, cerrado.valor_orden);

  // Una vecina no puede ver la lista ni marcar entregas
  await assert.rejects(rpc(db, 'lista_entrega', { p_token: paisa, p_pedido_id: id }), /Solo la tienda anfitriona/);

  const lista = await rpc(db, 'lista_entrega', { p_token: rosa, p_pedido_id: id });
  assert.equal(lista.length, 5);
  assert.equal(lista[0].es_mia, true);
  assert.equal(lista.reduce((a: number, x: any) => a + x.cajas, 0), 30);

  const deElPaisa = lista.find((x: any) => x.tienda === 'Tienda El Paisa');
  await assert.rejects(
    rpc(db, 'marcar_retiro', { p_token: paisa, p_participacion_id: deElPaisa.participacion_id, p_retirado: true }),
    /Solo la tienda anfitriona/,
  );

  let v;
  for (const x of lista) {
    v = await rpc(db, 'marcar_retiro', { p_token: rosa, p_participacion_id: x.participacion_id, p_retirado: true });
  }
  assert.equal(v.estado, 'entregado');
  assert.equal(v.retirados, 5);

  // La vecina ve en sus movimientos que recogió sus cajas
  const movs = await rpc(db, 'mis_movimientos', { p_token: paisa });
  assert.ok(movs.some((m: any) => m.accion === 'retiro_confirmado'));

  // Desmarcar una vuelve el pedido a confirmado
  v = await rpc(db, 'marcar_retiro', { p_token: rosa, p_participacion_id: deElPaisa.participacion_id, p_retirado: false });
  assert.equal(v.estado, 'confirmado');
});

test('300 cierres aleatorios: suma exacta y ningún cobro supera lo retenido', async () => {
  const db = await montarBase();
  // Generador determinista (semilla fija) para que la prueba sea reproducible
  let s = 2026;
  const azar = (n: number) => ((s = (s * 1103515245 + 12345) % 2 ** 31), s % n);

  const tiendas = (await db.query<{ nombre: string }>(
    `select nombre from public.tiendas where barrio = 'Timiza' order by nombre`)).rows.map((r) => r.nombre);
  const tokens = await Promise.all(tiendas.map((n) => entrar(db, n)));
  const productos = (await db.query<{ id: string }>(`select id from public.productos order by nombre`)).rows;
  const catalogo = await rpc(db, 'catalogo', { p_token: tokens[0] });

  let confirmados = 0;
  for (let i = 0; i < 300; i++) {
    const prod = productos[azar(productos.length)].id;
    const minimo = catalogo.find((c: any) => c.id === prod).objetivo_minimo;
    const meta = minimo + azar(30);
    const anfitriona = azar(tokens.length);
    const abierto = await rpc(db, 'abrir_pedido', {
      p_token: tokens[anfitriona], p_producto_id: prod, p_cajas_objetivo: meta,
      p_horas: 24, p_punto_acopio: 'Punto', p_mis_cajas: 1 + azar(8),
    });
    for (let k = 0; k < tokens.length; k++) {
      if (k === anfitriona || azar(3) === 0) continue;
      const libre = abierto.cajas_maximas - (await rpc(db, 'listar_pedidos', { p_token: tokens[k] }))
        .find((p: any) => p.id === abierto.id).total_cajas;
      if (libre <= 0) break;
      await rpc(db, 'sumarse', { p_token: tokens[k], p_pedido_id: abierto.id, p_cajas: 1 + azar(Math.min(libre, 15)) });
    }
    const r = await rpc(db, 'cerrar_ahora', { p_token: tokens[anfitriona], p_pedido_id: abierto.id });
    if (r.estado === 'confirmado') {
      confirmados++;
      assert.equal(r.suma_cobros, r.valor_orden, `pedido ${i}`);
    }
    const excede = await valor<number>(db, `select count(*)::int from public.participaciones
      where pedido_id = $1 and monto_final > monto_reservado`, [abierto.id]);
    assert.equal(excede, 0);
  }
  assert.ok(confirmados > 50, `solo ${confirmados} confirmados: el generador no está probando lo suficiente`);
});
