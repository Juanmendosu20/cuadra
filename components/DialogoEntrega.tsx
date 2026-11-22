'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { rpc } from '@/lib/supabase';
import type { ItemEntrega, Pedido } from '@/lib/tipos';
import { Dialogo } from './Dialogo';
import { IconoCheck } from './Iconos';

/**
 * Lista de entrega de la tienda anfitriona: cuántas cajas recoge cada vecina.
 * Es la única pantalla con cajas por tienda, y solo la ve quien entrega el pedido.
 */
export function DialogoEntrega({
  pedido,
  token,
  onCerrar,
  onCambio,
}: {
  pedido: Pedido | null;
  token: string;
  onCerrar: () => void;
  onCambio: () => void;
}) {
  const id = useId();
  return (
    <Dialogo abierto={!!pedido} onCerrar={onCerrar} tituloId={`${id}-t`}>
      {pedido && (
        <Lista key={pedido.id} p={pedido} token={token} tituloId={`${id}-t`} onCerrar={onCerrar} onCambio={onCambio} />
      )}
    </Dialogo>
  );
}

function Lista({
  p,
  token,
  tituloId,
  onCerrar,
  onCambio,
}: {
  p: Pedido;
  token: string;
  tituloId: string;
  onCerrar: () => void;
  onCambio: () => void;
}) {
  const [items, setItems] = useState<ItemEntrega[] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      setItems(await rpc<ItemEntrega[]>('lista_entrega', { p_token: token, p_pedido_id: p.id }));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [p.id, token]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function marcar(item: ItemEntrega) {
    setOcupado(item.participacion_id);
    setError('');
    try {
      await rpc('marcar_retiro', {
        p_token: token,
        p_participacion_id: item.participacion_id,
        p_retirado: !item.retirado_en,
      });
      await cargar();
      onCambio();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  const listos = items?.filter((i) => i.retirado_en).length ?? 0;
  const total = items?.length ?? 0;
  const completo = total > 0 && listos === total;

  return (
    <div>
      <h2 id={tituloId}>Lista de entrega</h2>
      <p className="sub">
        {p.producto} · {p.total_cajas} cajas en total. Marca cada tienda cuando recoja.
      </p>

      {items === null && !error && <p className="vacio">Cargando…</p>}

      {items && (
        <>
          <p className={completo ? 'aviso exito' : 'aviso'} aria-live="polite">
            {completo
              ? '¡Listo! Todas las tiendas recogieron. El pedido quedó como entregado.'
              : `${listos} de ${total} tiendas han recogido.`}
          </p>
          <ul className="lista-entrega">
            {items.map((i) => {
              const hecho = !!i.retirado_en;
              return (
                <li key={i.participacion_id}>
                  <button
                    type="button"
                    className={hecho ? 'casilla hecha' : 'casilla'}
                    aria-pressed={hecho}
                    disabled={ocupado !== null}
                    onClick={() => marcar(i)}
                  >
                    <span className="marca" aria-hidden="true">
                      {hecho && <IconoCheck size={18} />}
                    </span>
                    <span className="nombre">
                      {i.es_mia ? `${i.tienda} (tu tienda)` : i.tienda}
                    </span>
                    <span className="cajas">{i.cajas} cajas</span>
                    <span className="visually-hidden">{hecho ? ', ya recogió' : ', pendiente'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {error && (
        <p className="aviso error" role="alert" style={{ marginBlockStart: '0.75rem' }}>
          {error}
        </p>
      )}

      <div className="pie">
        <button className="btn" type="button" onClick={onCerrar}>
          Listo
        </button>
      </div>
    </div>
  );
}
