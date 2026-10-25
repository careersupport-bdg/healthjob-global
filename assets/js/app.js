/* HealthJob Global — core helpers, router, static views, assistance form. */
(function () {
  'use strict';
  var C = window.HJ_CONFIG || {};
  var HJ = window.HJ = window.HJ || {};

  HJ.COUNTRIES = ['Bangladesh', 'UAE', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Oman', 'Bahrain', 'Other'];
  HJ.SERVICES = [
    { value: 'cv_writing', label: 'CV and resume writing', text: 'Clear, honest CVs and cover letters tailored to nursing and healthcare roles.' },
    { value: 'job_application', label: 'Job application assistance', text: 'Help preparing and submitting applications on official employer channels.' },
    { value: 'exam_prep', label: 'Nursing recruitment exam preparation', text: 'Guidance and practice for nursing recruitment written exams.' },
    { value: 'interview_prep', label: 'Private hospital interview and viva preparation', text: 'Mock questions and feedback for hospital interviews and viva.' },
    { value: 'study_materials', label: 'Nursing study PDFs and practice materials', text: 'Study notes and practice question sets for revision.' },
    { value: 'career_guidance', label: 'International healthcare career guidance', text: 'General information about working in healthcare abroad. No visa or job guarantees.' }
  ];

  /* ---------- DOM helpers (all text via textContent: XSS-safe) ---------- */
  HJ.el = function (tag, attrs, kids) {
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
  };
  var el = HJ.el;

  HJ.safeUrl = function (u) {
    if (!u || typeof u !== 'string') return null;
    try {
      var x = new URL(u.trim());
      return (x.protocol === 'http:' || x.protocol === 'https:') ? x.href : null;
    } catch (e) { return null; }
  };
  HJ.extLink = function (url, label, cls) {
    var s = HJ.safeUrl(url);
    if (!s) return null;
    return el('a', { href: s, target: '_blank', rel: 'noopener noreferrer nofollow', class: cls || 'btn btn-outline', text: label });
  };
  HJ.fmtDate = function (d) {
    if (!d) return '';
    var dt = new Date(String(d).length === 10 ? d + 'T00:00:00' : d);
    if (isNaN(dt)) return '';
    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  HJ.todayISO = function () {
    var d = new Date();
    var m = ('0' + (d.getMonth() + 1)).slice(-2), day = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + m + '-' + day;
  };
  HJ.whatsappLink = function (text) {
    var n = String(C.WHATSAPP_NUMBER || '').replace(/\D/g, '');
    if (n.length < 8) return null;
    return 'https://wa.me/' + n + (text ? '?text=' + encodeURIComponent(text) : '');
  };
  HJ.stateBox = function (kind, title, text, actionLabel, action) {
    var kids = [el('h3', { text: title }), text ? el('p', { class: 'muted', text: text }) : null];
    if (actionLabel) kids.push(el('button', { type: 'button', class: 'btn btn-outline', text: actionLabel, onclick: action }));
    return el('div', { class: 'state' + (kind === 'error' ? ' error' : ''), role: kind === 'error' ? 'alert' : 'status' }, kids);
  };
  HJ.skeletons = function (n) {
    var w = el('div', { class: 'grid cols', 'aria-busy': 'true', 'aria-label': 'Loading jobs' });
    for (var i = 0; i < n; i++) {
      w.appendChild(el('div', { class: 'skeleton' }, [el('div', { class: 'sk w40' }), el('div', { class: 'sk t' }), el('div', { class: 'sk w60' }), el('div', { class: 'sk' })]));
    }
    return w;
  };

  /* ---------- mounting & routing ---------- */
  var app;
  HJ.mount = function (title, nodes) {
    document.title = (title ? title + ' — ' : '') + 'HealthJob Global';
    app.textContent = '';
    nodes.forEach(function (n) { if (n) app.appendChild(n); });
    window.scrollTo(0, 0);
    var h1 = app.querySelector('h1');
    if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
  };

  HJ.parseHash = function () {
    var h = location.hash.replace(/^#/, '') || '/';
    var qi = h.indexOf('?');
    var path = qi >= 0 ? h.slice(0, qi) : h;
    var params = {};
    if (qi >= 0) {
      h.slice(qi + 1).split('&').forEach(function (p) {
        if (!p) return;
        var kv = p.split('=');
        try { params[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' ')); } catch (e) {}
      });
    }
    return { path: path, params: params };
  };
  HJ.buildHash = function (path, params) {
    var q = Object.keys(params || {}).filter(function (k) { return params[k]; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    return '#' + path + (q ? '?' + q : '');
  };

  function setActive(path) {
    var key = path.indexOf('/job') === 0 ? 'jobs' : path.indexOf('/services') === 0 ? 'services' :
      (path === '/about' || path === '/privacy') ? 'about' : 'home';
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      var on = a.getAttribute('data-nav') === key;
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  function route() {
    var r = HJ.parseHash();
    setActive(r.path);
    var m;
    try {
      if (r.path === '/' || r.path === '') return HJ.views.home(r.params);
      if (r.path === '/jobs') return HJ.views.jobs(r.params);
      if ((m = r.path.match(/^\/job\/([^\/]+)$/))) return HJ.views.job(decodeURIComponent(m[1]));
      if (r.path === '/services') return HJ.views.services(r.params);
      if (r.path === '/about') return HJ.views.about();
      if (r.path === '/privacy') return HJ.views.privacy();
    } catch (e) {
      return HJ.mount('Error', [el('div', { class: 'wrap page-pad' }, [HJ.stateBox('error', 'Something went wrong', 'Please reload the page.')])]);
    }
    HJ.mount('Not found', [el('div', { class: 'wrap page-pad' }, [HJ.stateBox('info', 'Page not found', 'The page you are looking for does not exist.', 'Go to home', function () { location.hash = '#/'; })])]);
  }

  /* ---------- views ---------- */
  HJ.views = HJ.views || {};

  HJ.views.home = function () {
    var q = el('input', { id: 'hq', type: 'search', placeholder: 'Job title, hospital or profession', autocomplete: 'off', maxlength: '80' });
    var cs = el('select', { id: 'hc' }, [el('option', { value: '', text: 'All countries' })].concat(HJ.COUNTRIES.map(function (c) { return el('option', { value: c, text: c }); })));
    var form = el('form', { class: 'search-box', role: 'search', onsubmit: function (e) {
      e.preventDefault();
      location.hash = HJ.buildHash('/jobs', { q: q.value.trim(), country: cs.value });
    } }, [
      el('div', {}, [el('label', { for: 'hq', text: 'Search jobs' }), q]),
      el('div', {}, [el('label', { for: 'hc', text: 'Country' }), cs]),
      el('button', { type: 'submit', class: 'btn btn-amber', text: 'Search' })
    ]);
    var hero = el('section', { class: 'hero' }, [el('div', { class: 'wrap' }, [
      el('h1', { text: 'Healthcare & nursing jobs for Bangladesh and the Gulf' }),
      el('p', { text: 'Reviewed job circulars with links to the official source, plus optional help with your CV, application and interview preparation.' }),
      form,
      el('div', { class: 'hero-cta' }, [
        el('a', { class: 'btn btn-outline', href: '#/jobs', text: 'Browse all jobs' }),
        el('a', { class: 'btn btn-teal', href: '#/services', text: 'Get application help' })
      ])
    ])]);

    var chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by country' },
      HJ.COUNTRIES.map(function (c) {
        return el('a', { class: 'chip', href: HJ.buildHash('/jobs', { country: c }), style: 'text-decoration:none;display:inline-flex;align-items:center', text: c });
      }));

    var latestBox = el('div');
    var latest = el('section', { class: 'section' }, [el('div', { class: 'wrap' }, [
      el('div', { class: 'section-head' }, [el('h2', { text: 'Latest jobs' }), el('a', { href: '#/jobs', text: 'View all jobs →' })]),
      chips, latestBox
    ])]);

    var svc = el('section', { class: 'section' }, [el('div', { class: 'wrap' }, [
      el('h2', { text: 'Optional career support' }),
      el('div', { class: 'svc-grid' }, HJ.SERVICES.map(function (s) {
        return el('div', { class: 'card svc' }, [el('h3', { text: s.label }), el('p', { class: 'muted', text: s.text })]);
      })),
      el('div', { class: 'cta-band', style: 'margin-top:16px' }, [
        el('div', {}, [el('h3', { text: 'Need help applying?' }), el('p', { class: 'muted', style: 'margin:0', text: 'Send a request and we will contact you. Support is optional and does not guarantee a job, exam result or visa.' })]),
        el('a', { class: 'btn btn-primary', href: '#/services', text: 'Request assistance' })
      ])
    ])]);

    HJ.mount('', [hero, latest, svc]);
    HJ.renderJobList(latestBox, { limit: 6, loadMore: false });
  };

  HJ.views.services = function (params) {
    var f = {};
    function field(id, labelText, control, hint) {
      var d = el('div', { class: 'field' }, [el('label', { for: id, text: labelText }), control]);
      if (hint) d.appendChild(el('div', { class: 'hint', text: hint }));
      var e = el('div', { class: 'err-text', id: id + '-err', role: 'alert' });
      d.appendChild(e);
      f[id] = { input: control, err: e };
      return d;
    }
    var nameI = el('input', { id: 'sname', type: 'text', maxlength: '100', autocomplete: 'name', required: true });
    var contactI = el('input', { id: 'scontact', type: 'text', maxlength: '200', autocomplete: 'off', required: true, placeholder: 'WhatsApp/phone number or email' });
    var svcI = el('select', { id: 'sservice', required: true }, [el('option', { value: '', text: 'Select a service' })]
      .concat(HJ.SERVICES.map(function (s) { return el('option', { value: s.value, text: s.label }); })));
    var jobI = el('input', { id: 'sjob', type: 'text', maxlength: '60', placeholder: 'e.g. job title or reference (optional)' });
    var msgI = el('textarea', { id: 'smsg', maxlength: '1000' });
    var hp = el('input', { id: 'swebsite', name: 'website', type: 'text', tabindex: '-1', autocomplete: 'off' });
    if (params && params.job) jobI.value = String(params.job).slice(0, 60);
    if (params && params.service) svcI.value = params.service;

    var statusBox = el('div', { 'aria-live': 'polite' });
    var btn = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Send request' });

    function validate() {
      var ok = true;
      Object.keys(f).forEach(function (k) { f[k].err.textContent = ''; });
      var name = nameI.value.trim(), contact = contactI.value.trim();
      if (name.length < 2 || name.length > 100) { f.sname.err.textContent = 'Please enter your name (2–100 characters).'; ok = false; }
      var isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
      var digits = contact.replace(/\D/g, '');
      var isPhone = /^[+\d][\d\s\-()+]{6,}$/.test(contact) && digits.length >= 7 && digits.length <= 15;
      if (!(isEmail || isPhone) || contact.length < 5) { f.scontact.err.textContent = 'Enter a valid phone/WhatsApp number or email address.'; ok = false; }
      if (!svcI.value) { f.sservice.err.textContent = 'Please choose a service.'; ok = false; }
      if (msgI.value.length > 1000) { f.smsg.err.textContent = 'Message is too long (max 1000 characters).'; ok = false; }
      return ok;
    }

    var form = el('form', { novalidate: true, onsubmit: function (e) {
      e.preventDefault();
      statusBox.textContent = '';
      if (hp.value) { return; } // bot
      if (!validate()) { var bad = app.querySelector('.err-text:not(:empty)'); if (bad) bad.previousElementSibling && bad.previousElementSibling.focus && (bad.parentNode.querySelector('input,select,textarea') || {}).focus(); return; }
      if (!window.HJ_DB) { statusBox.appendChild(el('div', { class: 'fail', role: 'alert', text: 'Requests cannot be sent right now: ' + (window.HJ_DB_ERROR || 'service unavailable') + ' You can contact us on WhatsApp instead.' })); return; }
      var last = 0;
      try { last = parseInt(localStorage.getItem('hj_last_submit') || '0', 10); } catch (x) {}
      if (Date.now() - last < 60000) { statusBox.appendChild(el('div', { class: 'notice', role: 'alert', text: 'Please wait a minute before sending another request.' })); return; }

      var ref = jobI.value.trim();
      var message = (ref ? 'Job reference: ' + ref + '\n' : '') + msgI.value.trim();
      var row = { customer_name: nameI.value.trim(), contact: contactI.value.trim(), service_type: svcI.value, message: message || null };
      if (params && params.jobid && /^[0-9a-fA-F-]{1,40}$/.test(params.jobid)) row.job_id = /^\d+$/.test(params.jobid) ? Number(params.jobid) : params.jobid;

      btn.disabled = true; btn.textContent = 'Sending…';
      window.HJ_DB.from('service_orders').insert(row).then(function (res) {
        btn.disabled = false; btn.textContent = 'Send request';
        if (res.error) {
          statusBox.appendChild(el('div', { class: 'fail', role: 'alert', text: 'Sorry, your request could not be sent. Please try again later or contact us on WhatsApp.' }));
          return;
        }
        try { localStorage.setItem('hj_last_submit', String(Date.now())); } catch (x) {}
        form.reset();
        statusBox.appendChild(el('div', { class: 'success', role: 'status', text: 'Thank you. Your request was received. We will contact you using the details you provided.' }));
      }).catch(function () {
        btn.disabled = false; btn.textContent = 'Send request';
        statusBox.appendChild(el('div', { class: 'fail', role: 'alert', text: 'Network problem. Please check your connection and try again.' }));
      });
    } }, [
      el('div', { class: 'form-grid' }, [
        field('sname', 'Your name', nameI),
        field('scontact', 'Contact (phone/WhatsApp or email)', contactI, 'We use this only to reply to your request.'),
        field('sservice', 'Service requested', svcI),
        field('sjob', 'Job reference (optional)', jobI),
        (function () { var d = field('smsg', 'Message (optional)', msgI); d.className += ' full'; return d; })()
      ]),
      el('div', { class: 'hp', 'aria-hidden': 'true' }, [el('label', { for: 'swebsite', text: 'Leave this field empty' }), hp]),
      btn
    ]);

    var wa = HJ.whatsappLink('Hello HealthJob Global, I need career support.');
    var left = [
      el('h1', { text: 'Career support services' }),
      el('p', { class: 'muted', text: 'Optional paid or free help (terms are agreed directly with you). We do not guarantee employment, exam success or visa approval.' }),
      el('div', { class: 'svc-grid', style: 'margin-bottom:20px' }, HJ.SERVICES.map(function (s) {
        return el('div', { class: 'card svc' }, [el('h3', { text: s.label }), el('p', { class: 'muted', style: 'margin:0', text: s.text })]);
      })),
      el('div', { class: 'card page-narrow' }, [el('h2', { text: 'Request assistance' }), form, statusBox,
        wa ? el('p', { style: 'margin-top:16px' }, [el('a', { class: 'btn btn-teal', href: wa, target: '_blank', rel: 'noopener noreferrer', text: 'Chat on WhatsApp' })]) : null])
    ];
    HJ.mount('Career support', [el('div', { class: 'wrap page-pad' }, left)]);
  };

  HJ.views.about = function () {
    HJ.mount('About & disclaimer', [el('div', { class: 'wrap page-pad' }, [el('div', { class: 'page-narrow prose' }, [
      el('h1', { text: 'About HealthJob Global' }),
      el('p', { text: 'HealthJob Global is an independent job-information and career-support platform for nurses and other healthcare professionals in Bangladesh and the Gulf region (UAE, Saudi Arabia, Qatar, Kuwait, Oman and Bahrain).' }),
      el('h2', { text: 'Disclaimer' }),
      el('ul', {}, [
        el('li', { text: 'We are not a hospital, government authority, licensing board or recruitment agency.' }),
        el('li', { text: 'We do not guarantee employment, exam results, licensing outcomes or visa approval.' }),
        el('li', { text: 'Every job entry links to its official source where available. Always verify details and deadlines with the employer before applying.' }),
        el('li', { text: 'Never pay anyone who promises a guaranteed job or visa. Apply only through official employer channels.' })
      ]),
      el('h2', { text: 'How jobs are published' }),
      el('p', { text: 'Job circulars are reviewed by an administrator before appearing on this website. Listings past their deadline are hidden automatically.' }),
      el('h2', { text: 'Tips for job seekers' }),
      el('ul', {}, [
        el('li', { text: 'Keep your certificates, council registration and passport details ready in digital form.' }),
        el('li', { text: 'Tailor your CV to each role and keep it to the facts you can document.' }),
        el('li', { text: 'Check that the application link goes to the employer’s own website or an official government portal.' }),
        el('li', { text: 'Be cautious of requests for payment before an offer.' })
      ]),
      el('p', {}, [el('a', { href: '#/privacy', text: 'Privacy notice' })])
    ])])]);
  };

  HJ.views.privacy = function () {
    HJ.mount('Privacy notice', [el('div', { class: 'wrap page-pad' }, [el('div', { class: 'page-narrow prose' }, [
      el('h1', { text: 'Privacy notice' }),
      el('p', { class: 'notice', text: 'Template text: have this reviewed and edited by you (and legal advice if needed) before relying on it.' }),
      el('h2', { text: 'What we collect' }),
      el('p', { text: 'Only what you type into the assistance request form: your name, contact detail, requested service and optional message or job reference.' }),
      el('h2', { text: 'How it is used' }),
      el('p', { text: 'To reply to your request. The information is stored in our database and is visible only to site administrators.' }),
      el('h2', { text: 'Cookies and tracking' }),
      el('p', { text: 'This site does not use advertising or analytics trackers. Your browser may store technical data to make the site work offline.' }),
      el('h2', { text: 'Your choices' }),
      el('p', { text: 'To ask for your request to be deleted, contact us using the details in the footer.' })
    ])])]);
  };

  /* ---------- boot ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    app = document.getElementById('app');
    var fc = document.getElementById('footContact');
    if (fc) {
      var wa = HJ.whatsappLink('');
      if (wa) fc.appendChild(el('li', {}, [el('a', { href: wa, target: '_blank', rel: 'noopener noreferrer', text: 'WhatsApp' })]));
      if (C.SUPPORT_EMAIL && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(C.SUPPORT_EMAIL)) fc.appendChild(el('li', {}, [el('a', { href: 'mailto:' + C.SUPPORT_EMAIL, text: C.SUPPORT_EMAIL })]));
      if (!fc.children.length) fc.appendChild(el('li', { class: 'muted', text: 'Contact details coming soon.' }));
    }
    window.addEventListener('hashchange', route);
    route();
  });
})();
