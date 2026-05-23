import { getState, setState } from '../store.js';
import { updateReservation, getReservations } from '../db.js';
import { fmt, fmtDate, showToast, sanitize } from '../utils.js';

export function renderReservas() {
  const el = document.getElementById('panel-reservas');
  if (!el) return;

  const reservations = getReservations()
    .filter(r => r.status === 'active')
    .sort((a, b) => a.pickup_time.localeCompare(b.pickup_time));

  el.innerHTML = `
    <div class="panel-header">
      <h2>Reservas Ativas <span class="badge">${reservations.length}</span></h2>
    </div>
    ${!reservations.length
      ? '<div class="empty-state">Nenhuma reserva ativa no momento</div>'
      : reservations.map(r => renderReservaCard(r)).join('')}`;

  bindReservas();
}

function renderReservaCard(r) {
  const items = (r.items_snapshot || []).map(i =>
    `<span class="item-tag">${sanitize(i.name)} ×${i.qty}</span>`
  ).join('');

  const payBadge = r.payment_timing === 'reserva'
    ? '<span class="badge badge--green">Pago</span>'
    : '<span class="badge badge--warning">Pagar na retirada</span>';

  return `
    <div class="reserva-card" data-id="${r.id}">
      <div class="reserva-card-header">
        <div class="reserva-info">
          <div class="reserva-cliente">${sanitize(r.customer_name)}</div>
          <div class="reserva-horario">🕐 ${sanitize(r.pickup_time)}</div>
        </div>
        <div class="reserva-meta">
          ${payBadge}
          <div class="reserva-total">${fmt(r.total_amount)}</div>
        </div>
      </div>
      <div class="reserva-items">${items || '<span class="muted">Sem itens</span>'}</div>
      <div class="reserva-created muted">Criada em ${fmtDate(r.created_at)}</div>
      <div class="reserva-actions">
        <button class="btn btn--success" data-reserva-action="deliver" data-id="${r.id}">✅ Entregue</button>
        <button class="btn btn--danger-outline" data-reserva-action="cancel" data-id="${r.id}">✕ Cancelar</button>
      </div>
    </div>`;
}

function bindReservas() {
  document.getElementById('panel-reservas')?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-reserva-action]');
    if (!btn) return;

    const id = btn.dataset.id;
    const action = btn.dataset.reservaAction;

    if (action === 'deliver') {
      await updateReservation(id, { status: 'delivered' });
      showToast('Reserva marcada como entregue!', 'success');
    } else if (action === 'cancel') {
      if (!confirm('Cancelar a reserva? Isso não estorna o estoque automaticamente.')) return;
      await updateReservation(id, { status: 'cancelled' });
      showToast('Reserva cancelada', 'info');
    }

    renderReservas();
  });
}
