// Convierte un valor en pesos colombianos a su representación en letras para
// el encabezado de la cuenta de cobro ("Me debe la suma de ... PESOS").
// Implementación propia (no una librería externa poco mantenida) porque esto
// va en un documento financiero real -- mejor algo chico y auditable.

const UNIDADES = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
const DIECIS = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"];
const DECENAS = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
// "veintiXXX" lleva tilde en el 1, 2, 3 y 6 (veintiuno/dós/trés/séis) -- el
// resto (veinticuatro, veinticinco, veintisiete, veintiocho, veintinueve) no.
const VEINTI_UNIDAD = ["", "ÚN", "DÓS", "TRÉS", "CUATRO", "CINCO", "SÉIS", "SIETE", "OCHO", "NUEVE"];
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

function trescientos(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto > 0) {
    if (resto < 10) partes.push(UNIDADES[resto]);
    else if (resto < 20) partes.push(DIECIS[resto - 10]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      if (d === 2 && u > 0) partes.push(`VEINTI${VEINTI_UNIDAD[u]}`);
      else if (u === 0) partes.push(DECENAS[d]);
      else partes.push(`${DECENAS[d]} Y ${UNIDADES[u]}`);
    }
  }
  return partes.join(" ");
}

function seccion(n: number, singular: string, plural: string): string {
  if (n === 0) return "";
  if (n === 1) return `${singular}`;
  return `${trescientos(n)} ${plural}`;
}

export function numeroALetras(valor: number): string {
  const entero = Math.round(Math.abs(valor));
  if (entero === 0) return "CERO PESOS";

  const millones = Math.floor(entero / 1_000_000);
  const miles = Math.floor((entero % 1_000_000) / 1_000);
  const resto = entero % 1_000;

  const partes: string[] = [];
  if (millones > 0) partes.push(seccion(millones, "UN MILLÓN", "MILLONES"));
  if (miles > 0) partes.push(miles === 1 ? "MIL" : `${trescientos(miles)} MIL`);
  if (resto > 0) partes.push(trescientos(resto));

  return `${partes.join(" ").trim()} PESOS`;
}
