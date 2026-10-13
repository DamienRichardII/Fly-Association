/* ═══════════════════════════════════════════════════════════
   Participants d'un événement : liste, ajout manuel, statut,
   paiement, pointage le jour J, export CSV.
   Route : #/events/participants/:id
   ═══════════════════════════════════════════════════════════ */
(function (w) {
  const { esc, toast, fmtMoney, fmtDate, empty, skeleton, ICONS } = w.UI;
  const V = w.VIEWS;

  const STATUS = [['registered', 'Inscrit'], ['confirmed', 'Confirmé'], ['attended', 'Présent'],
    ['no_show', 'Absent'], ['cancelled', 'Annulé']];
  const METHODS = [['', '—'], ['especes', 'Espèces'], ['virement', 'Virement'], ['helloasso', 'HelloAsso'], ['autre', 'Autre']];

  let ctx = { event: null, tickets: [], rows: [], filter: 'all', q: '' };

  const nameOf = (r) => [r.contacts?.first_name, r.contacts?.last_name].filter(Boolean).join(' ') || '—';
  const opts = (list, cur) => list.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('');

  function visible() {
    const q = ctx.q.toLowerCase();
    return ctx.rows.filter(r => {
      if (ctx.filter === 'unpaid' && (r.paid || r.status === 'cancelled')) return false;
      if (ctx.filter !== 'all' && ctx.filter !== 'unpaid' && r.ticket_type_id !== ctx.filter) return false;
      if (!q) return true;
      return [nameOf(r), r.contacts?.email, r.contacts?.phone].join(' ').toLowerCase().includes(q);
    });
  }

  function stats() {
    const active = ctx.rows.filter(r => r.status !== 'cancelled');
    const paid = active.filter(r => r.paid);
    const cash = paid.reduce((n, r) => n + (r.event_ticket_types?.price_cents || 0), 0);
    const present = active.filter(r => r.status === 'attended').length;
    const byType = ctx.tickets.map(t => {
      const n = active.filter(r => r.ticket_type_id === t.id).length;
      return `<div class="card"><div class="kpi-label">${esc(t.name)}</div>
        <div class="kpi-value">${n}</div>${t.quantity_total ? `<div class="kpi-hint">sur ${t.quantity_total} places</div>` : ''}</div>`;
    }).join('');
    return `<div class="cards">
      <div class="card"><div class="kpi-label">Inscrits</div><div class="kpi-value">${active.length}</div>
        <div class="kpi-hint">${present} présent${present > 1 ? 's' : ''}</div></div>
      ${byType}
      <div class="card"><div class="kpi-label">Participations payées</div><div class="kpi-value">${paid.length}</div>
        <div class="kpi-hint">${esc(fmtMoney(cash))} encaissés · ${active.length - paid.length} à régler</div></div>
    </div>`;
  }

  function tableHtml() {
    const rows = visible();
    if (!rows.length) return empty({ title: 'Aucun participant', text: ctx.rows.length ? 'Aucun résultat pour ce filtre.' : 'Les inscriptions du site et celles ajoutées à la main apparaîtront ici.' });
    return `<div class="table-wrap"><div class="table-scroll"><table>
      <thead><tr><th>Participant</th><th>Catégorie</th><th>Statut</th><th>Payé</th><th>Moyen</th><th>Notes</th><th>Inscrit le</th></tr></thead>
      <tbody>${rows.map(r => `<tr data-id="${esc(r.id)}"${r.status === 'cancelled' ? ' style="opacity:.5"' : ''}>
        <td><div class="cell-main">${esc(nameOf(r))}</div>
          <div class="cell-sub">${esc(r.contacts?.email || '')}${r.contacts?.phone ? ' · ' + esc(r.contacts.phone) : ''}</div></td>
        <td>${esc(r.event_ticket_types?.name?.replace('Participation — ', '') || '—')}</td>
        <td><select class="filter" data-att="status">${opts(STATUS, r.status)}</select></td>
        <td><input type="checkbox" data-att="paid" ${r.paid ? 'checked' : ''} aria-label="Payé"></td>
        <td><select class="filter" data-att="payment_method" ${r.paid ? '' : 'disabled'}>${opts(METHODS, r.payment_method || '')}</select></td>
        <td><input type="text" data-att="notes" value="${esc(r.notes || '')}" placeholder="Note" style="min-width:140px"></td>
        <td class="cell-sub">${esc(fmtDate(r.registered_at, true))}${r.source === 'admin' ? ' · ajouté par l’équipe' : ''}</td>
      </tr>`).join('')}</tbody></table></div>
      <div class="table-foot"><span>${rows.length} participant${rows.length > 1 ? 's' : ''}</span></div></div>`;
  }

  function csv() {
    const esc2 = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Prénom', 'Nom', 'Email', 'Téléphone', 'Catégorie', 'Statut', 'Payé', 'Moyen', 'Notes', 'Inscrit le']];
    ctx.rows.forEach(r => lines.push([r.contacts?.first_name, r.contacts?.last_name, r.contacts?.email, r.contacts?.phone,
      r.event_ticket_types?.name, (STATUS.find(s => s[0] === r.status) || [])[1], r.paid ? 'oui' : 'non',
      r.payment_method, r.notes, r.registered_at]));
    const blob = new Blob(['﻿' + lines.map(l => l.map(esc2).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `participants-${ctx.event.slug}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function addModal(reload) {
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = `<form class="modal" style="max-width:480px">
      <div class="modal-head"><h3>Ajouter un participant</h3></div>
      <div class="modal-body">
        <div class="form-error" hidden></div>
        <div class="field"><label>Catégorie</label><select name="ticket_type_id" required>
          ${ctx.tickets.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></div>
        <div class="field-row">
          <div class="field"><label>Prénom *</label><input name="first_name" required></div>
          <div class="field"><label>Nom *</label><input name="last_name" required></div>
        </div>
        <div class="field"><label>Email *</label><input name="email" type="email" required></div>
        <div class="field"><label>Téléphone</label><input name="phone" type="tel"></div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" data-no>Annuler</button>
        <button type="submit" class="btn btn-navy">Ajouter</button>
      </div></form>`;
    back.addEventListener('click', (e) => { if (e.target === back || e.target.hasAttribute('data-no')) back.remove(); });
    back.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      try { await w.API.addAttendee(ctx.event.id, f); back.remove(); toast('Participant ajouté', '', ''); reload(); }
      catch (err) { const b = back.querySelector('.form-error'); b.hidden = false; b.textContent = err.message; }
    });
    document.body.appendChild(back);
  }

  V['events/participants'] = {
    title: 'Participants',
    skeleton: () => skeleton(6),
    toolbar: () => '',
    async load(state) {
      const id = state.params.id;
      const [ev, tk, at] = await Promise.all([w.API.event(id), w.API.eventTickets(id), w.API.eventAttendees(id)]);
      if (!ev) return empty({ title: 'Événement introuvable', text: 'Il a peut-être été supprimé.' });
      ctx = { event: ev, tickets: tk.data, rows: at.data, filter: 'all', q: '' };
      const filters = [['all', 'Tous'], ...ctx.tickets.map(t => [t.id, t.name.replace('Participation — ', '')]), ['unpaid', 'À régler']];
      return `<div class="toolbar">
          <a class="btn btn-ghost btn-sm" href="#/events">${ICONS.back} Événements</a>
          <h2 style="font-size:1.25rem;margin:0 8px">${esc(ev.title)} <span class="cell-sub">${esc(fmtDate(ev.start_at, true))}</span></h2>
          <div style="margin-left:auto"></div>
          <a class="btn btn-ghost btn-sm" href="#/events/edit/${esc(id)}">Modifier l’événement</a>
          <button class="btn btn-ghost btn-sm" data-action="export-attendees">Exporter (CSV)</button>
          ${ctx.tickets.length || ev.kind === 'rsvp' ? `<button class="btn btn-navy btn-sm" data-action="add-attendee">${ICONS.plus} Ajouter</button>` : ''}
        </div>
        <div id="attStats">${stats()}</div>
        <div class="toolbar">
          <div class="search">${ICONS.search}<input type="search" id="attSearch" placeholder="Nom, email, téléphone…"></div>
          <div class="tabs">${filters.map(([v, l]) => `<button class="tab${v === 'all' ? ' active' : ''}" data-att-filter="${esc(v)}">${esc(l)}</button>`).join('')}</div>
        </div>
        <div id="attTable">${tableHtml()}</div>`;
    },
    afterRender(state, content) {
      const redraw = () => { content.querySelector('#attTable').innerHTML = tableHtml(); content.querySelector('#attStats').innerHTML = stats(); };
      content.querySelector('#attSearch')?.addEventListener('input', (e) => { ctx.q = e.target.value.trim(); redraw(); });
      content.querySelectorAll('[data-att-filter]').forEach(b => b.addEventListener('click', () => {
        ctx.filter = b.dataset.attFilter;
        content.querySelectorAll('[data-att-filter]').forEach(x => x.classList.toggle('active', x === b));
        redraw();
      }));
      content.querySelector('#attTable').addEventListener('change', async (e) => {
        const tr = e.target.closest('tr[data-id]'); if (!tr || !e.target.dataset.att) return;
        const r = ctx.rows.find(x => x.id === tr.dataset.id);
        const prev = { ...r };
        r[e.target.dataset.att] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        if (r.paid && !r.payment_method) r.payment_method = 'especes';
        try { await w.API.updateAttendee(r.id, r); redraw(); }
        catch (err) { Object.assign(r, prev); redraw(); toast('Modification refusée', err.message, 'err'); }
      });
    },
    onAction(action, el, state, { reload }) {
      if (action === 'export-attendees') { csv(); return true; }
      if (action === 'add-attendee') { addModal(reload); return true; }
      return false;
    }
  };
})(window);
