import 'dotenv/config';
import { interpretarSolicitudHistorial, pareceQuiereHistorial, interpretarTipoClienteConocido } from '../src/ai/flujoCotizacionAmg';
import { guardarSesion, obtenerSesion, borradorVacio } from '../src/modules/sesion-cotizacion-amg/service';
import { db } from '../src/db/client';

async function main() {
  console.log('=== 1) Deteccion de "quiere historial" ===');
  const frases = [
    'mandame la cotizacion de altavista',
    'la ultima que le hice a mileto, pasamela',
    'necesito 4 camaras domo 4mp',
    'hazme una cotizacion para cedritos',
  ];
  for (const f of frases) {
    const heuristica = pareceQuiereHistorial(f);
    console.log(`"${f}" -- heuristica: ${heuristica}`);
    if (heuristica) {
      const r = await interpretarSolicitudHistorial(f);
      console.log('  IA:', r);
    }
  }

  console.log('\n=== 2) Tipo de cliente con typo ===');
  for (const t of ['preferencia', 'es un integrador grande', 'sub por favor', 'xyz123']) {
    const r = await interpretarTipoClienteConocido(t);
    console.log(`"${t}" -> ${r ?? 'no_entendido'}`);
  }

  console.log('\n=== 3) Expiracion de sesion ===');
  const numeroPrueba = '573000000000-TESTEXPIRA';
  await guardarSesion(numeroPrueba, 'recolectando_items', borradorVacio(numeroPrueba, 'Prueba'));
  // Forzar que quede como si llevara 10 horas sin actividad.
  await db.sesionCotizacionAmg.update({
    where: { numeroCliente: numeroPrueba },
    data: { actualizadoEn: new Date(Date.now() - 10 * 60 * 60 * 1000) },
  });
  const sesion = await obtenerSesion(numeroPrueba);
  console.log('Sesion tras 10h de inactividad (deberia ser null):', sesion);
  const filaCruda = await db.sesionCotizacionAmg.findUnique({ where: { numeroCliente: numeroPrueba } });
  console.log('Fila en BD tras la consulta (deberia ser null, se borro sola):', filaCruda);
}

main()
  .catch((err) => {
    console.error('ERROR:', err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
