'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cliente: SupabaseClient | null = null;

/**
 * Cliente con la llave publicable. Las tablas están cerradas al cliente:
 * todo pasa por funciones RPC que validan la sesión de la tienda.
 */
export function supabase(): SupabaseClient {
  if (!cliente) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
    }
    cliente = createClient(url, key, { auth: { persistSession: false } });
  }
  return cliente;
}

/** Llama una RPC y devuelve sus datos, o lanza un Error con el mensaje de la base. */
export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) {
    const e = new Error(error.message);
    (e as Error & { code?: string }).code = error.code;
    throw e;
  }
  return data as T;
}
