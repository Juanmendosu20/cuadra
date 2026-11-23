'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { rpc, supabase } from '@/lib/supabase';
import { cop, fechaHora, cajas as nCajas } from '@/lib/formato';
import type { Movimiento, Pedido, Producto, Sesion } from '@/lib/tipos';
import { Ingreso } from '@/components/Ingreso';
import { Logo } from '@/components/Logo';
import { TarjetaPedido } from '@/components/TarjetaPedido';
import { DialogoSumarse } from '@/components/DialogoSumarse';
import { DialogoAbrir, type DatosNuevoPedido } from '@/components/DialogoAbrir';
import { DialogoEntrega } from '@/components/DialogoEntrega';
import { GuiaInicio } from '@/components/GuiaInicio';
import {
  IconoAyuda,
  IconoHistorial,
  IconoMas,
  IconoPedidos,
  IconoRegistro,
  IconoSinSenal,
} from '@/components/Iconos';

const CLAVE = 'cuadra.sesion';
const CLAVE_GUIA = 'cuadra.guia-vista';

type Vista = 'abiertos' | 'historial' | 'movimientos';

function textoMovimiento(m: Movimiento): string {
  const d = m.detalle ?? {};
  switch (m.accion) {
    case 'pedido_abierto':
      return 'Abriste un pedido';
    case 'reserva':
      return 'Reservaste cajas';
    case 'retiro':
      return 'Te retiraste de un pedido';
    case 'cierre_manual':
      return 'Cerraste un pedido';
    case 'entrega_marcada':
      return d.retirado ? `Entregaste a ${d.tienda}` : `Desmarcaste la entrega de ${d.tienda}`;
    case 'retiro_confirmado':
      return 'Recogiste tus cajas';
    case 'pedido_entregado':
      return 'Completaste la entrega del pedido';
    default:
      return m.accion;
  }
}

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

/** Vibración corta al confirmar una acción (solo en celulares que la soportan). */
const vibrar = () => {
  try {
    navigator.vibrate?.(30);
  } catch {}
};

function useEnLinea() {
  const [enLinea, setEnLinea] = useState(true);
  useEffect(() => {
    const actualizar = () => setEnLinea(navigator.onLine);
    actualizar();
    window.addEventListener('online', actualizar);
    window.addEventListener('offline', actualizar);
    return () => {
      window.removeEventListener('online', actualizar);
      window.removeEventListener('offline', actualizar);
    };
  }, []);
  return enLinea;
}

function Panel({ sesion, onSalir }: { sesion: Sesion; onSalir: () => void }) {
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [catalogo, setCatalogo] = useState<Producto[]>([]);
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [vista, setVista] = useState<Vista>('abiertos');
  const [sumarse, setSumarse] = useState<Pedido | null>(null);
  const [entrega, setEntrega] = useState<Pedido | null>(null);
  const [abrir, setAbrir] = useState(false);
  const [guia, setGuia] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [reintentando, setReintentando] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);
  const enLinea = useEnLinea();

  const token = sesion.token;

  // La guía «Cómo funciona» aparece sola la primera vez en este celular
  useEffect(() => {
    try {
      if (!localStorage.getItem(CLAVE_GUIA)) setGuia(true);
    } catch {}
  }, []);
  const cerrarGuia = useCallback(() => {
    setGuia(false);
    try {
      localStorage.setItem(CLAVE_GUIA, '1');
    } catch {}
  }, []);

  const avisar = (m: string) => {
    setMensaje(m);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setMensaje(''), 3500);
  };

  const manejarError = useCallback(
    (e: unknown) => {
      const err = e as Error & { code?: string };
      if (err.code === '28000') onSalir();
      else
        setError(
          /fetch|network|Failed/i.test(err.message)
            ? 'No pudimos conectarnos. Revisa los datos o el wifi.'
            : err.message,
        );
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

  const reintentar = async () => {
    setReintentando(true);
    await cargar();
    if (!catalogo.length) rpc<Producto[]>('catalogo', { p_token: token }).then(setCatalogo).catch(() => {});
    setReintentando(false);
  };

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
    window.addEventListener('online', cargar);

    return () => {
      supabase().removeChannel(canal);
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('online', cargar);
    };
  }, [token, cargar, manejarError]);

  // Mantiene el diálogo de entrega con los datos más recientes del pedido
  useEffect(() => {
    if (entrega && pedidos) {
      const fresco = pedidos.find((p) => p.id === entrega.id);
      if (fresco && fresco !== entrega) setEntrega(fresco);
    }
  }, [pedidos, entrega]);

  const confirmarSumarse = async (p: Pedido, cajas: number) => {
    await rpc('sumarse', { p_token: token, p_pedido_id: p.id, p_cajas: cajas });
    setSumarse(null);
    vibrar();
    avisar(cajas === 0 ? 'Te retiraste del pedido.' : `Listo: ${nCajas(cajas)} en ${p.producto}.`);
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
    vibrar();
    avisar('Pedido abierto. Las tiendas de tu zona ya lo pueden ver.');
    cargar();
  };

  const cerrarAhora = async (p: Pedido) => {
    try {
      const r = await rpc<Pedido>('cerrar_ahora', { p_token: token, p_pedido_id: p.id });
      vibrar();
      avisar(
        r.estado === 'confirmado'
          ? 'Pedido confirmado. Revisa la liquidación en Historial.'
          : 'No se llegó a la meta: se devolvió todo.',
      );
      setVista('historial');
      cargar();
    } catch (e) {
      manejarError(e);
    }
  };

  const abiertos = pedidos?.filter((p) => p.estado === 'abierto') ?? [];
  const cerrados = pedidos?.filter((p) => p.estado !== 'abierto') ?? [];
  const confirmados = cerrados.filter((p) => p.mi_participacion?.ahorro);
  const ahorroTotal = confirmados.reduce((a, p) => a + Number(p.mi_participacion?.ahorro ?? 0), 0);

  const tarjetas = (lista: Pedido[]) => (
    <ul className="lista">
      {lista.map((p) => (
        <TarjetaPedido key={p.id} p={p} onSumarse={setSumarse} onCerrar={cerrarAhora} onEntrega={setEntrega} />
      ))}
    </ul>
  );

  const resumenAhorro = ahorroTotal > 0 && (
    <p className="resumen">
      <span className="sub">Llevas ahorrado</span>
      <strong>{cop(ahorroTotal)}</strong>
      <span className="sub">
        en {confirmados.length} {confirmados.length === 1 ? 'pedido conjunto' : 'pedidos conjuntos'}
      </span>
    </p>
  );

  return (
    <>
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
        <span className="barra-acciones">
          <button className="btn-icono" type="button" onClick={() => setGuia(true)} aria-label="Cómo funciona">
            <IconoAyuda />
          </button>
          <button className="btn-salir" type="button" onClick={onSalir}>
            Salir
          </button>
        </span>
      </header>

      {!enLinea && (
        <p className="sin-senal" role="status">
          <IconoSinSenal size={20} />
          Sin conexión. Lo que ves puede no estar al día.
        </p>
      )}

      <div className="app">
        {error && pedidos !== null && (
          <div className="aviso error fila" role="alert">
            <span>{error}</span>
            <button className="btn-texto" type="button" onClick={reintentar} disabled={reintentando}>
              Reintentar
            </button>
          </div>
        )}

        <main>
          {pedidos === null && !error && <Esqueleto />}

          {pedidos === null && error && (
            <div className="estado-vacio" role="alert">
              <IconoSinSenal size={40} />
              <p>{error}</p>
              <button className="btn" type="button" onClick={reintentar} disabled={reintentando}>
                {reintentando ? 'Reintentando…' : 'Reintentar'}
              </button>
            </div>
          )}

          {pedidos && vista === 'abiertos' && (
            <>
              <div className="encabezado-vista">
                <h1 className="titulo-vista">Pedidos en tu zona</h1>
                {abiertos.length > 0 && (
                  <button className="btn-abrir" type="button" onClick={() => setAbrir(true)} disabled={!catalogo.length}>
                    <IconoMas size={20} />
                    Abrir pedido
                  </button>
                )}
              </div>
              {resumenAhorro}
              {abiertos.length === 0 ? (
                <div className="estado-vacio">
                  <IconoPedidos size={40} />
                  <p>No hay pedidos abiertos a menos de 1,5 km.</p>
                  <button className="btn" type="button" onClick={() => setAbrir(true)} disabled={!catalogo.length}>
                    Abrir el primero
                  </button>
                </div>
              ) : (
                tarjetas(abiertos)
              )}
            </>
          )}

          {pedidos && vista === 'historial' && (
            <>
              <h1 className="titulo-vista">Historial</h1>
              {resumenAhorro}
              {cerrados.length === 0 ? (
                <div className="estado-vacio">
                  <IconoHistorial size={40} />
                  <p>Aún no tienes pedidos cerrados.</p>
                </div>
              ) : (
                tarjetas(cerrados)
              )}
            </>
          )}

          {pedidos && vista === 'movimientos' && (
            <>
              <h1 className="titulo-vista">Movimientos</h1>
              <p className="sub" style={{ marginBlockEnd: '0.75rem' }}>
                Registro de lo que ha hecho tu tienda. Cada acción queda guardada con fecha y hora.
              </p>
              {movs.length === 0 ? (
                <div className="estado-vacio">
                  <IconoRegistro size={40} />
                  <p>Sin movimientos todavía.</p>
                </div>
              ) : (
                <ul className="movs">
                  {movs.map((m, i) => (
                    <li key={i}>
                      <span>
                        <strong>{textoMovimiento(m)}</strong>
                        {m.producto && ` · ${m.producto}`}
                        {typeof m.detalle?.cajas === 'number' && ` · ${nCajas(m.detalle.cajas)}`}
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

      <nav className="nav-inferior" aria-label="Secciones">
        {(
          [
            ['abiertos', 'Pedidos', IconoPedidos, abiertos.length],
            ['historial', 'Historial', IconoHistorial, 0],
            ['movimientos', 'Movimientos', IconoRegistro, 0],
          ] as const
        ).map(([v, texto, Icono, cuenta]) => (
          <button
            key={v}
            type="button"
            aria-current={vista === v ? 'page' : undefined}
            onClick={() => {
              setVista(v);
              window.scrollTo({ top: 0 });
            }}
          >
            <span className="icono">
              <Icono />
              {cuenta > 0 && <span className="globo">{cuenta}</span>}
            </span>
            {texto}
          </button>
        ))}
      </nav>

      <div className="estado-vivo" role="status">
        {mensaje && <p>{mensaje}</p>}
      </div>

      <DialogoSumarse pedido={sumarse} onCerrar={() => setSumarse(null)} onConfirmar={confirmarSumarse} />
      <DialogoEntrega pedido={entrega} token={token} onCerrar={() => setEntrega(null)} onCambio={cargar} />
      <DialogoAbrir
        abierto={abrir}
        catalogo={catalogo}
        tienda={sesion.tienda.nombre}
        onCerrar={() => setAbrir(false)}
        onConfirmar={confirmarAbrir}
      />
      <GuiaInicio abierto={guia} onCerrar={cerrarGuia} />
    </>
  );
}

/** Siluetas de tarjetas mientras cargan los pedidos. */
function Esqueleto() {
  return (
    <div aria-busy="true" aria-label="Cargando pedidos de tu zona">
      <div className="esqueleto linea corta" />
      {[0, 1].map((i) => (
        <div key={i} className="tarjeta esqueleto-tarjeta" aria-hidden="true">
          <div className="esqueleto linea media" />
          <div className="esqueleto linea" />
          <div className="esqueleto barra-progreso" />
          <div className="esqueleto boton" />
        </div>
      ))}
    </div>
  );
}
