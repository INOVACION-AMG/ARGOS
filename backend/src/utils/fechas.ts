// Colombia usa siempre UTC-5, sin horario de verano, así que el cálculo es fijo.
const OFFSET_BOGOTA_HORAS = 5;

export function inicioDeHoyBogota(): Date {
  const bogotaAhora = new Date(Date.now() - OFFSET_BOGOTA_HORAS * 60 * 60 * 1000);
  return new Date(
    Date.UTC(
      bogotaAhora.getUTCFullYear(),
      bogotaAhora.getUTCMonth(),
      bogotaAhora.getUTCDate(),
      OFFSET_BOGOTA_HORAS,
      0,
      0,
    ),
  );
}
