'use client';

import { cop, fechaHora, relativo } from '@/lib/formato';
import type { Pedido } from '@/lib/tipos';

const ETIQUETA = { abierto: 'Abierto', confirmado: 'Confirmado', anulado: 'No se completó' } as const;

export function TarjetaPedido({
  p,
  onSumarse,
  onCerrar,
}: {
  p: Pedido;
  onSumarse: (p: Pedido) => void;
  onCerrar: (p: Pedido) => void;
}) {
  const faltan = Math.max(0, p.cajas_objetivo - p.total_cajas);
  const logrado = faltan === 0;
  const mia = p.mi_participacion;
  const progresoId = `prog-${p.id}`;
  // Escalón vigente: el mayor volumen mínimo que ya se alcanzó
  const vigente = Math.max(0, ...p.escalas.filter((e) => e.cajas_min <= p.total_cajas).map((e) => e.cajas_min));

  return (
    <li>
      <article className="tarjeta" aria-labelledby={`t-${p.id}`}>
        <header>
          <div>
            <h2 id={`t-${p.id}`}>{p.producto}</h2>
            <p className="sub">
              {p.empaque} · lista {cop(p.precio_lista_caja)}/caja
            </p>
          </div>
          <span className={`etiqueta ${p.estado}`}>{ETIQUETA[p.estado]}</span>
        </header>

        <p className="sub">
          Anfitriona: <strong>{p.soy_anfitrion ? 'tu tienda' : p.anfitrion}</strong> · a{' '}
          {Number(p.distancia_km).toLocaleString('es-CO')} km
          <br />
          Entrega en: {p.punto_acopio}
        </p>

        <div className="avance">
          <div className="cifras">
            <span id={progresoId}>
              <strong>{p.total_cajas}</strong> de {p.cajas_objetivo} cajas
            </span>
            <span>
              {p.participantes} {p.participantes === 1 ? 'tienda' : 'tiendas'}
            </span>
          </div>
          <progress
            className={logrado ? 'meta-lograda' : undefined}
            max={p.cajas_objetivo}
            value={Math.min(p.total_cajas, p.cajas_objetivo)}
            aria-labelledby={progresoId}
          />
          {p.estado === 'abierto' && (
            <p className="sub">
              {logrado
                ? `¡Meta lograda! Descuento actual ${p.descuento_actual}%.`
                : `Faltan ${faltan} cajas para cerrar con descuento.`}{' '}
              {p.siguiente_escalon &&
                `Con ${p.siguiente_escalon.cajas_min} cajas sube a ${p.siguiente_escalon.descuento_pct}%.`}{' '}
              Cierra {relativo(p.fecha_cierre)}.
            </p>
          )}
        </div>

        <ul className="escalones" aria-label="Escalones de descuento del mayorista">
          {p.escalas.map((e) => (
            <li
              key={e.cajas_min}
              className={e.cajas_min === vigente ? 'vigente' : undefined}
            >
              {e.cajas_min}+ cajas: −{e.descuento_pct}%
            </li>
          ))}
        </ul>

        {mia && p.estado === 'abierto' && (
          <div className="mia">
            <strong>Tienes {mia.cajas} cajas reservadas.</strong>
            <span className="sub">
              {cop(mia.monto_reservado)} retenidos (simulado). Se ajusta al precio final al cerrar; si no se
              llega a la meta, se devuelve todo.
            </span>
          </div>
        )}

        {mia && p.estado === 'confirmado' && (
          <div className="mia">
            <strong>Pedido confirmado con −{p.descuento_actual}%</strong>
            <dl className="datos">
              <dt>Mercancía ({mia.cajas} cajas × {cop(p.precio_caja_final)})</dt>
              <dd>{cop(mia.valor_mercancia)}</dd>
              <dt>Tu parte del flete</dt>
              <dd>{cop(mia.flete_asignado)}</dd>
              <dt className="total">Total pagado</dt>
              <dd className="total">{cop(mia.monto_final)}</dd>
              <dt>Comprando solo (precio de lista)</dt>
              <dd>{cop(mia.costo_comprando_solo)}</dd>
              <dt className="ahorro">Ahorro</dt>
              <dd className="ahorro">{cop(mia.ahorro)}</dd>
            </dl>
            <span className="sub">Cerró el {p.cerrado_en && fechaHora(p.cerrado_en)}</span>
          </div>
        )}

        {mia && p.estado === 'anulado' && (
          <div className="aviso">
            No se llegó a la meta ({p.total_cajas} de {p.cajas_objetivo}). Nadie pagó: se devolvieron tus{' '}
            {cop(mia.monto_reservado)}.
          </div>
        )}

        {p.estado === 'abierto' && (
          <div className="acciones">
            <button className="btn" type="button" onClick={() => onSumarse(p)}>
              {mia ? 'Cambiar mis cajas' : 'Sumarme al pedido'}
            </button>
            {p.soy_anfitrion && (
              <button className="btn secundario" type="button" onClick={() => onCerrar(p)}>
                Cerrar ahora (demo)
              </button>
            )}
          </div>
        )}
      </article>
    </li>
  );
}
