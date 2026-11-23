// Servidor local que imita la API de Supabase (solo las llamadas RPC) sobre una base
// Postgres en memoria con las migraciones reales y los datos demo.
//
// Sirve para dos cosas:
//   1. Desarrollar y probar sin tocar la base de producción.
//   2. Respaldo para la sustentación: la app corre completa en un portátil sin internet.
//
// Uso:  npm run dev:local     (levanta este servidor y la app en http://localhost:3000)
// Clave del modo entrevistador en local: "local"
import { createServer } from 'node:http';
import { montarBase } from '../tests/base.ts';

const PUERTO = Number(process.env.PUERTO_BASE ?? 54321);
const db = await montarBase();
await db.exec(`insert into public.config (clave, valor)
               values ('clave_facilitador', extensions.crypt('local', extensions.gen_salt('bf')))`);

const cabeceras = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, accept-profile, content-profile, prefer',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'content-type': 'application/json',
};

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return res.writeHead(204, cabeceras).end();
  const m = req.url?.match(/^\/rest\/v1\/rpc\/([a-z_]+)/);
  if (!m || req.method !== 'POST') return res.writeHead(404, cabeceras).end('{}');

  let cuerpo = '';
  for await (const parte of req) cuerpo += parte;
  const args: Record<string, unknown> = cuerpo ? JSON.parse(cuerpo) : {};
  const nombres = Object.keys(args);
  const lista = nombres.map((n, i) => `${n} => $${i + 1}`).join(', ');
  try {
    const r = await db.query<Record<string, unknown>>(`select * from public.${m[1]}(${lista})`, Object.values(args));
    const unaColumna = r.fields.length === 1 && r.fields[0].name === m[1];
    res.writeHead(200, cabeceras).end(JSON.stringify(unaColumna ? r.rows[0]?.[m[1]] ?? null : r.rows));
  } catch (e) {
    const err = e as Error & { code?: string };
    res.writeHead(400, cabeceras).end(JSON.stringify({ code: err.code, message: err.message }));
  }
}).listen(PUERTO, () => console.log(`Base local lista en http://localhost:${PUERTO} (datos demo, PIN 1234)`));
