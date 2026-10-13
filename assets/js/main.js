/* Le Fly Association — interactions */
(function () {
  // Menu mobile
  var burger = document.querySelector('.burger');
  var nav = document.querySelector('.main-nav');
  if (burger && nav) {
    burger.addEventListener('click', function () {
      nav.classList.toggle('open');
      burger.classList.toggle('open');
      burger.setAttribute('aria-expanded', nav.classList.contains('open'));
    });
    nav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('open');
        burger.classList.remove('open');
      });
    });
  }

  // Apparition au scroll
  var els = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px' });
    els.forEach(function (el) { io.observe(el); });
  } else {
    els.forEach(function (el) { el.classList.add('in'); });
  }

  // FAQ
  document.querySelectorAll('.faq-q').forEach(function (q) {
    q.addEventListener('click', function () {
      var item = q.closest('.faq-item');
      var wasOpen = item.classList.contains('open');
      item.parentNode.querySelectorAll('.faq-item').forEach(function (i) { i.classList.remove('open'); });
      if (!wasOpen) item.classList.add('open');
    });
  });

  // Lien actif dans la nav
  var page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.main-nav a').forEach(function (a) {
    if (a.getAttribute('href') === page) a.classList.add('active');
  });

  // Vidéo de présentation : charge le fichier au clic
  document.querySelectorAll('.video-box[data-video]').forEach(function (box) {
    var play = box.querySelector('.video-play');
    if (!play) return;
    function start() {
      var v = document.createElement('video');
      v.src = box.getAttribute('data-video');
      v.controls = true; v.autoplay = true; v.playsInline = true;
      v.setAttribute('poster', box.querySelector('img').src);
      v.style.cssText = 'width:100%;aspect-ratio:16/10;object-fit:cover;display:block;background:#0e1a42';
      box.innerHTML = ''; box.appendChild(v);
    }
    play.addEventListener('click', start);
    play.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); } });
  });
})();

/* Contact : préremplit le sujet depuis ?sujet= (lien « Réserver » des évènements) */
(function () {
  var f = document.querySelector('input[name="sujet"]');
  var v = new URLSearchParams(location.search).get('sujet');
  if (f && v && !f.value) f.value = v.slice(0, 120);
})();

/* Contact : envoie le message dans Supabase (visible dans le back-office, rubrique Messages) */
(function () {
  var f = document.getElementById('contactForm');
  if (!f) return;
  var URL_ = 'https://wpwqmiefneagvudisapn.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd3FtaWVmbmVhZ3Z1ZGlzYXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4MTA3MzIsImV4cCI6MjEwNzM4NjczMn0.nc-8o45mwTTaglMLZCYytGguWTS7zGhPp6QIF20vxYY';
  var msg = document.getElementById('contactMsg');
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = f.querySelector('button[type=submit]'), v = function (n) { return f.elements[n].value; };
    btn.disabled = true; msg.style.color = ''; msg.textContent = 'Envoi…';
    fetch(URL_ + '/rest/v1/rpc/submit_contact_message', {
      method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_first: v('prenom'), p_last: v('nom'), p_email: v('email'), p_subject: v('sujet'), p_message: v('message') })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error((r.j && r.j.message) || 'Envoi impossible');
        f.reset(); msg.style.color = '#1E7A46';
        msg.textContent = 'Message envoyé ! L’équipe du Fly vous répond rapidement.';
      })
      .catch(function (err) { msg.style.color = '#B3261E'; msg.textContent = err.message + ' — vous pouvez aussi nous écrire en message privé sur les réseaux.'; })
      .then(function () { btn.disabled = false; });
  });
})();
