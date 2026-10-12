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
