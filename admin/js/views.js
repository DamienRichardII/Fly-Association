/* ═══════════════════════════════════════════════════════════
   Les 13 rubriques du back-office.
   Phase A : structure, filtres, colonnes, états vides et
   squelettes de chargement. Les formulaires de création et
   d'édition arrivent aux phases suivantes.
   ═══════════════════════════════════════════════════════════ */
(function (w) {
  const { fmtMoney, fmtDate, esc, badge, skeleton, empty, table, ICONS } = w.UI;

  /* Fabrique commune : toolbar + tableau + état vide.
     Évite de répéter treize fois la même mécanique. */
  function listView({ key, title, tabs, search, filterSelect, head, row, fetch, emptyText, action, afterRender }) {
    return {
      title,
      toolbar(state) {
        const parts = [];
        if (search) parts.push(
          `<div class="search">${ICONS.search}
             <input type="search" placeholder="${esc(search)}" data-search value="${esc(state.q || '')}">
           </div>`);
        if (tabs) parts.push(
          `<div class="tabs">${tabs.map(t =>
            `<button class="tab${(state.tab || tabs[0].id) === t.id ? ' active' : ''}" data-tab="${t.id}">${esc(t.label)}</button>`
          ).join('')}</div>`);
        if (filterSelect) parts.push(
          `<select class="filter" data-filter="${filterSelect.key}" id="filter-${filterSelect.key}">
             <option value="all">${esc(filterSelect.allLabel || 'Tous')}</option>
           </select>`);
        parts.push('<div style="margin-left:auto"></div>');
        if (action) parts.push(`<button class="btn btn-navy" data-action="${action.id}">${ICONS.plus}${esc(action.label)}</button>`);
        return `<div class="toolbar">${parts.join('')}</div>`;
      },
      skeleton: () => skeleton(6),
      async load(state) {
        const res = await fetch(state);
        if (res.notConfigured) return empty({
          title: 'Supabase n’est pas encore connecté',
          text: 'Renseignez l’URL et la clé anon dans admin/js/config.js pour voir vos données ici.'
        });
        if (!res.data.length) return empty({ title: 'Rien pour le moment', text: emptyText, action });
        return table({
          head,
          rows: res.data.map(row),
          foot: `<span>${res.count} élément${res.count > 1 ? 's' : ''}</span>`
        });
      },
      async afterRender(state, content) {
        if (filterSelect) {
          const sel = content.querySelector(`#filter-${filterSelect.key}`);
          if (sel) {
            const opts = await filterSelect.options();
            sel.innerHTML = `<option value="all">${esc(filterSelect.allLabel || 'Tous')}</option>` +
              opts.map(o => `<option value="${esc(o.value)}"${state[filterSelect.key] === o.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
          }
        }
        if (afterRender) afterRender(state, content);
      }
    };
  }

  const nameCell = (main, sub) =>
    `<div class="cell-main">${esc(main || '—')}</div>${sub ? `<div class="cell-sub">${esc(sub)}</div>` : ''}`;

  const V = {};

  /* ── 1. Tableau de bord ─────────────────────────────────── */
  V.dashboard = {
    title: 'Tableau de bord',
    toolbar: () => '',
    skeleton: () => `<div class="cards">${'<div class="card"><div class="skeleton" style="width:60%"></div><div class="skeleton" style="height:28px;margin-top:10px;width:40%"></div></div>'.repeat(4)}</div>` + skeleton(4),
    async load() {
      const s = await w.API.dashboard();
      if (!s) return `<div class="banner">${ICONS.alert}
          <div><strong>Supabase n’est pas encore connecté</strong>
          <p>Ouvrez <code>admin/js/config.js</code> et renseignez <code>SUPABASE_URL</code> et <code>SUPABASE_ANON_KEY</code>. Les migrations se trouvent dans <code>supabase/migrations/</code>.</p></div>
        </div>` + empty({ title: 'Aucune donnée à afficher', text: 'Les indicateurs apparaîtront dès la connexion à la base.' });

      const kpi = (label, value, hint) =>
        `<div class="card"><div class="kpi-label">${esc(label)}</div>
           <div class="kpi-value">${esc(value)}</div>
           ${hint ? `<div class="kpi-hint">${esc(hint)}</div>` : ''}</div>`;

      return `<div class="cards">
          ${kpi('Événements à venir', s.upcoming_events)}
          ${kpi('Billets vendus', s.tickets_sold)}
          ${kpi('Réservations à venir', s.upcoming_bookings)}
          ${kpi('Encaissé ce mois', fmtMoney(s.revenue_month_cents), fmtMoney(s.revenue_total_cents) + ' au total')}
        </div>
        <div class="cards">
          ${kpi('Contacts', s.contacts_total, '+' + s.contacts_last_30d + ' sur 30 jours')}
          ${kpi('Abonnements actifs', s.active_subscriptions)}
          ${kpi('Commandes en attente', s.pending_orders)}
          ${kpi('Messages non traités', s.unread_messages)}
        </div>`;
    }
  };

  /* ── 2. Événements ──────────────────────────────────────── */
  V.events = listView({
    key: 'events', title: 'Événements', search: 'Rechercher un événement…',
    tabs: [{ id:'all', label:'Tous' }, { id:'published', label:'Publiés' },
           { id:'draft', label:'Brouillons' }, { id:'past', label:'Passés' }],
    action: { id:'create-event', label:'Créer un événement' },
    head: ['Événement', 'Date', 'Statut', { label:'Inscrits', num:true },
           { label:'Billets', num:true }, { label:'CA', num:true }],
    fetch: (s) => w.API.events(s.tab === 'all' ? null : s.tab, s.q),
    emptyText: 'Créez votre premier événement : billetterie ou simple inscription.',
    row: (e) => `<tr data-nav="#/events/edit/${esc(e.id)}">
        <td><div style="display:flex;align-items:center;gap:11px">
          ${e.cover_url
            ? `<img src="${esc(e.cover_url)}" alt="" style="width:42px;height:42px;border-radius:8px;object-fit:cover;flex:none">`
            : `<div style="width:42px;height:42px;border-radius:8px;background:var(--ice);flex:none"></div>`}
          <div>${nameCell(e.title, [e.city, e.category].filter(Boolean).join(' · '))}</div>
        </div></td>
        <td>${esc(fmtDate(e.start_at, true))}</td>
        <td>${badge(e.effective_state)}</td>
        <td class="num">${e.attendees_count}</td>
        <td class="num">${e.tickets_sold}${e.tickets_available ? ` <span class="cell-sub">/ ${e.tickets_sold + e.tickets_available}</span>` : ''}</td>
        <td class="num">${esc(fmtMoney(e.revenue_cents))}</td>
      </tr>`
  });

  /* Premier écran de création — le wizard complet arrive en phase C */
  V['events/new'] = {
    title: 'Créer un événement',
    toolbar: () => '',
    skeleton: () => '',
    async load() {
      return `<h2 style="font-size:1.4rem;margin-bottom:6px">Que souhaitez-vous faire ?</h2>
        <p style="color:var(--muted);margin-bottom:22px">Ce choix détermine les étapes suivantes.</p>
        <div class="choice-grid">
          <button class="choice" data-action="wizard-ticketed">
            <div class="empty-ico">${ICONS.ticket}</div>
            <h3>Vendre des billets</h3>
            <p>Événement avec billetterie, gratuite ou payante. Catégories de billets, quotas et dates de vente.</p>
          </button>
          <button class="choice" data-action="wizard-rsvp">
            <div class="empty-ico">${ICONS.box}</div>
            <h3>Collecter des réponses</h3>
            <p>Inscription simple sans achat obligatoire. Liste des inscrits et réponses au formulaire.</p>
          </button>
        </div>`;
    }
  };

  /* ── 3. Réservations ────────────────────────────────────── */
  V.bookings = listView({
    key:'bookings', title:'Réservations', search:'Rechercher une réservation…',
    tabs:[{id:'all',label:'Toutes'},{id:'pending',label:'En attente'},
          {id:'confirmed',label:'Confirmées'},{id:'cancelled',label:'Annulées'}],
    action:{ id:'create-booking', label:'Nouvelle réservation' },
    head:['Client','Service','Créneau','Statut',{label:'Montant',num:true}],
    fetch:(s)=>w.API.bookings(s.tab==='all'?null:s.tab, s.q),
    emptyText:'Créez d’abord un service réservable dans le catalogue, puis les créneaux apparaîtront ici.',
    row:(b)=>`<tr>
        <td>${nameCell(b.customer_name, b.customer_email)}</td>
        <td>${esc(b.service_name)}<div class="cell-sub">${b.duration_minutes} min</div></td>
        <td>${esc(fmtDate(b.starts_at, true))}</td>
        <td>${badge(b.status)}</td>
        <td class="num">${esc(fmtMoney(b.price_cents))}</td>
      </tr>`
  });

  /* ── 4. Ventes (synthèse) ───────────────────────────────── */
  V.sales = {
    title: 'Ventes',
    toolbar: () => '',
    skeleton: () => skeleton(4),
    async load() {
      const s = await w.API.dashboard();
      if (!s) return empty({ title:'Supabase n’est pas encore connecté', text:'Renseignez vos clés dans admin/js/config.js.' });
      return `<div class="cards">
          <div class="card"><div class="kpi-label">Encaissé ce mois</div><div class="kpi-value">${esc(fmtMoney(s.revenue_month_cents))}</div></div>
          <div class="card"><div class="kpi-label">Encaissé au total</div><div class="kpi-value">${esc(fmtMoney(s.revenue_total_cents))}</div></div>
          <div class="card"><div class="kpi-label">Commandes en attente</div><div class="kpi-value">${s.pending_orders}</div></div>
          <div class="card"><div class="kpi-label">Abonnements actifs</div><div class="kpi-value">${s.active_subscriptions}</div></div>
        </div>
        <div class="toolbar">
          <a class="btn btn-ghost" href="#/orders">Commandes</a>
          <a class="btn btn-ghost" href="#/payments">Paiements</a>
          <a class="btn btn-ghost" href="#/subscriptions">Abonnements</a>
        </div>`;
    }
  };

  /* ── 5. Commandes ───────────────────────────────────────── */
  V.orders = listView({
    key:'orders', title:'Commandes', search:'N° de commande ou client…',
    tabs:[{id:'all',label:'Toutes'},{id:'pending',label:'En attente'},
          {id:'confirmed',label:'Confirmées'},{id:'cancelled',label:'Annulées'}],
    head:['N°','Client','Articles',{label:'Qté',num:true},{label:'Montant',num:true},'Commande','Paiement','Date'],
    fetch:(s)=>w.API.orders(s.tab==='all'?null:s.tab, s.q),
    emptyText:'Les commandes apparaîtront ici dès la première vente de billet, de produit ou de formule.',
    row:(o)=>`<tr>
        <td class="cell-main">${esc(o.order_number)}</td>
        <td>${nameCell(o.customer_name, o.customer_email)}</td>
        <td><div class="cell-sub">${esc(o.items_label || '—')}</div></td>
        <td class="num">${o.items_count}</td>
        <td class="num">${esc(fmtMoney(o.total_cents))}</td>
        <td>${badge(o.status)}</td>
        <td>${badge(o.payment_state)}</td>
        <td>${esc(fmtDate(o.created_at))}</td>
      </tr>`
  });

  /* ── 6. Paiements ───────────────────────────────────────── */
  V.payments = listView({
    key:'payments', title:'Paiements',
    tabs:[{id:'all',label:'Tous'},{id:'paid',label:'Payés'},{id:'pending',label:'En attente'},
          {id:'failed',label:'Échoués'},{id:'refunded',label:'Remboursés'}],
    head:['Prestataire','Référence',{label:'Montant',num:true},'Statut','Date'],
    fetch:(s)=>w.API.payments(s.tab==='all'?null:s.tab),
    emptyText:'Aucun prestataire de paiement n’est encore branché. Le schéma est prêt : statuts, webhooks et rattachement aux commandes.',
    row:(p)=>`<tr>
        <td class="cell-main">${esc(p.provider)}</td>
        <td><div class="cell-sub">${esc(p.provider_payment_id || '—')}</div></td>
        <td class="num">${esc(fmtMoney(p.amount_cents))}</td>
        <td>${badge(p.status)}</td>
        <td>${esc(fmtDate(p.created_at, true))}</td>
      </tr>`
  });

  /* ── 7. Abonnements ─────────────────────────────────────── */
  V.subscriptions = listView({
    key:'subscriptions', title:'Abonnements',
    tabs:[{id:'all',label:'Tous'},{id:'active',label:'Actifs'},
          {id:'expired',label:'Expirés'},{id:'cancelled',label:'Annulés'}],
    head:['Contact','Formule','Statut','Début','Renouvellement'],
    fetch:(s)=>w.API.subscriptions(s.tab==='all'?null:s.tab),
    emptyText:'Créez une formule dans le catalogue pour proposer des adhésions ou abonnements.',
    row:(s)=>`<tr>
        <td class="cell-main">${esc(s.contact_id || '—')}</td>
        <td>${esc(s.plan_id || '—')}</td>
        <td>${badge(s.status)}</td>
        <td>${esc(fmtDate(s.started_at))}</td>
        <td>${esc(fmtDate(s.renews_at))}</td>
      </tr>`
  });

  /* ── 8. Catalogue ───────────────────────────────────────── */
  const KINDS = { product:'Produit', booking_service:'Service de réservation', plan:'Formule' };
  V.catalog = listView({
    key:'catalog', title:'Catalogue',
    tabs:[{id:'all',label:'Tout'},{id:'product',label:'Produits'},
          {id:'booking_service',label:'Services'},{id:'plan',label:'Formules'}],
    action:{ id:'create-catalog', label:'Ajouter une offre' },
    head:['Offre','Type',{label:'Prix',num:true},'Statut'],
    fetch:(s)=>w.API.catalog(s.tab==='all'?null:s.tab),
    emptyText:'Produits, services réservables et formules se gèrent ici, chacun avec sa propre logique.',
    row:(c)=>`<tr>
        <td>${nameCell(c.name, c.duration_minutes ? c.duration_minutes + ' min' : null)}</td>
        <td>${esc(KINDS[c.kind] || c.kind)}</td>
        <td class="num">${esc(fmtMoney(c.price_cents))}</td>
        <td>${badge(c.is_active ? 'published' : 'draft')}</td>
      </tr>`
  });

  /* ── 9. Vidéos ──────────────────────────────────────────── */
  V.videos = listView({
    key:'videos', title:'Vidéos', search:'Rechercher une vidéo…',
    action:{ id:'create-video', label:'Ajouter une vidéo' },
    head:['Titre','Catégorie','Source','Statut',{label:'Ordre',num:true}],
    fetch:(s)=>w.API.videos(s.q),
    emptyText:'Ajoutez les vidéos de l’association : lien YouTube, Vimeo ou fichier hébergé.',
    row:(v)=>`<tr>
        <td>${nameCell(v.title, v.description)}</td>
        <td>${esc(v.category || '—')}</td>
        <td>${esc(v.source)}</td>
        <td>${badge(v.status)}</td>
        <td class="num">${v.position}</td>
      </tr>`
  });

  /* ── 10. Groupes ────────────────────────────────────────── */
  V.groups = listView({
    key:'groups', title:'Groupes',
    action:{ id:'create-group', label:'Créer un groupe' },
    head:['Groupe','Visibilité','Statut','Créé le'],
    fetch:()=>w.API.groups(),
    emptyText:'Créez des groupes pour animer la communauté Fly : équipes, bénévoles, coachs.',
    row:(g)=>`<tr>
        <td>${nameCell(g.name, g.description)}</td>
        <td>${esc(g.visibility)}</td>
        <td>${badge(g.status)}</td>
        <td>${esc(fmtDate(g.created_at))}</td>
      </tr>`
  });

  /* ── 11. Galerie ────────────────────────────────────────── */
  V.gallery = listView({
    key:'gallery', title:'Galerie',
    action:{ id:'create-gallery', label:'Créer un album' },
    head:['Album','Statut',{label:'Ordre',num:true},'Mis à jour'],
    fetch:()=>w.API.galleries(),
    emptyText:'Regroupez les photos par album : un tournoi, un stage, une saison.',
    row:(g)=>`<tr>
        <td>${nameCell(g.title, g.description)}</td>
        <td>${badge(g.status)}</td>
        <td class="num">${g.position}</td>
        <td>${esc(fmtDate(g.updated_at))}</td>
      </tr>`
  });

  /* ── 12. CMS ────────────────────────────────────────────── */
  V.cms = listView({
    key:'cms', title:'CMS',
    tabs:[{id:'all',label:'Tout'},{id:'actualites',label:'Actualités'},{id:'equipe',label:'Équipe'},
          {id:'partenaires',label:'Partenaires'},{id:'faq',label:'FAQ'},{id:'temoignages',label:'Témoignages'}],
    action:{ id:'create-cms', label:'Nouveau contenu' },
    head:['Titre','Collection','Statut','Publié le','Mis à jour'],
    fetch:(s)=>w.API.cmsEntries(s.tab==='all'?null:s.tab),
    emptyText:'Les contenus éditoriaux du site public se gèrent ici, sans toucher au code.',
    row:(e)=>`<tr>
        <td>${nameCell(e.title, e.excerpt)}</td>
        <td>${esc(e.collection)}</td>
        <td>${badge(e.status)}</td>
        <td>${esc(fmtDate(e.published_at))}</td>
        <td>${esc(fmtDate(e.updated_at))}</td>
      </tr>`
  });

  /* ── 13. Clients & prospects ────────────────────────────── */
  /* ── 13. Clients & prospects ────────────────────────────── */
  const KIND_LABEL = {
    booking:'Réservation', ticket:'Billet', event_registration:'Inscription événement',
    order:'Commande', payment:'Paiement', subscription:'Abonnement', group:'Groupe'
  };

  function contactFormHTML(c = {}, { submitLabel = 'Enregistrer les modifications' } = {}) {
    const field = (name, label, value, type = 'text') =>
      `<div class="field"><label>${esc(label)}</label>
         <input type="${type}" name="${name}" value="${esc(value || '')}"></div>`;
    return `<form class="card">
        <div class="kpi-label" style="margin-bottom:14px">Coordonnées</div>
        <div class="field-row">
          ${field('first_name', 'Prénom', c.first_name)}
          ${field('last_name', 'Nom', c.last_name)}
          ${field('email', 'Email', c.email, 'email')}
          ${field('phone', 'Téléphone', c.phone, 'tel')}
          ${field('address_line', 'Adresse', c.address_line)}
          ${field('postal_code', 'Code postal', c.postal_code)}
          ${field('city', 'Ville', c.city)}
          ${field('country', 'Pays', c.country || 'France')}
        </div>
        <div class="field"><label>Notes</label><textarea name="notes" rows="3">${esc(c.notes || '')}</textarea></div>
        <label style="display:flex;align-items:center;gap:8px;margin:2px 0 18px;font-size:.88rem;color:var(--muted)">
          <input type="checkbox" name="marketing_optin" ${c.marketing_optin ? 'checked' : ''}>
          Accepte de recevoir des communications de l'association
        </label>
        <button type="submit" class="btn btn-navy">${esc(submitLabel)}</button>
      </form>`;
  }

  V.contacts = listView({
    key:'contacts', title:'Clients & prospects', search:'Nom, prénom ou email…',
    filterSelect: {
      key: 'tag', allLabel: 'Tous les tags',
      options: async () => {
        const { data } = await w.API.allTags();
        return (data || []).map(t => ({ value: t.slug, label: t.label }));
      }
    },
    action:{ id:'create-contact', label:'Ajouter un contact' },
    head:['Contact','Tags',{label:'Commandes',num:true},{label:'Billets',num:true},
          {label:'Réservations',num:true},{label:'Total dépensé',num:true},'Dernière activité'],
    fetch:(s)=>w.API.contacts(s.q, s.tag),
    emptyText:'Chaque acheteur de billet, chaque réservation et chaque message crée automatiquement une fiche ici.',
    row:(c)=>`<tr data-nav="#/contacts/${esc(c.id)}">
        <td>${nameCell(c.full_name || c.email, c.email)}</td>
        <td>${(c.tags || []).map(t => `<span class="badge badge-info">${esc(t)}</span>`).join(' ') || '<span class="cell-sub">—</span>'}</td>
        <td class="num">${c.orders_count}</td>
        <td class="num">${c.tickets_count}</td>
        <td class="num">${c.bookings_count}</td>
        <td class="num">${esc(fmtMoney(c.lifetime_value_cents))}</td>
        <td>${esc(fmtDate(c.last_activity_at))}</td>
      </tr>`
  });

  /* ── Création d'un contact ──────────────────────────────── */
  V['contacts/new'] = {
    title: 'Nouveau contact',
    toolbar: () => `<div class="toolbar"><a class="btn btn-ghost btn-sm" href="#/contacts">${ICONS.back} Retour à la liste</a></div>`,
    skeleton: () => '',
    async load() {
      return `<div style="max-width:640px">${contactFormHTML({}, { submitLabel: 'Créer le contact' })}</div>`;
    },
    async onSubmit(form, state, ctx) {
      const fd = new FormData(form);
      const btn = form.querySelector('button[type=submit]');
      const payload = {
        id: null,
        first_name: (fd.get('first_name') || '').trim() || null,
        last_name: (fd.get('last_name') || '').trim() || null,
        email: (fd.get('email') || '').trim() || null,
        phone: (fd.get('phone') || '').trim() || null,
        address_line: (fd.get('address_line') || '').trim() || null,
        postal_code: (fd.get('postal_code') || '').trim() || null,
        city: (fd.get('city') || '').trim() || null,
        country: (fd.get('country') || '').trim() || 'France',
        notes: (fd.get('notes') || '').trim() || null,
        marketing_optin: fd.get('marketing_optin') === 'on'
      };
      if (btn) { btn.disabled = true; btn.textContent = 'Création…'; }
      try {
        const newId = await w.API.saveContact(payload);
        w.UI.toast('Contact créé', '', 'ok');
        location.hash = '#/contacts/' + newId;
      } catch (e) {
        w.UI.toast('Impossible de créer le contact', e.message, 'err');
        if (btn) { btn.disabled = false; btn.textContent = 'Créer le contact'; }
      }
    }
  };

  /* ── Fiche contact ───────────────────────────────────────── */
  V['contacts/detail'] = {
    title: 'Fiche contact',
    toolbar: () => `<div class="toolbar"><a class="btn btn-ghost btn-sm" href="#/contacts">${ICONS.back} Retour à la liste</a></div>`,
    skeleton: () => `<div class="cards">${'<div class="card"><div class="skeleton" style="width:50%"></div></div>'.repeat(4)}</div>` + skeleton(4),
    async load(state) {
      const id = state.params.id;
      const c = await w.API.contact(id);
      if (!c) return empty({
        title: 'Contact introuvable',
        text: 'Il a peut-être été supprimé ou fusionné avec une autre fiche.'
      });

      const [timelineRes, tagsRes, dupes] = await Promise.all([
        w.API.contactTimeline(id),
        w.API.allTags(),
        w.API.duplicatesOf(id).catch(() => [])
      ]);
      const timeline = timelineRes.data || [];
      const allTags  = tagsRes.data || [];
      const myTags   = c.tags || [];
      const fullName = c.full_name && c.full_name.trim() ? c.full_name.trim() : (c.email || 'Contact');

      const kpi = (label, value) =>
        `<div class="card"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(value)}</div></div>`;

      const infoLine = (icon, val) => val
        ? `<span style="display:inline-flex;align-items:center;gap:5px">${icon}${esc(val)}</span>` : '';

      const chip = (t) => {
        const active = myTags.includes(t.slug);
        return `<button type="button" class="btn btn-sm ${active ? 'btn-navy' : 'btn-ghost'}"
                   data-action="toggle-tag" data-tag="${esc(t.slug)}">
                   ${active ? ICONS.close : ICONS.tagIco} ${esc(t.label)}
                 </button>`;
      };

      const dupesHTML = dupes.length ? `<div class="banner" style="margin-bottom:16px">
          ${ICONS.merge}
          <div>
            <strong>Doublon${dupes.length > 1 ? 's' : ''} potentiel${dupes.length > 1 ? 's' : ''} détecté${dupes.length > 1 ? 's' : ''}</strong>
            <p>Ces fiches semblent correspondre à la même personne. La fusion rattache tout l'historique ici et ferme l'autre fiche.</p>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
              ${dupes.map(dd => `
                <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;background:#fff;border:1px solid var(--line);border-radius:8px;padding:10px 14px;flex-wrap:wrap">
                  <div>
                    <div class="cell-main">${esc(dd.full_name || dd.email || '—')}</div>
                    <div class="cell-sub">${[dd.email, dd.phone].filter(Boolean).map(esc).join(' · ')} — ${esc(dd.match_reason)}</div>
                  </div>
                  <button class="btn btn-ghost btn-sm" data-action="merge-dupe"
                    data-merge-id="${esc(dd.id)}" data-merge-name="${esc(dd.full_name || dd.email || '')}">
                    ${ICONS.merge} Fusionner ici
                  </button>
                </div>`).join('')}
            </div>
          </div>
        </div>` : '';

      const timelineHTML = timeline.length
        ? `<div class="table-wrap"><div class="table-scroll" style="max-height:440px;overflow-y:auto">
            <table><tbody>
              ${timeline.map(t => `<tr>
                <td><div class="cell-main">${esc(KIND_LABEL[t.kind] || t.kind)}</div><div class="cell-sub">${esc(t.label || '—')}</div></td>
                <td>${badge(t.status)}</td>
                <td class="num">${t.amount_cents != null ? esc(fmtMoney(t.amount_cents)) : ''}</td>
                <td>${esc(fmtDate(t.happened_at, true))}</td>
              </tr>`).join('')}
            </tbody></table>
          </div></div>`
        : empty({ title:'Aucun historique', text:'Les commandes, billets et réservations de ce contact apparaîtront ici.' });

      return `
        <div class="card" style="margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
            <div>
              <h2 style="font-size:1.5rem;margin-bottom:6px">${esc(fullName)}</h2>
              <div style="display:flex;gap:16px;flex-wrap:wrap;color:var(--muted);font-size:.88rem">
                ${infoLine(ICONS.mail, c.email)}
                ${infoLine(ICONS.phone, c.phone)}
                ${infoLine(ICONS.pin, [c.city, c.postal_code].filter(Boolean).join(' '))}
              </div>
            </div>
            <button class="btn btn-ghost btn-sm" data-action="delete-contact">${ICONS.trash} Supprimer</button>
          </div>
        </div>

        <div class="cards">
          ${kpi('Commandes', c.orders_count)}
          ${kpi('Billets', c.tickets_count)}
          ${kpi('Réservations', c.bookings_count)}
          ${kpi('Total dépensé', fmtMoney(c.lifetime_value_cents))}
        </div>

        <div class="card" style="margin:16px 0" data-tags="${esc(JSON.stringify(myTags))}">
          <div class="kpi-label" style="margin-bottom:10px">Tags</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${allTags.map(chip).join('') || '<span class="cell-sub">Aucun tag disponible</span>'}
          </div>
        </div>

        ${dupesHTML}

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px" class="contact-detail-grid">
          <div>${contactFormHTML(c)}</div>
          <div>
            <div class="kpi-label" style="margin-bottom:10px">Historique</div>
            ${timelineHTML}
          </div>
        </div>`;
    },

    async onAction(action, el, state, ctx) {
      const id = state.params.id;

      if (action === 'toggle-tag') {
        const container = el.closest('[data-tags]');
        const current = JSON.parse(container.dataset.tags || '[]');
        const tag = el.dataset.tag;
        const next = current.includes(tag) ? current.filter(t => t !== tag) : current.concat(tag);
        try {
          await w.API.setContactTags(id, next);
          w.UI.toast('Tags mis à jour', '', 'ok');
          ctx.reload();
        } catch (e) { w.UI.toast('Impossible de mettre à jour les tags', e.message, 'err'); }
        return true;
      }

      if (action === 'delete-contact') {
        const ok = await w.UI.confirmDialog({
          title: 'Supprimer ce contact ?',
          text: 'La fiche sera masquée de la liste. Ses commandes, billets et paiements restent conservés pour la comptabilité.',
          confirmLabel: 'Supprimer'
        });
        if (!ok) return true;
        try {
          await w.API.deleteContact(id);
          w.UI.toast('Contact supprimé', '', 'ok');
          location.hash = '#/contacts';
        } catch (e) { w.UI.toast('Suppression impossible', e.message, 'err'); }
        return true;
      }

      if (action === 'merge-dupe') {
        const mergeId = el.dataset.mergeId;
        const mergeName = el.dataset.mergeName || 'cette fiche';
        const ok = await w.UI.confirmDialog({
          title: 'Fusionner les deux fiches ?',
          text: `« ${mergeName} » sera fusionné dans cette fiche : tout son historique (commandes, billets, réservations) sera rattaché ici, et sa fiche sera définitivement fermée. Cette action est irréversible.`,
          confirmLabel: 'Fusionner'
        });
        if (!ok) return true;
        try {
          await w.API.mergeContacts(id, mergeId);
          w.UI.toast('Fusion effectuée', '', 'ok');
          ctx.reload();
        } catch (e) { w.UI.toast('Fusion impossible', e.message, 'err'); }
        return true;
      }

      return false;
    },

    async onSubmit(form, state, ctx) {
      const id = state.params.id;
      const fd = new FormData(form);
      const btn = form.querySelector('button[type=submit]');
      const payload = {
        id,
        first_name: (fd.get('first_name') || '').trim() || null,
        last_name: (fd.get('last_name') || '').trim() || null,
        email: (fd.get('email') || '').trim() || null,
        phone: (fd.get('phone') || '').trim() || null,
        address_line: (fd.get('address_line') || '').trim() || null,
        postal_code: (fd.get('postal_code') || '').trim() || null,
        city: (fd.get('city') || '').trim() || null,
        country: (fd.get('country') || '').trim() || 'France',
        notes: (fd.get('notes') || '').trim() || null,
        marketing_optin: fd.get('marketing_optin') === 'on'
      };
      if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }
      try {
        await w.API.saveContact(payload);
        w.UI.toast('Contact enregistré', '', 'ok');
        ctx.reload();
      } catch (e) {
        w.UI.toast('Enregistrement impossible', e.message, 'err');
        if (btn) { btn.disabled = false; btn.textContent = 'Enregistrer les modifications'; }
      }
    }
  };

  w.VIEWS = V;
})(window);
