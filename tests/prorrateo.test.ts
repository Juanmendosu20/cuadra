import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mayorResiduo, descuentoPara, estimarPago } from '../lib/prorrateo.ts';

test('el flete repartido suma exactamente el total', () => {
  const casos: [number, number[]][] = [
    [40000, [10, 7, 6, 6, 5]],
    [40000, [1, 1, 1]],
    [40000, [7]],
    [39999, [3, 3, 3, 3, 3, 3, 3]],
    [100, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]],
  ];
  for (const [total, pesos] of casos) {
    const partes = mayorResiduo(total, pesos);
    assert.equal(partes.reduce((a, b) => a + b, 0), total);
    partes.forEach((p) => assert.ok(Number.isInteger(p)));
  }
});

test('coincide con el pedido demo de gaseosa calculado en Postgres', () => {
  // Resultado real de interno.cerrar() sobre los datos demo: 11765, 8235, 7059, 7059, 5882
  assert.deepEqual(mayorResiduo(40000, [10, 7, 6, 6, 5]), [11765, 8235, 7059, 7059, 5882]);
});

test('empates: gana quien se sumó primero', () => {
  assert.deepEqual(mayorResiduo(10, [1, 1, 1]), [4, 3, 3]);
});

test('descuento por escalón', () => {
  const e = [
    { cajas_min: 10, descuento_pct: 3 },
    { cajas_min: 20, descuento_pct: 6 },
    { cajas_min: 40, descuento_pct: 10 },
  ];
  assert.equal(descuentoPara(e, 9), 0);
  assert.equal(descuentoPara(e, 10), 3);
  assert.equal(descuentoPara(e, 39), 6);
  assert.equal(descuentoPara(e, 80), 10);
});

test('estimación de pago y ahorro', () => {
  const r = estimarPago({
    escalas: [{ cajas_min: 30, descuento_pct: 7 }],
    precioLista: 54000,
    fleteTotal: 40000,
    totalCajas: 34,
    misCajas: 10,
  });
  assert.equal(r.precioCaja, 50220);
  assert.equal(r.mercancia, 502200);
  assert.equal(r.solo, 540000);
  assert.ok(r.ahorro > 0);
});
