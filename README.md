# HealthJob Global — Setup & Deployment Guide (Windows, beginner-friendly)

A static website (no Node.js, no paid hosting) for GitHub Pages + Supabase.
Live address: `https://careersupport-bdg.github.io/jobs/`

## 1. Architecture (short)

- **Public site** `index.html` — one page, hash routes (`#/jobs`, `#/job/12`, `#/services`, `#/about`, `#/privacy`), so it works on GitHub Pages without server rewrites.
- **Admin** `admin.html` — separate page (`noindex`), email/password login via Supabase Auth.
- **Database** Supabase Postgres. **All security is Row Level Security (RLS)**; hiding buttons in the browser is only cosmetic.
- **Admin authority** comes only from the table `public.admin_users` (checked by `public.is_admin()`), never from user-editable metadata.
- **PWA**: `manifest.webmanifest`, `sw.js`, `offline.html`, icons. The site works if the service worker fails.

### File tree (upload exactly this, in the repo root)

```
jobs/                      (repository root)
├─ index.html
├─ admin.html
├─ offline.html
├─ manifest.webmanifest
├─ sw.js
├─ robots.txt              (see note in section 9)
├─ sitemap.xml
├─ assets/
│  ├─ css/style.css
│  └─ js/ config.js  supabase.js  app.js  jobs.js  admin.js
├─ icons/ favicon.svg  icon-192.png  icon-512.png  icon-maskable-512.png
└─ supabase/migration_001_healthjob.sql   (for reference; you run it in Supabase)
```
All paths in the code are **relative**, so they work under `/jobs/`.

## 2. Assumptions about your existing database

I could not connect to your Supabase project from here, so I did **not** inspect it. The migration assumes the tables/columns you listed exist. Check first:

1. Supabase Dashboard → **SQL Editor** → New query, paste and run:
```sql
select table_name, column_name, data_type, column_default
from information_schema.columns
where table_schema='public' and table_name in ('jobs','service_orders')
order by table_name, ordinal_position;

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname='public' order by tablename, policyname;
```
2. If a column is missing or named differently, tell me the result and I will adjust the SQL and code. The migration never drops tables or deletes data.
3. **Old policies:** my migration creates policies named `hj jobs: …` / `hj orders: …`. Any older policy you already have **stays** and still applies (policies are OR-ed). If the second query shows an old policy such as "anyone can read all jobs" or "anyone can update", drop it manually: `drop policy "name" on public.jobs;`.

## 3. Run the migration

1. SQL Editor → New query → paste the whole of `supabase/migration_001_healthjob.sql` → **Run**.
2. It is safe to run again. If you see a NOTICE about `jobs_source_url_uniq`, you have duplicate source URLs; fix them and re-run.
3. What it does: admin registry + `is_admin()`, extra columns (`source_name`, `fingerprint`, `collected_at`, `verification_status`), URL/status/country constraints (applied to new/edited rows only), RLS policies, column-level grants (visitors cannot even request internal columns), sequence permission for admin inserts, and an `expire_old_jobs()` helper.

## 4. Get the public key

Dashboard → **Project Settings → API Keys**. Copy the **anon / publishable** key (starts with `eyJ…` or `sb_publishable_…`).
Open `assets/js/config.js` and replace `PASTE_YOUR_PUBLISHABLE_OR_ANON_KEY_HERE`.

| Value | Safe in frontend? |
|---|---|
| Supabase URL, anon/publishable key, WhatsApp number, site URL, support email | Yes (public) |
| `service_role` key, `sb_secret_…`, database password, admin password | **NEVER** — not in any file, not in GitHub |

Also set `WHATSAPP_NUMBER` (digits only, e.g. country code + number) and optionally `SUPPORT_EMAIL`. Leave blank to hide them.

## 5. Create / register your admin

1. Dashboard → **Authentication → Users**. If you have no admin user, click **Add user** (email + password you choose; tick auto-confirm).
2. Copy that user's **User UID**.
3. SQL Editor, run (replace the UUID):
```sql
insert into public.admin_users (user_id, note)
values ('PASTE-USER-UID-HERE', 'primary admin')
on conflict (user_id) do nothing;
```
4. Also: Authentication → Providers → Email → consider **disabling "Allow new users to sign up"** so strangers cannot create accounts (they still would not be admins, but it keeps things tidy).

## 6. Upload to GitHub (no command line needed)

1. Unzip the package on your PC.
2. Open `https://github.com/careersupport-bdg/jobs` → **Add file → Upload files**.
3. Drag the **contents** of the unzipped folder (files and the `assets`, `icons`, `supabase` folders — not the outer folder itself). Commit to `main`.
4. **Settings → Pages**: Source = *Deploy from a branch*, Branch = `main`, folder `/ (root)`. Save. Wait 1–2 minutes.
5. Open `https://careersupport-bdg.github.io/jobs/`.

Existing files with the same names will be replaced when you upload. Do not upload `config.js` with any secret key.

## 7. Test (do these manually)

- [ ] Home loads, no red errors; "Jobs unavailable" message means the key/URL is wrong.
- [ ] `…/jobs/admin.html` → sign in with admin → Overview shows counts.
- [ ] Create a job from a **real** official announcement, status Approved → appears on Jobs page.
- [ ] Set its deadline to yesterday → disappears from the public site.
- [ ] Submit the assistance form on a phone → appears under **Service requests** in admin.
- [ ] Sign in with a non-admin user → "Access denied".
- [ ] In a private window, open the browser console and run `await HJ_DB.from('service_orders').select('*')` on the public site → must return an error/empty (visitors can't read requests).
- [ ] Android Chrome → menu → **Install app / Add to Home screen**.

## 8. Automatic job collection (separate design — not built into the website)

A browser-only site on GitHub Pages **cannot** scrape other sites reliably (CORS, bot protection, and you must never put a service-role key in the browser).

Recommended safe design:
1. **Manual entry first** (already built). Use the admin form.
2. Optional later: a scheduled **GitHub Actions** workflow (free for public repos, with usage limits) runs a small script that reads only *official, permitted* pages/RSS feeds (check each site's terms and `robots.txt`; no CAPTCHA/login bypass).
3. The script writes to a **separate** secured path: store the Supabase **service_role key only in GitHub → Settings → Secrets** (never in files), and insert rows with `status='pending'`, `verification_status='collected_unverified'`, `collected_at=now()`, the original `source_url`, `published_at` if stated, and a `fingerprint` (e.g. SHA-256 of lowercase title + employer + deadline). The unique index on `source_url` blocks duplicates.
4. You review each pending lead in the admin **Jobs → Pending** list, correct it, and Approve. Nothing becomes public without approval.
Caveats: free Actions minutes are limited; pages that change layout will break the script; some sites forbid automated collection, so skip them.
Note: if your repository is public, workflow files are public too (secrets stay hidden).

## 9. PWA notes, SEO honesty

- **PWA vs APK:** a PWA is the website installed from Chrome ("Add to Home screen"). It is not a Play Store app. An APK/Play Store listing would be a separate wrapper project (and a one-time Google developer fee), which this package does **not** create.
- `robots.txt` and `sitemap.xml` only take effect at a domain's **root**. On `careersupport-bdg.github.io/jobs/` they sit in a sub-path, so search engines will mostly ignore them; submit `https://careersupport-bdg.github.io/jobs/` in Google Search Console instead. Because pages use `#/` routes, individual jobs are not separately indexable. Making them indexable would need generated per-job pages (a possible later upgrade).
- AdSense approval is never guaranteed and needs original content, policy pages and traffic.
- Replace the privacy notice template with text you have reviewed.

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| "Jobs unavailable / key not configured" | Paste the anon/publishable key in `assets/js/config.js`, re-upload, hard refresh (Ctrl+F5). |
| Jobs empty but you added some | Status must be `approved` and deadline today or later; check in admin. |
| Admin says Access denied | Your UID isn't in `admin_users` (step 5), or you signed in with a different user. |
| "permission denied for table jobs" | Re-run the migration (grants section). |
| Insert fails with sequence/permission error | Re-run migration; it grants sequence usage if `id` is serial/identity. |
| Assistance form fails | Check the browser console; ensure `service_orders.status` has a default and the migration ran. If your `job_id` column type differs, tell me. |
| Old version still showing | Service worker cache: Chrome → DevTools → Application → Unregister, or bump `VERSION` in `sw.js`. |
| Page 404 under `/jobs/` | Pages source not set to `main` / root, or files uploaded inside an extra folder. |

## 11. Tested vs not tested

**Actually done here:** JavaScript syntax check (`node --check`) on all `.js` files passed; `manifest.webmanifest` parsed as valid JSON; all files referenced by `index.html`/`admin.html` exist; PNG icons generated.

**Not done (I had no browser or access to your Supabase project):** running the pages in a browser, any call to your database, applying the SQL, mobile layout checks, service-worker behaviour, and the Supabase CDN script load. Please run the checklist in section 7. The pinned CDN version `@supabase/supabase-js@2.45.4` should be confirmed to load; if not, change the version in both HTML files.
