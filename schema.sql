-- ============================================================
-- TPC PDV - Schema Supabase
-- Execute no Supabase > SQL Editor > New Query
-- ============================================================

-- Produtos (gerenciados via Supabase)
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  category TEXT NOT NULL CHECK (category IN ('comida','doce','bebida','tpc','vale')),
  stock INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessões de Caixa (turnos)
CREATE TABLE IF NOT EXISTS cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  opening_amount DECIMAL(10,2) NOT NULL,
  opening_justification TEXT,
  late_justification TEXT,
  closing_physical_amount DECIMAL(10,2),
  closing_justification TEXT,
  low_fund_justification TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  operator_name TEXT
);

-- Vendas
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES cash_sessions(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  payment_method TEXT NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  cash_received DECIMAL(10,2),
  change_given DECIMAL(10,2),
  employee_name TEXT,
  is_voided BOOLEAN DEFAULT false,
  voided_at TIMESTAMPTZ,
  is_reservation BOOLEAN DEFAULT false,
  notes TEXT
);

-- Itens das vendas
CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  product_name TEXT NOT NULL,
  product_price DECIMAL(10,2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1
);

-- Divisões de pagamento (múltiplos métodos)
CREATE TABLE IF NOT EXISTS payment_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL
);

-- Sangrias (retiradas de caixa)
CREATE TABLE IF NOT EXISTS sangrias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES cash_sessions(id),
  amount DECIMAL(10,2) NOT NULL,
  justification TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reservas de itens
CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES sales(id),
  customer_name TEXT NOT NULL,
  pickup_time TEXT NOT NULL,
  payment_timing TEXT NOT NULL CHECK (payment_timing IN ('reserva','retirada')),
  items_snapshot JSONB,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','delivered','cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RLS: Permitir acesso total via anon key (ajuste com auth depois)
-- ============================================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE sangrias ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_all" ON products FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON cash_sessions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON sales FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON sale_items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON payment_splits FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON sangrias FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON reservations FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- Trigger: atualiza updated_at automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_reservations_updated BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Seed: Catálogo Inicial de Produtos
-- ============================================================
INSERT INTO products (name, price, category, stock) VALUES
  ('Pão de Queijo',                         4.50, 'comida',  50),
  ('Pipoca',                                4.00, 'comida',  30),
  ('Salgadinho Beck''s sabores',            3.50, 'comida',  40),
  ('Amendoim Mendorato',                    2.00, 'comida',  30),
  ('Halls',                                 3.00, 'doce',    50),
  ('Trident',                               3.50, 'doce',    40),
  ('Tic Tac',                               3.50, 'doce',    40),
  ('Fini',                                  3.00, 'doce',    30),
  ('Lilith',                                1.50, 'doce',    50),
  ('Stick Gutti',                           1.00, 'doce',    50),
  ('Chicletes',                             0.40, 'doce',   100),
  ('Balas',                                 0.30, 'doce',   200),
  ('Pão de Mel',                            3.50, 'doce',    20),
  ('Brigadeiro',                            3.50, 'doce',    20),
  ('Bolinho Roll',                          3.50, 'doce',    20),
  ('Paçocão',                               3.00, 'doce',    30),
  ('Barra de Cereal',                       3.00, 'doce',    30),
  ('Barrinha Bauducco',                     2.50, 'doce',    40),
  ('Doce de Leite',                         2.00, 'doce',    20),
  ('Paçoquinha Moreninha do Rio',           1.00, 'doce',    80),
  ('H2O',                                   7.00, 'bebida',  20),
  ('Refrigerante 600ml',                    7.00, 'bebida',  20),
  ('Refrigerante Lata 350ml',               6.50, 'bebida',  30),
  ('Suco / Capuccino Grande',               4.50, 'bebida',  20),
  ('Coca 200ml',                            4.00, 'bebida',  30),
  ('Refrigerante 250ml',                    4.00, 'bebida',  30),
  ('Café',                                  3.50, 'bebida',  50),
  ('Capuccino Pequeno',                     3.50, 'bebida',  30),
  ('Água COM gás',                          3.00, 'bebida',  30),
  ('Achocolatado',                          2.50, 'bebida',  20),
  ('Água sem gás',                          2.50, 'bebida',  30),
  ('Camiseta TPC Preta',                   55.00, 'tpc',     10),
  ('Camiseta TPC 17º Festival e 15ª Mostra',15.00,'tpc',    20),
  ('Carteirinha TPC',                      10.00, 'tpc',     50),
  ('Copo TPC',                             10.00, 'tpc',     30),
  ('VALE FUNCIONÁRIO',                      0.00, 'vale',  9999)
ON CONFLICT DO NOTHING;
