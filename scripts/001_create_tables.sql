-- Pricing config table 1
CREATE TABLE IF NOT EXISTS pricing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_fee NUMERIC(10,2) NOT NULL DEFAULT 5.00,
  hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 3.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Snacks table
CREATE TABLE IF NOT EXISTS snacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'checked_out')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  base_fee NUMERIC(10,2) NOT NULL DEFAULT 5.00,
  hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 3.00,
  total_cost NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Session snacks junction table
CREATE TABLE IF NOT EXISTS session_snacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  snack_id UUID NOT NULL REFERENCES snacks(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  price_at_time NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Disable RLS for public kiosk access (no auth required for this app)
ALTER TABLE pricing_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE snacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_snacks ENABLE ROW LEVEL SECURITY;

-- Allow public read/write for all tables (kiosk + admin, no auth)
CREATE POLICY "Allow all on pricing_config" ON pricing_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on snacks" ON snacks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on sessions" ON sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on session_snacks" ON session_snacks FOR ALL USING (true) WITH CHECK (true);

-- Insert default pricing config
INSERT INTO pricing_config (base_fee, hourly_rate) VALUES (5.00, 3.00);

-- Insert sample snacks
INSERT INTO snacks (name, price) VALUES
  ('Coffee', 2.50),
  ('Tea', 2.00),
  ('Soda', 1.50),
  ('Chips', 1.00),
  ('Cookie', 1.50),
  ('Sandwich', 4.00);
