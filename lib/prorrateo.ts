// Misma lógica que interno.cerrar() en la base de datos, usada en el cliente
// solo para mostrar estimaciones antes de reservar. El cálculo oficial ocurre en Postgres.

export type Escalon = { cajas_min: number; descuento_pct: number };

/** Descuento vigente para un volumen total de cajas. */
export function descuentoPara(escalas: Escalon[], cajas: number): number {
  let d = 0;
  for (const e of [...escalas].sort((a, b) => a.cajas_min - b.cajas_min)) {
    if (e.cajas_min <= cajas) d = e.descuento_pct;
  }
  return d;
}

/**
 * Reparte un total entero (p. ej. el flete en pesos) entre participantes de forma
 * proporcional a sus cajas, con el método del mayor residuo: cada parte es entera y
 * la suma es exactamente el total. Empates: gana quien se sumó primero (orden del arreglo).
 */
export function mayorResiduo(total: number, pesos: number[]): number[] {
  const suma = pesos.reduce((a, b) => a + b, 0);
  if (suma === 0) return pesos.map(() => 0);
  const exactos = pesos.map((p) => (total * p) / suma);
  const pisos = exactos.map(Math.floor);
  let faltan = total - pisos.reduce((a, b) => a + b, 0);
  const orden = exactos
    .map((x, i) => ({ i, resto: x - Math.floor(x) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (const { i } of orden) {
    if (faltan <= 0) break;
    pisos[i] += 1;
    faltan -= 1;
  }
  return pisos;
}

/** Estimación de lo que pagaría una tienda si el pedido cerrara con `totalCajas`. */
export function estimarPago(opts: {
  escalas: Escalon[];
  precioLista: number;
  fleteTotal: number;
  totalCajas: number;
  misCajas: number;
}) {
  const { escalas, precioLista, fleteTotal, totalCajas, misCajas } = opts;
  const descuento = descuentoPara(escalas, totalCajas);
  const precioCaja = Math.round(precioLista * (1 - descuento / 100));
  const mercancia = misCajas * precioCaja;
  const flete = totalCajas > 0 ? Math.round((fleteTotal * misCajas) / totalCajas) : 0;
  const total = mercancia + flete;
  const solo = misCajas * precioLista;
  return { descuento, precioCaja, mercancia, flete, total, solo, ahorro: solo - total };
}

/**
 * Meta mínima de cajas con la que un pedido conjunto ahorra de verdad (misma regla que
 * interno.objetivo_minimo en Postgres): al menos −5 %, pedido de $1.500.000 o más, y que el
 * flete quepa en el ahorro con un peso de margen. null si ninguna meta hasta 1000 cajas sirve.
 * Solo para la vista previa: la base de datos vuelve a validar.
 */
export function objetivoMinimo(escalas: Escalon[], precioLista: number, flete: number): number | null {
  for (let c = 1; c <= 1000; c++) {
    const d = descuentoPara(escalas, c);
    const precio = Math.round(precioLista * (1 - d / 100));
    if (d >= 5 && c * precioLista * (1 - d / 100) >= 1_500_000 && flete <= c * (precioLista - precio - 1)) return c;
  }
  return null;
}
