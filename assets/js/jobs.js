/* HealthJob Global — public job listing, filters, details. */
(function () {
  'use strict';
  var HJ = window.HJ;
  var el = HJ.el;
  var COLS = 'id,title,hospital_name,country,profession,description,requirements,salary_text,source_url,apply_url,published_at,deadline,status';
  var CARD_COLS = 'id,title,hospital_name,country,profession,published_at,deadline,status';

  function cleanTerm(s) { return String(s || '').replace(/[,()%*\\"'`:;]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60); }

  function daysLeft(deadline) {
    if (!deadline) return null;
    var d = new Date(String(deadline).slice(0, 10) + 'T23:59:59');
    return Math.ceil((d - new Date()) / 86400000);
  }

  // Public queries only ever ask for approved, non-expired jobs (RLS enforces the same on the server).
  HJ.loadJobs = function (o) {
    var db = window.HJ_DB;
    if (!db) return Promise.reject(new Error(window.HJ_DB_ERROR || 'No database'));
    var size = o.size || 12, from = (o.page || 0) * size, to = from + size - 1;
    var q = db.from('jobs').select(o.full ? COLS : CARD_COLS, { count: 'exact' })
      .eq('status', 'approved')
      .or('deadline.is.null,deadline.gte.' + HJ.todayISO())
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .range(from, to);
    if (o.country && HJ.COUNTRIES.indexOf(o.country) >= 0) q = q.eq('country', o.country);
    var t = cleanTerm(o.q);
    if (t) q = q.or('title.ilike.%' + t + '%,hospital_name.ilike.%' + t + '%,profession.ilike.%' + t + '%');
    return q.then(function (res) {
      if (res.error) throw res.error;
      return { rows: res.data || [], count: res.count || 0 };
    });
  };

  HJ.jobCard = function (j) {
    var left = daysLeft(j.deadline);
    var status, cls;
    if (left === null) { status = 'Deadline not stated'; cls = 'badge gray'; }
    else if (left <= 7) { status = left <= 0 ? 'Closes today' : 'Closing soon'; cls = 'badge warn'; }
    else { status = 'Open'; cls = 'badge'; }
    var meta = [el('span', { class: 'badge country', text: j.country || 'Other' })];
    if (j.profession) meta.push(el('span', { text: j.profession }));
    var foot = [];
    if (j.deadline) foot.push(el('span', { text: 'Deadline: ' + HJ.fmtDate(j.deadline) }));
    return el('article', { class: 'card job-card' }, [
      el('div', { class: 'meta' }, meta),
      el('h3', {}, [el('a', { href: '#/job/' + encodeURIComponent(j.id), text: j.title || 'Untitled job' })]),
      el('div', { text: j.hospital_name || 'Employer not stated', style: 'font-weight:600' }),
      el('div', { class: 'meta' }, [el('span', { class: cls, text: status })].concat(foot))
    ]);
  };

  // Renders a list with skeleton, error, empty and load-more states into `box`.
  HJ.renderJobList = function (box, opt) {
    var page = 0, total = 0, shown = 0;
    var grid = el('div', { class: 'grid cols' });
    var more = el('div', { style: 'text-align:center;margin-top:16px' });
    function setLoading() { box.textContent = ''; box.appendChild(HJ.skeletons(opt.limit && opt.limit < 6 ? opt.limit : 6)); }
    function fail(e) {
      box.textContent = '';
      var msg = (e && e.message && !window.HJ_DB) ? e.message : 'We could not load jobs. Please check your connection and try again.';
      box.appendChild(HJ.stateBox('error', 'Jobs unavailable', msg, 'Try again', function () { start(); }));
    }
    function addRows(rows) {
      rows.forEach(function (j) { grid.appendChild(HJ.jobCard(j)); });
      shown += rows.length;
      more.textContent = '';
      if (opt.loadMore && shown < total) {
        var b = el('button', { type: 'button', class: 'btn btn-outline', text: 'Load more jobs', onclick: function () {
          b.disabled = true; b.textContent = 'Loading…';
          page++;
          HJ.loadJobs({ q: opt.q, country: opt.country, page: page, size: opt.size }).then(function (r) { addRows(r.rows); }).catch(function () {
            page--; b.disabled = false; b.textContent = 'Could not load. Try again';
          });
        } });
        more.appendChild(b);
      }
    }
    function start() {
      page = 0; shown = 0; grid.textContent = ''; setLoading();
      HJ.loadJobs({ q: opt.q, country: opt.country, page: 0, size: opt.limit || opt.size }).then(function (r) {
        total = r.count; box.textContent = '';
        if (!r.rows.length) {
          box.appendChild(HJ.stateBox('info', 'No jobs found', (opt.q || opt.country) ? 'Try a different search or country.' : 'No approved jobs are listed right now. Please check back soon.'));
          return;
        }
        if (opt.loadMore) box.appendChild(el('p', { class: 'muted', role: 'status', text: total + (total === 1 ? ' job found' : ' jobs found') }));
        box.appendChild(grid); box.appendChild(more);
        addRows(r.rows);
      }).catch(fail);
    }
    start();
  };

  HJ.views.jobs = function (params) {
    var state = { q: params.q || '', country: HJ.COUNTRIES.indexOf(params.country) >= 0 ? params.country : '' };
    var listBox = el('div');
    var q = el('input', { id: 'jq', type: 'search', maxlength: '80', value: state.q, placeholder: 'Title, hospital or profession' });
    var form = el('form', { class: 'card', role: 'search', style: 'margin-bottom:12px', onsubmit: function (e) {
      e.preventDefault();
      location.hash = HJ.buildHash('/jobs', { q: q.value.trim(), country: state.country });
    } }, [
      el('label', { for: 'jq', text: 'Search jobs' }),
      el('div', { style: 'display:flex;gap:8px' }, [q, el('button', { type: 'submit', class: 'btn btn-primary', text: 'Search' })])
    ]);
    var chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by country' },
      [''].concat(HJ.COUNTRIES).map(function (c) {
        return el('button', { type: 'button', class: 'chip', 'aria-pressed': String(state.country === c), text: c || 'All countries', onclick: function () {
          location.hash = HJ.buildHash('/jobs', { q: state.q, country: c });
        } });
      }));
    HJ.mount('Jobs', [el('div', { class: 'wrap page-pad' }, [
      el('h1', { text: 'Healthcare jobs' }),
      el('p', { class: 'muted', text: 'Only approved listings that have not passed their deadline are shown.' }),
      form, chips, listBox
    ])]);
    HJ.renderJobList(listBox, { q: state.q, country: state.country, loadMore: true, size: (window.HJ_CONFIG && window.HJ_CONFIG.PAGE_SIZE) || 12 });
  };

  HJ.views.job = function (id) {
    var box = el('div');
    HJ.mount('Job details', [el('div', { class: 'wrap page-pad' }, [
      el('a', { class: 'crumb', href: '#/jobs', text: '← All jobs' }), box])]);
    box.appendChild(HJ.skeletons(1));
    var db = window.HJ_DB;
    if (!db) { box.textContent = ''; box.appendChild(HJ.stateBox('error', 'Job unavailable', window.HJ_DB_ERROR)); return; }
    db.from('jobs').select(COLS).eq('id', id).eq('status', 'approved')
      .or('deadline.is.null,deadline.gte.' + HJ.todayISO()).maybeSingle().then(function (res) {
        box.textContent = '';
        if (res.error) { box.appendChild(HJ.stateBox('error', 'Could not load this job', 'Please try again.', 'Retry', function () { HJ.views.job(id); })); return; }
        var j = res.data;
        if (!j) { box.appendChild(HJ.stateBox('info', 'Job not available', 'This job may have expired or been removed.', 'Browse jobs', function () { location.hash = '#/jobs'; })); return; }
        document.title = (j.title || 'Job') + ' — HealthJob Global';
        var kv = [['Employer', j.hospital_name || 'Not stated'], ['Country', j.country || 'Not stated'], ['Profession', j.profession || 'Not stated'],
          ['Salary', j.salary_text || 'Not stated'], ['Published', HJ.fmtDate(j.published_at) || 'Not stated'], ['Deadline', HJ.fmtDate(j.deadline) || 'Not stated']];
        var acts = [];
        var apply = HJ.extLink(j.apply_url, 'Apply on official site', 'btn btn-primary');
        var src = HJ.extLink(j.source_url, 'View official source', 'btn btn-outline');
        if (apply) acts.push(apply);
        if (src) acts.push(src);
        acts.push(el('a', { class: 'btn btn-teal', href: HJ.buildHash('/services', { service: 'job_application', job: (j.title || '').slice(0, 60), jobid: String(j.id) }), text: 'Get application help' }));
        var kids = [
          el('span', { class: 'badge country', text: j.country || 'Other' }),
          el('h1', { text: j.title || 'Untitled job', style: 'margin-top:8px' }),
          el('dl', { class: 'kv' }, kv.map(function (p) { return el('div', {}, [el('dt', { text: p[0] }), el('dd', { text: p[1] })]); }))
        ];
        if (j.description) kids.push(el('h2', { text: 'Job description' }), el('div', { class: 'detail-body', text: j.description }));
        if (j.requirements) kids.push(el('h2', { text: 'Requirements' }), el('div', { class: 'detail-body', text: j.requirements }));
        kids.push(el('div', { class: 'actions' }, acts));
        if (!apply && !src) kids.push(el('p', { class: 'notice', style: 'margin-top:14px', text: 'No official link was supplied for this listing. Verify details with the employer before applying.' }));
        kids.push(el('p', { class: 'muted', style: 'margin-top:16px;font-size:.88rem', text: 'Always confirm details and deadlines on the official source. HealthJob Global is not the employer.' }));
        box.appendChild(el('article', { class: 'card detail' }, kids));
      }).catch(function () {
        box.textContent = '';
        box.appendChild(HJ.stateBox('error', 'Network problem', 'Please check your connection.', 'Retry', function () { HJ.views.job(id); }));
      });
  };
})();
