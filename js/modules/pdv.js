import { getState, setState } from '../store.js';
import { saveSale, saveReservation, updateProductStock, saveCartLocal, clearCartLocal } from '../db.js';
import { fmt, uuid, cartTotal, showToast, sanitize } from '../utils.js';
import { CATEGORIAS, METODOS_PAGAMENTO } from '../config.js';

// ── Feedback sensorial ──────────────────────────────────────────
function feedbackAdd() {
  if (navigator.vibrate) navigator.vibrate(40);
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.start(); osc.stop(ctx.currentTime + 0.06);
  } catch { /* AudioContext não disponível */ }
}

// ── Salva carrinho no localStorage ─────────────────────────────
function persistCart() {
  saveCartLocal(getState('cart'), {
    isVale:       getState('isVale'),
    employeeName: getState('employeeName'),
    isReserva:    getState('isReserva')
  });
}

// ── Highlight de texto na busca ────────────────────────────────
function highlight(text, search) {
  if (!search) return sanitize(text);
  const re = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return sanitize(text).replace(re, '<mark>$1</mark>');
}

export function renderPDV() {
  const el = document.getElementById('panel-pdv');
  if (!el) return;

  const isVale = getState('isVale');
  el.className = `panel${isVale ? ' panel--vale' : ''}`;

  el.innerHTML = `
    <div class="pdv-layout">
      <div class="pdv-products">
        <div class="search-bar">
          <input type="search" id="pdv-search" placeholder="🔍 Buscar produto..." value="${getState('filterSearch')}">
        </div>
        <div class="cat-tabs" id="cat-tabs">
          ${CATEGORIAS.map(c => `
            <button class="cat-tab${getState('filterCat') === c.id ? ' active' : ''}" data-cat="${c.id}">${c.label}</button>
          `).join('')}
        </div>
        <div class="products-grid" id="products-grid">
          ${renderProducts()}
        </div>
      </div>
      <div class="pdv-cart">
        ${renderCart()}
      </div>
    </div>`;

  bindPDV();
}

function renderProducts() {
  const products = getState('products');
  const cat      = getState('filterCat');
  const search   = (getState('filterSearch') || '').toLowerCase();

  const filtered = products.filter(p => {
    const matchCat    = cat === 'all' || p.category === cat;
    const matchSearch = !search || p.name.toLowerCase().includes(search);
    return matchCat && matchSearch && p.active;
  });

  if (!filtered.length) return `<div class="empty-state">${search ? `Sem resultados para "<strong>${sanitize(search)}</strong>"` : 'Nenhum produto encontrado'}</div>`;

  return filtered.map(p => {
    const esgotado = p.stock <= 0 && p.category !== 'vale';
    return `
      <button class="product-card product-card--${p.category}${p.featured ? ' product-card--featured' : ''}${esgotado ? ' product-card--esgotado' : ''}"
              data-id="${p.id}" ${esgotado ? 'disabled' : ''}>
        <span class="product-name">${p.featured ? '<span class="featured-star">★</span> ' : ''}${highlight(p.name, search)}</span>
        <span class="product-price">${p.price === 0 ? 'Grátis' : fmt(p.price)}</span>
        ${esgotado ? '<span class="esgotado-badge">Esgotado</span>' : ''}
        ${p.stock < 5 && p.stock > 0 && p.category !== 'vale' ? `<span class="low-stock">Últ. ${p.stock}</span>` : ''}
      </button>`;
  }).join('');
}

function renderCart() {
  const cart = getState('cart');
  const isVale = getState('isVale');
  const isReserva = getState('isReserva');
  const total = cartTotal(cart);

  return `
    <div class="cart-header">
      <h3>Carrinho ${cart.length ? `<span class="badge">${cart.reduce((s,i)=>s+i.qty,0)}</span>` : ''}</h3>
      ${cart.length ? `<button class="btn-icon btn--ghost" id="btn-clear-cart" title="Limpar">🗑</button>` : ''}
    </div>

    ${isVale ? `
    <div class="vale-banner">
      <span>⚠️ VALE FUNCIONÁRIO</span>
    </div>
    <div class="form-group">
      <label>Nome do Funcionário / Professor *</label>
      <input type="text" id="inp-employee" placeholder="Nome completo" value="${sanitize(getState('employeeName'))}">
    </div>` : ''}

    <div class="cart-items" id="cart-items">
      ${cart.length ? cart.map((item, idx) => `
        <div class="cart-item" data-idx="${idx}">
          <div class="cart-item-info">
            <span class="cart-item-name">${sanitize(item.product.name)}</span>
            <span class="cart-item-price">${fmt(item.product.price * item.qty)}</span>
          </div>
          <div class="cart-item-qty">
            <button class="qty-btn" data-action="dec" data-idx="${idx}">−</button>
            <span>${item.qty}</span>
            <button class="qty-btn" data-action="inc" data-idx="${idx}">+</button>
          </div>
        </div>
      `).join('') : '<div class="cart-empty">Nenhum item adicionado</div>'}
    </div>

    ${cart.length ? `
    <div class="cart-footer">
      <div class="reserva-toggle">
        <label class="toggle-label">
          <input type="checkbox" id="chk-reserva" ${isReserva ? 'checked' : ''}>
          <span>📋 Marcar como Reserva</span>
        </label>
      </div>

      ${isReserva ? `
      <div class="reserva-fields">
        <div class="form-group">
          <label>Nome do Cliente *</label>
          <input type="text" id="inp-cliente" placeholder="Nome completo">
        </div>
        <div class="form-group">
          <label>Horário de Retirada *</label>
          <input type="text" id="inp-retirada" placeholder="Ex: Intervalo das 20h">
        </div>
        <div class="form-group">
          <label>Pagamento</label>
          <select id="sel-pay-timing">
            <option value="reserva">Pagar agora (na reserva)</option>
            <option value="retirada">Pagar na retirada</option>
          </select>
        </div>
        <button class="btn btn--primary btn--full" id="btn-reservar">📋 Confirmar Reserva</button>
      </div>` : `
      <div class="cart-total">
        <span>Total</span>
        <span class="total-value">${fmt(total)}</span>
      </div>
      <button class="btn btn--primary btn--full" id="btn-pagar">💳 Finalizar Venda</button>`}
    </div>` : ''}`;
}

function bindPDV() {
  // Busca
  document.getElementById('pdv-search')?.addEventListener('input', e => {
    setState('filterSearch', e.target.value);
    document.getElementById('products-grid').innerHTML = renderProducts();
  });

  // Abas de categoria
  document.getElementById('cat-tabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.cat-tab');
    if (!btn) return;
    setState('filterCat', btn.dataset.cat);
    document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('products-grid').innerHTML = renderProducts();
  });

  // Adicionar produto ao carrinho
  document.getElementById('products-grid')?.addEventListener('click', e => {
    const card = e.target.closest('.product-card');
    if (!card || card.disabled) return;
    const productId = card.dataset.id;
    const products = getState('products');
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const cart = [...getState('cart')];
    const existing = cart.find(i => i.product.id === productId);

    if (product.category === 'vale') {
      if (!cart.find(i => i.product.category === 'vale')) {
        cart.push({ product, qty: 1 });
        setState('isVale', true);
      }
    } else {
      if (existing) existing.qty++;
      else cart.push({ product, qty: 1 });
    }

    setState('cart', cart);
    feedbackAdd();
    persistCart();
    refreshCart();
  });

  // Qtd no carrinho
  document.getElementById('cart-items')?.addEventListener('click', e => {
    const btn = e.target.closest('.qty-btn');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx);
    const action = btn.dataset.action;
    const cart = [...getState('cart')];

    if (action === 'inc') {
      const p = cart[idx].product;
      if (p.stock > 0 && p.category !== 'vale' && cart[idx].qty >= p.stock) {
        showToast('Estoque insuficiente', 'error'); return;
      }
      cart[idx].qty++;
    } else {
      cart[idx].qty--;
      if (cart[idx].qty <= 0) {
        const removed = cart.splice(idx, 1)[0];
        if (removed.product.category === 'vale') { setState('isVale', false); setState('employeeName', ''); }
      }
    }

    setState('cart', cart);
    persistCart();
    refreshCart();
  });

  // Limpar carrinho
  document.getElementById('btn-clear-cart')?.addEventListener('click', () => {
    setState('cart', []);
    setState('isVale', false);
    setState('employeeName', '');
    setState('isReserva', false);
    clearCartLocal();
    refreshCart();
  });

  // Nome funcionário
  document.getElementById('inp-employee')?.addEventListener('input', e => {
    setState('employeeName', e.target.value);
    persistCart();
  });

  // Toggle reserva
  document.getElementById('chk-reserva')?.addEventListener('change', e => {
    setState('isReserva', e.target.checked);
    persistCart();
    refreshCart();
  });

  // Finalizar reserva
  document.getElementById('btn-reservar')?.addEventListener('click', async () => await confirmarReserva());

  // Finalizar venda
  document.getElementById('btn-pagar')?.addEventListener('click', () => openModalPagamento());
}

function refreshCart() {
  const cartEl = document.getElementById('pdv-cart');
  if (cartEl) { cartEl.outerHTML = ''; }
  // Re-render completo para manter estado correto
  renderPDV();
}

// ── Modal de Pagamento ──────────────────────────────────────────
function openModalPagamento() {
  const session = getState('session');
  if (!session) return showToast('Abra o caixa primeiro!', 'error');

  const cart = getState('cart');
  const isVale = getState('isVale');
  const total = cartTotal(cart);

  if (isVale && !getState('employeeName')?.trim()) {
    return showToast('Informe o nome do funcionário/professor', 'error');
  }

  showModal(`
    <h2>Finalizar Venda</h2>
    <div class="payment-total">Total: <strong>${fmt(total)}</strong></div>

    <div class="payment-methods">
      ${METODOS_PAGAMENTO.filter(m => !isVale || m.id === 'vale').map(m => `
        <button class="pay-method-btn${isVale && m.id === 'vale' ? ' active' : ''}" data-method="${m.id}">${m.label}</button>
      `).join('')}
    </div>

    <div id="pay-details"></div>

    <div class="modal-actions">
      <button class="btn btn--ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn--primary" id="btn-confirmar-venda">✅ Confirmar Venda</button>
    </div>
  `);

  if (isVale) {
    renderPayDetails('vale', total);
    setState('activeMethod', 'vale');
  }

  document.querySelectorAll('.pay-method-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setState('activeMethod', btn.dataset.method);
      renderPayDetails(btn.dataset.method, total);
    });
  });

  document.getElementById('btn-confirmar-venda')?.addEventListener('click', async () => await confirmarVenda());
}

function renderPayDetails(method, total) {
  const el = document.getElementById('pay-details');
  if (!el) return;

  if (method === 'dinheiro') {
    el.innerHTML = `
      <div class="form-group">
        <label>Valor Recebido</label>
        <input type="number" id="pay-recebido" min="${total}" step="0.01" placeholder="${total.toFixed(2)}" class="input-money" value="${total.toFixed(2)}">
      </div>
      <div class="troco-display" id="troco-display">Troco: ${fmt(0)}</div>`;
    document.getElementById('pay-recebido')?.addEventListener('input', e => {
      const rec = parseFloat(e.target.value) || 0;
      document.getElementById('troco-display').textContent = `Troco: ${fmt(Math.max(0, rec - total))}`;
    });
  } else if (method === 'multiplo') {
    el.innerHTML = renderMultiploPay(total);
    bindMultiploPay(total);
  } else {
    el.innerHTML = `<div class="pay-confirm-info">${fmt(total)} via ${method === 'vale' ? 'Vale Funcionário' : method.charAt(0).toUpperCase() + method.slice(1)}</div>`;
  }
}

function renderMultiploPay(total) {
  return `
    <div class="multiplo-container">
      <div id="multiplo-splits"></div>
      <div class="multiplo-restante">
        Restante: <strong id="multiplo-restante">${fmt(total)}</strong>
      </div>
      <div class="multiplo-add">
        <select id="multiplo-method">
          ${METODOS_PAGAMENTO.filter(m => m.id !== 'multiplo' && m.id !== 'vale').map(m =>
            `<option value="${m.id}">${m.label}</option>`).join('')}
        </select>
        <input type="number" id="multiplo-valor" step="0.01" placeholder="Valor" class="input-money">
        <button class="btn btn--ghost" id="btn-add-split">+ Add</button>
      </div>
    </div>`;
}

function bindMultiploPay(total) {
  const splits = [];
  const updateRestante = () => {
    const pago = splits.reduce((s, sp) => s + sp.amount, 0);
    const restante = total - pago;
    document.getElementById('multiplo-restante').textContent = fmt(Math.max(0, restante));
    renderSplits(splits);
  };

  document.getElementById('btn-add-split')?.addEventListener('click', () => {
    const method = document.getElementById('multiplo-method')?.value;
    const amount = parseFloat(document.getElementById('multiplo-valor')?.value) || 0;
    if (amount <= 0) return showToast('Informe o valor', 'error');
    splits.push({ id: uuid(), method, amount });
    document.getElementById('multiplo-valor').value = '';
    setState('multipleSplits', splits);
    updateRestante();
  });
}

function renderSplits(splits) {
  const el = document.getElementById('multiplo-splits');
  if (!el) return;
  el.innerHTML = splits.map((sp, i) => `
    <div class="split-item">
      <span>${labelMetodo(sp.method)}: ${fmt(sp.amount)}</span>
      <button class="btn-icon" data-split-idx="${i}">✕</button>
    </div>`).join('');
  el.addEventListener('click', e => {
    const btn = e.target.closest('[data-split-idx]');
    if (!btn) return;
    const idx = parseInt(btn.dataset.splitIdx);
    const s = getState('multipleSplits') || [];
    s.splice(idx, 1);
    setState('multipleSplits', s);
    renderSplits(s);
  });
}

function labelMetodo(m) {
  return { dinheiro:'Dinheiro', pix:'Pix', debito:'Débito', credito:'Crédito', vale:'Vale' }[m] || m;
}

async function confirmarVenda() {
  const session = getState('session');
  const cart = getState('cart');
  const total = cartTotal(cart);
  const method = getState('activeMethod');
  const isVale = getState('isVale');
  const employeeName = getState('employeeName');

  if (!method) return showToast('Selecione o método de pagamento', 'error');

  let cashReceived = null, changeGiven = null, splits = null;

  if (method === 'dinheiro') {
    cashReceived = parseFloat(document.getElementById('pay-recebido')?.value) || total;
    if (cashReceived < total) return showToast('Valor recebido insuficiente', 'error');
    changeGiven = cashReceived - total;
  }

  if (method === 'multiplo') {
    splits = getState('multipleSplits') || [];
    const pago = splits.reduce((s, sp) => s + sp.amount, 0);
    if (Math.abs(pago - total) > 0.01) return showToast('O total dos métodos não fecha', 'error');
  }

  const saleId = uuid();
  const items = cart.map(item => ({
    id: uuid(), sale_id: saleId,
    product_id: item.product.id,
    product_name: item.product.name,
    product_price: item.product.price,
    quantity: item.qty
  }));

  const sale = {
    id: saleId,
    session_id: session.id,
    payment_method: method,
    total_amount: total,
    cash_received: cashReceived,
    change_given: changeGiven,
    employee_name: isVale ? employeeName : null,
    is_voided: false,
    is_reservation: false,
    created_at: new Date().toISOString(),
    items,
    splits: method === 'multiplo' ? splits.map(sp => ({ ...sp, sale_id: saleId })) : null
  };

  await saveSale(sale);

  // Decrementa estoque
  for (const item of cart) {
    if (item.product.category !== 'vale' && item.product.stock > 0) {
      const newStock = Math.max(0, item.product.stock - item.qty);
      await updateProductStock(item.product.id, newStock);
      const products = getState('products').map(p =>
        p.id === item.product.id ? { ...p, stock: newStock } : p);
      setState('products', products);
    }
  }

  // Limpar estado
  setState('cart', []);
  setState('isVale', false);
  setState('employeeName', '');
  setState('isReserva', false);
  setState('activeMethod', null);
  setState('multipleSplits', null);
  clearCartLocal();

  const sales = [...(getState('sales') || []), sale];
  setState('sales', sales);

  closeModal();
  showToast(changeGiven != null ? `Venda OK! Troco: ${fmt(changeGiven)}` : 'Venda registrada!', 'success');
  renderPDV();
}

async function confirmarReserva() {
  const session = getState('session');
  const cart = getState('cart');
  const total = cartTotal(cart);
  const cliente = document.getElementById('inp-cliente')?.value?.trim();
  const horario = document.getElementById('inp-retirada')?.value?.trim();
  const payTiming = document.getElementById('sel-pay-timing')?.value;

  if (!cliente) return showToast('Informe o nome do cliente', 'error');
  if (!horario) return showToast('Informe o horário de retirada', 'error');

  const reservation = {
    id: uuid(),
    sale_id: null,
    customer_name: cliente,
    pickup_time: horario,
    payment_timing: payTiming,
    items_snapshot: cart.map(i => ({ name: i.product.name, qty: i.qty, price: i.product.price })),
    total_amount: total,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Se pagar na reserva, processar venda também
  if (payTiming === 'reserva') {
    const saleId = uuid();
    const items = cart.map(item => ({
      id: uuid(), sale_id: saleId,
      product_id: item.product.id,
      product_name: item.product.name,
      product_price: item.product.price,
      quantity: item.qty
    }));
    const sale = {
      id: saleId, session_id: session?.id,
      payment_method: 'pix', // default — pode mudar
      total_amount: total,
      is_reservation: true,
      is_voided: false,
      created_at: new Date().toISOString(),
      items
    };
    await saveSale(sale);
    reservation.sale_id = saleId;
  }

  // Decrementa estoque
  for (const item of cart) {
    if (item.product.category !== 'vale' && item.product.stock > 0) {
      const newStock = Math.max(0, item.product.stock - item.qty);
      await updateProductStock(item.product.id, newStock);
      const products = getState('products').map(p =>
        p.id === item.product.id ? { ...p, stock: newStock } : p);
      setState('products', products);
    }
  }

  await saveReservation(reservation);
  const reservations = [...getState('reservations'), reservation];
  setState('reservations', reservations);

  setState('cart', []);
  setState('isReserva', false);
  clearCartLocal();

  showToast(`Reserva para ${cliente} criada!`, 'success');
  renderPDV();
}
