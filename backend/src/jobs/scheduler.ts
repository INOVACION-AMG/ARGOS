import { schedule } from 'node-cron';
import type { WASocket } from '@whiskeysockets/baileys';
import { enviarReporteNocturno } from './reporteNocturno';

let yaIniciado = false;

export function iniciarProgramador(getSocket: () => WASocket) {
  // El bot se reconecta varias veces al día (cortes normales de WhatsApp);
  // sin esta guarda, cada reconexión registraría una tarea duplicada y el
  // reporte se enviaría varias veces a las 11pm.
  if (yaIniciado) return;
  yaIniciado = true;

  // Todos los días a las 11:00pm, hora de Bogotá
  schedule(
    '0 23 * * *',
    async () => {
      try {
        await enviarReporteNocturno(getSocket());
      } catch (err) {
        console.error('Error enviando el reporte nocturno a Colver:', err);
      }
    },
    { timezone: 'America/Bogota' },
  );

  console.log('Programador de tareas iniciado (reporte a Colver: 11:00pm hora Bogotá).');
}
