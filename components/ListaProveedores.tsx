'use client';

import { cop } from '@/lib/formato';
import type { Proveedor } from '@/lib/tipos';
import { IconoProveedores } from './Iconos';

/** Directorio de proveedores verificados: qué se puede pedir en conjunto y desde cuántas cajas ahorra. */
export function ListaProveedores({
  proveedores,
  onAbrir,
}: {
  proveedores: Proveedor[] | null;
  onAbrir: (idProducto: string) => void;
}) {
  return (
    <>
      <h1 className="titulo-vista">Proveedores</h1>
      <p className="sub" style={{ marginBlockEnd: '0.75rem' }}>
        Proveedores verificados por el equipo de Cuadra. Cada uno da mejor precio cuanto más cajas pide la zona.
      </p>

      {proveedores === null ? (
        <p className="vacio" aria-busy="true">Cargando proveedores…</p>
      ) : proveedores.length === 0 ? (
        <div className="estado-vacio">
          <IconoProveedores size={40} />
          <p>Todavía no hay proveedores.</p>
        </div>
      ) : (
        <div className="lista-tarjetas">
          {proveedores.map((pv) => (
            <article key={pv.id} className="tarjeta proveedor" aria-labelledby={`pv-${pv.id}`}>
              <header>
                <div>
                  <h2 id={`pv-${pv.id}`}>{pv.nombre}</h2>
                  <p className="sub">
                    Entrega en {pv.cobertura} · flete {cop(pv.flete_por_entrega)} por pedido, repartido entre las tiendas
                  </p>
                </div>
                <span className="etiqueta confirmado">{pv.categoria}</span>
              </header>

              {pv.productos.length === 0 ? (
                <p className="sub">Sin productos publicados todavía.</p>
              ) : (
                <ul className="productos-proveedor">
                  {pv.productos.map((p) => (
                    <li key={p.id}>
                      <div className="fila-producto">
                        <span>
                          <strong>{p.nombre}</strong>
                          <span className="sub"> · {p.empaque} · {cop(p.precio_lista_caja)} la caja</span>
                        </span>
                      </div>
                      <ul className="escalones" aria-label={`Descuentos por volumen de ${p.nombre}`}>
                        {p.escalas.map((e) => (
                          <li key={e.cajas_min}>
                            {e.cajas_min}+ cajas: −{e.descuento_pct}%
                          </li>
                        ))}
                      </ul>
                      {p.objetivo_minimo !== null && (
                        <div className="fila-producto">
                          <span className="sub">Un pedido conjunto ahorra desde {p.objetivo_minimo} cajas entre todos.</span>
                          <button className="btn compacto secundario" type="button" onClick={() => onAbrir(p.id)}>
                            Abrir pedido
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}

      <p className="pie-nota">
        ¿Conoces un distribuidor de tu zona? Cuéntale al equipo: lo verificamos con una cotización escrita antes de
        publicarlo.
      </p>
    </>
  );
}
