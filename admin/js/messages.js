/* Messages reçus via le formulaire de contact du site. */
(function (w) {
  const { esc, fmtDate, badge, toast, ICONS } = w.UI;
  const V = w.VIEWS;
  let rows = [];

  V.messages = {
    title: 'Messages',
    toolbar: (state) => `<div class="toolbar"><div class="tabs">
      ${[['open', 'À traiter'], ['all', 'Tous']].map(([id, l]) =>
        `<button class="tab${(state.tab || 'open') === id ? ' active' : ''}" data-tab="${id}">${l}</button>`).join('')}</div></div>`,
    skeleton: () => w.UI.skeleton(4),
    async load(state) {
      const res = await w.API.messages(state.tab || 'open');
      if (res.notConfigured) return w.UI.empty({ title: 'Supabase n’est pas encore connecté', text: 'Renseignez les clés dans admin/js/config.js.' });
      rows = res.data;
      if (!rows.length) return w.UI.empty({ title: 'Aucun message', text: 'Les messages du formulaire de contact du site apparaîtront ici.' });
      return rows.map(m => `<div class="card" style="margin-bottom:12px${m.handled ? ';opacity:.6' : ''}">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <strong>${esc([m.first_name, m.last_name].filter(Boolean).join(' ') || 'Anonyme')}</strong>
          <a href="mailto:${esc(m.email)}" style="color:var(--navy)">${esc(m.email)}</a>
          <span class="cell-sub">${esc(fmtDate(m.created_at, true))}</span>
          <span style="margin-left:auto">${m.handled ? badge('completed').replace('Terminé', 'Traité') : badge('pending')}</span>
        </div>
        ${m.subject ? `<div class="cell-main" style="margin-top:8px">${esc(m.subject)}</div>` : ''}
        <p style="margin:8px 0 12px;white-space:pre-wrap">${esc(m.message)}</p>
        <div style="display:flex;gap:8px">
          <a class="btn btn-ghost btn-sm" href="mailto:${esc(m.email)}?subject=${encodeURIComponent('Re: ' + (m.subject || 'Votre message'))}">Répondre</a>
          <button class="btn btn-ghost btn-sm" data-action="toggle-msg" data-id="${esc(m.id)}">${m.handled ? 'Rouvrir' : 'Marquer comme traité'}</button>
        </div></div>`).join('');
    },
    async onAction(action, el, state, { reload }) {
      if (action !== 'toggle-msg') return false;
      const m = rows.find(x => x.id === el.dataset.id);
      try { await w.API.setMessageHandled(m.id, !m.handled); reload(); }
      catch (err) { toast('Action refusée', err.message, 'err'); }
      return true;
    }
  };
})(window);
