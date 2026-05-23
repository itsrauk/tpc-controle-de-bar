import { getState, setState } from '../store.js';
import { getSales, getSangrias, voidSale } from '../db.js';
import { fmt, fmtDate, fmtTime, showToast, sanitize } from '../utils.js';
import { LS_KEYS } from '../config.js';

export function renderHistorico() {
  const el = document.getElementById('panel-historico');
  if (!el) return;

  const session  = getState('session');
  const sales    = getSales();
  const sangrias = getSangrias();
  const history  = JSON.parse(localStorage.getItem(LS_KEYS.HISTORY) || '[]');
  const fromDate = getState('histFromDate') || '';
  const toDate   = getState('histToDate')   || '';
  const filteredHistory = filterHistory(history, fromDate, toDate);

  el.innerHTML = `
    <div class="panel-header">
      <h2>Histórico do Turno</h2>
      <div style="display:flex;gap:.4rem">
        ${session ? `<button class="btn btn--ghost btn--sm" id="btn-exportar" title="Gerar PDF">📄 PDF</button>` : ''}
      </div>
    </div>

    ${session ? renderTurnoAtual(session, sales, sangrias) : '<div class="empty-state muted">Nenhum turno aberto</div>'}

    ${history.length ? `
    <div class="date-filter-bar">
      <span class="muted" style="white-space:nowrap;font-size:.78rem">Turnos anteriores:</span>
      <input type="date" id="hist-from" value="${fromDate}" title="De">
      <span class="muted">—</span>
      <input type="date" id="hist-to" value="${toDate}" title="Até">
      ${fromDate || toDate ? `<button class="btn btn--ghost btn--sm" id="btn-clear-filter" title="Limpar">✕</button>` : ''}
    </div>` : ''}

    ${filteredHistory.length
      ? renderHistoricoAnterior(filteredHistory)
      : history.length
        ? '<div class="empty-state muted" style="padding:1.5rem 1rem">Nenhum turno no período selecionado</div>'
        : ''}`;

  bindHistorico(sales, sangrias, session);
}

// ── Turno atual ───────────────────────────────────────────────
function renderTurnoAtual(session, sales, sangrias) {
  const validSales    = sales.filter(s => !s.is_voided);
  const normalSales   = validSales.filter(s => !s.employee_name);
  const totalVendas   = validSales.reduce((s, v) => s + v.total_amount, 0);
  const totalSangrias = sangrias.reduce((s, sg) => s + sg.amount, 0);
  const vales         = validSales.filter(s => s.employee_name);

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
    ${renderDashboard(validSales)}

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
          <span>${(v.items||[]).map(i => `${i.product_name}×${i.quantity}`).join(', ') || ''}</span>
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

// ── Dashboard ─────────────────────────────────────────────────
function renderDashboard(validSales) {
  if (!validSales.length) return '';

  const products = getState('products');
  const normalSales = validSales.filter(s => !s.employee_name);
  const totalVendas = normalSales.reduce((s, v) => s + v.total_amount, 0);

  // Revenue by category
  const catRevenue = {};
  for (const sale of normalSales) {
    for (const item of (sale.items || [])) {
      const prod = products.find(p => p.id === item.product_id || p.name === item.product_name);
      const cat  = prod?.category || 'outros';
      catRevenue[cat] = (catRevenue[cat] || 0) + (item.product_price * item.quantity);
    }
  }

  // Top 5 produtos
  const prodMap = {};
  for (const sale of normalSales) {
    for (const item of (sale.items || [])) {
      if (!prodMap[item.product_name]) prodMap[item.product_name] = { name: item.product_name, qty: 0, revenue: 0 };
      prodMap[item.product_name].qty     += item.quantity;
      prodMap[item.product_name].revenue += item.product_price * item.quantity;
    }
  }
  const top5 = Object.values(prodMap).sort((a, b) => b.qty - a.qty).slice(0, 5);

  const maxRev = Math.max(...Object.values(catRevenue), 1);
  const CAT_LABEL = { comida:'Comida', doce:'Doces', bebida:'Bebidas', tpc:'TPC', vale:'Vale', outros:'Outros' };

  return `
    <div class="card dashboard-card">
      <h3>📊 Dashboard</h3>

      <div class="dashboard-total">
        <span class="dashboard-total-label">Total faturado (turno)</span>
        <span class="dashboard-total-value">${fmt(totalVendas)}</span>
      </div>

      ${Object.keys(catRevenue).length ? `
      <div class="dashboard-section">
        <div class="dashboard-subtitle">Por categoria</div>
        ${Object.entries(catRevenue).sort((a,b) => b[1]-a[1]).map(([cat, rev]) => {
          const pct = Math.round((rev / maxRev) * 100);
          return `
            <div class="dash-bar-row">
              <span class="dash-bar-label">${CAT_LABEL[cat] || cat}</span>
              <div class="dash-bar-track">
                <div class="dash-bar-fill dash-bar--${cat}" style="width:${pct}%"></div>
              </div>
              <span class="dash-bar-value">${fmt(rev)}</span>
            </div>`;
        }).join('')}
      </div>` : ''}

      ${top5.length ? `
      <div class="dashboard-section">
        <div class="dashboard-subtitle">Top produtos</div>
        ${top5.map((p, i) => `
          <div class="top-product-row">
            <span class="top-rank">#${i+1}</span>
            <span class="top-name">${sanitize(p.name)}</span>
            <span class="top-qty muted">${p.qty}×</span>
            <span class="top-rev">${fmt(p.revenue)}</span>
          </div>`).join('')}
      </div>` : ''}
    </div>`;
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
        ${sale.is_fiado  ? '<span class="badge badge--warning">Fiado</span>' : ''}
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
  return { dinheiro:'Dinheiro', pix:'Pix', debito:'Débito', vale:'Vale' }[m] || m;
}

function filterHistory(history, fromDate, toDate) {
  if (!fromDate && !toDate) return history;
  return history.filter(entry => {
    const date = (entry.session?.opened_at || '').slice(0, 10);
    if (fromDate && date < fromDate) return false;
    if (toDate   && date > toDate)   return false;
    return true;
  });
}

function bindHistorico(sales, sangrias, session) {
  document.getElementById('btn-exportar')?.addEventListener('click', () => printRelatorio(session, sales, sangrias));

  document.getElementById('hist-from')?.addEventListener('change', e => {
    setState('histFromDate', e.target.value);
    renderHistorico();
  });
  document.getElementById('hist-to')?.addEventListener('change', e => {
    setState('histToDate', e.target.value);
    renderHistorico();
  });
  document.getElementById('btn-clear-filter')?.addEventListener('click', () => {
    setState('histFromDate', '');
    setState('histToDate', '');
    renderHistorico();
  });

  document.getElementById('btn-estornar')?.addEventListener('click', async () => {
    const valid = sales.filter(s => !s.is_voided);
    const last  = [...valid].reverse()[0];
    if (!last) return showToast('Nenhuma venda para estornar', 'error');
    if (!confirm(`Estornar a venda de ${fmt(last.total_amount)}?`)) return;
    await voidSale(last.id);
    showToast('Venda estornada', 'success');
    renderHistorico();
  });
}

// ── Gerador de PDF / Janela de impressão ──────────────────────
function printRelatorio(session, sales, sangrias) {
  if (!session) return;

  const validSales    = sales.filter(s => !s.is_voided);
  const normalSales   = validSales.filter(s => !s.employee_name)
                          .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const vales         = validSales.filter(s => s.employee_name);
  const totalVendas   = normalSales.reduce((s, v) => s + v.total_amount, 0);
  const totalVales    = vales.reduce((s, v) => s + v.total_amount, 0);
  const totalSangrias = sangrias.reduce((s, sg) => s + sg.amount, 0);
  const closedAt      = fmtTime(new Date().toISOString());

  // ── Linhas das vendas normais ──────────────────────────────
  const rows = [];
  for (const sale of normalSales) {
    const items    = sale.items || [];
    const method   = labelMetodoPDF(sale);
    const discount = sale.discount_amount ? `<td style="color:#cf222e">−${fmtBRL(sale.discount_amount)}</td>` : '';

    if (!items.length) {
      rows.push(`<tr class="sale-first">
        <td>${fmtTime(sale.created_at)}</td>
        <td>—</td>
        <td>—</td>
        <td>${fmtBRL(sale.total_amount)}</td>
        <td>${method}</td>
      </tr>`);
    } else {
      items.forEach((item, i) => {
        if (i === 0) {
          rows.push(`<tr class="sale-first">
            <td>${fmtTime(sale.created_at)}</td>
            <td>${item.quantity}×</td>
            <td>${escHtml(item.product_name)}</td>
            <td>${fmtBRL(item.product_price * item.quantity)}</td>
            <td>${method}</td>
          </tr>`);
        } else {
          rows.push(`<tr class="sale-cont">
            <td></td>
            <td>${item.quantity}×</td>
            <td>${escHtml(item.product_name)}</td>
            <td>${fmtBRL(item.product_price * item.quantity)}</td>
            <td></td>
          </tr>`);
        }
      });
      if (sale.discount_amount) {
        rows.push(`<tr class="sale-cont">
          <td></td>
          <td colspan="2" style="color:#cf222e;font-style:italic">Desconto</td>
          <td style="color:#cf222e">−${fmtBRL(sale.discount_amount)}</td>
          <td></td>
        </tr>`);
      }
    }
  }

  // ── Linhas dos vales ───────────────────────────────────────
  const valeRows = [];
  for (const sale of vales) {
    for (const item of (sale.items || [])) {
      valeRows.push(`<tr>
        <td>${item.quantity}×</td>
        <td>${escHtml(item.product_name)}</td>
        <td>${fmtBRL(item.product_price * item.quantity)}</td>
        <td>${escHtml(sale.employee_name || '')}</td>
      </tr>`);
    }
  }

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8">
<title>Relatório TPC PDV — ${new Date().toLocaleDateString('pt-BR')}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', Courier, monospace; padding: 24px 20px;
         max-width: 760px; margin: 0 auto; color: #111; font-size: 13px; }
  h1  { text-align: center; font-size: 15px; border-bottom: 2px solid #000;
        padding-bottom: 6px; margin-bottom: 4px; letter-spacing: 1px; }
  .subtitle { text-align: center; font-size: 11px; color: #555; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th  { border-bottom: 1px solid #000; padding: 4px 6px; text-align: left; font-size: 12px; white-space: nowrap; }
  td  { padding: 2px 6px; vertical-align: top; }
  tr.sale-first td { padding-top: 5px; }
  tr.sale-first:not(:first-child) td:first-child { border-top: 1px dashed #ccc; padding-top: 5px; }
  .footer-line { font-size: 13px; font-weight: bold; margin-top: 10px;
                 border-top: 2px solid #000; padding-top: 8px; }
  h2  { font-size: 13px; margin-top: 24px; border-bottom: 1px solid #000;
        padding-bottom: 4px; margin-bottom: 8px; letter-spacing: .5px; }
  .total-vales { font-weight: bold; margin-top: 8px; font-size: 13px; }
  .no-print { margin-top: 24px; }
  @media print {
    .no-print { display: none !important; }
    body { padding: 10px; }
  }
</style>
</head>
<body>

<h1>RELATÓRIO DE FECHAMENTO — TPC PDV</h1>
<div class="subtitle">
  Abertura: ${new Date(session.opened_at).toLocaleString('pt-BR')}
  &nbsp;|&nbsp;
  Fechamento: ${new Date().toLocaleString('pt-BR')}
  &nbsp;|&nbsp;
  Fundo inicial: ${fmtBRL(session.opening_amount)}
</div>

<table>
  <thead>
    <tr>
      <th style="width:55px">Horário</th>
      <th style="width:36px">Qtd</th>
      <th>Item</th>
      <th style="width:80px;text-align:right">Preço</th>
      <th style="width:110px">Pagamento</th>
    </tr>
  </thead>
  <tbody>
    ${rows.join('\n') || '<tr><td colspan="5" style="padding:8px;color:#888">Nenhuma venda registrada</td></tr>'}
  </tbody>
</table>

<div class="footer-line">
  Caixa fechado às ${closedAt} com ${fmtBRL(session.opening_amount)}
  &mdash; Sangrias: ${fmtBRL(totalSangrias)}
  &mdash; Total: ${fmtBRL(totalVendas)}
</div>

${valeRows.length ? `
<h2>VALES DE FUNCIONÁRIO</h2>
<table>
  <thead>
    <tr>
      <th style="width:36px">Qtd</th>
      <th>Item</th>
      <th style="width:80px;text-align:right">Preço</th>
      <th>Funcionário</th>
    </tr>
  </thead>
  <tbody>
    ${valeRows.join('\n')}
  </tbody>
</table>
<div class="total-vales">Total em vales: ${fmtBRL(totalVales)}</div>
` : ''}

<div class="no-print">
  <button onclick="window.print()"
          style="padding:10px 22px;font-size:14px;cursor:pointer;
                 background:#0550ae;color:#fff;border:none;border-radius:6px">
    🖨️ Imprimir / Salvar PDF
  </button>
</div>

</body></html>`;

  const w = window.open('', '_blank');
  if (!w) { showToast('Permita popups para gerar o PDF', 'error'); return; }
  w.document.write(html);
  w.document.close();
}

// helpers para o PDF
function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function labelMetodoPDF(sale) {
  if (sale.payment_method === 'multiplo') {
    return (sale.splits || []).map(sp => `${sp.method.charAt(0).toUpperCase()+sp.method.slice(1)} ${fmtBRL(sp.amount)}`).join(' + ');
  }
  return { dinheiro:'Dinheiro', pix:'Pix', debito:'Débito', vale:'Vale' }[sale.payment_method] || sale.payment_method;
}
