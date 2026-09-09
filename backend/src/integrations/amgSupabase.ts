import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Cliente al Supabase real de AMG-LEGION (el cotizador/CCTV), usado solo en
// MODO_BOT='amg' para leer el catálogo real y crear cotizaciones reales --
// no es la base propia de este bot (esa sigue siendo Prisma/Postgres).
let cliente: SupabaseClient | null = null;

export function amgSupabase(): SupabaseClient {
  if (cliente) return cliente;

  const url = process.env.AMG_SUPABASE_URL;
  const serviceRoleKey = process.env.AMG_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Falta AMG_SUPABASE_URL o AMG_SUPABASE_SERVICE_ROLE_KEY en .env -- necesarios para MODO_BOT=amg. Ver MODO-AMG.md.',
    );
  }

  cliente = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  return cliente;
}
