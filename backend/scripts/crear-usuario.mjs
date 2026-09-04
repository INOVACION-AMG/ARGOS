import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const [, , nombre, email, password, rol] = process.argv;
if (!nombre || !email || !password) {
  console.error('Uso: node scripts/crear-usuario.mjs "Nombre" email@ejemplo.com password [rol]');
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 10);
const usuario = await db.usuario.upsert({
  where: { email },
  update: { passwordHash, nombre, rol: rol ?? 'gerente' },
  create: { nombre, email, passwordHash, rol: rol ?? 'gerente' },
});

console.log('Usuario listo:', { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol });
await db.$disconnect();
