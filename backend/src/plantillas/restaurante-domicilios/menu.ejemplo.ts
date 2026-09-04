// Catálogo de ejemplo para la demo. Cargar en la tabla Producto (el campo
// `unidad` ya existe en el schema — usar "unidad" en vez de "kg").
// Se puede insertar a mano con Prisma Studio, o adaptar un script como
// backend/scripts/crear-usuario.mjs para insertar estos productos.

export const menuEjemplo = [
  { nombre: 'Hamburguesa clásica', precioActual: 18000, unidad: 'unidad' },
  { nombre: 'Hamburguesa doble carne', precioActual: 24000, unidad: 'unidad' },
  { nombre: 'Perro caliente especial', precioActual: 14000, unidad: 'unidad' },
  { nombre: 'Papas a la francesa', precioActual: 9000, unidad: 'unidad' },
  { nombre: 'Combo hamburguesa + papas + gaseosa', precioActual: 28000, unidad: 'unidad' },
  { nombre: 'Gaseosa 400ml', precioActual: 5000, unidad: 'unidad' },
  { nombre: 'Limonada natural', precioActual: 7000, unidad: 'unidad' },
];
