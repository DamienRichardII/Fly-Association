/* Évènements publics — lit les évènements publiés dans Supabase (lecture
   anonyme autorisée par RLS) et remplace l'état vide. Sans réseau ou sans
   évènement, le bloc statique « Aucun évènement » reste affiché. */
(function () {
  var URL_ = 'https://wpwqmiefneagvudisapn.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd3FtaWVmbmVhZ3Z1ZGlzYXBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4MTA3MzIsImV4cCI6MjEwNzM4NjczMn0.nc-8o45mwTTaglMLZCYytGguWTS7zGhPp6QIF20vxYY';
  var host = document.querySelector('[data-events]');
  if (!host) return;
  var full = host.getAttribute('data-events') === 'full';

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var euro = function (c) { return (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }); };
  var ICON_PIN = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
  var ICON_CLOCK = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

  function priceLabel(ev) {
    var t = ev.event_ticket_types || [];
    if (ev.kind !== 'ticketed' || !t.length) return ev.kind === 'rsvp' ? 'Inscription gratuite' : '';
    var paid = t.filter(function (x) { return !x.is_free; }).map(function (x) { return x.price_cents; });
    if (paid.length < t.length) return paid.length ? 'Dès gratuit · billets payants' : 'Entrée gratuite';
    return 'Dès ' + euro(Math.min.apply(null, paid));
  }

  function row(ev) {
    var d = new Date(ev.start_at);
    var day = d.toLocaleDateString('fr-FR', { day: '2-digit' });
    var month = d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
    var hour = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    var where = ev.location_type === 'online' ? 'En ligne' : [ev.venue_name, ev.city].filter(Boolean).join(', ');
    var price = priceLabel(ev);
    var head = '<div class="event-date"><div class="event-day">' + esc(day) + '</div><div class="event-month">' + esc(month) + '</div></div>' +
      '<div class="event-body"><div class="event-name">' + esc(ev.title) + '</div>' +
      '<div class="event-meta">' + (where ? '<span>' + ICON_PIN + ' ' + esc(where) + '</span>' : '') +
      '<span>' + ICON_CLOCK + ' ' + esc(hour) + '</span>' + (price ? '<span>' + esc(price) + '</span>' : '') + '</div></div>';
    if (!full) {
      return '<a class="event-row" href="evenements.html#' + esc(ev.slug) + '">' + head + '<div class="event-go">&rarr;</div></a>';
    }
    var tickets = (ev.event_ticket_types || []).map(function (t) {
      return '<li><span>' + esc(t.name) + '</span><strong>' + (t.is_free ? 'Gratuit' : esc(euro(t.price_cents))) + '</strong></li>';
    }).join('');
    var cta = 'S’inscrire';
    var types = (ev.event_ticket_types || []).slice().sort(function (a, b) { return a.position - b.position; });
    var form = '<form class="event-form" data-event="' + esc(ev.id) + '" hidden>' +
      (types.length ? '<select name="type" required><option value="">Catégorie…</option>' + types.map(function (t) {
        return '<option value="' + esc(t.id) + '">' + esc(t.name) + (t.is_free ? '' : ' — ' + euro(t.price_cents)) + '</option>'; }).join('') + '</select>' : '') +
      '<div class="event-form-row"><input name="first" placeholder="Prénom" required><input name="last" placeholder="Nom" required></div>' +
      '<input name="email" type="email" placeholder="Email" required><input name="phone" type="tel" placeholder="Téléphone">' +
      '<button class="btn btn-navy btn-sm" type="submit">Valider mon inscription</button>' +
      '<p class="event-form-msg" role="status"></p></form>';
    return '<article class="event-card" id="' + esc(ev.slug) + '" data-open="' + (ev.kind === 'ticketed' || ev.kind === 'rsvp' ? '1' : '') + '">' +
      (ev.cover_url ? '<img class="event-cover" src="' + esc(ev.cover_url) + '" alt="" loading="lazy">' : '') +
      '<div class="event-row event-row-static">' + head + '</div>' +
      (ev.category ? '<div class="event-tag">' + esc(ev.category) + '</div>' : '') +
      (ev.short_description ? '<p class="event-lead">' + esc(ev.short_description) + '</p>' : '') +
      (ev.description ? '<p class="event-desc">' + esc(ev.description).replace(/\n/g, '<br>') + '</p>' : '') +
      (tickets ? '<ul class="event-tickets">' + tickets + '</ul>' : '') +
      '<button type="button" class="btn btn-navy btn-sm" data-register>' + cta + '</button>' + form + '</article>';
  }

  host.addEventListener('click', function (e) {
    var b = e.target.closest('[data-register]');
    if (b) { var f = b.parentNode.querySelector('.event-form'); f.hidden = !f.hidden; }
  });
  host.addEventListener('submit', function (e) {
    var f = e.target.closest('.event-form'); if (!f) return;
    e.preventDefault();
    var msg = f.querySelector('.event-form-msg'), btn = f.querySelector('button[type=submit]'), v = function (n) { var x = f.elements[n]; return x ? x.value : ''; };
    btn.disabled = true; msg.className = 'event-form-msg'; msg.textContent = 'Envoi…';
    fetch(URL_ + '/rest/v1/rpc/register_for_event', {
      method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_event: f.getAttribute('data-event'), p_ticket_type: v('type') || null,
        p_first: v('first'), p_last: v('last'), p_email: v('email'), p_phone: v('phone') || null })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error((r.j && r.j.message) || 'Inscription impossible');
        f.reset(); msg.className = 'event-form-msg ok';
        msg.textContent = 'Inscription enregistrée ! L’équipe du Fly vous recontacte pour la confirmation et le règlement.';
      })
      .catch(function (err) { msg.className = 'event-form-msg err'; msg.textContent = err.message; })
      .then(function () { btn.disabled = false; });
  });

  /* Liens directs : evenements.html#inscription (1er évènement ouvert aux inscriptions)
     ou evenements.html#<slug> (lien à mettre en bio) → formulaire déjà ouvert. */
  function openFromHash() {
    if (!full) return;
    var h = decodeURIComponent((location.hash || '').slice(1));
    if (!h) return;
    var card = h === 'inscription' ? host.querySelector('.event-card[data-open="1"]') : document.getElementById(h);
    if (!card) return;
    var f = card.querySelector('.event-form');
    if (f) f.hidden = false;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.classList.add('event-card-focus');
  }
  window.addEventListener('hashchange', openFromHash);

  var q = URL_ + '/rest/v1/events?select=id,slug,title,kind,category,short_description,description,cover_url,start_at,end_at,location_type,venue_name,city,event_ticket_types(id,name,is_free,price_cents,position)' +
    '&status=eq.published&start_at=gte.' + encodeURIComponent(new Date(Date.now() - 6 * 3600e3).toISOString()) +
    '&order=start_at.asc&limit=' + (full ? 30 : 3);
  fetch(q, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (list) {
      if (!list || !list.length) return;
      var empty = host.querySelector('.event-empty');
      var html = list.map(row).join('');
      if (empty) empty.insertAdjacentHTML('beforebegin', html), empty.style.display = 'none';
      else host.insertAdjacentHTML('beforeend', html);
      openFromHash();
    })
    .catch(function () { /* l'état vide reste affiché */ });
})();
