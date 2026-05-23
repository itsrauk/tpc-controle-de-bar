import { getState, setState } from '../store.js';
import { saveProduct } from '../db.js';
import { fmt, uuid, showToast, sanitize } from '../utils.js';
import { CATEGORIAS } from '../config.js';

export function renderEstoque() {
  const el = document.getElementById('panel-estoque');
  if (!el) return;

  const products = getState('products');
  const cats = CATEGORIAS.filter(c => c.id !== 'all');

  el.innerHTML = `
    <div class="panel-header">
      <h2>Estoque</h2>
      <button class="btn btn--primary btn--sm" id="btn-add-produto">+ Produto</button>
    </div>
    ${cats.map(cat => {
      const items = products.filter(p => p.category === cat.id);
      if (!items.length) return '';
      return `
        <div class="estoque-categoria">
          <h3 class="cat-title">${cat.label}</h3>
          ${items.map(p => renderProdutoRow(p)).join('')}
        </div>`;
    }).join('')}`;

  bindEstoque();
}

function renderProdutoRow(p) {
  const stockClass = p.stock === 0 ? 'stock--zero'
    : p.stock < 5 ? 'stock--low'
    : 'stock--ok';
  return `
    <div class="produto-row" data-id="${p.id}">
      <div class="produto-info">
        <span class="produto-nome">${sanitize(p.name)}</span>
        <span class="produto-preco">${p.price === 0 ? 'Grátis' : fmt(p.price)}</span>
      </div>
      <div class="produto-estoque">
        <button class="qty-btn-sm" data-stock-dec data-id="${p.id}">−</button>
        <span class="stock-count ${stockClass}">${p.stock}</span>
        <button class="qty-btn-sm" data-stock-inc data-id="${p.id}">+</button>
        <button class="btn-icon" data-edit-id="${p.id}" title="Editar">✏️</button>
      </div>
    </div>`;
}

function bindEstoque() {
  const el = document.getElementById('panel-estoque');

  el?.addEventListener('click', async e => {
    const incBtn = e.target.closest('[data-stock-inc]');
    const decBtn = e.target.closest('[data-stock-dec]');
    const editBtn = e.target.closest('[data-edit-id]');

    if (incBtn) await adjustStock(incBtn.dataset.id, 1);
    else if (decBtn) await adjustStock(decBtn.dataset.id, -1);
    else if (editBtn) openEditModal(editBtn.dataset.editId);
  });

  document.getElementById('btn-add-produto')?.addEventListener('click', () => openAddModal());
}

async function adjustStock(productId, delta) {
  let products = getState('products');
  const idx = products.findIndex(p => p.id === productId);
  if (idx === -1) return;

  const newStock = Math.max(0, products[idx].stock + delta);
  products = products.map(p => p.id === productId ? { ...p, stock: newStock } : p);
  setState('products', products);

  await saveProduct({ ...products.find(p => p.id === productId), updated_at: new Date().toISOString() });
  renderEstoque();
}

function openAddModal() {
  const cats = CATEGORIAS.filter(c => c.id !== 'all');
  showModal(`
    <h2>Novo Produto</h2>
    <div class="form-group">
      <label>Nome</label>
      <input type="text" id="np-nome" placeholder="Nome do produto">
    </div>
    <div class="form-group">
      <label>Preço (R$)</label>
      <input type="number" id="np-preco" min="0" step="0.01" placeholder="0,00" class="input-money">
    </div>
    <div class="form-group">
      <label>Categoria</label>
      <select id="np-cat">
        ${cats.map(c => `<option value="${c.id}">${c.label}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Estoque Inicial</label>
      <input type="number" id="np-stock" min="0" step="1" placeholder="0">
    </div>
    <div class="modal-actions">
      <button class="btn btn--ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn--primary" id="btn-salvar-produto">Salvar</button>
    </div>
  `);

  document.getElementById('btn-salvar-produto')?.addEventListener('click', async () => {
    const nome = document.getElementById('np-nome')?.value?.trim();
    const preco = parseFloat(document.getElementById('np-preco')?.value) || 0;
    const cat = document.getElementById('np-cat')?.value;
    const stock = parseInt(document.getElementById('np-stock')?.value) || 0;

    if (!nome) return showToast('Informe o nome do produto', 'error');

    const product = {
      id: uuid(), name: nome, price: preco,
      category: cat, stock, active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await saveProduct(product);
    const products = [...getState('products'), product];
    setState('products', products);

    closeModal();
    showToast(`${nome} adicionado!`, 'success');
    renderEstoque();
  });
}

function openEditModal(productId) {
  const product = getState('products').find(p => p.id === productId);
  if (!product) return;

  const cats = CATEGORIAS.filter(c => c.id !== 'all');
  showModal(`
    <h2>Editar Produto</h2>
    <div class="form-group">
      <label>Nome</label>
      <input type="text" id="ep-nome" value="${sanitize(product.name)}">
    </div>
    <div class="form-group">
      <label>Preço (R$)</label>
      <input type="number" id="ep-preco" min="0" step="0.01" value="${product.price}" class="input-money">
    </div>
    <div class="form-group">
      <label>Categoria</label>
      <select id="ep-cat">
        ${cats.map(c => `<option value="${c.id}" ${c.id === product.category ? 'selected' : ''}>${c.label}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Estoque</label>
      <input type="number" id="ep-stock" min="0" step="1" value="${product.stock}">
    </div>
    <div class="modal-actions">
      <button class="btn btn--ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn--danger btn--sm" id="btn-desativar">Desativar</button>
      <button class="btn btn--primary" id="btn-salvar-edit">Salvar</button>
    </div>
  `);

  document.getElementById('btn-salvar-edit')?.addEventListener('click', async () => {
    const updated = {
      ...product,
      name: document.getElementById('ep-nome')?.value?.trim() || product.name,
      price: parseFloat(document.getElementById('ep-preco')?.value) ?? product.price,
      category: document.getElementById('ep-cat')?.value,
      stock: parseInt(document.getElementById('ep-stock')?.value) ?? product.stock,
      updated_at: new Date().toISOString()
    };

    await saveProduct(updated);
    const products = getState('products').map(p => p.id === productId ? updated : p);
    setState('products', products);

    closeModal();
    showToast('Produto atualizado!', 'success');
    renderEstoque();
  });

  document.getElementById('btn-desativar')?.addEventListener('click', async () => {
    if (!confirm(`Desativar "${product.name}"?`)) return;
    const updated = { ...product, active: false, updated_at: new Date().toISOString() };
    await saveProduct(updated);
    const products = getState('products').filter(p => p.id !== productId);
    setState('products', products);
    closeModal();
    showToast('Produto desativado', 'info');
    renderEstoque();
  });
}
