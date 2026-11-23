'use client';

import { useRef, useState } from 'react';
import { rpc } from '@/lib/supabase';
import { Logo } from '@/components/Logo';

// Formulario de validación de campo. Guarda exactamente lo que responde el participante:
// nada se completa ni se infiere. Los tiempos los mide el propio formulario.

type Datos = Record<string, string | number | boolean | null>;

const TIENDAS = [
  'Tienda Carmencita',
  'Tienda El Paisa',
  'La Esquina de Don Jorge',
  'Granero La Economía',
  'Tienda Mi Barrio',
  'Supertienda La 38',
];

const ESCALA = ['1 · Nada de acuerdo', '2 · Poco', '3 · Más o menos', '4 · Bastante', '5 · Totalmente de acuerdo'];

function Opciones({ name, opciones, valor, onCambio, legend }: {
  name: string; opciones: string[]; valor: string | undefined; onCambio: (v: string) => void; legend: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className="opciones">
        {opciones.map((o) => (
          <label key={o} className="opcion">
            <input type="radio" name={name} value={o} checked={valor === o} onChange={() => onCambio(o)} />
            <span>{o}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Cronometro({ id, onFin }: { id: string; onFin: (seg: number) => void }) {
  const inicio = useRef<number | null>(null);
  const [estado, setEstado] = useState<'listo' | 'corriendo' | 'fin'>('listo');
  const [seg, setSeg] = useState(0);
  return (
    <div className="acciones" style={{ alignItems: 'center', marginBlockEnd: '1rem' }}>
      {estado === 'listo' && (
        <button type="button" className="btn secundario" onClick={() => { inicio.current = Date.now(); setEstado('corriendo'); }}>
          Empezar {id}
        </button>
      )}
      {estado === 'corriendo' && (
        <button type="button" className="btn" onClick={() => {
          const s = Math.round((Date.now() - (inicio.current ?? Date.now())) / 1000);
          setSeg(s); setEstado('fin'); onFin(s);
        }}>
          Terminé {id}
        </button>
      )}
      {estado === 'fin' && <p className="sub" role="status">{id}: {seg} segundos registrados.</p>}
    </div>
  );
}

export default function Encuesta() {
  const [d, setD] = useState<Datos>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);
  const set = (k: string, v: string | number | boolean | null) => setD((x) => ({ ...x, [k]: v }));
  const txt = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(k, e.target.value);
  const num = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')));
  const sino = (k: string) => (v: string) => set(k, v === 'Sí');
  const val = (k: string) => (d[k] === true ? 'Sí' : d[k] === false ? 'No' : undefined);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (d.acepta !== true) { setError('Para guardar se necesita aceptar participar.'); return; }
    setEnviando(true); setError('');
    try {
      await rpc('registrar_respuesta', { p_datos: { ...d, enviado_desde: 'formulario-web', version: 1 } });
      setListo(true);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError((err as Error).message);
      setEnviando(false);
    }
  }

  if (listo) {
    return (
      <main className="portada">
        <div className="hero"><span className="marca-logo"><Logo size={40} /><h1>¡Gracias!</h1></span>
          <p>Sus respuestas quedaron guardadas. Nos ayudan mucho para el proyecto de la universidad.</p></div>
      </main>
    );
  }

  return (
    <main className="app" style={{ paddingBlockStart: '1.5rem' }}>
      <div className="hero" style={{ marginBlockEnd: '1rem' }}>
        <span className="marca-logo"><Logo size={36} /><h1>Encuesta Cuadra</h1></span>
        <p className="sub">Universidad El Bosque · unos 10 minutos. Probamos la aplicación, no a usted.</p>
      </div>

      <form className="panel" onSubmit={enviar} style={{ background: 'var(--papel)', padding: '1.25rem', borderRadius: 'var(--radio)' }}>
        <h2>1. Consentimiento</h2>
        <p className="sub" style={{ marginBlock: '0.5rem 1rem' }}>
          Somos estudiantes de Ingeniería de Sistemas de la Universidad El Bosque y probamos una aplicación para que las
          tiendas del barrio compren juntas y consigan mejores precios. No pedimos su nombre ni datos personales. Los precios
          y pagos de la aplicación son de prueba. Puede dejarla cuando quiera.
        </p>
        <Opciones name="acepta" legend="¿Acepta participar?" opciones={['Sí', 'No']} valor={val('acepta')} onCambio={sino('acepta')} />
        <Opciones name="foto" legend="¿Acepta que se guarde una captura solo de la pantalla de la app?" opciones={['Sí', 'No']} valor={val('foto')} onCambio={sino('foto')} />

        {d.acepta === true && (
          <>
            <h2>2. Su negocio</h2>
            <div className="campo"><label htmlFor="tipo">Tipo de negocio</label>
              <input id="tipo" placeholder="Tienda, panadería, droguería…" onChange={txt('tipo_negocio')} /></div>
            <div className="campo"><label htmlFor="barrio">Barrio</label><input id="barrio" onChange={txt('barrio')} /></div>
            <div className="campo"><label htmlFor="anios">Años del negocio</label>
              <input id="anios" inputMode="numeric" pattern="\d*" onChange={num('anios')} /></div>
            <Opciones name="pagos" legend="¿Usa Nequi, Daviplata o datáfono?" opciones={['Sí', 'No']} valor={val('pagos_digitales')} onCambio={sino('pagos_digitales')} />
            <Opciones name="vinculado" legend="¿Es familiar, socio o empleado de alguien del equipo de estudiantes?" opciones={['Sí', 'No']} valor={val('vinculado')} onCambio={sino('vinculado')} />

            <h2>3. Cómo compra hoy</h2>
            <div className="campo"><label htmlFor="a1">¿Cada cuánto se reabastece, a quién le compra y cómo decide cuánto pedirle?</label>
              <textarea id="a1" rows={3} onChange={txt('a1')} /></div>
            <Opciones name="a2" legend="¿Le ha pasado que el proveedor da mejor precio por más cantidad, pero usted no alcanza a pedir esa cantidad?" opciones={['Sí', 'No']} valor={val('a2')} onCambio={sino('a2')} />
            <div className="campo"><label htmlFor="a3">¿Con qué producto le pasa más?</label><input id="a3" onChange={txt('a3')} /></div>
            <div className="campo"><label htmlFor="a4">¿Alguna vez ha comprado junto con un negocio vecino? ¿Cómo les fue?</label>
              <textarea id="a4" rows={2} onChange={txt('a4')} /></div>
            <div className="campo"><label htmlFor="a5">¿Qué le preocuparía de comprar junto con una tienda que también es su competencia?</label>
              <textarea id="a5" rows={2} onChange={txt('a5')} /></div>

            <h2>4. Pruebe la aplicación</h2>
            <p className="sub" style={{ marginBlock: '0.5rem 1rem' }}>
              Abra la aplicación en otra pestaña y vuelva aquí después de cada tarea. Use el botón “Empezar” justo antes de
              cada tarea y “Terminé” cuando la complete.
            </p>
            <div className="campo"><label htmlFor="tienda">Entre con esta tienda de prueba (PIN 1234)</label>
              <select id="tienda" defaultValue="" onChange={txt('tienda_demo')}>
                <option value="" disabled>Elija una</option>
                {TIENDAS.map((t) => <option key={t}>{t}</option>)}
              </select></div>
            <p style={{ marginBlockEnd: '1rem' }}>
              <a className="btn secundario" href="/" target="_blank" rel="noopener">Abrir la aplicación</a>
            </p>

            <h3>Tarea 1</h3>
            <p style={{ marginBlock: '0.25rem 0.5rem' }}>Entre con la tienda elegida, busque el pedido de <b>arroz</b> y vea cuántas cajas faltan para la meta.</p>
            <Cronometro id="T1" onFin={(s) => set('t1_seg', s)} />
            <div className="campo"><label htmlFor="t1">¿Cuántas cajas faltan?</label>
              <input id="t1" inputMode="numeric" pattern="\d*" onChange={num('t1_respuesta')} /></div>
            <Opciones name="t1a" legend="¿Necesitó que alguien le ayudara?" opciones={['Sí', 'No']} valor={val('t1_ayuda')} onCambio={sino('t1_ayuda')} />

            <h3>Tarea 2</h3>
            <p style={{ marginBlock: '0.25rem 0.5rem' }}>Usted necesita <b>3 cajas de arroz</b>. Súmese al pedido.</p>
            <Cronometro id="T2" onFin={(s) => set('t2_seg', s)} />
            <Opciones name="t2e" legend="¿Logró reservar las 3 cajas?" opciones={['Sí', 'No']} valor={val('t2_exito')} onCambio={sino('t2_exito')} />
            <Opciones name="t2a" legend="¿Necesitó que alguien le ayudara?" opciones={['Sí', 'No']} valor={val('t2_ayuda')} onCambio={sino('t2_ayuda')} />

            <h3>Tarea 3</h3>
            <div className="campo"><label htmlFor="t3a">Según la aplicación, ¿cuánto dinero le retienen hoy? (escriba el valor)</label>
              <input id="t3a" inputMode="numeric" placeholder="Solo números" onChange={num('t3a_valor')} /></div>
            <Opciones name="t3b" legend="Si el pedido NO llega a 30 cajas, ¿qué pasa con esa plata?"
              opciones={['Me la devuelven toda', 'Queda para el próximo pedido', 'Se pierde', 'No sé']}
              valor={d.t3b_respuesta as string | undefined} onCambio={(v) => set('t3b_respuesta', v)} />

            <h2>5. Su opinión</h2>
            <Opciones name="e1" legend="Fue fácil sumarme a un pedido." opciones={ESCALA} valor={d.e1_txt as string | undefined} onCambio={(v) => { set('e1_txt', v); set('e1', Number(v[0])); }} />
            <Opciones name="e2" legend="Entiendo cuánto voy a pagar y cuánto me ahorro." opciones={ESCALA} valor={d.e2_txt as string | undefined} onCambio={(v) => { set('e2_txt', v); set('e2', Number(v[0])); }} />
            <Opciones name="e3" legend="Me da confianza que la plata quede retenida y se devuelva si no se llega a la meta." opciones={ESCALA} valor={d.e3_txt as string | undefined} onCambio={(v) => { set('e3_txt', v); set('e3', Number(v[0])); }} />
            <Opciones name="e4" legend="Usaría Cuadra para comprar con tiendas vecinas, aunque sean mi competencia." opciones={ESCALA} valor={d.e4_txt as string | undefined} onCambio={(v) => { set('e4_txt', v); set('e4', Number(v[0])); }} />
            <Opciones name="e5" legend="Me importa que las otras tiendas no vean cuánto compro." opciones={ESCALA} valor={d.e5_txt as string | undefined} onCambio={(v) => { set('e5_txt', v); set('e5', Number(v[0])); }} />
            <div className="campo"><label htmlFor="e6">¿Qué producto compraría primero así, en grupo?</label><input id="e6" onChange={txt('e6')} /></div>
            <div className="campo"><label htmlFor="e7">¿Qué le cambiaría a la aplicación?</label><textarea id="e7" rows={3} onChange={txt('e7')} /></div>
            <Opciones name="e8" legend="¿Por dónde quiere recibir los avisos del pedido?" opciones={['WhatsApp', 'La app', 'Llamada', 'Otro']} valor={d.e8 as string | undefined} onCambio={(v) => set('e8', v)} />

            <h2>6. Solo para el entrevistador</h2>
            <div className="campo"><label htmlFor="codigo">Código del participante (P1, P2…)</label><input id="codigo" onChange={txt('codigo')} /></div>
            <div className="campo"><label htmlFor="obs">Observaciones y frases textuales</label><textarea id="obs" rows={3} onChange={txt('observaciones')} /></div>
          </>
        )}

        {error && <p className="aviso error" role="alert" style={{ marginBlockEnd: '1rem' }}>{error}</p>}
        <button className="btn bloque" type="submit" disabled={enviando || d.acepta !== true}>
          {enviando ? 'Guardando…' : 'Enviar respuestas'}
        </button>
      </form>
    </main>
  );
}
