import 'dotenv/config';

const idInstance = process.env.GREEN_API_ID_INSTANCE;
const apiTokenInstance = process.env.GREEN_API_TOKEN_INSTANCE;
if (!idInstance || !apiTokenInstance) throw new Error('Faltan credenciales de Green API en .env');

const NUMERO_JEFE = '573022939548';
const CHAT_ID = `${NUMERO_JEFE}@c.us`;

const MENSAJE =
  'LÍDER, le hago un resumen honesto de en qué quedé hoy -- lo que ya sé hacer y lo que todavía me falta entrenar:\n\n' +
  '✅ *Lo que ya puedo hacer:*\n' +
  '- Armar una cotización completa paso a paso: ítems, mano de obra, metraje, tipo de cliente, si va con IVA o no, resumen y PDF automático.\n' +
  '- Entender lo que pide en lenguaje natural (incluso fotos), y aguantar preguntas tipo "la primera", "cuál me recomiendas", "la más barata".\n' +
  '- Preguntar para qué cliente final es cada cotización y acordarme de lo que le cotizó la última vez.\n' +
  '- Reenviarle una cotización vieja si me la pide (ej. "mándame la de Altavista"), siempre que se haya hecho conmigo.\n' +
  '- Darme cuenta cuando quiere cancelar una cotización a medias, en vez de quedarme confundido.\n' +
  '- Agregar productos nuevos al catálogo si no los tengo, preguntándole el precio directo en el chat.\n' +
  '- Avisarle a usted y quedarme callado cuando algo se sale de lo que puedo resolver solo (reclamos, diseños completos de un sistema).\n\n' +
  '⚠️ *Lo que todavía me falta / hay que entrenar:*\n' +
  '- No leo documentos (PDF, Word) ni videos que me mande -- solo texto, fotos y audio.\n' +
  '- El catálogo real todavía no tiene cargados como 150 productos y servicios que usó en cotizaciones pasadas (cajas de paso, fuentes, mano de obra puntual) -- entre más los agreguemos, más preciso voy a ser.\n' +
  '- Si deja una cotización a medias más de 6 horas, la olvido sola para no mezclar cosas viejas -- toca retomarla desde cero.\n' +
  '- No puedo anular ni corregir una cotización que ya se generó -- eso todavía toca hacerlo desde la app web.\n' +
  '- No tengo recordatorios de seguimiento (avisarle si un cliente no ha aprobado en unos días) -- eso no existe todavía.\n' +
  '- Apenas estoy aprendiendo el historial real de sus clientes (por ahora tengo 19 cargados de cotizaciones viejas) -- entre más cotice conmigo, más voy a ir recordando solo.\n' +
  '- Es la primera vez que corro en producción con todo esto, así que puede que me tope con algún caso raro que no anticipé -- si algo sale mal o rarísimo, cuénteme apenas lo note.';

async function main() {
  const resp = await fetch(`https://api.green-api.com/waInstance${idInstance}/sendMessage/${apiTokenInstance}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: CHAT_ID, message: MENSAJE }),
  });
  if (!resp.ok) throw new Error(`Green API sendMessage falló: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  console.log('Mensaje enviado:', data);
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
