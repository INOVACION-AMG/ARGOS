// Copia de src/lib/constants/cotizacion.ts y src/lib/format.ts de AMG-LEGION
// (proyecto separado, sin monorepo/paths compartidos) -- mantener en sync a
// mano si cambia el texto legal/comercial allá.

export const VIGENCIA_DIAS_DEFAULT = 15;
export const TIEMPO_EJECUCION_DEFAULT = "15 días hábiles a partir de su anticipo";

export const FORMA_PAGO = [
  "60 % del valor de la cotización como anticipo.",
  "40 % restante del valor de la cotización una vez sea entregado el trabajo a satisfacción del cliente.",
];

export const CONSIDERACIONES = [
  "El valor de la cotización es calculado a todo costo.",
  "El pago incluye la seguridad social del personal.",
  "Cualquier actividad adicional no prevista debe ser acordada previamente con el personal encargado de la obra, siendo esta una actividad independiente la cual queda excluida de esta cotización.",
  "La presente cotización incluye los equipos y herramientas necesarias para llevar a cabo las actividades.",
  "Para llevar a cabo las actividades se cuenta con personal capacitado.",
];

export const GARANTIA_TEXTO =
  "Mediante este documento se indica que los elementos instalados (relacionados en el cuadro anterior) tienen un tiempo de garantía de 12 meses por defectos o daños de fábrica, el cableado y los insumos de instalación tales como canaletas y ductos tienen una garantía de 12 meses cumpliendo con los estándares de calidad dispuestos para su máxima durabilidad.";

export const GARANTIA_EXCLUSIONES = [
  "Deterioro de los cimientos, vigas o en general de cualquier estructura que afecte el óptimo funcionamiento y/o calidad de la instalación o los equipos.",
  "Daños generados a los equipos o a los ductos que fueron instalados donde se evidencie mala fe o influencia de terceros para su deterioro.",
  "Daños a los equipos y/o ductos que excedan el periodo de garantía de los mismos.",
  "Toda garantía será anulada en el momento que por parte de terceros interfieran, modifiquen o afecten los equipos y/o ductos de los cuales dicta este documento.",
  "Daños por sobrecargas eléctricas, catástrofes naturales o daños por terceros.",
];

export const AMG_CONTACTO = {
  razonSocial: "SOLUCIONES Y MEDIOS TECNOLOGICOS AMG SAS",
  nit: "NIT: 901693518-4",
  direccion: "CARRERA 84C #57C-58 SUR",
  telefonos: "3022939548 - 3125302828 - 3228004513",
  correos: "LAURA.LOGISTICAMEDIOS@GMAIL.COM - ADMON.LOGISTICAMEDIOS@GMAIL.COM",
};

export function formatCOP(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}
