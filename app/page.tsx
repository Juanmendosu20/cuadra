'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { rpc, supabase } from '@/lib/supabase';
import { cop, fechaHora } from '@/lib/formato';
import type { Movimiento, Pedido, Producto, Sesion } from '@/lib/tipos';
import { Ingreso } from '@/components/Ingreso';
import { Logo } from '@/components/Logo';
import { TarjetaPedido } from '@/components/TarjetaPedido';
import { DialogoSumarse } from '@/components/DialogoSumarse';
import { DialogoAbrir, type DatosNuevoPedido } from '@/components/DialogoAbrir';

const CLAVE = 'cuadra.sesion';

type Vista = 'abiertos' | 'historial' | 'movimientos';

const ACCIONES: Record<string, string> = {
  pedido_abierto: 'Abriste un pedido',
  reserva: 'Reservaste cajas',
  retiro: 'Te retiraste de un pedido',
  cierre_manual: 'Cerraste un pedido',
};

function leerSesion(): Sesion | null {
  try {
    const s = localStorage.getItem(CLAVE);
    return s ? (JSON.parse(s) as Sesion) : null;
  } catch {
    return null;
  }
}

export default function Inicio() {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    setSesion(leerSesion());
    setListo(true);
  }, []);

  const entrar = (s: Sesion) => {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(s));
    } catch {}
    setSesion(s);
  };
  const salir = useCallback(() => {
    try {
      localStorage.removeItem(CLAVE);
    } catch {}
    setSesion(null);
  }, []);

  if (!listo) return null;
  if (!sesion) return <Ingreso onEntrar={entrar} />;
  return <Panel sesion={sesion} onSalir={salir} />;
}

function Panel({ sesion, onSalir }: { sesion: Sesion; onSalir: () => void }) {
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [catalogo, setCatalogo] = useState<Producto[]>([]);
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [vista, setVista] = useState<Vista>('abiertos');
  const [sumarse, setSumarse] = useState<Pedido | null>(null);
  const [abrir, setAbrir] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);

  const token = sesion.token;

  const avisar = (m: string) => {
    setMensaje(m);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setMensaje(''), 3500);
  };

  const manejarError = useCallback(
    (e: unknown) => {
      const err = e as Error & { code?: string };
      if (err.code === '28000') onSalir();
      else setError(err.message);
    },
    [onSalir],
  );

  const cargar = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([
        rpc<Pedido[]>('listar_pedidos', { p_token: token }),
        rpc<Movimiento[]>('mis_movimientos', { p_token: token }),
      ]);
      setPedidos(p);
      setMovs(m);
      setError('');
    } catch (e) {
      manejarError(e);
    }
  }, [token, manejarError]);

  useEffect(() => {
    cargar();
    rpc<Producto[]>('catalogo', { p_token: token }).then(setCatalogo).catch(manejarError);

    // Tiempo real: la base avisa qué pedido cambió (sin datos de otras tiendas) y se vuelve a consultar
    const canal = supabase()
      .channel('pedidos')
      .on('broadcast', { event: 'cambio' }, () => cargar())
      .subscribe();

    // Respaldo por si la conexión en tiempo real se cae (redes móviles inestables)
    const intervalo = setInterval(cargar, 20000);
    const alVolver = () => document.visibilityState === 'visible' && cargar();
    document.addEventListener('visibilitychange', alVolver);

    return () => {
      supabase().removeChannel(canal);
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [token, cargar, manejarError]);

  const confirmarSumarse = async (p: Pedido, cajas: number) => {
    await rpc('sumarse', { p_token: token, p_pedido_id: p.id, p_cajas: cajas });
    setSumarse(null);
    avisar(cajas === 0 ? 'Te retiraste del pedido.' : `Listo: ${cajas} cajas reservadas en ${p.producto}.`);
    cargar();
  };

  const confirmarAbrir = async (d: DatosNuevoPedido) => {
    await rpc('abrir_pedido', {
      p_token: token,
      p_producto_id: d.productoId,
      p_cajas_objetivo: d.objetivo,
      p_horas: d.horas,
      p_punto_acopio: d.acopio,
      p_mis_cajas: d.misCajas,
    });
    setAbrir(false);
    setVista('abiertos');
    avisar('Pedido abierto. Las tiendas de tu zona ya lo pueden ver.');
    cargar();
  };

  const cerrarAhora = async (p: Pedido) => {
    try {
      const r = await rpc<Pedido>('cerrar_ahora', { p_token: token, p_pedido_id: p.id });
      avisar(r.estado === 'confirmado' ? 'Pedido confirmado. Revisa tu liquidación en Historial.' : 'No se llegó a la meta: se devolvió todo.');
      setVista('historial');
      cargar();
    } catch (e) {
      manejarError(e);
    }
  };

  const abiertos = pedidos?.filter((p) => p.estado === 'abierto') ?? [];
  const cerrados = pedidos?.filter((p) => p.estado !== 'abierto') ?? [];
  const ahorroTotal = cerrados.reduce((a, p) => a + Number(p.mi_participacion?.ahorro ?? 0), 0);

  return (
    <>
      <div className="app">
        <header className="barra">
          <span className="marca-logo">
            <Logo />
            <span>
              <span className="marca">Cuadra</span>
              <br />
              <span className="tienda">
                {sesion.tienda.nombre} · {sesion.tienda.barrio}
              </span>
            </span>
          </span>
          <button className="btn-salir" type="button" onClick={onSalir}>
            Salir
          </button>
        </header>

        <nav className="tabs" aria-label="Secciones">
          {(
            [
              ['abiertos', `Abiertos (${abiertos.length})`],
              ['historial', 'Historial'],
              ['movimientos', 'Movimientos'],
            ] as [Vista, string][]
          ).map(([v, t]) => (
            <button key={v} type="button" aria-pressed={vista === v} onClick={() => setVista(v)}>
              {t}
            </button>
          ))}
        </nav>

        {error && (
          <p className="aviso error" role="alert" style={{ marginBlockEnd: '1rem' }}>
            {error}
          </p>
        )}

        <main>
          {pedidos === null && <p className="vacio">Cargando pedidos de tu zona…</p>}

          {pedidos && vista === 'abiertos' && (
            <>
              <h1 className="visually-hidden">Pedidos abiertos en tu zona</h1>
              {abiertos.length === 0 ? (
                <p className="vacio">No hay pedidos abiertos a menos de 1,5 km. ¡Abre el primero!</p>
              ) : (
                <ul className="lista">
                  {abiertos.map((p) => (
                    <TarjetaPedido key={p.id} p={p} onSumarse={setSumarse} onCerrar={cerrarAhora} />
                  ))}
                </ul>
              )}
            </>
          )}

          {pedidos && vista === 'historial' && (
            <>
              <h1 className="visually-hidden">Historial de pedidos</h1>
              {cerrados.length > 0 && (
                <p className="aviso" style={{ marginBlockEnd: '1rem' }}>
                  Ahorro acumulado en pedidos confirmados: <strong>{cop(ahorroTotal)}</strong>
                </p>
              )}
              {cerrados.length === 0 ? (
                <p className="vacio">Aún no tienes pedidos cerrados.</p>
              ) : (
                <ul className="lista">
                  {cerrados.map((p) => (
                    <TarjetaPedido key={p.id} p={p} onSumarse={setSumarse} onCerrar={cerrarAhora} />
                  ))}
                </ul>
              )}
            </>
          )}

          {vista === 'movimientos' && (
            <>
              <h1 className="visually-hidden">Mis movimientos</h1>
              <p className="sub" style={{ marginBlockEnd: '0.75rem' }}>
                Registro de lo que ha hecho tu tienda. Cada acción queda guardada con fecha y hora.
              </p>
              {movs.length === 0 ? (
                <p className="vacio">Sin movimientos todavía.</p>
              ) : (
                <ul className="movs">
                  {movs.map((m, i) => (
                    <li key={i}>
                      <span>
                        <strong>{ACCIONES[m.accion] ?? m.accion}</strong>
                        {m.producto && ` · ${m.producto}`}
                        {typeof m.detalle?.cajas === 'number' && ` · ${m.detalle.cajas} cajas`}
                      </span>
                      <span className="sub">{fechaHora(m.creado)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </main>
      </div>

      <button className="btn fab" type="button" onClick={() => setAbrir(true)} disabled={!catalogo.length}>
        + Abrir pedido conjunto
      </button>

      <div className="estado-vivo" role="status">
        {mensaje && <p>{mensaje}</p>}
      </div>

      <DialogoSumarse pedido={sumarse} onCerrar={() => setSumarse(null)} onConfirmar={confirmarSumarse} />
      <DialogoAbrir
        abierto={abrir}
        catalogo={catalogo}
        tienda={sesion.tienda.nombre}
        onCerrar={() => setAbrir(false)}
        onConfirmar={confirmarAbrir}
      />
    </>
  );
}
