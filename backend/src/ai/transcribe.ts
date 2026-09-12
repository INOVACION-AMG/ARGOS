import OpenAI, { toFile } from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// El jefe manda muchos audios y habla rápido y de corrido -- Whisper tiende a
// tropezar con jerga técnica del catálogo (nombres de marca, siglas) y a
// repetir/perder palabras en tramos rápidos. El "prompt" de Whisper no es una
// instrucción, solo una muestra de vocabulario/estilo para sesgar el
// reconocimiento hacia estos términos.
const VOCABULARIO_AMG =
  'AMG seguridad electrónica CCTV DVR NVR Hikvision TurboHD PoE cámara domo cámara bullet ' +
  'control de acceso cerca eléctrica panel de alarma sensor de movimiento cable UTP cat 5e cat 6 ' +
  'conjunto residencial cuenta de cobro factura electrónica mano de obra metraje final VIP.';

export async function transcribirAudio(buffer: Buffer, mimetype: string): Promise<string> {
  const archivo = await toFile(buffer, 'audio.ogg', { type: mimetype });

  const resultado = await openai.audio.transcriptions.create({
    file: archivo,
    model: 'whisper-1',
    language: 'es',
    prompt: VOCABULARIO_AMG,
  });

  return resultado.text.trim();
}
