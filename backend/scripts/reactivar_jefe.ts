import 'dotenv/config';
import { reanudarBot } from '../src/modules/clientes/service';
import { db } from '../src/db/client';

async function main() {
  const antes = await db.cliente.findUnique({ where: { numeroWhatsapp: '573022939548' } });
  console.log('ANTES:', JSON.stringify(antes, null, 2));

  await reanudarBot('573022939548');

  const despues = await db.cliente.findUnique({ where: { numeroWhatsapp: '573022939548' } });
  console.log('DESPUES:', JSON.stringify(despues, null, 2));
}

main()
  .catch((err) => {
    console.error('ERROR:', err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
