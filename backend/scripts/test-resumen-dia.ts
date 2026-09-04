import 'dotenv/config';
import { obtenerResumenDelDia } from '../src/modules/pedidos/service';

obtenerResumenDelDia()
  .then((resumen) => {
    console.log(JSON.stringify(resumen, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
