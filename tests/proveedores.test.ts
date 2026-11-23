// Pruebas del directorio de proveedores y del panel de administración.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarBase, rpc, entrar } from './base.ts';

async function base() {
  const db = await montarBase();
  await db.exec(`insert into public.config (clave, valor)
                 values ('clave_facilitador', extensions.crypt('prueba', extensions.gen_salt('bf')))`);
  return db;
}

test('las tiendas ven el directorio con los proveedores de ejemplo', async () => {
  const db = await base();
  const t = await entrar(db, 'Tienda Carmencita');
  const provs = await rpc(db, 'listar_proveedores', { p_token: t });
  assert.equal(provs.length, 3);
  for (const pv of provs) for (const p of pv.productos) assert.ok(p.objetivo_minimo > 0, p.nombre);
  // Los productos nuevos también aparecen en el catálogo para abrir pedidos
  const cat = await rpc(db, 'catalogo', { p_token: t });
  assert.ok(cat.some((c: any) => c.nombre === 'Lenteja 500 g'));
});

test('el directorio exige sesión de tienda', async () => {
  const db = await base();
  await assert.rejects(rpc(db, 'listar_proveedores', { p_token: '00000000-0000-0000-0000-000000000000' }));
});

test('el administrador crea proveedor y producto; sin clave no puede', async () => {
  const db = await base();
  await assert.rejects(
    rpc(db, 'admin_crear_proveedor', { p_clave: 'mala', p_nombre: 'X S.A.S.', p_categoria: 'Aseo',
                                       p_cobertura: 'Kennedy', p_flete: 30000 }),
    /Clave incorrecta/,
  );
  const id = await rpc<string>(db, 'admin_crear_proveedor', {
    p_clave: 'prueba', p_nombre: 'Lácteos Zonales (ejemplo)', p_categoria: 'Lácteos',
    p_cobertura: 'Kennedy', p_flete: 30000 });
  const r = await rpc(db, 'admin_crear_producto', {
    p_clave: 'prueba', p_proveedor_id: id, p_nombre: 'Leche UHT 1 L', p_empaque: 'paca x 6 und.',
    p_precio: 21000, p_escalas: [{ cajas_min: 75, descuento_pct: 5 }, { cajas_min: 120, descuento_pct: 8 }] });
  assert.equal(r.objetivo_minimo, 76); // 75 cajas × $19.950 = $1.496.250 < $1.500.000
});

test('rechaza escalas que nunca ahorran o cuyo descuento baja con el volumen', async () => {
  const db = await base();
  const id = await rpc<string>(db, 'admin_crear_proveedor', {
    p_clave: 'prueba', p_nombre: 'Prueba (ejemplo)', p_categoria: 'Aseo', p_cobertura: 'Kennedy', p_flete: 30000 });
  const producto = { p_clave: 'prueba', p_proveedor_id: id, p_nombre: 'Detergente 1 kg',
                     p_empaque: 'caja x 12 und.', p_precio: 90000 };
  await assert.rejects(
    rpc(db, 'admin_crear_producto', { ...producto, p_escalas: [{ cajas_min: 10, descuento_pct: 3 }] }),
    /ningún pedido ahorra/,
  );
  await assert.rejects(
    rpc(db, 'admin_crear_producto', { ...producto,
      p_escalas: [{ cajas_min: 20, descuento_pct: 8 }, { cajas_min: 40, descuento_pct: 6 }] }),
    /no puede bajar/,
  );
});

test('no se borra un producto que ya tiene pedidos', async () => {
  const db = await base();
  const provs = await rpc(db, 'admin_listar_proveedores', { p_clave: 'prueba' });
  const arroz = provs.flatMap((p: any) => p.productos).find((p: any) => p.nombre === 'Arroz blanco 500 g');
  await assert.rejects(rpc(db, 'admin_eliminar_producto', { p_clave: 'prueba', p_producto_id: arroz.id }),
                       /ya tiene pedidos/);
});

test('reiniciar la demo conserva los proveedores del administrador', async () => {
  const db = await base();
  const id = await rpc<string>(db, 'admin_crear_proveedor', {
    p_clave: 'prueba', p_nombre: 'Lácteos Zonales (ejemplo)', p_categoria: 'Lácteos',
    p_cobertura: 'Kennedy', p_flete: 30000 });
  await rpc(db, 'admin_crear_producto', {
    p_clave: 'prueba', p_proveedor_id: id, p_nombre: 'Leche UHT 1 L', p_empaque: 'paca x 6 und.',
    p_precio: 21000, p_escalas: [{ cajas_min: 75, descuento_pct: 5 }, { cajas_min: 120, descuento_pct: 8 }] });
  await rpc(db, 'reiniciar_demo', { p_clave: 'prueba' });
  const provs = await rpc(db, 'admin_listar_proveedores', { p_clave: 'prueba' });
  assert.equal(provs.length, 4);
  const lacteos = provs.find((p: any) => p.nombre === 'Lácteos Zonales (ejemplo)');
  assert.equal(lacteos.productos[0].escalas.length, 2);
});
