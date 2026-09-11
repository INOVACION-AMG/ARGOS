import 'dotenv/config';

const idInstance = process.env.GREEN_API_ID_INSTANCE;
const apiTokenInstance = process.env.GREEN_API_TOKEN_INSTANCE;
if (!idInstance || !apiTokenInstance) throw new Error('Faltan credenciales de Green API en .env');

const NUMERO_JEFE = '573022939548';
const CHAT_ID = `${NUMERO_JEFE}@c.us`;

const MENSAJE =
  'LÍDER, dos noticias:\n\n' +
  '1) Argos ya quedó migrado a un servidor en la nube que corre 24/7 -- ya no depende de que un PC esté prendido en la oficina. Listos para el combate.\n\n' +
  '2) Ya quedó lista la regla nueva para cuentas de cobro: al valor inicial se le suma el recargo del 30% más el IVA del 19%, y el resumen (y el PDF) ahora muestran ese desglose completo (subtotal, recargo, IVA, total) para que usted pueda revisar y corregir cualquier monto antes de aprobar.\n\n' +
  'Cuando quiera, hágame una cotización de prueba como cuenta de cobro para que vea cómo queda.';

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
