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
      return '<a class="event-row" href="evenements.html">' + head + '<div class="event-go">&rarr;</div></a>';
    }
    var tickets = (ev.event_ticket_types || []).map(function (t) {
      return '<li><span>' + esc(t.name) + '</span><strong>' + (t.is_free ? 'Gratuit' : esc(euro(t.price_cents))) + '</strong></li>';
    }).join('');
    var cta = ev.kind === 'rsvp' ? 'S’inscrire' : 'Réserver ma place';
    return '<article class="event-card">' +
      (ev.cover_url ? '<img class="event-cover" src="' + esc(ev.cover_url) + '" alt="" loading="lazy">' : '') +
      '<div class="event-row event-row-static">' + head + '</div>' +
      (ev.category ? '<div class="event-tag">' + esc(ev.category) + '</div>' : '') +
      (ev.short_description ? '<p class="event-lead">' + esc(ev.short_description) + '</p>' : '') +
      (ev.description ? '<p class="event-desc">' + esc(ev.description).replace(/\n/g, '<br>') + '</p>' : '') +
      (tickets ? '<ul class="event-tickets">' + tickets + '</ul>' : '') +
      '<a class="btn btn-navy btn-sm" href="contact.html?sujet=' + encodeURIComponent(ev.title) + '">' + cta + '</a></article>';
  }

  var q = URL_ + '/rest/v1/events?select=id,title,kind,category,short_description,description,cover_url,start_at,end_at,location_type,venue_name,city,event_ticket_types(name,is_free,price_cents,position)' +
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
    })
    .catch(function () { /* l'état vide reste affiché */ });
})();
