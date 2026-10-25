/*
 * HealthJob Global — configuration (PUBLIC values only)
 *
 * Everything in this file is visible to every visitor. That is fine for:
 *   - SUPABASE_URL           (public project URL)
 *   - SUPABASE_KEY           (the "anon" / "publishable" key — protected by Row Level Security)
 *   - WHATSAPP_NUMBER, SITE_URL, SUPPORT_EMAIL
 *
 * NEVER put any of these here or anywhere in this repository:
 *   - service_role key / secret key (sb_secret_...)
 *   - database password
 *   - admin passwords or any private token
 */
window.HJ_CONFIG = {
  SUPABASE_URL: 'https://hvscamiwqzwgudvzsbam.supabase.co',

  // Supabase Dashboard > Project Settings > API Keys > "anon" (legacy) or "publishable" key.
  SUPABASE_KEY: 'sb_publishable_qxnxEI7ZzT8ynxAPLy2VwA_3Sw7ZZ3M',

  // International format, digits only, no "+" or spaces (example shape: 8801XXXXXXXXX).
  // Leave empty until you have your real number; the WhatsApp button hides itself when empty.
  WHATSAPP_NUMBER: '+8801798771842',

  SITE_URL: 'https://careersupport-bdg.github.io/jobs/',

  // Optional. Leave empty to hide.
  SUPPORT_EMAIL: '',

  PAGE_SIZE: 12
};
