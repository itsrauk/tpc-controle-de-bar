export function fmt(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

export function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR');
}

export function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
}

export function isLateOpening() {
  const now = new Date();
  const dow = now.getDay(); // 0=dom, 6=sab
  const h = now.getHours(), m = now.getMinutes();
  const mins = h * 60 + m;
  if (dow === 6) return mins >= 18 * 60 + 30;
  if (dow === 0) return true; // domingo sempre exige justificativa
  return mins >= 22 * 60 + 30;
}

export function calcExpectedCash(session, sales, sangrias) {
  const cashSales = sales
    .filter(s => !s.is_voided)
    .reduce((sum, s) => {
      if (s.payment_method === 'dinheiro') return sum + (s.total_amount || 0);
      if (s.payment_method === 'multiplo') {
        const splits = s.splits || [];
        return sum + splits.filter(sp => sp.method === 'dinheiro').reduce((a, sp) => a + sp.amount, 0);
      }
      return sum;
    }, 0);
  const totalSangrias = sangrias.reduce((sum, sg) => sum + (sg.amount || 0), 0);
  return (session.opening_amount || 0) + cashSales - totalSangrias;
}

export function cartTotal(cart) {
  return cart.reduce((sum, item) => sum + item.product.price * item.qty, 0);
}

export function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast toast--${type} toast--show`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('toast--show'), 3200);
}

export function sanitize(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
