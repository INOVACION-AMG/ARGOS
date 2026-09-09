import 'dotenv/config';
import { buscarClienteFinal } from '../src/modules/clientes-finales-amg/service';
import { db } from '../src/db/client';

async function main() {
  const pruebas = ['Altavista', 'mauricio', 'cerezos suba', 'mileto', 'un cliente que no existe', 'Cedritos'];
  for (const p of pruebas) {
    const r = await buscarClienteFinal(p);
    console.log(`"${p}" ->`, r ? `${r.nombre} (${r.items.length} items, ultima: ${r.ultimaCotizacion})` : 'SIN HISTORIAL');
  }
}

main()
  .catch((err) => {
    console.error('ERROR:', err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
