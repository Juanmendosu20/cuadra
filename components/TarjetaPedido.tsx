'use client';

import { cop, fechaHora, relativo, cajas as nCajas, lugar, fechaHoraFin } from '@/lib/formato';
import type { Pedido } from '@/lib/tipos';
import { IconoCaja, IconoCheck } from './Iconos';

const ETIQUETA = {
  abierto: 'Abierto',
  confirmado: 'Confirmado',
  entregado: 'Entregado',
  anulado: 'No se completó',
} as const;

const decimales = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function TarjetaPedido({
  p,
  onSumarse,
  onCerrar,
  onEntrega,
}: {
  p: Pedido;
  onSumarse: (p: Pedido) => void;
  onCerrar: (p: Pedido) => void;
  onEntrega: (p: Pedido) => void;
}) {
  const faltan = Math.max(0, p.cajas_objetivo - p.total_cajas);
  const logrado = faltan === 0;
  const mia = p.mi_participacion;
  const cerradoConCompra = p.estado === 'confirmado' || p.estado === 'entregado';
  const progresoId = `prog-${p.id}`;
  // Escalón vigente: el mayor volumen mínimo que ya se alcanzó
  const vigente = Math.max(0, ...p.escalas.filter((e) => e.cajas_min <= p.total_cajas).map((e) => e.cajas_min));

  return (
    <li>
      <article className={`tarjeta ${p.estado}`} aria-labelledby={`t-${p.id}`}>
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
          Entrega en: {lugar(p.punto_acopio)}
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
              {logrado ? (
                <strong className="texto-verde">¡Meta lograda! Descuento actual −{p.descuento_actual}%.</strong>
              ) : (
                <>
                  Faltan <strong>{faltan} cajas</strong> para cerrar con descuento.
                </>
              )}{' '}
              {p.siguiente_escalon &&
                `Con ${p.siguiente_escalon.cajas_min} cajas sube a −${p.siguiente_escalon.descuento_pct}%.`}{' '}
              Cierra {relativo(p.fecha_cierre)}.
            </p>
          )}
        </div>

        {p.estado === 'abierto' && (
          <ul className="escalones" aria-label="Escalones de descuento del mayorista">
            {p.escalas.map((e) => (
              <li key={e.cajas_min} className={e.cajas_min === vigente ? 'vigente' : undefined}>
                {e.cajas_min}+ cajas: −{e.descuento_pct}%
              </li>
            ))}
          </ul>
        )}

        {mia && p.estado === 'abierto' && (
          <div className="mia">
            <strong>Tienes {nCajas(mia.cajas)} {mia.cajas === 1 ? 'reservada' : 'reservadas'}.</strong>
            <span className="sub">
              {cop(mia.monto_reservado)} retenidos (simulado). Se ajusta al precio final al cerrar; si no se
              llega a la meta, se devuelve todo.
            </span>
          </div>
        )}

        {mia && cerradoConCompra && <Liquidacion p={p} />}

        {cerradoConCompra && <EstadoEntrega p={p} onEntrega={onEntrega} />}

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
                Cerrar ahora
              </button>
            )}
          </div>
        )}
      </article>
    </li>
  );
}

/** Lo que pagó la tienda, con el paso a paso de cómo se calculó. */
function Liquidacion({ p }: { p: Pedido }) {
  const mia = p.mi_participacion!;
  const precio = Number(p.precio_caja_final);
  const fleteExacto = (Number(p.flete_total) * mia.cajas) / p.total_cajas;
  const flete = Number(mia.flete_asignado);
  const devuelto = Number(mia.monto_reservado) - Number(mia.monto_final);
  const cuadra = p.valor_orden !== null && Number(p.valor_orden) === Number(p.suma_cobros);

  return (
    <div className="mia">
      <strong>Pedido confirmado con −{p.descuento_actual}%</strong>
      <dl className="datos">
        <dt>
          Mercancía ({nCajas(mia.cajas)} × {cop(precio)})
        </dt>
        <dd>{cop(mia.valor_mercancia)}</dd>
        <dt>Tu parte del flete</dt>
        <dd>{cop(flete)}</dd>
        <dt className="total">Total pagado</dt>
        <dd className="total">{cop(mia.monto_final)}</dd>
        <dt>Comprando solo (precio de lista)</dt>
        <dd>{cop(mia.costo_comprando_solo)}</dd>
        <dt className="ahorro">Ahorro</dt>
        <dd className="ahorro">{cop(mia.ahorro)}</dd>
      </dl>

      <details className="explicacion">
        <summary>¿Cómo se calculó mi cobro?</summary>
        <ol className="pasos">
          <li>
            <strong>Precio por caja.</strong> Entre todas juntaron {p.total_cajas} cajas, así que el mayorista dio{' '}
            −{p.descuento_actual}%: {cop(p.precio_lista_caja)} → <strong>{cop(precio)}</strong>.
          </li>
          <li>
            <strong>Tu mercancía.</strong> {nCajas(mia.cajas)} × {cop(precio)} = <strong>{cop(mia.valor_mercancia)}</strong>.
          </li>
          <li>
            <strong>Tu parte del flete.</strong> El flete de {cop(p.flete_total)} se reparte según las cajas de cada
            tienda: {cop(p.flete_total)} × {mia.cajas} ÷ {p.total_cajas} = ${decimales.format(fleteExacto)}.
            Como se cobra en pesos enteros, queda en <strong>{cop(flete)}</strong>. Los pesos que sobran del
            redondeo van a las tiendas con la fracción más alta (método del mayor residuo).
          </li>
          <li>
            <strong>Retención.</strong> Al reservar se retuvieron {cop(mia.monto_reservado)} (precio de lista). Se
            cobraron {cop(mia.monto_final)} y se te devolvieron <strong>{cop(devuelto)}</strong>.
          </li>
        </ol>
        {cuadra && (
          <p className="sello" role="note">
            <IconoCheck size={20} />
            <span>
              <strong>Cuadra al peso.</strong> La orden completa vale {cop(p.valor_orden)} y lo que pagaron las{' '}
              {p.participantes} tiendas suma exactamente {cop(p.suma_cobros)}. Nadie paga de más ni de menos.
            </span>
          </p>
        )}
      </details>

      <span className="sub">Cerró el {p.cerrado_en && fechaHora(p.cerrado_en)}</span>
    </div>
  );
}

/** Dónde y cuándo se recoge la mercancía, y cuántas vecinas ya lo hicieron. */
function EstadoEntrega({ p, onEntrega }: { p: Pedido; onEntrega: (p: Pedido) => void }) {
  const mia = p.mi_participacion;
  const todas = p.retirados === p.participantes;

  return (
    <div className="entrega">
      <IconoCaja size={22} />
      <div>
        {p.soy_anfitrion ? (
          <p>
            <strong>Tú entregas este pedido.</strong>{' '}
            {todas ? 'Todas las tiendas recogieron sus cajas.' : `${p.retirados} de ${p.participantes} tiendas ya recogieron.`}
          </p>
        ) : mia?.retirado_en ? (
          <p>
            <strong>Recogiste {mia.cajas === 1 ? 'tu caja' : `tus ${mia.cajas} cajas`}</strong> el {fechaHoraFin(mia.retirado_en)}
          </p>
        ) : mia ? (
          <p>
            <strong>Recoge {mia.cajas === 1 ? 'tu caja' : `tus ${mia.cajas} cajas`}</strong> en {lugar(p.punto_acopio)}.{' '}
            <span className="sub">
              {p.retirados} de {p.participantes} tiendas ya recogieron.
            </span>
          </p>
        ) : null}
        {p.estado === 'entregado' && p.entregado_en && (
          <p className="sub">Pedido entregado el {fechaHoraFin(p.entregado_en)}</p>
        )}
        {p.soy_anfitrion && (
          <button className="btn secundario compacto" type="button" onClick={() => onEntrega(p)}>
            Lista de entrega ({p.retirados}/{p.participantes})
          </button>
        )}
      </div>
    </div>
  );
}
