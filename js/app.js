import { getState, setState, subscribe } from './store.js';
import { loadProducts, loadReservations, getSession, getSales, getSangrias,
         flushQueue, openSession, loadCartLocal, clearCartLocal, ls } from './db.js';
import { isLateOpening, showToast } from './utils.js';
import { FUNDO_MINIMO, LS_KEYS } from './config.js';
import { requirePin } from './modules/pin.js';
import { renderCaixa } from './modules/caixa.js';
import { renderPDV } from './modules/pdv.js';
import { renderReservas } from './modules/reservas.js';
import { renderEstoque } from './modules/estoque.js';
import { renderHistorico } from './modules/historico.js';

const TABS = { pdv: renderPDV, caixa: renderCaixa, reservas: renderReservas, estoque: renderEstoque, historico: renderHistorico };

async function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  const updateOnline = () => {
    setState('isOnline', navigator.onLine);
    document.getElementById('online-indicator')?.classList.toggle('offline', !navigator.onLine);
    if (navigator.onLine) flushQueue().catch(() => {});
  };
  window.addEventListener('online', updateOnline);
  window.addEventListener('offline', updateOnline);
  updateOnline();

  // ── 1. Cache local → UI instantânea (sem esperar rede) ──────────────
  setState('products',     ls.get(LS_KEYS.PRODUCTS, []));
  setState('reservations', ls.get(LS_KEYS.RESERVATIONS, []));

  // Restaura sessão e carrinho do localStorage
  const session = getSession();
  if (session) {
    setState('session', session);
    setState('sales', getSales());
    setState('sangrias', getSangrias());
    const { cart, meta } = loadCartLocal();
    if (cart?.length) {
      setState('cart', cart);
      setState('isVale',       meta.isVale       || false);
      setState('employeeName', meta.employeeName || '');
      setState('isReserva',    meta.isReserva    || false);
      setState('isFiado',      meta.isFiado      || false);
      setState('nomeAluno',    meta.nomeAluno    || '');
      setState('nomePai',      meta.nomePai      || '');
      setState('discount',     meta.discount     || 0);
    }
  }

  // ── 2. Mostra a UI imediatamente ─────────────────────────────────────
  setupNav();
  bindBlockerForm();
  subscribe('session', () => { updateBlocker(); updateSessionChip(); renderActive(); });
  updateBlocker();
  updateSessionChip();
  navigateTo('pdv');                         // ← visível antes de qualquer rede

  // ── 3. Sincroniza com Supabase em background (não bloqueia) ──────────
  const hadCache = getState('products').length > 0;
  if (!hadCache) showLoading(true);          // spinner só se não há cache local
  try {
    const [products, reservations] = await Promise.all([loadProducts(), loadReservations()]);
    setState('products', products);
    setState('reservations', reservations);
    renderActive();                          // atualiza view com dados frescos
  } catch {
    if (!hadCache) showToast('Sem conexão — sem produtos carregados', 'error');
  }
  showLoading(false);
}

function setupNav() {
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.tab));
  });
  document.getElementById('modal')?.addEventListener('click', e => {
    if (e.target.id === 'modal') closeModal();
  });
}

// Formulário de abertura de caixa com validação de PIN
function bindBlockerForm() {
  const inp = document.getElementById('blocker-abertura');
  inp?.addEventListener('input', () => {
    const v = parseFloat(inp.value) || 0;
    document.getElementById('blocker-grp-baixo')?.classList.toggle('hidden', v >= FUNDO_MINIMO);
    document.getElementById('blocker-grp-tarde')?.classList.toggle('hidden', !isLateOpening());
  });

  document.getElementById('blocker-btn-abrir')?.addEventListener('click', async () => {
    const val    = parseFloat(document.getElementById('blocker-abertura')?.value) || 0;
    const jBaixo = document.getElementById('blocker-just-baixo')?.value?.trim() || '';
    const jTarde = document.getElementById('blocker-just-tarde')?.value?.trim() || '';

    if (val <= 0) return showToast('Informe o valor inicial', 'error');
    if (val < FUNDO_MINIMO && jBaixo.length < 5) return showToast('Justifique o valor abaixo do mínimo', 'error');
    if (isLateOpening() && jTarde.length < 5) return showToast('Justifique a abertura fora do horário', 'error');

    // Verificação de PIN (só pede se houver PIN configurado)
    try {
      await requirePin('Confirme o PIN para abrir o caixa');
    } catch {
      return; // Cancelado pelo operador
    }

    const sess = await openSession({
      opening_amount: val,
      opening_justification: jBaixo || null,
      late_justification: jTarde || null
    });
    setState('session', sess);
    setState('sales', []);
    setState('sangrias', []);
    clearCartLocal();
    showToast('Caixa aberto!', 'success');
    navigateTo('pdv');
  });
}

function navigateTo(tab) {
  setState('tab', tab);
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('hidden', p.id !== `panel-${tab}`));
  renderActive();
}

function renderActive() {
  const tab = getState('tab');
  TABS[tab]?.();
}

function updateBlocker() {
  const session = getState('session');
  document.getElementById('blocker')?.classList.toggle('hidden', !!session);
}

function updateSessionChip() {
  const session = getState('session');
  const chip = document.getElementById('session-chip');
  if (!chip) return;
  if (session) {
    const h = new Date(session.opened_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    chip.textContent = `Aberto desde ${h}`;
    chip.style.color = 'var(--green)';
  } else {
    chip.textContent = 'Caixa fechado';
    chip.style.color = '';
  }
}

function showLoading(show) {
  document.getElementById('loading')?.classList.toggle('hidden', !show);
}

window.navigateTo = navigateTo;

document.addEventListener('DOMContentLoaded', init);
