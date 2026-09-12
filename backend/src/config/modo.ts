// Argos se comparte entre dos clientes reales (D'Carnes y AMG) por falta de
// presupuesto para una instancia aparte. MODO_BOT decide qué negocio responde
// el bot ahora mismo. Cambiar y reiniciar con pm2 -- ver MODO-AMG.md.
export type ModoBot = 'dcarnes' | 'amg';

export const MODO_BOT: ModoBot = process.env.MODO_BOT === 'amg' ? 'amg' : 'dcarnes';

// Falla rápido en vez de arrancar en un estado inseguro: sin esta lista, en
// modo AMG cualquier número podría escribirle al bot y disparar IA, crear
// clientes y generar cotizaciones reales con la service role de Supabase.
if (
  MODO_BOT === 'amg' &&
  (process.env.ARGOS_NUMEROS_AUTORIZADOS ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean).length === 0
) {
  throw new Error(
    'MODO_BOT=amg requiere ARGOS_NUMEROS_AUTORIZADOS con al menos un número en .env -- sin esto el bot quedaría abierto a cualquiera.',
  );
}
