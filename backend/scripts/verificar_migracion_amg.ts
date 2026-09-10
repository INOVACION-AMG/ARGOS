import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const admin = createClient(process.env.AMG_SUPABASE_URL!, process.env.AMG_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await admin
    .from('profiles')
    .select('id, full_name, role, puede_gestionar_servicios')
    .order('role');
  if (error) {
    console.error('ERROR:', error.message);
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error('ERROR GENERAL:', err);
  process.exit(1);
});
