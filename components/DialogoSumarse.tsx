'use client';

import { useId, useState } from 'react';
import { cop, cajas as nCajas } from '@/lib/formato';
import { estimarPago } from '@/lib/prorrateo';
import type { Pedido } from '@/lib/tipos';
import { Dialogo } from './Dialogo';

export function DialogoSumarse({
  pedido,
  onCerrar,
  onConfirmar,
}: {
  pedido: Pedido | null;
  onCerrar: () => void;
  onConfirmar: (p: Pedido, cajas: number) => Promise<void>;
}) {
  const id = useId();
  return (
    <Dialogo abierto={!!pedido} onCerrar={onCerrar} tituloId={`${id}-t`}>
      {pedido && <Contenido key={pedido.id} p={pedido} tituloId={`${id}-t`} onCerrar={onCerrar} onConfirmar={onConfirmar} />}
    </Dialogo>
  );
}

function Contenido({
  p,
  tituloId,
  onCerrar,
  onConfirmar,
}: {
  p: Pedido;
  tituloId: string;
  onCerrar: () => void;
  onConfirmar: (p: Pedido, cajas: number) => Promise<void>;
}) {
  const actuales = p.mi_participacion?.cajas ?? 0;
  const otros = p.total_cajas - actuales;
  const maximo = p.cajas_maximas - otros;
  const [cajas, setCajas] = useState(actuales || 1);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const valido = Number.isInteger(cajas) && cajas >= 1 && cajas <= maximo;
  const total = otros + (valido ? cajas : 0);
  const est = estimarPago({
    escalas: p.escalas,
    precioLista: p.precio_lista_caja,
    fleteTotal: p.flete_total,
    totalCajas: Math.max(total, p.cajas_objetivo),
    misCajas: valido ? cajas : 0,
  });
  const llegaMeta = total >= p.cajas_objetivo;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!valido) return;
    setEnviando(true);
    setError('');
    try {
      await onConfirmar(p, cajas);
    } catch (err) {
      setError((err as Error).message);
      setEnviando(false);
    }
  }

  async function retirarme() {
    setEnviando(true);
    setError('');
    try {
      await onConfirmar(p, 0);
    } catch (err) {
      setError((err as Error).message);
      setEnviando(false);
    }
  }

  const ajustar = (d: number) => setCajas((c) => Math.min(maximo, Math.max(1, (Number(c) || 0) + d)));

  return (
    <form onSubmit={enviar} noValidate>
      <h2 id={tituloId}>{actuales ? 'Cambiar mis cajas' : 'Sumarme al pedido'}</h2>
      <p className="sub">
        {p.producto} · {p.empaque}
      </p>

      <div className="campo">
        <label htmlFor="cajas-sumarse">¿Cuántas cajas necesitas?</label>
        <div className="contador">
          <button type="button" onClick={() => ajustar(-1)} aria-label="Una caja menos">−</button>
          <input
            id="cajas-sumarse"
            name="cajas"
            type="text"
            inputMode="numeric"
            pattern="\d*"
            autoFocus
            value={Number.isNaN(cajas) ? '' : cajas}
            onChange={(e) => setCajas(parseInt(e.target.value.replace(/\D/g, ''), 10))}
            aria-describedby="cajas-ayuda"
            aria-invalid={!valido}
          />
          <button type="button" onClick={() => ajustar(1)} aria-label="Una caja más">+</button>
        </div>
        <span id="cajas-ayuda" className="ayuda">
          Puedes pedir entre 1 y {maximo} cajas (cupo del proveedor).
        </span>
      </div>

      <dl className="datos" aria-live="polite">
        <dt>El pedido quedaría en</dt>
        <dd>
          {total} de {p.cajas_objetivo} cajas
        </dd>
        <dt>Descuento {llegaMeta ? 'al cerrar' : 'si se llega a la meta'}</dt>
        <dd>−{est.descuento}%</dd>
        <dt>Mercancía</dt>
        <dd>{cop(est.mercancia)}</dd>
        <dt>Tu parte del flete (aprox.)</dt>
        <dd>{cop(est.flete)}</dd>
        <dt className="total">Pagarías aprox.</dt>
        <dd className="total">{cop(est.total)}</dd>
        <dt className="ahorro">Ahorro frente a comprar solo</dt>
        <dd className="ahorro">{cop(est.ahorro)}</dd>
      </dl>

      <p className="aviso" style={{ marginBlockStart: '1rem' }}>
        Hoy se retienen {cop(valido ? cajas * p.precio_lista_caja : 0)} (precio de lista). Al cerrar se cobra el
        precio final y se devuelve la diferencia. Si no se llega a {p.cajas_objetivo} cajas, se devuelve todo.
        <br />
        <small>Pago simulado: el prototipo no mueve dinero real.</small>
      </p>

      {error && (
        <p className="aviso error" role="alert" style={{ marginBlockStart: '0.75rem' }}>
          {error}
        </p>
      )}

      <div className="pie">
        {actuales > 0 && !p.soy_anfitrion && (
          <button className="btn peligro" type="button" onClick={retirarme} disabled={enviando}>
            Retirarme
          </button>
        )}
        <button className="btn secundario" type="button" onClick={onCerrar}>
          Cancelar
        </button>
        <button className="btn" type="submit" disabled={enviando || !valido}>
          {enviando ? 'Guardando…' : valido ? `Reservar ${nCajas(cajas)}` : 'Reservar'}
        </button>
      </div>
    </form>
  );
}
