const pesos = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export const cop = (n: number | null | undefined) => pesos.format(Number(n ?? 0));

const rel = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

/** "en 5 horas", "hace 2 días" */
export function relativo(iso: string, ahora = Date.now()): string {
  const diff = (new Date(iso).getTime() - ahora) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return rel.format(Math.round(diff), 'second');
  if (abs < 3600) return rel.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rel.format(Math.round(diff / 3600), 'hour');
  return rel.format(Math.round(diff / 86400), 'day');
}

const fecha = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Bogota',
});

export const fechaHora = (iso: string) => fecha.format(new Date(iso));

/** "1 caja", "3 cajas" */
export const cajas = (n: number | null | undefined) => `${n ?? 0} ${Number(n) === 1 ? 'caja' : 'cajas'}`;

/** Punto de entrega sin la marca «(dirección ficticia)» de los datos semilla. */
export const lugar = (s: string | null | undefined) => (s ?? '').replace(/\s*\(direcci[oó]n ficticia\)/gi, '');

/** Fecha y hora para cerrar una frase: evita el doble punto tras «p. m.». */
export const fechaHoraFin = (iso: string | null | undefined) => {
  const t = iso ? fechaHora(iso) : '';
  return t.endsWith('.') ? t : `${t}.`;
};
