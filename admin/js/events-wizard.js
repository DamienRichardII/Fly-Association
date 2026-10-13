/* ═══════════════════════════════════════════════════════════
   Assistant de création / édition d'un événement (phase C).
   5 étapes : Type → Infos & lieu → Billets → Visuel & texte →
   Publication. Tout est écrit en base par admin_save_event().
   Les événements publiés apparaissent sur le site public.
   ═══════════════════════════════════════════════════════════ */
(function (w) {
  const { esc, toast, ICONS, fmtMoney, fmtDate } = w.UI;
  const V = w.VIEWS;

  const CATEGORIES = ['Tournoi football', 'Compétition basket', 'Battle danse',
    'Détection', 'Camp / Stage', 'Rencontre / Soirée', 'Autre'];
  const STEPS = ['Type', 'Infos & lieu', 'Inscriptions', 'Visuel & texte', 'Publication'];

  /* ── utilitaires ── */
  const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'evenement';
  const pad = (n) => String(n).padStart(2, '0');
  const toLocalInput = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const toISO = (local) => (local ? new Date(local).toISOString() : null);
  const toCents = (v) => Math.round(parseFloat(String(v || '0').replace(',', '.')) * 100) || 0;
  const num = (v) => (v === '' || v == null ? null : parseInt(v, 10));

  const blankTicket = () => ({ id: null, name: '', is_free: false, price: '', quantity_total: '',
    max_per_order: 10, sales_start_at: '', sales_end_at: '' });

  const blank = () => ({
    id: null, slug: null, kind: null, status: 'draft', title: '', category: '',
    organizer: 'Le Fly Association', short_description: '', description: '', cover_url: '',
    start_at: '', end_at: '', location_type: 'onsite', venue_name: '', address_line: '',
    city: '', postal_code: '', access_info: '', online_url: '', capacity: '',
    tickets: [], removed: []
  });

  /* ── composants HTML ── */
  const field = (label, name, val, { type = 'text', ph = '', hint = '', req = false } = {}) =>
    `<div class="field"><label>${esc(label)}${req ? ' *' : ''}</label>
       <input type="${type}" data-f="${name}" value="${esc(val ?? '')}" placeholder="${esc(ph)}">
       ${hint ? `<div class="wz-hint">${esc(hint)}</div>` : ''}</div>`;

  const area = (label, name, val, { rows = 3, ph = '', hint = '' } = {}) =>
    `<div class="field"><label>${esc(label)}</label>
       <textarea data-f="${name}" rows="${rows}" placeholder="${esc(ph)}">${esc(val ?? '')}</textarea>
       ${hint ? `<div class="wz-hint">${esc(hint)}</div>` : ''}</div>`;

  function stepper(step, maxStep) {
    return `<ol class="wz-steps">${STEPS.map((l, i) => {
      const n = i + 1;
      const cls = n === step ? 'current' : n < step ? 'done' : '';
      const can = n <= maxStep && n !== step;
      return `<li class="${cls}"><button type="button" ${can ? `data-wz="goto" data-step="${n}"` : 'disabled'}>
        <span class="wz-num">${n < step ? '✓' : n}</span><span class="wz-lbl">${esc(l)}</span></button></li>`;
    }).join('')}</ol>`;
  }

  /* ── les 5 étapes ── */
  function stepType(s) {
    const opt = (k, ico, t, p) => `<button type="button" class="choice${s.kind === k ? ' selected' : ''}" data-wz="kind" data-kind="${k}">
        <div class="empty-ico">${ico}</div><h3>${t}</h3><p>${p}</p></button>`;
    return `<h2 class="wz-h">Quel type d'événement ?</h2>
      <p class="wz-sub">Ce choix détermine l'étape « Inscriptions ». Vous pourrez le modifier tant que l'événement n'a pas d'inscrits.</p>
      <div class="choice-grid">
        ${opt('ticketed', ICONS.ticket, 'Billetterie', 'Billets gratuits ou payants, par catégorie, avec quotas et dates de vente. Idéal pour tournois, compétitions, soirées.')}
        ${opt('rsvp', ICONS.box, 'Inscription simple', 'Les gens s’inscrivent sans acheter. Liste des inscrits, jauge de places. Idéal pour détections, stages, entraînements ouverts.')}
      </div>`;
  }

  function stepInfos(s) {
    const onsite = s.location_type === 'onsite';
    return `<h2 class="wz-h">Informations & lieu</h2>
      ${field('Titre de l’événement', 'title', s.title, { req: true, ph: 'Ex. Tournoi Fly Future Champions' })}
      <div class="field-row">
        <div class="field"><label>Catégorie</label>
          <select data-f="category"><option value="">— Choisir —</option>
            ${CATEGORIES.map(c => `<option${s.category === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        ${field('Organisateur', 'organizer', s.organizer)}
      </div>
      <div class="field-row">
        ${field('Début', 'start_at', s.start_at, { type: 'datetime-local', req: true })}
        ${field('Fin', 'end_at', s.end_at, { type: 'datetime-local', hint: 'Facultatif' })}
      </div>
      <div class="field"><label>Lieu</label>
        <div class="wz-seg">
          <button type="button" class="${onsite ? 'on' : ''}" data-wz="loc" data-loc="onsite">Sur place</button>
          <button type="button" class="${!onsite ? 'on' : ''}" data-wz="loc" data-loc="online">En ligne</button>
        </div></div>
      ${onsite ? `
        ${field('Nom du lieu', 'venue_name', s.venue_name, { ph: 'Ex. Gymnase Jean Jaurès' })}
        ${field('Adresse', 'address_line', s.address_line)}
        <div class="field-row">
          ${field('Code postal', 'postal_code', s.postal_code)}
          ${field('Ville', 'city', s.city)}
        </div>
        ${area('Infos d’accès', 'access_info', s.access_info, { rows: 2, ph: 'Parking, transports, consignes…' })}`
      : field('Lien de l’événement', 'online_url', s.online_url, { type: 'url', req: true, ph: 'https://…' })}`;
  }

  function stepTickets(s) {
    if (s.kind === 'rsvp') {
      return `<h2 class="wz-h">Inscriptions</h2>
        <p class="wz-sub">Inscription simple, sans paiement.</p>
        ${field('Nombre de places', 'capacity', s.capacity, { type: 'number', hint: 'Laissez vide pour ne pas limiter.' })}`;
    }
    const rows = s.tickets.map((t, i) => `
      <div class="wz-ticket">
        <div class="wz-ticket-head"><strong>Catégorie ${i + 1}</strong>
          <button type="button" class="btn btn-ghost btn-sm" data-wz="rm-ticket" data-i="${i}">${ICONS.trash} Retirer</button></div>
        <div class="field-row">
          <div class="field"><label>Nom *</label><input data-t="${i}" data-f="name" value="${esc(t.name)}" placeholder="Ex. Entrée, Joueur, Pass journée"></div>
          <div class="field"><label>Prix (€)</label><input data-t="${i}" data-f="price" inputmode="decimal" value="${esc(t.price)}" placeholder="0" ${t.is_free ? 'disabled' : ''}></div>
        </div>
        <label class="wz-check"><input type="checkbox" data-t="${i}" data-f="is_free" ${t.is_free ? 'checked' : ''}> Billet gratuit</label>
        <div class="field-row">
          <div class="field"><label>Quantité disponible</label><input data-t="${i}" data-f="quantity_total" type="number" min="1" value="${esc(t.quantity_total)}" placeholder="Illimité"></div>
          <div class="field"><label>Maximum par commande</label><input data-t="${i}" data-f="max_per_order" type="number" min="1" value="${esc(t.max_per_order)}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Début des ventes</label><input data-t="${i}" data-f="sales_start_at" type="datetime-local" value="${esc(t.sales_start_at)}"></div>
          <div class="field"><label>Fin des ventes</label><input data-t="${i}" data-f="sales_end_at" type="datetime-local" value="${esc(t.sales_end_at)}"></div>
        </div>
      </div>`).join('');
    return `<h2 class="wz-h">Billetterie</h2>
      <p class="wz-sub">Créez une ou plusieurs catégories de billets.</p>
      <div class="wz-note">Le paiement en ligne sera branché quand le prestataire aura été choisi. En attendant, les billets payants s’affichent sur le site avec un bouton de contact pour réserver.</div>
      ${rows || '<div class="empty" style="padding:24px"><p>Aucune catégorie pour le moment.</p></div>'}
      <button type="button" class="btn btn-ghost" data-wz="add-ticket">${ICONS.plus} Ajouter une catégorie</button>
      <div style="margin-top:22px">${field('Capacité totale de l’événement', 'capacity', s.capacity, { type: 'number', hint: 'Facultatif — indicatif.' })}</div>`;
  }

  function stepContent(s) {
    return `<h2 class="wz-h">Visuel & texte</h2>
      <div class="field"><label>Image de couverture</label>
        <div class="wz-cover ${s.cover_url ? 'has' : ''}">
          ${s.cover_url ? `<img src="${esc(s.cover_url)}" alt="">` : '<span>Aucune image</span>'}
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
          <label class="btn btn-ghost btn-sm" style="cursor:pointer">Importer une image
            <input type="file" accept="image/jpeg,image/png,image/webp" data-wz="upload" hidden></label>
          ${s.cover_url ? '<button type="button" class="btn btn-ghost btn-sm" data-wz="rm-cover">Retirer</button>' : ''}
        </div>
        <div class="wz-hint" id="upStatus">Format paysage conseillé (16/9). L’image est allégée automatiquement.</div>
      </div>
      ${field('Résumé', 'short_description', s.short_description, { ph: 'Une phrase affichée dans la liste des événements' })}
      ${area('Description complète', 'description', s.description, { rows: 7, ph: 'Programme, public concerné, règlement, ce qu’il faut apporter…' })}`;
  }

  function stepPublish(s) {
    const tk = s.kind === 'ticketed' ? s.tickets.map(t =>
      `<li>${esc(t.name || '—')} — ${t.is_free ? 'Gratuit' : esc(fmtMoney(toCents(t.price)))}${t.quantity_total ? ` · ${esc(t.quantity_total)} places` : ''}</li>`).join('') : '';
    const where = s.location_type === 'online' ? 'En ligne' :
      [s.venue_name, s.city].filter(Boolean).join(', ') || '—';
    const st = (v, t, d) => `<label class="wz-radio"><input type="radio" name="status" value="${v}" data-wz="status" ${s.status === v ? 'checked' : ''}>
        <span><strong>${t}</strong><small>${d}</small></span></label>`;
    return `<h2 class="wz-h">Récapitulatif & publication</h2>
      <div class="card wz-recap">
        ${s.cover_url ? `<img src="${esc(s.cover_url)}" alt="">` : ''}
        <div>
          <h3>${esc(s.title)}</h3>
          <p class="wz-sub" style="margin:4px 0 10px">${esc(s.category || 'Événement')} · ${s.kind === 'ticketed' ? 'Billetterie' : 'Inscription simple'}</p>
          <ul class="wz-list">
            <li>${esc(fmtDate(toISO(s.start_at), true))}${s.end_at ? ' → ' + esc(fmtDate(toISO(s.end_at), true)) : ''}</li>
            <li>${esc(where)}</li>
            ${s.capacity ? `<li>${esc(s.capacity)} places</li>` : ''}
            ${tk}
          </ul>
        </div>
      </div>
      <div class="wz-status">
        ${st('draft', 'Brouillon', 'Enregistré, invisible sur le site.')}
        ${st('published', 'Publié', 'Visible tout de suite sur la page Évènements du site.')}
        ${s.id ? st('cancelled', 'Annulé', 'Reste en base avec son historique, retiré du site.') : ''}
      </div>`;
  }

  const RENDER = [null, stepType, stepInfos, stepTickets, stepContent, stepPublish];

  /* ── validation ── */
  function validate(s, step) {
    const err = [];
    if (step >= 1 && !s.kind) err.push('Choisissez un type d’événement.');
    if (step === 2) {
      if (!s.title.trim()) err.push('Le titre est obligatoire.');
      if (!s.start_at) err.push('La date de début est obligatoire.');
      if (s.start_at && s.end_at && s.end_at < s.start_at) err.push('La fin doit être après le début.');
      if (s.location_type === 'online' && !s.online_url.trim()) err.push('Indiquez le lien de l’événement en ligne.');
      if (s.location_type === 'onsite' && !s.city.trim() && !s.venue_name.trim()) err.push('Indiquez le lieu ou la ville.');
    }
    if (step === 3) {
      if (s.capacity !== '' && !(parseInt(s.capacity, 10) > 0)) err.push('La capacité doit être supérieure à 0.');
      if (s.kind === 'ticketed') {
        if (!s.tickets.length) err.push('Ajoutez au moins une catégorie de billets.');
        s.tickets.forEach((t, i) => {
          if (!t.name.trim()) err.push(`Catégorie ${i + 1} : le nom est obligatoire.`);
          if (!t.is_free && !(toCents(t.price) > 0)) err.push(`Catégorie ${i + 1} : indiquez un prix, ou cochez « gratuit ».`);
          if (t.quantity_total !== '' && !(parseInt(t.quantity_total, 10) > 0)) err.push(`Catégorie ${i + 1} : quantité invalide.`);
          if (t.sales_start_at && t.sales_end_at && t.sales_end_at < t.sales_start_at) err.push(`Catégorie ${i + 1} : la fin des ventes précède le début.`);
        });
      }
    }
    return err;
  }
  const validateUpTo = (s, step) => { for (let i = 1; i <= step; i++) { const e = validate(s, i); if (e.length) return { step: i, err: e }; } return null; };

  /* ── envoi ── */
  function payload(s) {
    return {
      event: {
        kind: s.kind, status: s.status, title: s.title.trim(), slug: s.slug || slugify(s.title),
        category: s.category, organizer: s.organizer, short_description: s.short_description,
        description: s.description, cover_url: s.cover_url,
        start_at: toISO(s.start_at), end_at: toISO(s.end_at),
        location_type: s.location_type,
        venue_name: s.location_type === 'onsite' ? s.venue_name : '', address_line: s.location_type === 'onsite' ? s.address_line : '',
        city: s.location_type === 'onsite' ? s.city : '', postal_code: s.location_type === 'onsite' ? s.postal_code : '',
        access_info: s.location_type === 'onsite' ? s.access_info : '',
        online_url: s.location_type === 'online' ? s.online_url : '',
        capacity: s.capacity === '' ? '' : String(parseInt(s.capacity, 10))
      },
      tickets: s.kind !== 'ticketed' ? [] : s.tickets.map(t => ({
        id: t.id || '', name: t.name.trim(), is_free: !!t.is_free,
        price_cents: t.is_free ? 0 : toCents(t.price),
        quantity_total: t.quantity_total === '' ? '' : String(parseInt(t.quantity_total, 10)),
        max_per_order: String(parseInt(t.max_per_order, 10) || 10),
        sales_start_at: toISO(t.sales_start_at) || '', sales_end_at: toISO(t.sales_end_at) || ''
      }))
    };
  }

  /* ── redimensionne l'image avant envoi (≤ 1600 px, JPEG) ── */
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(b => b ? resolve(b) : reject(new Error('Image illisible')), 'image/jpeg', 0.84);
      };
      img.onerror = () => reject(new Error('Image illisible'));
      img.src = URL.createObjectURL(file);
    });
  }

  /* ── composant ── */
  async function mount(root, id) {
    let s = blank(), step = 1, maxStep = 1, busy = false;

    if (id) {
      root.innerHTML = '<div class="empty"><p>Chargement…</p></div>';
      try {
        const [ev, tk] = await Promise.all([w.API.event(id), w.API.eventTickets(id)]);
        if (!ev) { root.innerHTML = '<div class="table-wrap"><div class="empty"><h3>Événement introuvable</h3><p><a href="#/events" style="color:var(--navy);text-decoration:underline">Retour aux événements</a></p></div></div>'; return; }
        s = Object.assign(blank(), {
          id: ev.id, slug: ev.slug, kind: ev.kind, status: ev.status === 'completed' ? 'published' : ev.status,
          title: ev.title || '', category: ev.category || '', organizer: ev.organizer || '',
          short_description: ev.short_description || '', description: ev.description || '',
          cover_url: ev.cover_url || '', start_at: toLocalInput(ev.start_at), end_at: toLocalInput(ev.end_at),
          location_type: ev.location_type || 'onsite', venue_name: ev.venue_name || '', address_line: ev.address_line || '',
          city: ev.city || '', postal_code: ev.postal_code || '', access_info: ev.access_info || '',
          online_url: ev.online_url || '', capacity: ev.capacity ?? ''
        });
        s.tickets = (tk.data || []).map(t => ({
          id: t.id, name: t.name, is_free: t.is_free, price: t.is_free ? '' : String((t.price_cents / 100).toString().replace('.', ',')),
          quantity_total: t.quantity_total ?? '', max_per_order: t.max_per_order,
          sales_start_at: toLocalInput(t.sales_start_at), sales_end_at: toLocalInput(t.sales_end_at)
        }));
        step = 2; maxStep = 5;
      } catch (e) {
        root.innerHTML = `<div class="table-wrap"><div class="empty"><h3>Chargement impossible</h3><p>${esc(e.message)}</p></div></div>`;
        return;
      }
    }

    function draw(msgs) {
      root.innerHTML = `
        ${stepper(step, maxStep)}
        <div class="card wz-card">
          ${msgs && msgs.length ? `<div class="form-error">${msgs.map(esc).join('<br>')}</div>` : ''}
          ${RENDER[step](s)}
        </div>
        <div class="wz-nav">
          ${s.id ? `<a class="btn btn-ghost" href="#/events/participants/${esc(s.id)}">Voir les participants</a>` : ''}
          ${step > 1 ? '<button type="button" class="btn btn-ghost" data-wz="prev">Retour</button>' : '<a class="btn btn-ghost" href="#/events">Annuler</a>'}
          <div style="flex:1"></div>
          ${step < 5
            ? `<button type="button" class="btn btn-navy" data-wz="next"${step === 1 && !s.kind ? ' disabled' : ''}>Continuer</button>`
            : `<button type="button" class="btn btn-navy" data-wz="save"${busy ? ' disabled' : ''}>${busy ? 'Enregistrement…' : s.status === 'published' ? 'Publier' : s.status === 'cancelled' ? 'Annuler l’événement' : 'Enregistrer le brouillon'}</button>`}
        </div>`;
      window.scrollTo({ top: 0 });
    }

    function go(n, msgs) { step = n; maxStep = Math.max(maxStep, n); draw(msgs); }

    // saisie : on met l'état à jour sans redessiner (le focus reste en place)
    root.addEventListener('input', (e) => {
      const el = e.target, f = el.dataset.f;
      if (!f) return;
      if (el.dataset.t !== undefined) {
        const t = s.tickets[+el.dataset.t];
        t[f] = el.type === 'checkbox' ? el.checked : el.value;
        if (f === 'is_free') draw();
      } else s[f] = el.value;
    });
    root.addEventListener('change', (e) => {
      const el = e.target, f = el.dataset.f;
      if (f && el.dataset.t !== undefined && el.type === 'checkbox') {
        s.tickets[+el.dataset.t][f] = el.checked; draw();
      }
      if (el.dataset.wz === 'status') { s.status = el.value; draw(); }
      if (el.dataset.wz === 'upload' && el.files[0]) upload(el.files[0]);
    });

    async function upload(file) {
      const st = root.querySelector('#upStatus');
      if (st) st.textContent = 'Envoi de l’image…';
      try {
        const blob = await shrink(file);
        s.cover_url = await w.API.uploadMedia(blob);
        draw(); toast('Image importée', '', '');
      } catch (err) {
        if (st) st.textContent = 'Échec de l’envoi : ' + err.message;
        toast('Image non importée', err.message, 'err');
      }
    }

    async function save() {
      const bad = validateUpTo(s, 3);
      if (bad) { go(bad.step, bad.err); return; }
      busy = true; draw();
      try {
        const p = payload(s);
        const newId = await w.API.saveEvent(s.id, p.event, p.tickets);
        let note = '';
        if (s.removed.length) {
          try { await w.API.deleteTicketTypes(s.removed); }
          catch (e) { note = ' Une catégorie déjà vendue n’a pas pu être retirée.'; }
        }
        toast(s.status === 'published' ? 'Événement publié' : 'Événement enregistré',
          (s.status === 'published' ? 'Il est visible sur le site.' : '') + note, '');
        location.hash = '#/events';
      } catch (err) {
        busy = false; draw([err.message || 'Enregistrement impossible']);
      }
    }

    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-wz]');
      if (!b || b.tagName === 'INPUT') return;
      const a = b.dataset.wz;
      if (a === 'kind') { s.kind = b.dataset.kind; if (s.kind === 'ticketed' && !s.tickets.length) s.tickets.push(blankTicket()); draw(); }
      else if (a === 'loc') { s.location_type = b.dataset.loc; draw(); }
      else if (a === 'goto') go(+b.dataset.step);
      else if (a === 'prev') go(step - 1);
      else if (a === 'next') { const er = validate(s, step); er.length ? draw(er) : go(step + 1); }
      else if (a === 'add-ticket') { s.tickets.push(blankTicket()); draw(); }
      else if (a === 'rm-ticket') { const t = s.tickets.splice(+b.dataset.i, 1)[0]; if (t.id) s.removed.push(t.id); draw(); }
      else if (a === 'rm-cover') { s.cover_url = ''; draw(); }
      else if (a === 'save') save();
    });

    draw();
  }

  /* ── vues ── */
  V['events/new'] = {
    title: 'Créer un événement',
    toolbar: () => '', skeleton: () => '',
    load: async () => '<div id="wiz"></div>',
    afterRender: (state, content) => mount(content.querySelector('#wiz'), null)
  };
  V['events/edit'] = {
    title: 'Modifier l’événement',
    toolbar: () => '', skeleton: () => '',
    load: async () => '<div id="wiz"></div>',
    afterRender: (state, content) => mount(content.querySelector('#wiz'), state.params.id)
  };
})(window);
