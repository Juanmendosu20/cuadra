// Criterio C1 del informe, ahora sobre el código de la app: 10.000 repartos aleatorios
// del flete con el método del mayor residuo, comparados contra un cálculo exacto en
// aritmética entera (BigInt), sin decimales de por medio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mayorResiduo } from '../lib/prorrateo.ts';

/** Referencia independiente: mayor residuo con enteros exactos. */
function referencia(total: number, pesos: number[]): number[] {
  const suma = BigInt(pesos.reduce((a, b) => a + b, 0));
  const T = BigInt(total);
  const pisos = pesos.map((p) => (T * BigInt(p)) / suma);
  const restos = pesos.map((p) => (T * BigInt(p)) % suma);
  let faltan = Number(T - pisos.reduce((a, b) => a + b, 0n));
  const orden = pesos.map((_, i) => i).sort((a, b) => (restos[b] > restos[a] ? 1 : restos[b] < restos[a] ? -1 : a - b));
  const r = pisos.map(Number);
  for (const i of orden) {
    if (faltan-- <= 0) break;
    r[i] += 1;
  }
  return r;
}

test('10.000 escenarios aleatorios: suma exacta, desvío < 1 peso e igual a la referencia entera', () => {
  let s = 2026; // semilla fija: resultados reproducibles
  const azar = (n: number) => ((s = (s * 1103515245 + 12345) % 2 ** 31), s % n);
  let maxDesvio = 0;

  for (let k = 0; k < 10_000; k++) {
    const tiendas = 1 + azar(8);
    const cajas = Array.from({ length: tiendas }, () => 1 + azar(40));
    const flete = 5_000 + azar(150_001);
    const partes = mayorResiduo(flete, cajas);
    const suma = cajas.reduce((a, b) => a + b, 0);

    assert.equal(partes.reduce((a, b) => a + b, 0), flete, `escenario ${k}: no suma el flete`);
    partes.forEach((p, i) => {
      assert.ok(Number.isInteger(p));
      maxDesvio = Math.max(maxDesvio, Math.abs(p - (flete * cajas[i]) / suma));
    });
    assert.deepEqual(partes, referencia(flete, cajas), `escenario ${k}: difiere de la referencia`);
  }
  assert.ok(maxDesvio < 1, `desvío máximo ${maxDesvio}`);
});
