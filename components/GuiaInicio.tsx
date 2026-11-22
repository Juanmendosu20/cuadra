'use client';

import { useId } from 'react';
import { Dialogo } from './Dialogo';

const PASOS = [
  {
    titulo: 'Súmate a un pedido de tu zona',
    texto: 'Elige cuántas cajas necesitas. Se retiene el precio de lista, sin cobrarte todavía.',
  },
  {
    titulo: 'Si juntan la meta, todas ahorran',
    texto: 'Cada tienda paga sus cajas a precio de mayorista y su parte del flete, calculada al peso.',
  },
  {
    titulo: 'Si no se llega, nadie paga',
    texto: 'Se devuelve todo lo retenido. Si se confirma, recoges tus cajas en la tienda anfitriona.',
  },
];

/** «Cómo funciona» en tres pasos. Se muestra la primera vez y desde el botón de ayuda. */
export function GuiaInicio({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const id = useId();
  return (
    <Dialogo abierto={abierto} onCerrar={onCerrar} tituloId={`${id}-t`}>
      <h2 id={`${id}-t`}>Así funciona Cuadra</h2>
      <p className="sub">Compra con las tiendas de tu cuadra al precio de los grandes.</p>
      <ol className="guia">
        {PASOS.map((p, i) => (
          <li key={i}>
            <span className="numero" aria-hidden="true">
              {i + 1}
            </span>
            <span>
              <strong>{p.titulo}</strong>
              <br />
              <span className="sub">{p.texto}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="sub">Tus vecinas nunca ven cuántas cajas pides tú: solo el total del pedido.</p>
      <div className="pie">
        <button className="btn bloque" type="button" onClick={onCerrar} autoFocus>
          Entendido
        </button>
      </div>
    </Dialogo>
  );
}
