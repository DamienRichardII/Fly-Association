/* ═══════════════════════════════════════════════════════════
   Shell du back-office : garde d'authentification, navigation
   par ancre (#/rubrique) et rendu des vues.
   ═══════════════════════════════════════════════════════════ */
(function (w, d) {
  const { toast, confirmDialog } = w.UI;

  const ROUTES = [
    { group: 'Pilotage' },
    { id:'dashboard',     label:'Tableau de bord',    icon:'grid' },
    { group: 'Activité' },
    { id:'events',        label:'Événements',         icon:'calendar' },
    { id:'players',       label:'Joueurs inscrits',   icon:'users' },
    { id:'bookings',      label:'Réservations',       icon:'clock' },
    { group: 'Commerce' },
    { id:'sales',         label:'Ventes',             icon:'chart' },
    { id:'orders',        label:'Commandes',          icon:'cart' },
    { id:'payments',      label:'Paiements',          icon:'card' },
    { id:'subscriptions', label:'Abonnements',        icon:'repeat' },
    { id:'catalog',       label:'Catalogue',          icon:'box' },
    { group: 'Contenus' },
    { id:'videos',        label:'Vidéos',             icon:'play' },
    { id:'groups',        label:'Groupes',            icon:'users' },
    { id:'gallery',       label:'Galerie',            icon:'image' },
    { id:'cms',           label:'CMS',                icon:'file' },
    { group: 'Relation' },
    { id:'contacts',      label:'Clients & prospects', icon:'user' },
    { id:'messages',      label:'Messages',           icon:'mail' }
  ];

  const I = {
    grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    clock:'<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
    chart:'<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    cart:'<circle cx="9" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 7H6"/>',
    card:'<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
    repeat:'<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    box:'<path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.3 7 12 12 20.7 7"/>',
    play:'<circle cx="12" cy="12" r="9"/><polygon points="10 8 16 12 10 16" fill="currentColor" stroke="none"/>',
    users:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    mail:'<rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,6 12,13 2,6"/>',
    user:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'
  };
  const icon = (k) => `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${I[k] || I.grid}</svg>`;

  const state = { route:'dashboard', params:{}, tab:null, q:'' };
  let els = {};

  function buildSidebar() {
    return ROUTES.map(r => r.group
      ? `<div class="nav-group">${r.group}</div>`
      : `<a class="nav-link" href="#/${r.id}" data-route="${r.id}">${icon(r.icon)}<span>${r.label}</span></a>`
    ).join('');
  }

  function markActive() {
    d.querySelectorAll('.nav-link').forEach(a =>
      a.classList.toggle('active', a.dataset.route === state.route.split('/')[0]));
  }

  function parseHash() {
    const raw = (location.hash || '#/dashboard').replace(/^#\/?/, '');
    return raw || 'dashboard';
  }

  // 'contacts/<uuid>' → vue de détail avec l'id en paramètre.
  // 'contacts/new' reste une clé littérale (vue de création dédiée).
  function resolveRoute(raw) {
    const parts = raw.split('/');
    if (parts[0] === 'contacts' && parts[1] && parts[1] !== 'new') {
      return { key: 'contacts/detail', params: { id: parts[1] } };
    }
    if (parts[0] === 'events' && parts[1] === 'edit' && parts[2]) {
      return { key: 'events/edit', params: { id: parts[2] } };
    }
    if (parts[0] === 'events' && parts[1] === 'participants' && parts[2]) {
      return { key: 'events/participants', params: { id: parts[2] } };
    }
    return { key: raw, params: {} };
  }

  async function render() {
    const { key, params } = resolveRoute(state.route);
    state.params = params;
    const view = w.VIEWS[key] || w.VIEWS.dashboard;
    els.title.textContent = typeof view.title === 'function' ? view.title(state) : view.title;
    d.title = els.title.textContent + ' · Back-office Le Fly';
    markActive();

    els.content.innerHTML = (view.toolbar ? view.toolbar(state) : '') +
      `<div id="viewBody">${view.skeleton ? view.skeleton(state) : ''}</div>`;

    try {
      const html = await view.load(state);
      const body = d.getElementById('viewBody');
      if (body) body.innerHTML = html;
      if (view.afterRender) view.afterRender(state, els.content);
    } catch (err) {
      const body = d.getElementById('viewBody');
      if (body) body.innerHTML =
        `<div class="table-wrap"><div class="empty">
           <h3>Impossible de charger les données</h3>
           <p>${w.UI.esc(err.message || 'Erreur inconnue')}</p>
         </div></div>`;
      toast('Erreur de chargement', err.message || '', 'err');
    }
  }

  function onHashChange() {
    const next = parseHash();
    if (next !== state.route) { state.tab = null; state.q = ''; }
    state.route = next;
    render();
    els.sidebar.classList.remove('open');
    const scrim = d.querySelector('.scrim');
    if (scrim) scrim.remove();
  }

  function currentView() {
    return w.VIEWS[resolveRoute(state.route).key] || w.VIEWS.dashboard;
  }

  /* Délégation d'événements : filtres, recherche, actions, formulaires.
     Chaque vue peut définir onAction()/onSubmit() pour son propre
     comportement — app.js reste générique, les vues restent autonomes. */
  function wireContent() {
    let searchTimer;

    els.content.addEventListener('click', async (e) => {
      // Ligne de tableau cliquable (liste → fiche détail)
      const navRow = e.target.closest('[data-nav]');
      if (navRow && !e.target.closest('button, a, input')) {
        location.hash = navRow.dataset.nav;
        return;
      }

      const tab = e.target.closest('[data-tab]');
      if (tab) { state.tab = tab.dataset.tab; render(); return; }

      const act = e.target.closest('[data-action]');
      if (act) {
        const view = currentView();
        if (view.onAction) {
          const handled = await view.onAction(act.dataset.action, act, state, { reload: render });
          if (handled) return;
        }
        const id = act.dataset.action;
        if (id === 'create-event')   { location.hash = '#/events/new'; return; }
        if (id === 'create-contact') { location.hash = '#/contacts/new'; return; }
        if (id.startsWith('wizard-')) {
          toast('Assistant de création', 'Les étapes du formulaire arrivent en phase C.', '');
          return;
        }
        toast('Bientôt disponible', 'Cette action est prévue dans une phase ultérieure.', '');
      }
    });

    els.content.addEventListener('submit', async (e) => {
      const view = currentView();
      if (!view.onSubmit) return;
      e.preventDefault();
      await view.onSubmit(e.target, state, { reload: render });
    });

    els.content.addEventListener('input', (e) => {
      if (!e.target.matches('[data-search]')) return;
      state.q = e.target.value.trim();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const view = currentView();
        const body = d.getElementById('viewBody');
        if (!view || !body) return;
        body.innerHTML = view.skeleton ? view.skeleton(state) : '';
        view.load(state).then(h => { body.innerHTML = h; if (view.afterRender) view.afterRender(state, els.content); });
      }, 280);
    });

    els.content.addEventListener('change', (e) => {
      if (!e.target.matches('[data-filter]')) return;
      state[e.target.dataset.filter] = e.target.value;
      render();
    });
  }

  async function start() {
    els = {
      sidebar: d.getElementById('sidebar'),
      nav:     d.getElementById('sidebarNav'),
      title:   d.getElementById('viewTitle'),
      content: d.getElementById('content'),
      who:     d.getElementById('whoami')
    };
    els.nav.innerHTML = buildSidebar();

    // Garde d'authentification : le dashboard n'apparaît qu'après connexion.
    if (w.API.configured) {
      const profile = await w.API.profile();
      const isStaff = profile && ['admin', 'staff'].includes(profile.role);
      // MODE APERÇU (temporaire) : FLY_CONFIG.PREVIEW = true laisse voir l'interface sans
      // connexion. Aucune donnée privée n'est exposée : la base reste protégée (RLS) et
      // toute écriture est refusée côté serveur. À retirer une fois les admins validés.
      if (w.FLY_CONFIG.PREVIEW && !isStaff) {
        els.who.innerHTML = '<strong>Mode aperçu</strong>Lecture seule';
        const bar = d.createElement('div');
        bar.style.cssText = 'background:#FFF4D6;color:#6B4A00;padding:9px 16px;font-size:.85rem;text-align:center;border-bottom:1px solid #F0DDA5';
        bar.textContent = 'Mode aperçu — l’interface est visible sans connexion, mais rien ne peut être enregistré. Connectez-vous pour créer de vrais événements.';
        d.body.prepend(bar);
      } else if (!profile) { location.replace('login.html'); return; }
      else if (!isStaff) {
        d.body.innerHTML = `<div class="login-page"><div class="login-card">
            <h1>Accès refusé</h1>
            <p class="sub">Ce compte n’a pas les droits d’administration.</p>
            <button class="btn btn-ghost" onclick="window.API.signOut().then(()=>location.replace('login.html'))">Se déconnecter</button>
          </div></div>`;
        return;
      }
      if (isStaff) els.who.innerHTML = `<strong>${w.UI.esc(profile.full_name || profile.email)}</strong>${profile.role}`;
    } else {
      els.who.innerHTML = '<strong>Mode démo</strong>Supabase non connecté';
    }

    d.getElementById('signout').addEventListener('click', async () => {
      if (!(await confirmDialog({ title:'Se déconnecter ?', text:'Vous reviendrez à l’écran de connexion.', confirmLabel:'Se déconnecter' }))) return;
      await w.API.signOut();
      location.replace('login.html');
    });

    d.getElementById('burger').addEventListener('click', () => {
      els.sidebar.classList.add('open');
      const scrim = d.createElement('div');
      scrim.className = 'scrim';
      scrim.addEventListener('click', () => { els.sidebar.classList.remove('open'); scrim.remove(); });
      d.body.appendChild(scrim);
    });

    wireContent();
    w.addEventListener('hashchange', onHashChange);
    state.route = parseHash();
    render();
  }

  d.addEventListener('DOMContentLoaded', start);
})(window, document);
