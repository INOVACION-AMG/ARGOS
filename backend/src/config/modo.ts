// Argos se comparte entre dos clientes reales (D'Carnes y AMG) por falta de
// presupuesto para una instancia aparte. MODO_BOT decide qué negocio responde
// el bot ahora mismo. Cambiar y reiniciar con pm2 -- ver MODO-AMG.md.
export type ModoBot = 'dcarnes' | 'amg';

export const MODO_BOT: ModoBot = process.env.MODO_BOT === 'amg' ? 'amg' : 'dcarnes';
