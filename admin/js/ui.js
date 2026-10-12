/* Helpers d'interface partagés par toutes les rubriques. */
(function (w) {
  const cfg = w.FLY_CONFIG || {};

  const ICONS = {
    search:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.7" y2="16.7"/></svg>',
    plus:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    alert:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    box:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.3 7 12 12 20.7 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>',
    ticket:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 9V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v3a3 3 0 0 0 0 6v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a3 3 0 0 0 0-6z"/></svg>',
    mail:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,6 12,13 2,6"/></svg>',
    phone:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 3a2 2 0 0 1-.4 2.1L8 10.3a16 16 0 0 0 6 6l1.5-1.5a2 2 0 0 1 2-.4c1 .3 2 .5 3 .7a2 2 0 0 1 1.7 2z"/></svg>',
    pin:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    back:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    trash:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    merge:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v4a2 2 0 0 1-2 2H2M22 3v4a2 2 0 0 0 2-2M2 3h4a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1"/><circle cx="18" cy="18" r="3"/></svg>',
    tagIco:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13 21l-9-9V3h9z"/><line x1="7.5" y1="7.5" x2="7.5" y2="7.51"/></svg>',
    close:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
  };

  const fmtMoney = (cents) =>
    new Intl.NumberFormat(cfg.LOCALE || 'fr-FR', { style:'currency', currency: cfg.CURRENCY || 'EUR' })
      .format((cents || 0) / 100);

  const fmtDate = (iso, withTime) => {
    if (!iso) return '—';
    const o = { day:'2-digit', month:'short', year:'numeric' };
    if (withTime) { o.hour = '2-digit'; o.minute = '2-digit'; }
    return new Date(iso).toLocaleString(cfg.LOCALE || 'fr-FR', o);
  };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  // Correspondance statut → pastille colorée
  const BADGES = {
    published:['badge-ok','Publié'],        draft:['badge-off','Brouillon'],
    past:['badge-info','Passé'],            cancelled:['badge-bad','Annulé'],
    completed:['badge-ok','Terminé'],       pending:['badge-wait','En attente'],
    confirmed:['badge-ok','Confirmée'],     paid:['badge-ok','Payé'],
    failed:['badge-bad','Échoué'],          refunded:['badge-info','Remboursé'],
    partial:['badge-wait','Partiel'],       active:['badge-ok','Actif'],
    expired:['badge-off','Expiré'],         valid:['badge-ok','Valide'],
    used:['badge-info','Utilisé']
  };
  const badge = (status) => {
    const [cls, label] = BADGES[status] || ['badge-off', status || '—'];
    return `<span class="badge ${cls}">${esc(label)}</span>`;
  };

  const skeleton = (rows = 5) =>
    `<div class="table-wrap">${Array.from({length:rows}).map(() =>
      `<div class="skel-row">
         <div class="skeleton" style="width:70%"></div>
         <div class="skeleton" style="width:50%"></div>
         <div class="skeleton" style="width:40%"></div>
         <div class="skeleton" style="width:60%"></div>
       </div>`).join('')}</div>`;

  const empty = ({ title, text, action }) =>
    `<div class="table-wrap"><div class="empty">
       <div class="empty-ico">${ICONS.box}</div>
       <h3>${esc(title)}</h3>
       <p>${esc(text)}</p>
       ${action ? `<button class="btn btn-navy" data-action="${esc(action.id)}">${ICONS.plus}${esc(action.label)}</button>` : ''}
     </div></div>`;

  const table = ({ head, rows, foot }) =>
    `<div class="table-wrap"><div class="table-scroll"><table>
       <thead><tr>${head.map(h => `<th${h.num ? ' class="num"' : ''}>${esc(h.label || h)}</th>`).join('')}</tr></thead>
       <tbody>${rows.join('')}</tbody>
     </table></div>${foot ? `<div class="table-foot">${foot}</div>` : ''}</div>`;

  let toastHost;
  const toast = (title, text, kind = '') => {
    if (!toastHost) {
      toastHost = document.createElement('div');
      toastHost.className = 'toasts';
      document.body.appendChild(toastHost);
    }
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = `<strong>${esc(title)}</strong>${text ? `<span>${esc(text)}</span>` : ''}`;
    toastHost.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  };

  // Confirmation obligatoire avant toute suppression
  const confirmDialog = ({ title, text, confirmLabel = 'Supprimer' }) =>
    new Promise((resolve) => {
      const back = document.createElement('div');
      back.className = 'modal-backdrop';
      back.innerHTML =
        `<div class="modal" role="dialog" aria-modal="true">
           <div class="modal-head"><h3>${esc(title)}</h3></div>
           <div class="modal-body"><p>${esc(text)}</p></div>
           <div class="modal-foot">
             <button class="btn btn-ghost" data-no>Annuler</button>
             <button class="btn btn-danger" data-yes>${esc(confirmLabel)}</button>
           </div>
         </div>`;
      const close = (v) => { back.remove(); resolve(v); };
      back.addEventListener('click', (e) => {
        if (e.target === back || e.target.hasAttribute('data-no')) close(false);
        if (e.target.hasAttribute('data-yes')) close(true);
      });
      document.body.appendChild(back);
    });

  w.UI = { ICONS, fmtMoney, fmtDate, esc, badge, skeleton, empty, table, toast, confirmDialog };
})(window);
