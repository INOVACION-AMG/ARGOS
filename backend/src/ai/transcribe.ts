import OpenAI, { toFile } from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function transcribirAudio(buffer: Buffer, mimetype: string): Promise<string> {
  const archivo = await toFile(buffer, 'audio.ogg', { type: mimetype });

  const resultado = await openai.audio.transcriptions.create({
    file: archivo,
    model: 'whisper-1',
    language: 'es',
  });

  return resultado.text.trim();
}
