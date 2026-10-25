/* Creates the Supabase client. Uses only the public anon/publishable key from config.js. */
(function () {
  'use strict';
  var c = window.HJ_CONFIG || {};
  var keyOk = c.SUPABASE_KEY && c.SUPABASE_KEY.indexOf('PASTE_') !== 0;
  var ready = !!(window.supabase && c.SUPABASE_URL && keyOk);
  window.HJ_DB = null;
  window.HJ_DB_ERROR = '';
  if (!window.supabase) {
    window.HJ_DB_ERROR = 'The database library could not be loaded. Check your internet connection.';
  } else if (!keyOk) {
    window.HJ_DB_ERROR = 'Supabase key is not configured yet (assets/js/config.js).';
  }
  if (ready) {
    try {
      window.HJ_DB = window.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_KEY, {
        auth: {
          // Only the admin page keeps a login session; visitors never store one.
          persistSession: !!window.HJ_ADMIN_PAGE,
          autoRefreshToken: !!window.HJ_ADMIN_PAGE,
          detectSessionInUrl: false
        }
      });
    } catch (e) {
      window.HJ_DB_ERROR = 'Could not start the database client.';
    }
  }
})();
