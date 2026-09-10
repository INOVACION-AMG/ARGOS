import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const EMAIL = 'tecnico5@amgtest.co';
const PASSWORD = 'AMGTemporal2026!';

async function main() {
  const url = process.env.AMG_SUPABASE_URL!;
  const serviceKey = process.env.AMG_SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  console.log('=== 1) Buscando el usuario en auth.users (admin) ===');
  const { data: usersPage, error: errList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (errList) {
    console.error('Error listando usuarios:', errList.message);
    return;
  }
  const usuario = usersPage.users.find((u) => u.email?.toLowerCase() === EMAIL.toLowerCase());
  if (!usuario) {
    console.log(`NO EXISTE ningún usuario con email ${EMAIL} en auth.users.`);
  } else {
    console.log('Usuario encontrado:');
    console.log('  id:', usuario.id);
    console.log('  email:', usuario.email);
    console.log('  email_confirmed_at:', usuario.email_confirmed_at);
    console.log('  confirmed_at:', usuario.confirmed_at);
    console.log('  banned_until:', (usuario as any).banned_until);
    console.log('  last_sign_in_at:', usuario.last_sign_in_at);
    console.log('  created_at:', usuario.created_at);
    console.log('  app_metadata:', JSON.stringify(usuario.app_metadata));
  }

  console.log('\n=== 2) Buscando el profile correspondiente ===');
  if (usuario) {
    const { data: profile, error: errProfile } = await admin.from('profiles').select('*').eq('id', usuario.id).maybeSingle();
    if (errProfile) console.error('Error consultando profile:', errProfile.message);
    else if (!profile) console.log('NO HAY fila en profiles para este id de usuario -- esto rompería getCurrentProfile().');
    else console.log('Profile:', JSON.stringify(profile, null, 2));
  }

  console.log('\n=== 3) Intentando el login real (como lo haría la app, con ANON key) ===');
  const anonUrl = process.env.AMG_SUPABASE_URL!;
  // Necesitamos la anon key real de AMG-LEGION -- se prueba con la del .env.local del propio AMG-LEGION.
  const fs = require('fs');
  const envLegion = fs.readFileSync('C:/Users/usuario/AMG-LEGION/.env.local', 'utf-8');
  const anonKeyMatch = envLegion.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/);
  const anonKey = anonKeyMatch ? anonKeyMatch[1].trim() : undefined;
  if (!anonKey) {
    console.log('No pude leer la anon key de AMG-LEGION/.env.local, me salto esta prueba.');
  } else {
    const anonClient = createClient(anonUrl, anonKey, { auth: { persistSession: false } });
    const { data, error } = await anonClient.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (error) {
      console.log('LOGIN FALLÓ (igual que en la app):');
      console.log('  status:', error.status);
      console.log('  code:', (error as any).code);
      console.log('  message:', error.message);
    } else {
      console.log('LOGIN EXITOSO. user id:', data.user?.id);
    }
  }

  console.log('\n=== 4) Todos los perfiles existentes (para el QA de todos los roles) ===');
  const { data: todos, error: errTodos } = await admin.from('profiles').select('id, full_name, role, identificacion').order('role');
  if (errTodos) console.error('Error:', errTodos.message);
  else console.log(JSON.stringify(todos, null, 2));
}

main().catch((err) => {
  console.error('ERROR GENERAL:', err);
  process.exit(1);
});
