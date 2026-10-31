// Development projects only. Never put these known-password accounts in production.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_DEMO_PASSWORD, ALLOW_DEMO_SEED } = process.env;
if (ALLOW_DEMO_SEED !== 'true' || !SEED_DEMO_PASSWORD || SEED_DEMO_PASSWORD.length < 12) throw new Error('Set ALLOW_DEMO_SEED=true and a unique SEED_DEMO_PASSWORD (12+ characters) for your development project');
const client = createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const users = [
  ['a0000000-0000-0000-0000-000000000001','teacher@quizna.dev','Prof. Sarah Connor','teacher'],
  ['b0000000-0000-0000-0000-000000000002','student@quizna.dev','Alex Mercer','student'],
  ['b0000000-0000-0000-0000-000000000003','student2@quizna.dev','Emma Watson','student'],
];
for (const [id,email,name,role] of users) {
  const existing = await client.auth.admin.getUserById(id);
  if (!existing.data.user) {
    const { error } = await client.auth.admin.createUser({id,email,password:SEED_DEMO_PASSWORD,email_confirm:true,user_metadata:{full_name:name}});
    if (error) throw new Error(`Cannot create ${email}: ${error.message}`);
  }
  const { error } = await client.from('profiles').upsert({id,email,full_name:name,role});
  if (error) throw new Error(error.message);
}
console.log('Development Auth users ready. Run supabase/seed.sql in the SQL editor to add CS101.');
