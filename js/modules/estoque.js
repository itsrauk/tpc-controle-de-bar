import { getState, setState } from '../store.js';
import { openPinSetup } from './pin.js';
import { saveProduct } from '../db.js';
import { fmt, uuid, showToast, sanitize } from '../utils.js';
import { CATEGORIAS } from '../config.js';

// ── Render principal ─────────────────────────────────────────────
export function renderEstoque() {
  const el = document.getElementById('panel-estoque');
  if (!el) return;

  const products  = getState('products');
  const showAll   = getState('prodShowAll') || false;
  const cats      = CATEGORIAS.filter(c => c.id !== 'all');
  const search    = (getState('prodSearch') || '').toLowerCase();

  const filtered  = products.filter(p =>
    !search || p.name.toLowerCase().includes(search)
  );
  const ativos    = filtered.filter(p => p.active);
  const inativos  = filtered.filter(p => !p.active);

  el.innerHTML = `
    <div class="panel-header">
      <h2>Produtos</h2>
      <div style="display:flex;gap:.4rem">
        <button class="btn btn--ghost btn--sm" id="btn-pin-setup" title="Configurar PIN do operador">🔐 PIN</button>
        <button class="btn btn--primary btn--sm" id="btn-add-produto">+ Novo</button>
      </div>
    </div>

    <div class="search-bar" style="padding:.25rem 0 .5rem">
      <input type="search" id="prod-search" placeholder="Buscar produto..."
             value="${sanitize(getState('prodSearch') || '')}">
    </div>

    ${ativos.length === 0 && inativos.length === 0
      ? '<div class="empty-state">Nenhum produto encontrado.<br>Rode o schema.sql no Supabase primeiro.</div>'
      : ''}

    ${cats.map(cat => {
      const items = ativos.filter(p => p.category === cat.id);
      if (!items.length) return '';
      return `
        <div class="estoque-categoria">
          <h3 class="cat-title">${cat.label}
            <span class="muted" style="font-weight:400;font-size:.75rem"> — ${items.length} itens</span>
          </h3>
          ${items.map(p => renderProdutoRow(p, true)).join('')}
        </div>`;
    }).join('')}

    ${inativos.length ? `
      <div class="estoque-categoria">
        <button class="cat-title btn-toggle-inativos" id="btn-toggle-inativos"
                style="background:none;border:none;cursor:pointer;color:var(--text-muted);width:100%;text-align:left;padding:.75rem 0 .4rem">
          ${showAll ? '▾' : '▸'} Indisponíveis (${inativos.length})
        </button>
        ${showAll ? inativos.map(p => renderProdutoRow(p, false)).join('') : ''}
      </div>` : ''}
  `;

  bindEstoque();
}

// ── Row de cada produto ──────────────────────────────────────────
function renderProdutoRow(p, ativo) {
  const stockClass = p.stock === 0 ? 'stock--zero' : p.stock < 5 ? 'stock--low' : 'stock--ok';

  return `
    <div class="produto-row${ativo ? '' : ' produto-row--inativo'}" data-id="${p.id}">

      <!-- Nome + badge inativo -->
      <div class="produto-info">
        <span class="produto-nome">${sanitize(p.name)}</span>
        ${!ativo ? '<span class="badge badge--danger" style="font-size:.65rem">Indisponível</span>' : ''}
      </div>

      <!-- Preço editável inline -->
      <div class="produto-preco-wrap" title="Clique para editar o preço">
        <span class="preco-prefix">R$</span>
        <input  class="preco-inline"
                type="number" min="0" step="0.01"
                value="${p.price.toFixed(2)}"
                data-price-id="${p.id}"
                data-original="${p.price}">
      </div>

      <!-- Estoque -->
      <div class="produto-estoque">
        <button class="qty-btn-sm" data-stock-dec data-id="${p.id}">−</button>
        <span class="stock-count ${stockClass}">${p.stock}</span>
        <button class="qty-btn-sm" data-stock-inc data-id="${p.id}">+</button>
      </div>

      <!-- Destaque -->
      <button class="star-btn${p.featured ? ' star-btn--active' : ''}"
              data-feat-id="${p.id}"
              title="${p.featured ? 'Remover destaque' : 'Marcar como destaque'}">⭐</button>

      <!-- Toggle disponível -->
      <label class="avail-toggle" title="${ativo ? 'Clique para tornar indisponível' : 'Clique para reativar'}">
        <input type="checkbox" class="avail-chk" data-toggle-id="${p.id}" ${ativo ? 'checked' : ''}>
        <span class="avail-slider"></span>
      </label>

    </div>`;
}

// ── Bind de eventos ──────────────────────────────────────────────
function bindEstoque() {
  const el = document.getElementById('panel-estoque');

  // Busca em tempo real
  document.getElementById('prod-search')?.addEventListener('input', e => {
    setState('prodSearch', e.target.value);
    renderEstoque();
  });

  // Toggle seção inativos
  document.getElementById('btn-toggle-inativos')?.addEventListener('click', () => {
    setState('prodShowAll', !getState('prodShowAll'));
    renderEstoque();
  });

  // Ajuste de estoque
  el?.addEventListener('click', async e => {
    const inc  = e.target.closest('[data-stock-inc]');
    const dec  = e.target.closest('[data-stock-dec]');
    const star = e.target.closest('.star-btn');
    if (inc)       await adjustStock(inc.dataset.id, 1);
    else if (dec)  await adjustStock(dec.dataset.id, -1);
    else if (star) await toggleFeatured(star.dataset.featId, !star.classList.contains('star-btn--active'));
  });

  // Toggle de disponibilidade
  el?.addEventListener('change', async e => {
    const chk = e.target.closest('.avail-chk');
    if (chk) await toggleAvailability(chk.dataset.toggleId, chk.checked);
  });

  // Edição de preço inline — salva ao sair do campo (blur) ou Enter
  el?.addEventListener('blur', async e => {
    const inp = e.target.closest('.preco-inline');
    if (inp) await savePrice(inp);
  }, true);

  el?.addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    const inp = e.target.closest('.preco-inline');
    if (inp) { inp.blur(); }
  });

  // PIN settings
  document.getElementById('btn-pin-setup')?.addEventListener('click', () => openPinSetup());

  // Botão novo produto
  document.getElementById('btn-add-produto')?.addEventListener('click', () => openAddModal());
}

// ── Ações de dados ───────────────────────────────────────────────
async function adjustStock(productId, delta) {
  const products = getState('products');
  const product  = products.find(p => p.id === productId);
  if (!product) return;

  const newStock  = Math.max(0, product.stock + delta);
  const updated   = { ...product, stock: newStock, updated_at: new Date().toISOString() };
  setState('products', products.map(p => p.id === productId ? updated : p));
  await saveProduct(updated);
  renderEstoque();
}

async function savePrice(inp) {
  const productId = inp.dataset.priceId;
  const original  = parseFloat(inp.dataset.original);
  const newPrice  = Math.max(0, parseFloat(inp.value) || 0);

  if (Math.abs(newPrice - original) < 0.001) return; // sem mudança

  const products  = getState('products');
  const product   = products.find(p => p.id === productId);
  if (!product) return;

  const updated   = { ...product, price: newPrice, updated_at: new Date().toISOString() };
  setState('products', products.map(p => p.id === productId ? updated : p));
  await saveProduct(updated);
  showToast(`Preço de "${product.name}" atualizado para ${fmt(newPrice)}`, 'success');
  // Atualiza o data-original sem re-render total
  inp.dataset.original = newPrice.toFixed(2);
}

async function toggleAvailability(productId, makeActive) {
  const products  = getState('products');
  const product   = products.find(p => p.id === productId);
  if (!product) return;

  const updated   = { ...product, active: makeActive, updated_at: new Date().toISOString() };
  // Se reativando, mantém no estado global; se desativando, move para inativos (estado local)
  setState('products', products.map(p => p.id === productId ? updated : p));
  await saveProduct(updated);

  const label = makeActive ? 'disponível' : 'indisponível';
  showToast(`"${product.name}" marcado como ${label}`, makeActive ? 'success' : 'info');
  renderEstoque();
}

async function toggleFeatured(productId, makeFeatured) {
  const products = getState('products');
  const product  = products.find(p => p.id === productId);
  if (!product) return;

  const updated = { ...product, featured: makeFeatured, updated_at: new Date().toISOString() };
  setState('products', products.map(p => p.id === productId ? updated : p));
  await saveProduct(updated);
  showToast(`"${product.name}" ${makeFeatured ? 'em destaque ⭐' : 'sem destaque'}`, makeFeatured ? 'success' : 'info');
  renderEstoque();
}

// ── Modal: novo produto ──────────────────────────────────────────
function openAddModal() {
  const cats = CATEGORIAS.filter(c => c.id !== 'all');
  showModal(`
    <h2>Novo Produto</h2>
    <div class="form-group">
      <label>Nome</label>
      <input type="text" id="np-nome" placeholder="Nome do produto" autofocus>
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
      <button class="btn btn--primary" id="btn-salvar-produto">Salvar Produto</button>
    </div>
  `);

  document.getElementById('btn-salvar-produto')?.addEventListener('click', async () => {
    const nome  = document.getElementById('np-nome')?.value?.trim();
    const preco = parseFloat(document.getElementById('np-preco')?.value) || 0;
    const cat   = document.getElementById('np-cat')?.value;
    const stock = parseInt(document.getElementById('np-stock')?.value) || 0;

    if (!nome) return showToast('Informe o nome do produto', 'error');

    const product = {
      id: uuid(), name: nome, price: preco,
      category: cat, stock, active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await saveProduct(product);
    setState('products', [...getState('products'), product]);
    closeModal();
    showToast(`"${nome}" adicionado!`, 'success');
    renderEstoque();
  });
}
