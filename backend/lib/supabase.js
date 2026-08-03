// backend/lib/supabase.js
// Admin client using SERVICE ROLE KEY — never expose in frontend!
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('⚠ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
}

const supabase = createClient(url || '', key || '');

module.exports = supabase;
