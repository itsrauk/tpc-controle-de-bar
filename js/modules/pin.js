import { getPin, setPin, clearPin, checkPin as checkPinDB } from '../db.js';
import { showToast } from '../utils.js';

// Retorna Promise<true> se PIN correto (ou não configurado), rejeita se cancelado
export function requirePin(reason = 'Confirme o PIN para continuar') {
  return new Promise((resolve, reject) => {
    const pin = getPin();
    if (!pin) { resolve(true); return; }
    openPinModal(reason, resolve, reject);
  });
}

function openPinModal(reason, resolve, reject) {
  showModal(`
    <div class="pin-modal">
      <div class="pin-icon">🔐</div>
      <h2>PIN do Operador</h2>
      <p class="muted">${reason}</p>
      <div class="pin-dots" id="pin-dots">
        <span class="dot"></span><span class="dot"></span>
        <span class="dot"></span><span class="dot"></span>
      </div>
      <div class="pin-pad">
        ${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(k => `
          <button class="pin-key${k === '' ? ' pin-key--empty' : ''}" data-key="${k}">${k}</button>
        `).join('')}
      </div>
      <button class="btn btn--ghost btn--sm" id="pin-cancel" style="margin-top:.5rem;width:100%">Cancelar</button>
    </div>
  `);

  let entered = '';
  const dots  = document.querySelectorAll('.dot');

  const updateDots = () => {
    dots.forEach((d, i) => d.classList.toggle('dot--filled', i < entered.length));
  };

  document.getElementById('modal-body')?.addEventListener('click', e => {
    const btn = e.target.closest('.pin-key');
    if (!btn) return;
    const k = btn.dataset.key;
    if (k === '⌫') { entered = entered.slice(0, -1); }
    else if (k !== '' && entered.length < 4) { entered += k; }
    updateDots();

    if (entered.length === 4) {
      if (checkPinDB(entered)) {
        closeModal();
        resolve(true);
      } else {
        entered = '';
        updateDots();
        document.querySelector('.pin-dots')?.classList.add('pin-shake');
        setTimeout(() => document.querySelector('.pin-dots')?.classList.remove('pin-shake'), 400);
        showToast('PIN incorreto', 'error');
      }
    }
  });

  document.getElementById('pin-cancel')?.addEventListener('click', () => {
    closeModal();
    reject(new Error('cancelled'));
  });
}

// ── Configuração do PIN (chamado no painel Produtos) ─────────────
export function openPinSetup() {
  const hasPin = !!getPin();
  showModal(`
    <h2>${hasPin ? 'Alterar PIN' : 'Criar PIN do Operador'}</h2>
    <p class="muted">O PIN de 4 dígitos será pedido antes de cada abertura de caixa.</p>
    <div class="form-group">
      <label>Novo PIN (4 dígitos)</label>
      <input type="password" id="pin-new" maxlength="4" inputmode="numeric"
             pattern="[0-9]{4}" placeholder="••••" style="letter-spacing:.5rem;font-size:1.5rem;text-align:center">
    </div>
    <div class="form-group">
      <label>Confirmar PIN</label>
      <input type="password" id="pin-confirm" maxlength="4" inputmode="numeric"
             pattern="[0-9]{4}" placeholder="••••" style="letter-spacing:.5rem;font-size:1.5rem;text-align:center">
    </div>
    <div class="modal-actions">
      <button class="btn btn--ghost" onclick="closeModal()">Cancelar</button>
      ${hasPin ? `<button class="btn btn--danger btn--sm" id="pin-remove">Remover PIN</button>` : ''}
      <button class="btn btn--primary" id="pin-save">Salvar PIN</button>
    </div>
  `);

  document.getElementById('pin-save')?.addEventListener('click', () => {
    const n = document.getElementById('pin-new')?.value?.trim();
    const c = document.getElementById('pin-confirm')?.value?.trim();
    if (!n || n.length !== 4 || !/^\d{4}$/.test(n)) return showToast('PIN deve ter exatamente 4 dígitos', 'error');
    if (n !== c) return showToast('Os PINs não coincidem', 'error');
    setPin(n);
    closeModal();
    showToast('PIN configurado!', 'success');
  });

  document.getElementById('pin-remove')?.addEventListener('click', () => {
    if (!confirm('Remover o PIN? O caixa ficará sem proteção.')) return;
    clearPin();
    closeModal();
    showToast('PIN removido', 'info');
  });
}
