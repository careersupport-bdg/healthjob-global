/* HealthJob Global — admin dashboard.
 * Security model: this file only SHOWS/HIDES the interface. The real protection is
 * Row Level Security in Supabase (public.is_admin()). A non-admin who edits this
 * script in their browser still cannot read or change protected data.
 */
(function () {
  'use strict';
  var db = window.HJ_DB;
  var root = document.getElementById('admin');
  var topRight = document.getElementById('topRight');
  var COUNTRIES = ['Bangladesh', 'UAE', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Oman', 'Bahrain', 'Other'];
  var JOB_STATUS = ['pending', 'approved', 'rejected', 'expired'];
  var ORDER_STATUS = ['pending', 'in_progress', 'completed', 'cancelled'];
  var SERVICE_LABEL = {
    cv_writing: 'CV and resume writing', job_application: 'Job application assistance', exam_prep: 'Nursing exam preparation',
    interview_prep: 'Interview and viva preparation', study_materials: 'Study PDFs and practice materials', career_guidance: 'International career guidance'
  };

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (v === true) n.setAttribute(k, '');
      else n.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }
  function clear(n) { n.textContent = ''; }
  function safeUrl(u) {
    if (!u) return null;
    try { var x = new URL(String(u).trim()); return (x.protocol === 'http:' || x.protocol === 'https:') ? x.href : null; } catch (e) { return null; }
  }
  function fmt(d) {
    if (!d) return '—';
    var dt = new Date(String(d).length === 10 ? d + 'T00:00:00' : d);
    return isNaN(dt) ? '—' : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function fmtTime(d) {
    var dt = new Date(d); return isNaN(dt) ? '—' : dt.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function badge(status) {
    var cls = status === 'approved' || status === 'completed' ? 'badge' : status === 'pending' || status === 'in_progress' ? 'badge warn' : status === 'rejected' || status === 'cancelled' ? 'badge bad' : 'badge gray';
    return el('span', { class: cls, text: String(status || '').replace('_', ' ') });
  }
  function errBox(msg) { return el('div', { class: 'fail', role: 'alert', text: msg }); }

  if (!db) {
    root.textContent = '';
    root.appendChild(el('div', { class: 'page-pad' }, [errBox('Cannot start: ' + (window.HJ_DB_ERROR || 'database not available') + ' Check assets/js/config.js.')]));
    return;
  }

  /* ---------------- login ---------------- */
  function showLogin(message) {
    clear(root); clear(topRight);
    var email = el('input', { id: 'em', type: 'email', autocomplete: 'username', required: true });
    var pw = el('input', { id: 'pw', type: 'password', autocomplete: 'current-password', required: true });
    var msg = el('div', { 'aria-live': 'polite' });
    if (message) msg.appendChild(errBox(message));
    var btn = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Sign in' });
    var form = el('form', { onsubmit: function (e) {
      e.preventDefault(); clear(msg);
      if (!email.value.trim() || !pw.value) { msg.appendChild(errBox('Enter your email and password.')); return; }
      btn.disabled = true; btn.textContent = 'Signing in…';
      db.auth.signInWithPassword({ email: email.value.trim(), password: pw.value }).then(function (res) {
        pw.value = '';
        btn.disabled = false; btn.textContent = 'Sign in';
        if (res.error) { msg.appendChild(errBox('Sign-in failed. Check your email and password.')); return; }
        start();
      }).catch(function () { btn.disabled = false; btn.textContent = 'Sign in'; msg.appendChild(errBox('Network problem. Try again.')); });
    } }, [
      el('div', { class: 'field' }, [el('label', { for: 'em', text: 'Email' }), email]),
      el('div', { class: 'field' }, [el('label', { for: 'pw', text: 'Password' }), pw]),
      btn
    ]);
    root.appendChild(el('div', { class: 'page-pad', style: 'max-width:420px;margin:0 auto' }, [
      el('div', { class: 'card' }, [el('h1', { text: 'Administrator sign-in' }), msg, form])]));
  }

  function logoutBtn() {
    return el('button', { type: 'button', class: 'btn btn-outline btn-sm', style: 'background:transparent;color:#fff;border-color:#fff', text: 'Sign out', onclick: function () {
      db.auth.signOut().then(function () { showLogin(); });
    } });
  }

  function showDenied(email) {
    clear(root); clear(topRight); topRight.appendChild(logoutBtn());
    root.appendChild(el('div', { class: 'page-pad', style: 'max-width:520px;margin:0 auto' }, [el('div', { class: 'card' }, [
      el('h1', { text: 'Access denied' }),
      el('p', { text: 'This account (' + (email || 'unknown') + ') is not registered as an administrator.' }),
      el('p', { class: 'muted', text: 'If you are the site owner, register your user ID in the admin_users table (see README, step 5).' })])]));
  }

  /* ---------------- start / auth check ---------------- */
  function start() {
    clear(root); root.appendChild(el('p', { text: 'Checking access…' }));
    db.auth.getSession().then(function (r) {
      var s = r.data && r.data.session;
      if (!s) return showLogin();
      return db.rpc('is_admin').then(function (res) {
        if (res.error || res.data !== true) return showDenied(s.user && s.user.email);
        showApp(s.user);
      });
    }).catch(function () { showLogin('Could not verify your session. Please sign in again.'); });
  }

  /* ---------------- app shell ---------------- */
  var tabArea, content, currentTab = 'overview';
  function showApp(user) {
    clear(root); clear(topRight);
    topRight.appendChild(el('span', { style: 'margin-right:10px;font-size:.9rem', text: user.email || '' }));
    topRight.appendChild(logoutBtn());
    tabArea = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Admin sections' });
    content = el('div');
    root.appendChild(tabArea); root.appendChild(content);
    renderTabs(); go('overview');
  }
  function renderTabs() {
    clear(tabArea);
    [['overview', 'Overview'], ['jobs', 'Jobs'], ['requests', 'Service requests']].forEach(function (t) {
      tabArea.appendChild(el('button', { type: 'button', class: 'tab', role: 'tab', 'aria-selected': String(currentTab === t[0]), text: t[1], onclick: function () { go(t[0]); } }));
    });
  }
  function go(tab, arg) {
    currentTab = tab === 'jobform' ? 'jobs' : tab; renderTabs(); clear(content);
    if (tab === 'overview') overview();
    else if (tab === 'jobs') jobsList();
    else if (tab === 'jobform') jobForm(arg);
    else if (tab === 'requests') requests();
  }
  function loading() { return el('p', { 'aria-busy': 'true', text: 'Loading…' }); }

  /* ---------------- overview ---------------- */
  function count(table, col, val) {
    var q = db.from(table).select('id', { count: 'exact', head: true });
    if (col) q = q.eq(col, val);
    return q.then(function (r) { if (r.error) throw r.error; return r.count || 0; });
  }
  function overview() {
    content.appendChild(loading());
    Promise.all([
      count('jobs', 'status', 'pending'), count('jobs', 'status', 'approved'),
      count('jobs', 'status', 'rejected'), count('jobs', 'status', 'expired'),
      count('service_orders', 'status', 'pending'), count('service_orders')
    ]).then(function (n) {
      clear(content);
      var stat = function (label, v) { return el('div', { class: 'stat' }, [el('b', { text: String(v) }), el('span', { class: 'muted', text: label })]); };
      content.appendChild(el('h1', { text: 'Dashboard' }));
      content.appendChild(el('div', { class: 'stats' }, [stat('Pending jobs', n[0]), stat('Approved jobs', n[1]), stat('Rejected jobs', n[2]), stat('Expired jobs', n[3])]));
      content.appendChild(el('div', { class: 'stats', style: 'margin-top:12px' }, [stat('New service requests', n[4]), stat('All service requests', n[5])]));
      var out = el('div');
      content.appendChild(el('div', { class: 'card', style: 'margin-top:16px' }, [
        el('h2', { text: 'Housekeeping' }),
        el('p', { class: 'muted', text: 'Public pages already hide jobs past their deadline. This button also marks them as "expired" in the database.' }),
        el('button', { type: 'button', class: 'btn btn-outline', text: 'Mark past-deadline jobs as expired', onclick: function (e) {
          var b = e.currentTarget; b.disabled = true; clear(out);
          db.rpc('expire_old_jobs').then(function (r) {
            b.disabled = false;
            out.appendChild(r.error ? errBox('Failed: ' + r.error.message) : el('div', { class: 'success', text: r.data + ' job(s) marked expired.' }));
            overview_refreshLater();
          });
        } }), out]));
    }).catch(function (e) { clear(content); content.appendChild(errBox('Could not load counts: ' + (e && e.message ? e.message : 'error'))); });
  }
  function overview_refreshLater() { setTimeout(function () { if (currentTab === 'overview') { clear(content); overview(); } }, 1500); }

  /* ---------------- jobs list ---------------- */
  var jobFilter = { q: '', status: 'pending', country: '' };
  function jobsList() {
    var q = el('input', { id: 'jsq', type: 'search', value: jobFilter.q, placeholder: 'Search title or hospital' });
    var st = el('select', { id: 'jss' }, [el('option', { value: '', text: 'All statuses' })].concat(JOB_STATUS.map(function (s) { return el('option', { value: s, text: s }); })));
    st.value = jobFilter.status;
    var ct = el('select', { id: 'jsc' }, [el('option', { value: '', text: 'All countries' })].concat(COUNTRIES.map(function (c) { return el('option', { value: c, text: c }); })));
    ct.value = jobFilter.country;
    var list = el('div', { class: 'grid' });
    function refresh() { jobFilter.q = q.value; jobFilter.status = st.value; jobFilter.country = ct.value; load(); }
    st.addEventListener('change', refresh); ct.addEventListener('change', refresh);
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); refresh(); } });
    content.appendChild(el('div', { class: 'section-head' }, [el('h1', { text: 'Jobs' }), el('button', { type: 'button', class: 'btn btn-primary', text: '+ New job', onclick: function () { go('jobform'); } })]));
    content.appendChild(el('div', { class: 'toolbar' }, [
      el('div', {}, [el('label', { for: 'jsq', text: 'Search' }), q]),
      el('div', {}, [el('label', { for: 'jss', text: 'Status' }), st]),
      el('div', {}, [el('label', { for: 'jsc', text: 'Country' }), ct])]));
    content.appendChild(list);

    function load() {
      clear(list); list.appendChild(loading());
      var req = db.from('jobs').select('*').order('created_at', { ascending: false }).limit(100);
      if (jobFilter.status) req = req.eq('status', jobFilter.status);
      if (jobFilter.country) req = req.eq('country', jobFilter.country);
      var t = jobFilter.q.replace(/[,()%*\\"'`:;]/g, ' ').trim().slice(0, 60);
      if (t) req = req.or('title.ilike.%' + t + '%,hospital_name.ilike.%' + t + '%');
      req.then(function (r) {
        clear(list);
        if (r.error) { list.appendChild(errBox('Could not load jobs: ' + r.error.message)); return; }
        if (!r.data.length) { list.appendChild(el('div', { class: 'state', role: 'status', text: 'No jobs match this filter.' })); return; }
        r.data.forEach(function (j) { list.appendChild(jobRow(j)); });
      });
    }
    load();
  }

  function setStatus(j, status, card) {
    if (status === 'approved' && !safeUrl(j.source_url)) {
      if (!window.confirm('This job has no valid official source URL. Approve anyway?')) return;
    }
    var patch = { status: status };
    if (status === 'approved') patch.verification_status = 'admin_verified';
    db.from('jobs').update(patch).eq('id', j.id).select('id').then(function (r) {
      if (r.error || !r.data || !r.data.length) { window.alert('Update failed' + (r.error ? ': ' + r.error.message : ' (no permission).')); return; }
      jobsListReload();
    });
  }
  function jobsListReload() { clear(content); jobsList(); }

  function jobRow(j) {
    var acts = [el('button', { type: 'button', class: 'btn btn-outline btn-sm', text: 'Edit', onclick: function () { go('jobform', j); } })];
    if (j.status !== 'approved') acts.push(el('button', { type: 'button', class: 'btn btn-teal btn-sm', text: 'Approve', onclick: function () { setStatus(j, 'approved'); } }));
    if (j.status !== 'rejected') acts.push(el('button', { type: 'button', class: 'btn btn-outline btn-sm', text: 'Reject', onclick: function () { setStatus(j, 'rejected'); } }));
    if (j.status !== 'expired') acts.push(el('button', { type: 'button', class: 'btn btn-outline btn-sm', text: 'Mark expired', onclick: function () { setStatus(j, 'expired'); } }));
    acts.push(el('button', { type: 'button', class: 'btn btn-danger btn-sm', text: 'Delete', onclick: function () {
      if (!window.confirm('Delete "' + (j.title || 'this job') + '" permanently? This cannot be undone.')) return;
      db.from('jobs').delete().eq('id', j.id).select('id').then(function (r) {
        if (r.error || !r.data || !r.data.length) { window.alert('Delete failed' + (r.error ? ': ' + r.error.message : '.')); return; }
        jobsListReload();
      });
    } }));
    var src = safeUrl(j.source_url);
    return el('div', { class: 'card row-card' }, [
      el('div', { class: 'meta' }, [badge(j.status), el('span', { class: 'badge country', text: j.country || '—' }), el('span', { text: 'Deadline: ' + fmt(j.deadline) }), j.verification_status ? el('span', { text: j.verification_status.replace(/_/g, ' ') }) : null]),
      el('h3', { style: 'margin:0', text: j.title || 'Untitled' }),
      el('div', { text: (j.hospital_name || '—') + (j.profession ? ' · ' + j.profession : ''), style: 'font-weight:600' }),
      src ? el('a', { href: src, target: '_blank', rel: 'noopener noreferrer nofollow', text: 'Official source ↗' }) : el('span', { class: 'muted', text: 'No valid source URL' }),
      el('div', { class: 'row-actions' }, acts)
    ]);
  }

  /* ---------------- job form (create / edit) ---------------- */
  function jobForm(job) {
    var isEdit = !!(job && job.id !== undefined);
    var inputs = {}, errs = {};
    function fld(name, labelText, control, full, hint) {
      var err = el('div', { class: 'err-text', role: 'alert' });
      inputs[name] = control; errs[name] = err;
      var d = el('div', { class: 'field' + (full ? ' full' : '') }, [el('label', { for: 'f_' + name, text: labelText }), control]);
      if (hint) d.appendChild(el('div', { class: 'hint', text: hint }));
      d.appendChild(err); return d;
    }
    function inp(name, type, val, max) { return el('input', { id: 'f_' + name, type: type, maxlength: max || null, value: val || '' }); }
    var v = job || {};
    var country = el('select', { id: 'f_country' }, COUNTRIES.map(function (c) { return el('option', { value: c, text: c }); }));
    country.value = v.country || 'Bangladesh';
    var status = el('select', { id: 'f_status' }, JOB_STATUS.map(function (s) { return el('option', { value: s, text: s }); }));
    status.value = v.status || 'pending';
    var desc = el('textarea', { id: 'f_description', maxlength: '8000' }); desc.value = v.description || '';
    var req = el('textarea', { id: 'f_requirements', maxlength: '4000' }); req.value = v.requirements || '';
    var out = el('div', { 'aria-live': 'polite' });
    var save = el('button', { type: 'submit', class: 'btn btn-primary', text: isEdit ? 'Save changes' : 'Create job' });

    var form = el('form', { novalidate: true, onsubmit: function (e) {
      e.preventDefault(); clear(out);
      Object.keys(errs).forEach(function (k) { errs[k].textContent = ''; });
      var ok = true;
      function bad(k, m) { errs[k].textContent = m; ok = false; }
      var title = inputs.title.value.trim(), hosp = inputs.hospital_name.value.trim();
      if (title.length < 3) bad('title', 'Title is required (at least 3 characters).');
      if (hosp.length < 2) bad('hospital_name', 'Employer/hospital name is required.');
      var su = inputs.source_url.value.trim(), au = inputs.apply_url.value.trim();
      if (su && !safeUrl(su)) bad('source_url', 'Must be a valid http:// or https:// link.');
      if (au && !safeUrl(au)) bad('apply_url', 'Must be a valid http:// or https:// link.');
      if (status.value === 'approved' && !su) bad('source_url', 'An official source URL is required to approve a job.');
      var pub = inputs.published_at.value, dl = inputs.deadline.value;
      if (pub && dl && dl < pub) bad('deadline', 'Deadline cannot be before the publication date.');
      if (!ok) { var first = form.querySelector('.err-text:not(:empty)'); if (first) { var c = first.parentNode.querySelector('input,select,textarea'); if (c) c.focus(); } return; }

      var payload = {
        title: title, hospital_name: hosp, country: country.value,
        profession: inputs.profession.value.trim() || null,
        description: desc.value.trim() || null, requirements: req.value.trim() || null,
        salary_text: inputs.salary_text.value.trim() || null,
        source_url: su ? safeUrl(su) : null, apply_url: au ? safeUrl(au) : null,
        published_at: pub || null, deadline: dl || null, status: status.value
      };
      if (status.value === 'approved') payload.verification_status = 'admin_verified';
      else if (!isEdit) payload.verification_status = 'manual_entry';

      save.disabled = true; save.textContent = 'Saving…';
      var op = isEdit ? db.from('jobs').update(payload).eq('id', job.id).select('id') : db.from('jobs').insert(payload).select('id');
      op.then(function (r) {
        save.disabled = false; save.textContent = isEdit ? 'Save changes' : 'Create job';
        if (r.error) {
          var m = r.error.message || 'error';
          if (/duplicate key|unique/i.test(m)) m = 'A job with this source URL already exists.';
          out.appendChild(errBox('Could not save: ' + m)); return;
        }
        if (!r.data || !r.data.length) { out.appendChild(errBox('Nothing was saved (no permission or job not found).')); return; }
        jobFilter.status = ''; go('jobs');
      }).catch(function () { save.disabled = false; save.textContent = 'Save'; out.appendChild(errBox('Network problem. Try again.')); });
    } }, [
      el('div', { class: 'form-grid' }, [
        fld('title', 'Job title *', inp('title', 'text', v.title, 200), true),
        fld('hospital_name', 'Employer / hospital *', inp('hospital_name', 'text', v.hospital_name, 200)),
        fld('country', 'Country *', country),
        fld('profession', 'Profession', inp('profession', 'text', v.profession, 120)),
        fld('salary_text', 'Salary (only if officially stated)', inp('salary_text', 'text', v.salary_text, 200)),
        fld('description', 'Job description', desc, true),
        fld('requirements', 'Requirements', req, true),
        fld('source_url', 'Official source URL', inp('source_url', 'url', v.source_url, 1000), true, 'Link to the official announcement or career page. Required to approve.'),
        fld('apply_url', 'Official application URL', inp('apply_url', 'url', v.apply_url, 1000), true),
        fld('published_at', 'Publication date', inp('published_at', 'date', v.published_at ? String(v.published_at).slice(0, 10) : '')),
        fld('deadline', 'Deadline', inp('deadline', 'date', v.deadline ? String(v.deadline).slice(0, 10) : '')),
        fld('status', 'Status', status)
      ]),
      out,
      el('div', { class: 'actions' }, [save, el('button', { type: 'button', class: 'btn btn-outline', text: 'Cancel', onclick: function () { go('jobs'); } })])
    ]);
    content.appendChild(el('div', { class: 'card' }, [
      el('h1', { text: isEdit ? 'Edit job' : 'New job' }),
      el('p', { class: 'muted', text: 'Only enter information taken from the official announcement. Do not invent details.' }),
      form]));
  }

  /* ---------------- service requests ---------------- */
  var orderFilter = '';
  function requests() {
    var st = el('select', { id: 'rs' }, [el('option', { value: '', text: 'All statuses' })].concat(ORDER_STATUS.map(function (s) { return el('option', { value: s, text: s.replace('_', ' ') }); })));
    st.value = orderFilter;
    var list = el('div', { class: 'grid' });
    st.addEventListener('change', function () { orderFilter = st.value; load(); });
    content.appendChild(el('h1', { text: 'Service requests' }));
    content.appendChild(el('div', { class: 'field', style: 'max-width:260px' }, [el('label', { for: 'rs', text: 'Status' }), st]));
    content.appendChild(list);
    function load() {
      clear(list); list.appendChild(loading());
      var q = db.from('service_orders').select('*').order('created_at', { ascending: false }).limit(100);
      if (orderFilter) q = q.eq('status', orderFilter);
      q.then(function (r) {
        clear(list);
        if (r.error) { list.appendChild(errBox('Could not load requests: ' + r.error.message)); return; }
        if (!r.data.length) { list.appendChild(el('div', { class: 'state', role: 'status', text: 'No requests found.' })); return; }
        r.data.forEach(function (o) {
          var sel = el('select', { 'aria-label': 'Status for ' + (o.customer_name || 'request') },
            ORDER_STATUS.map(function (s) { return el('option', { value: s, text: s.replace('_', ' ') }); }));
          sel.value = o.status || 'pending';
          var note = el('span', { class: 'hint', role: 'status' });
          sel.addEventListener('change', function () {
            sel.disabled = true;
            db.from('service_orders').update({ status: sel.value }).eq('id', o.id).select('id').then(function (u) {
              sel.disabled = false;
              note.textContent = (u.error || !u.data || !u.data.length) ? 'Update failed' : 'Saved';
            });
          });
          list.appendChild(el('div', { class: 'card row-card' }, [
            el('div', { class: 'meta' }, [badge(o.status), el('span', { text: fmtTime(o.created_at) })]),
            el('h3', { style: 'margin:0', text: o.customer_name || '—' }),
            el('div', { text: 'Contact: ' + (o.contact || '—') }),
            el('div', { text: 'Service: ' + (SERVICE_LABEL[o.service_type] || o.service_type || '—') }),
            o.job_id !== null && o.job_id !== undefined ? el('div', { text: 'Job ID: ' + o.job_id }) : null,
            o.message ? el('div', { class: 'detail-body', text: o.message }) : null,
            el('div', { class: 'row-actions' }, [el('label', { style: 'margin:0;align-self:center', text: 'Update status:' }), sel, note])
          ]));
        });
      });
    }
    load();
  }

  /* keep the session in sync (e.g. signed out in another tab) */
  db.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_OUT') showLogin(); });
  start();
})();
