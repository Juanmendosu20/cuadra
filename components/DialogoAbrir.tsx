'use client';

import { useId, useState } from 'react';
import { cop } from '@/lib/formato';
import { descuentoPara } from '@/lib/prorrateo';
import type { Producto } from '@/lib/tipos';
import { Dialogo } from './Dialogo';

export type DatosNuevoPedido = {
  productoId: string;
  objetivo: number;
  horas: number;
  acopio: string;
  misCajas: number;
};

export function DialogoAbrir({
  abierto,
  catalogo,
  tienda,
  onCerrar,
  onConfirmar,
}: {
  abierto: boolean;
  catalogo: Producto[];
  tienda: string;
  onCerrar: () => void;
  onConfirmar: (d: DatosNuevoPedido) => Promise<void>;
}) {
  const id = useId();
  return (
    <Dialogo abierto={abierto} onCerrar={onCerrar} tituloId={`${id}-t`}>
      <Formulario catalogo={catalogo} tienda={tienda} tituloId={`${id}-t`} onCerrar={onCerrar} onConfirmar={onConfirmar} />
    </Dialogo>
  );
}

function Formulario({
  catalogo,
  tienda,
  tituloId,
  onCerrar,
  onConfirmar,
}: {
  catalogo: Producto[];
  tienda: string;
  tituloId: string;
  onCerrar: () => void;
  onConfirmar: (d: DatosNuevoPedido) => Promise<void>;
}) {
  const [productoId, setProductoId] = useState(catalogo[0]?.id ?? '');
  const prod = catalogo.find((c) => c.id === productoId);
  const [objetivo, setObjetivo] = useState<number>(prod?.objetivo_minimo ?? 1);
  const [misCajas, setMisCajas] = useState(3);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  function elegir(idProd: string) {
    setProductoId(idProd);
    const p = catalogo.find((c) => c.id === idProd);
    if (p) setObjetivo(p.objetivo_minimo);
  }

  const desc = prod ? descuentoPara(prod.escalas, objetivo) : 0;
  const valor = prod ? Math.round(objetivo * prod.precio_lista_caja * (1 - desc / 100)) : 0;

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    if (!f.reportValidity()) return;
    const datos = new FormData(f);
    setEnviando(true);
    setError('');
    try {
      await onConfirmar({
        productoId,
        objetivo,
        horas: Number(datos.get('horas')),
        acopio: String(datos.get('acopio')),
        misCajas,
      });
    } catch (err) {
      setError((err as Error).message);
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar}>
      <h2 id={tituloId}>Abrir un pedido conjunto</h2>
      <p className="sub">Tu tienda será la anfitriona: recibe la entrega y las vecinas pasan a recoger.</p>

      <fieldset>
        <legend>Producto</legend>
        <div className="opciones">
          {catalogo.map((c) => (
            <label key={c.id} className="opcion">
              <input
                type="radio"
                name="producto"
                value={c.id}
                checked={productoId === c.id}
                onChange={() => elegir(c.id)}
                required
              />
              <span>
                <strong>{c.nombre}</strong>
                <br />
                <span className="sub">
                  {c.empaque} · {cop(c.precio_lista_caja)}/caja · hasta −
                  {Math.max(...c.escalas.map((e) => e.descuento_pct))}%
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {prod && (
        <div className="campo">
          <label htmlFor={`${tituloId}-obj`}>Meta del pedido (cajas en total)</label>
          <input
            id={`${tituloId}-obj`}
            type="number"
            inputMode="numeric"
            min={prod.objetivo_minimo}
            max={500}
            required
            value={Number.isNaN(objetivo) ? '' : objetivo}
            onChange={(e) => setObjetivo(parseInt(e.target.value, 10))}
            aria-describedby={`${tituloId}-obj-ayuda`}
          />
          <span id={`${tituloId}-obj-ayuda`} className="ayuda">
            Mínimo {prod.objetivo_minimo} cajas: por debajo, el descuento no alcanza a cubrir el costo de coordinar
            (regla de ahorro neto: −5% y pedido de al menos {cop(1500000)}). Con {objetivo || 0} cajas: −{desc}% ·
            pedido de {cop(valor)}.
          </span>
        </div>
      )}

      <div className="campo">
        <label htmlFor={`${tituloId}-mias`}>¿Cuántas cajas pones tú?</label>
        <input
          id={`${tituloId}-mias`}
          type="number"
          inputMode="numeric"
          min={1}
          max={Math.max(1, (objetivo || 1) * 2)}
          required
          value={Number.isNaN(misCajas) ? '' : misCajas}
          onChange={(e) => setMisCajas(parseInt(e.target.value, 10))}
        />
      </div>

      <div className="campo">
        <label htmlFor={`${tituloId}-horas`}>¿Cuándo cierra?</label>
        <select id={`${tituloId}-horas`} name="horas" defaultValue="24">
          <option value="6">En 6 horas</option>
          <option value="12">En 12 horas</option>
          <option value="24">Mañana (24 horas)</option>
          <option value="48">En 2 días</option>
          <option value="72">En 3 días</option>
        </select>
      </div>

      <div className="campo">
        <label htmlFor={`${tituloId}-acopio`}>Punto de entrega</label>
        <input
          id={`${tituloId}-acopio`}
          name="acopio"
          type="text"
          required
          maxLength={140}
          defaultValue={tienda}
          autoComplete="off"
        />
      </div>

      {error && (
        <p className="aviso error" role="alert">
          {error}
        </p>
      )}

      <div className="pie">
        <button className="btn secundario" type="button" onClick={onCerrar}>
          Cancelar
        </button>
        <button className="btn" type="submit" disabled={enviando}>
          {enviando ? 'Abriendo…' : 'Abrir pedido'}
        </button>
      </div>
    </form>
  );
}
