import 'dotenv/config';
import * as fs from 'fs';
import { manejarMensajeDeCliente } from '../src/whatsapp/messageRouter';
import { db } from '../src/db/client';

const NUMERO_PRUEBA = '573000000001';
const CHAT_ID = `${NUMERO_PRUEBA}@c.us`;
const OWN_JID = 'bot-prueba@c.us';
const NOMBRE_PERFIL = 'PRUEBA CLAUDE (borrar)';

const mensajesRecibidos: string[] = [];
let pdfGuardado: string | null = null;

const clienteFalso: any = {
  sendMessage: async (chatId: string, content: any) => {
    if (typeof content === 'string') {
      mensajesRecibidos.push(content);
      console.log(`\n[ARGOS -> ${chatId}]:\n${content}`);
    } else {
      // MessageMedia { mimetype, data (base64), filename }
      const buffer = Buffer.from(content.data, 'base64');
      const outPath = `C:/Users/usuario/AppData/Local/Temp/claude/C--Users-usuario-AMG-LEGION/d690b736-5f86-4afd-a830-8d0ed8e14026/scratchpad/prueba_cotizacion.pdf`;
      fs.writeFileSync(outPath, buffer);
      pdfGuardado = outPath;
      console.log(`\n[ARGOS -> ${chatId}]: [PDF adjunto, guardado en ${outPath}, ${buffer.length} bytes]`);
    }
    return { id: 'fake' };
  },
};

async function enviar(texto: string) {
  console.log(`\n[JEFE]: ${texto}`);
  await manejarMensajeDeCliente(clienteFalso, OWN_JID, CHAT_ID, NOMBRE_PERFIL, texto, undefined, undefined);
}

async function main() {
  // Limpieza de una corrida anterior de esta prueba, si quedo algo colgado.
  await db.sesionCotizacionAmg.deleteMany({ where: { numeroCliente: NUMERO_PRUEBA } });

  await enviar('necesito 1 camara domo 4mp');
  await enviar('Altavista');
  await enviar('ninguna');
  await enviar('ninguno');

  // A partir de aca la fase depende de si "final" ya tiene tarifa guardada o no.
  const ultimoMensaje = mensajesRecibidos[mensajesRecibidos.length - 1] ?? '';
  if (/preferencial|amigo|integrador|final vip/i.test(ultimoMensaje)) {
    await enviar('final');
    const preguntaTarifa = mensajesRecibidos[mensajesRecibidos.length - 1] ?? '';
    if (/porcentaje|%/i.test(preguntaTarifa)) {
      await enviar('0%');
    }
  }

  const preguntaDocumento = mensajesRecibidos[mensajesRecibidos.length - 1] ?? '';
  if (/cuenta de cobro|factura/i.test(preguntaDocumento)) {
    await enviar('cuenta de cobro');
  }

  await enviar('sí, apruebo, dale');

  console.log('\n\n=== RESUMEN ===');
  console.log(`Total mensajes de Argos: ${mensajesRecibidos.length}`);
  console.log(`PDF generado: ${pdfGuardado ?? 'NO SE GENERO NINGUN PDF'}`);
}

main()
  .catch((err) => {
    console.error('ERROR EN LA SIMULACION:', err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
