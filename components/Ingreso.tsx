'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { rpc } from '@/lib/supabase';
import type { Sesion, Tienda } from '@/lib/tipos';
import { Logo } from './Logo';
import { IconoPedidos, IconoProveedores } from './Iconos';

// PIN de todas las tiendas de la demostración (público: también se muestra en la pantalla)
const PIN_DEMO = '1234';

/**
 * Entrada a la demo. Dos vistas para mostrar las dos partes del modelo:
 *  · Tiendas: se toca una tienda y se entra sin escribir el PIN (o con PIN, como en las entrevistas).
 *  · Proveedor: /proveedor, la vitrina del mayorista de la demo.
 */
export function Ingreso({ onEntrar }: { onEntrar: (s: Sesion) => void }) {
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState<string | null>(null);
  const [vista, setVista] = useState<'inicio' | 'tiendas'>('inicio');
  const [conPin, setConPin] = useState(false);
  const id = useId();

  useEffect(() => {
    rpc<Tienda[]>('listar_tiendas')
      .then(setTiendas)
      .catch(() => setError('No se pudo cargar la lista de tiendas. Revisa tu conexión.'));
  }, []);

  async function iniciar(tiendaId: string, pin: string) {
    setEnviando(tiendaId);
    setError('');
    try {
      onEntrar(await rpc<Sesion>('iniciar_sesion', { p_tienda_id: tiendaId, p_pin: pin }));
    } catch (err) {
      setError((err as Error).message);
      setEnviando(null);
    }
  }

  function entrarConPin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    iniciar(String(datos.get('tienda')), String(datos.get('pin')));
  }

  // Primero el barrio con más tiendas (donde están los pedidos de la demo)
  const barrios = [...new Set(tiendas.map((t) => t.barrio))].sort(
    (a, b) => tiendas.filter((t) => t.barrio === b).length - tiendas.filter((t) => t.barrio === a).length,
  );

  return (
    <main className="portada">
      <div className="hero">
        <span className="marca-logo">
          <Logo size={44} />
          <h1>Cuadra</h1>
        </span>
        <p>
          Súmate con las tiendas de tu cuadra, completen juntas el pedido mínimo del mayorista y
          compren a precio de escala. Si no se llega a la meta, nadie paga.
        </p>
      </div>

      {vista === 'inicio' && (
        <nav className="vistas" aria-label="Elige una vista de la demostración">
          <button type="button" className="vista-opcion" onClick={() => setVista('tiendas')}>
            <span className="icono"><IconoPedidos size={28} /></span>
            <span>
              <strong>Vista de tiendas</strong>
              <span className="sub">Súmate a pedidos con tus vecinas y mira cuánto ahorras.</span>
            </span>
          </button>
          <Link href="/proveedor" className="vista-opcion">
            <span className="icono"><IconoProveedores size={28} /></span>
            <span>
              <strong>Vista de proveedor</strong>
              <span className="sub">Mira la demanda que junta el barrio y publica ofertas por volumen.</span>
            </span>
          </Link>
        </nav>
      )}

      {vista === 'tiendas' && (
        <section className="panel" aria-labelledby={`${id}-t`}>
          <div className="encabezado-vista">
            <h2 id={`${id}-t`} className="titulo-vista">Elige tu tienda</h2>
            <button type="button" className="btn-texto" onClick={() => setVista('inicio')}>
              Volver
            </button>
          </div>

          {!conPin && (
            <>
              {tiendas.length === 0 && !error && <p className="vacio">Cargando tiendas…</p>}
              {barrios.map((b) => (
                <div key={b} className="grupo-tiendas">
                  <h3>{b}</h3>
                  <ul>
                    {tiendas
                      .filter((t) => t.barrio === b)
                      .map((t) => (
                        <li key={t.id}>
                          <button type="button" className="tienda-opcion" disabled={enviando !== null}
                            onClick={() => iniciar(t.id, PIN_DEMO)}>
                            {t.nombre}
                            <span aria-hidden="true">{enviando === t.id ? '…' : '›'}</span>
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
              <p className="sub" style={{ marginBlockStart: '0.75rem' }}>
                Las tiendas de Suba están lejos de las de Timiza: no ven los mismos pedidos.{' '}
                <button type="button" className="btn-texto" onClick={() => setConPin(true)}>
                  Entrar con PIN
                </button>
              </p>
            </>
          )}

          {conPin && (
            <form onSubmit={entrarConPin}>
              <div className="campo">
                <label htmlFor={`${id}-tienda`}>Mi tienda</label>
                <select id={`${id}-tienda`} name="tienda" required defaultValue="">
                  <option value="" disabled>
                    {tiendas.length ? 'Elige tu tienda' : 'Cargando…'}
                  </option>
                  {barrios.map((b) => (
                    <optgroup key={b} label={b}>
                      {tiendas
                        .filter((t) => t.barrio === b)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nombre}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="campo">
                <label htmlFor={`${id}-pin`}>PIN</label>
                <input id={`${id}-pin`} name="pin" type="password" inputMode="numeric" autoComplete="current-password"
                  required pattern="\d{4}" maxLength={4} aria-describedby={`${id}-pin-ayuda`} enterKeyHint="go" />
                <span id={`${id}-pin-ayuda`} className="ayuda">
                  4 dígitos. En la demostración todas las tiendas usan <strong>{PIN_DEMO}</strong>.
                </span>
              </div>
              <button className="btn bloque" type="submit" disabled={enviando !== null}>
                {enviando ? 'Entrando…' : 'Entrar'}
              </button>
              <p style={{ marginBlockStart: '0.5rem' }}>
                <button type="button" className="btn-texto" onClick={() => setConPin(false)}>
                  Entrar sin PIN
                </button>
              </p>
            </form>
          )}
        </section>
      )}

      {error && (
        <p className="aviso error" role="alert">
          {error}
        </p>
      )}

      <p className="pie-nota">
        Prototipo académico · Universidad El Bosque · Gestión de Tecnología e Innovación 2026-2.
        Tiendas, proveedores, precios y pagos son simulados.
      </p>
    </main>
  );
}
