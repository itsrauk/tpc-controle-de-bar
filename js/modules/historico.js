import { getState } from '../store.js';
import { getSales, getSangrias, voidSale } from '../db.js';
import { fmt, fmtDate, fmtTime, calcExpectedCash, showToast } from '../utils.js';
import { LS_KEYS } from '../config.js';

export function renderHistorico() {
  const el = document.getElementById('panel-historico');
  if (!el) return;

  const session = getState('session');
  const sales = getSales();
  const sangrias = getSangrias();
  const history = JSON.parse(localStorage.getItem(LS_KEYS.HISTORY) || '[]');

  el.innerHTML = `
    <div class="panel-header">
      <h2>Histórico do Turno</h2>
      ${session ? `<button class="btn btn--primary btn--sm" id="btn-exportar">📄 Exportar</button>` : ''}
    </div>

    ${session ? renderTurnoAtual(session, sales, sangrias) : '<div class="empty-state muted">Nenhum turno aberto</div>'}
    ${history.length ? renderHistoricoAnterior(history) : ''}`;

  bindHistorico(sales, sangrias, session);
}

function renderTurnoAtual(session, sales, sangrias) {
  const validSales = sales.filter(s => !s.is_voided);
  const totalVendas = validSales.reduce((s, v) => s + v.total_amount, 0);
  const totalSangrias = sangrias.reduce((s, sg) => s + sg.amount, 0);
  const vales = validSales.filter(s => s.employee_name);

  const byMethod = {};
  for (const sale of validSales) {
    if (sale.payment_method === 'multiplo') {
      (sale.splits || []).forEach(sp => { byMethod[sp.method] = (byMethod[sp.method] || 0) + sp.amount; });
    } else {
      byMethod[sale.payment_method] = (byMethod[sale.payment_method] || 0) + sale.total_amount;
    }
  }

  const lastValid = [...validSales].reverse()[0];

  return `
    <div class="card">
      <h3>Resumo do Turno Atual</h3>
      <div class="balance-row"><span>Fundo Inicial</span><span>${fmt(session.opening_amount)}</span></div>
      ${Object.entries(byMethod).map(([m,v]) =>
        `<div class="balance-row"><span>${labelMetodo(m)}</span><span class="green">${fmt(v)}</span></div>`
      ).join('')}
      <div class="balance-row"><span>Sangrias</span><span class="red">− ${fmt(totalSangrias)}</span></div>
      <div class="balance-row balance-row--total"><span>Total Faturado</span><span class="green">${fmt(totalVendas)}</span></div>
      <div class="balance-row"><span>Nº de Vendas</span><span>${validSales.length}</span></div>
      <div class="balance-row"><span>Vales Emitidos</span><span>${vales.length}</span></div>
    </div>

    ${lastValid ? `
    <div class="card">
      <div class="section-header">
        <h3>Última Venda</h3>
        <button class="btn btn--danger btn--sm" id="btn-estornar">↩ Estornar</button>
      </div>
      ${renderSaleCard(lastValid)}
    </div>` : ''}

    ${validSales.length ? `
    <div class="card">
      <h3>Todas as Vendas do Turno</h3>
      ${[...sales].reverse().map(s => renderSaleCard(s)).join('')}
    </div>` : ''}

    ${vales.length ? `
    <div class="card">
      <h3>Vales Emitidos</h3>
      ${vales.map(v => `
        <div class="vale-item">
          <span>👤 ${v.employee_name}</span>
          <span class="muted">${fmtTime(v.created_at)}</span>
          <span>${v.items?.map(i => `${i.product_name}×${i.quantity}`).join(', ') || ''}</span>
        </div>`).join('')}
    </div>` : ''}

    ${sangrias.length ? `
    <div class="card">
      <h3>Sangrias</h3>
      ${sangrias.map(sg => `
        <div class="sangria-item">
          <span>${sg.justification}</span>
          <span class="muted">${fmtTime(sg.created_at)}</span>
          <span class="red">${fmt(sg.amount)}</span>
        </div>`).join('')}
    </div>` : ''}`;
}

function renderSaleCard(sale) {
  const methodLabel = sale.payment_method === 'multiplo'
    ? (sale.splits || []).map(sp => `${labelMetodo(sp.method)} ${fmt(sp.amount)}`).join(' + ')
    : labelMetodo(sale.payment_method);

  return `
    <div class="sale-card${sale.is_voided ? ' sale-card--voided' : ''}">
      <div class="sale-card-header">
        <span class="sale-time">${fmtTime(sale.created_at)}</span>
        <span class="sale-method">${methodLabel}</span>
        <span class="sale-total">${fmt(sale.total_amount)}</span>
        ${sale.is_voided ? '<span class="badge badge--danger">Estornado</span>' : ''}
      </div>
      ${sale.employee_name ? `<div class="muted">Vale: ${sale.employee_name}</div>` : ''}
      ${sale.items ? `<div class="sale-items">${sale.items.map(i => `${i.product_name} ×${i.quantity}`).join(', ')}</div>` : ''}
    </div>`;
}

function renderHistoricoAnterior(history) {
  return `
    <div class="card">
      <h3>Turnos Anteriores (${history.length})</h3>
      ${history.slice().reverse().map(entry => {
        const s = entry.session;
        const total = (entry.sales || []).filter(v => !v.is_voided).reduce((acc, v) => acc + v.total_amount, 0);
        return `
          <div class="history-entry" data-session-id="${s.id}">
            <div class="history-header">
              <span>${fmtDate(s.opened_at)} → ${fmtDate(s.closed_at)}</span>
              <span class="green">${fmt(total)}</span>
            </div>
            <div class="muted">${(entry.sales||[]).filter(v=>!v.is_voided).length} vendas</div>
          </div>`;
      }).join('')}
    </div>`;
}

function labelMetodo(m) {
  return { dinheiro:'Dinheiro', pix:'Pix', debito:'Débito', credito:'Crédito', vale:'Vale' }[m] || m;
}

function bindHistorico(sales, sangrias, session) {
  document.getElementById('btn-exportar')?.addEventListener('click', () => exportarRelatorio(session, sales, sangrias));

  document.getElementById('btn-estornar')?.addEventListener('click', async () => {
    const valid = sales.filter(s => !s.is_voided);
    const last = [...valid].reverse()[0];
    if (!last) return showToast('Nenhuma venda para estornar', 'error');
    if (!confirm(`Estornar a venda de ${fmt(last.total_amount)}?`)) return;
    await voidSale(last.id);
    showToast('Venda estornada', 'success');
    renderHistorico();
  });
}

function exportarRelatorio(session, sales, sangrias) {
  if (!session) return;
  const validSales = sales.filter(s => !s.is_voided);
  const totalVendas = validSales.reduce((s, v) => s + v.total_amount, 0);
  const totalSangrias = sangrias.reduce((s, sg) => s + sg.amount, 0);

  const byMethod = {};
  for (const sale of validSales) {
    if (sale.payment_method === 'multiplo') {
      (sale.splits || []).forEach(sp => { byMethod[sp.method] = (byMethod[sp.method] || 0) + sp.amount; });
    } else {
      byMethod[sale.payment_method] = (byMethod[sale.payment_method] || 0) + sale.total_amount;
    }
  }

  const itemQtd = {};
  for (const sale of validSales) {
    for (const item of (sale.items || [])) {
      itemQtd[item.product_name] = (itemQtd[item.product_name] || 0) + item.quantity;
    }
  }

  const vales = validSales.filter(s => s.employee_name);

  const lines = [
    '═══════════════════════════════════',
    '      RELATÓRIO DE FECHAMENTO TPC  ',
    '═══════════════════════════════════',
    `Abertura: ${new Date(session.opened_at).toLocaleString('pt-BR')}`,
    `Fechamento: ${new Date().toLocaleString('pt-BR')}`,
    '',
    '── BALANÇO FINANCEIRO ──',
    `Fundo Inicial:      ${fmt(session.opening_amount)}`,
    ...Object.entries(byMethod).map(([m,v]) => `${labelMetodo(m).padEnd(20)} ${fmt(v)}`),
    `Sangrias:           − ${fmt(totalSangrias)}`,
    `Total Faturado:     ${fmt(totalVendas)}`,
    `Nº Vendas:          ${validSales.length}`,
    '',
    '── VALES EMITIDOS ──',
    ...vales.map(v => `${v.employee_name}: ${(v.items||[]).map(i=>`${i.product_name}×${i.quantity}`).join(', ')}`),
    '',
    '── SANGRIAS ──',
    ...sangrias.map(sg => `${fmt(sg.amount)} - ${sg.justification}`),
    '',
    '── PRODUTOS VENDIDOS ──',
    ...Object.entries(itemQtd).sort((a,b)=>b[1]-a[1]).map(([name, qty]) => `${name.padEnd(28)} ×${qty}`),
    '═══════════════════════════════════'
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `relatorio_tpc_${new Date().toISOString().slice(0,10)}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Relatório exportado!', 'success');
}
