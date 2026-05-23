const _state = {
  session:      null,   // sessão de caixa aberta
  products:     [],     // catálogo de produtos
  cart:         [],     // itens no carrinho { product, qty }
  sales:        [],     // vendas do turno
  sangrias:     [],     // sangrias do turno
  reservations: [],     // reservas ativas
  tab:          'pdv',  // aba ativa
  isOnline:     navigator.onLine,
  isVale:       false,  // modo vale funcionário
  employeeName: '',
  isReserva:    false,  // modo reserva
  filterCat:    'all',
  filterSearch: ''
};

const _listeners = {};

export function getState(key) {
  return key ? _state[key] : { ..._state };
}

export function setState(key, value) {
  _state[key] = value;
  emit(key, value);
  emit('*', { key, value });
}

export function subscribe(key, fn) {
  (_listeners[key] = _listeners[key] || []).push(fn);
  return () => { _listeners[key] = _listeners[key].filter(f => f !== fn); };
}

function emit(key, value) {
  (_listeners[key] || []).forEach(fn => fn(value));
}
