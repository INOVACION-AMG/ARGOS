import 'dotenv/config';
import * as fs from 'fs';
import { transcribirAudio } from '../src/ai/transcribe';

async function main() {
  const buf = fs.readFileSync(
    'C:/Users/usuario/AppData/Local/Temp/claude/C--Users-usuario-AMG-LEGION/d690b736-5f86-4afd-a830-8d0ed8e14026/scratchpad/audio_real.oga',
  );
  console.log('Tamaño del archivo:', buf.length, 'bytes');
  const texto = await transcribirAudio(buf, 'audio/ogg; codecs=opus');
  console.log('TRANSCRIPCION:', JSON.stringify(texto));
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
