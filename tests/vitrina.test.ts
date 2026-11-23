// Pruebas de la vista de proveedor de la demostración (sin clave).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarBase, rpc, entrar } from './base.ts';

const OFERTA = {
  p_nombre: 'Panela 500 g',
  p_empaque: 'paca x 24 und.',
  p_precio: 72000,
  p_escalas: JSON.stringify([{ cajas_min: 15, descuento_pct: 5 }, { cajas_min: 30, descuento_pct: 9 }]),
};

test('el proveedor ve la demanda agregada de sus productos, con la orden cuadrada', async () => {
  const db = await montarBase();
  const v = await rpc(db, 'vitrina_proveedor');
  assert.equal(v.proveedor.nombre, 'Mayorista Central S.A.S.');
  const gaseosa = v.pedidos.find((p: any) => p.producto === 'Gaseosa 1,5 L');
  assert.equal(gaseosa.estado, 'confirmado');
  assert.equal(gaseosa.total_cajas, 34);
  assert.equal(gaseosa.tiendas, 5);
  assert.equal(gaseosa.valor_orden, 34 * 50220 + 40000);
  assert.equal(gaseosa.comision, Math.round(34 * 50220 * 0.03));
  // Nunca expone las cajas de cada tienda
  assert.ok(!JSON.stringify(v).includes('Tienda Carmencita'));
  assert.equal(v.resumen.por_despachar, 1);
  // Solo ve pedidos de sus productos (no la lenteja de otro proveedor)
  assert.ok(v.pedidos.every((p: any) => !p.producto.includes('Lenteja')));
});

test('una oferta publicada aparece para las tiendas y se puede retirar', async () => {
  const db = await montarBase();
  const r = await rpc(db, 'vitrina_crear_oferta', OFERTA);
  assert.ok(r.objetivo_minimo > 0);

  const t = await entrar(db, 'Tienda Carmencita');
  const provs = await rpc(db, 'listar_proveedores', { p_token: t });
  const central = provs.find((p: any) => p.nombre === 'Mayorista Central S.A.S.');
  assert.ok(central.productos.some((p: any) => p.nombre === 'Panela 500 g'));
  const cat = await rpc(db, 'catalogo', { p_token: t });
  assert.ok(cat.some((c: any) => c.nombre === 'Panela 500 g'));

  await rpc(db, 'vitrina_eliminar_oferta', { p_producto_id: r.id });
  const v = await rpc(db, 'vitrina_proveedor');
  assert.ok(!v.productos.some((p: any) => p.nombre === 'Panela 500 g'));
});

test('retirar una oferta con pedidos la deja de ofrecer sin romper los pedidos', async () => {
  const db = await montarBase();
  const t = await entrar(db, 'Tienda Carmencita');
  let v = await rpc(db, 'vitrina_proveedor');
  const arroz = v.productos.find((p: any) => p.nombre === 'Arroz blanco 500 g');
  await rpc(db, 'vitrina_eliminar_oferta', { p_producto_id: arroz.id });

  v = await rpc(db, 'vitrina_proveedor');
  assert.equal(v.productos.find((p: any) => p.id === arroz.id).activo, false);
  const cat = await rpc(db, 'catalogo', { p_token: t });
  assert.ok(!cat.some((c: any) => c.id === arroz.id));
  const provs = await rpc(db, 'listar_proveedores', { p_token: t });
  assert.ok(!provs.some((pv: any) => pv.productos.some((p: any) => p.id === arroz.id)));
  await assert.rejects(
    rpc(db, 'abrir_pedido', { p_token: t, p_producto_id: arroz.id, p_cajas_objetivo: 30, p_horas: 24,
                              p_punto_acopio: 'Aquí', p_mis_cajas: 3 }),
    /ya no está en oferta/,
  );
  // El pedido de arroz que ya estaba abierto sigue ahí
  const pedidos = await rpc(db, 'listar_pedidos', { p_token: t });
  assert.ok(pedidos.some((p: any) => p.producto === 'Arroz blanco 500 g' && p.estado === 'abierto'));

  await rpc(db, 'vitrina_publicar_oferta', { p_producto_id: arroz.id });
  const cat2 = await rpc(db, 'catalogo', { p_token: t });
  assert.ok(cat2.some((c: any) => c.id === arroz.id));
});

test('la vitrina rechaza escalas sin ahorro y respeta el límite', async () => {
  const db = await montarBase();

  // Escalas que no ahorran de verdad no se publican
  await assert.rejects(
    rpc(db, 'vitrina_crear_oferta', { ...OFERTA, p_nombre: 'Sin ahorro',
      p_escalas: JSON.stringify([{ cajas_min: 10, descuento_pct: 2 }]) }),
    /ningún pedido ahorra/,
  );

  for (let i = 1; i <= 5; i++) await rpc(db, 'vitrina_crear_oferta', { ...OFERTA, p_nombre: `Oferta ${i}` });
  await assert.rejects(rpc(db, 'vitrina_crear_oferta', { ...OFERTA, p_nombre: 'Oferta 6' }), /hasta 5 ofertas nuevas por proveedor/);
});

test('reiniciar la demo borra las ofertas de la vitrina', async () => {
  const db = await montarBase();
  await db.exec(`insert into public.config (clave, valor)
                 values ('clave_facilitador', extensions.crypt('prueba', extensions.gen_salt('bf')))`);
  await rpc(db, 'vitrina_crear_oferta', OFERTA);
  await rpc(db, 'reiniciar_demo', { p_clave: 'prueba' });
  const v = await rpc(db, 'vitrina_proveedor');
  assert.ok(!v.productos.some((p: any) => p.origen === 'vitrina'));
  assert.ok(v.productos.some((p: any) => p.nombre === 'Arroz blanco 500 g'));
});

test('una oferta nueva con pedidos se retira sin borrarse', async () => {
  const db = await montarBase();
  const r = await rpc(db, 'vitrina_crear_oferta', OFERTA);
  const t = await entrar(db, 'Tienda Carmencita');
  await rpc(db, 'abrir_pedido', { p_token: t, p_producto_id: r.id, p_cajas_objetivo: r.objetivo_minimo,
                                  p_horas: 24, p_punto_acopio: 'Tienda Carmencita', p_mis_cajas: 3 });
  await rpc(db, 'vitrina_eliminar_oferta', { p_producto_id: r.id });
  const v = await rpc(db, 'vitrina_proveedor');
  assert.equal(v.productos.find((p: any) => p.id === r.id).activo, false);
  assert.ok(v.pedidos.some((p: any) => p.producto === 'Panela 500 g' && p.estado === 'abierto'));
});

test('se puede elegir otro proveedor de demo; los de /admin solo se ven', async () => {
  const db = await montarBase();
  await db.exec(`insert into public.config (clave, valor)
                 values ('clave_facilitador', extensions.crypt('prueba', extensions.gen_salt('bf')))`);
  const v0 = await rpc(db, 'vitrina_proveedor');
  assert.equal(v0.proveedores.length, 3);
  const granos = v0.proveedores.find((p: any) => p.nombre.startsWith('Distribuidora Granos'));
  const vg = await rpc(db, 'vitrina_proveedor', { p_proveedor_id: granos.id });
  assert.equal(vg.proveedor.editable, true);
  assert.ok(vg.productos.some((p: any) => p.nombre === 'Lenteja 500 g'));
  await rpc(db, 'vitrina_crear_oferta', { ...OFERTA, p_proveedor_id: granos.id });

  const adm = await rpc<string>(db, 'admin_crear_proveedor', { p_clave: 'prueba', p_nombre: 'Lácteos Zonales',
    p_categoria: 'Abarrotes', p_cobertura: 'Kennedy', p_flete: 30000 });
  const va = await rpc(db, 'vitrina_proveedor', { p_proveedor_id: adm });
  assert.equal(va.proveedor.editable, false);
  await assert.rejects(rpc(db, 'vitrina_crear_oferta', { ...OFERTA, p_proveedor_id: adm }), /lo administra el equipo/);
});
