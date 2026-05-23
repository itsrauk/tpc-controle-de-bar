export const SUPABASE_URL = 'https://bjerhrfftffawojearlc.supabase.co';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqZXJocmZmdGZmYXdvamVhcmxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0ODc1MTgsImV4cCI6MjA5NTA2MzUxOH0.DhPpD4Q-ILBih0mC6OKp7zOkLbS7do9JFiv3iHR7r3I';

export const FUNDO_MINIMO = 200;

// Horário limite para abertura de caixa sem justificativa de auditoria
export const HORA_LIMITE = {
  semana: { h: 22, m: 30 }, // seg–sex
  sabado: { h: 18, m: 30 }
};

export const CATEGORIAS = [
  { id: 'all',    label: 'Todos'  },
  { id: 'comida', label: 'Comida' },
  { id: 'doce',   label: 'Doces'  },
  { id: 'bebida', label: 'Bebidas'},
  { id: 'tpc',    label: 'TPC'    },
  { id: 'vale',   label: 'Vale'   }
];

export const METODOS_PAGAMENTO = [
  { id: 'dinheiro', label: 'Dinheiro' },
  { id: 'pix',      label: 'Pix'      },
  { id: 'debito',   label: 'Débito'   },
  { id: 'credito',  label: 'Crédito'  },
  { id: 'multiplo', label: 'Múltiplo' }
];

export const LS_KEYS = {
  SESSION:      'tpc_session',
  SALES:        'tpc_sales',
  SANGRIAS:     'tpc_sangrias',
  PRODUCTS:     'tpc_products',
  RESERVATIONS: 'tpc_reservations',
  SYNC_QUEUE:   'tpc_sync_queue',
  HISTORY:      'tpc_history'
};
