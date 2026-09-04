import bcrypt from 'bcryptjs';
import { db } from '../../db/client';

const SALT_ROUNDS = 10;

export async function crearUsuario(nombre: string, email: string, password: string, rol: 'dueno' | 'gerente' = 'gerente') {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  return db.usuario.create({ data: { nombre, email, passwordHash, rol } });
}

export async function validarLogin(email: string, password: string) {
  const usuario = await db.usuario.findUnique({ where: { email } });
  if (!usuario) return null;

  const valido = await bcrypt.compare(password, usuario.passwordHash);
  return valido ? usuario : null;
}
