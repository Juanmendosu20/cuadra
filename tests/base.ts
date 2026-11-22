// Monta en memoria una base Postgres (PGlite) con todas las migraciones de supabase/,
// imitando lo que Supabase trae de fábrica: roles anon/authenticated, el esquema
// "extensions" con pgcrypto y la función realtime.send.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRACIONES = join(import.meta.dirname, '..', 'supabase', 'migrations');

export async function montarBase(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon; create role authenticated;
    create schema extensions; create extension pgcrypto schema extensions;
    create schema realtime;
    create function realtime.send(payload jsonb, event text, topic text, private boolean)
      returns void language sql as $$ select $$;
  `);
  for (const f of readdirSync(MIGRACIONES).filter((x) => x.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(join(MIGRACIONES, f), 'utf8'));
    } catch (e) {
      throw new Error(`${f}: ${(e as Error).message}`);
    }
  }
  return db;
}

/** Ejecuta una consulta y devuelve la primera columna de la primera fila. */
export async function valor<T = unknown>(db: PGlite, sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query<Record<string, T>>(sql, params);
  return (r.rows[0] ? Object.values(r.rows[0])[0] : undefined) as T;
}

/** Llama una RPC pública con argumentos con nombre, como lo hace supabase-js. */
export async function rpc<T = any>(db: PGlite, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const nombres = Object.keys(args);
  const lista = nombres.map((n, i) => `${n} => $${i + 1}`).join(', ');
  return valor<T>(db, `select public.${fn}(${lista})`, Object.values(args));
}

export async function entrar(db: PGlite, tienda: string): Promise<string> {
  const id = await valor<string>(db, 'select id from public.tiendas where nombre = $1', [tienda]);
  const s = await rpc<{ token: string }>(db, 'iniciar_sesion', { p_tienda_id: id, p_pin: '1234' });
  return s.token;
}
