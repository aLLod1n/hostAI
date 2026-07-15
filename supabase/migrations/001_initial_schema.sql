-- ============================================================
-- GuestBot — Initial Schema
-- ============================================================

-- HOSTS
CREATE TABLE hosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  full_name text,
  created_at timestamptz DEFAULT now(),
  stripe_customer_id text,
  subscription_status text DEFAULT 'trial' -- trial | active | cancelled
);
ALTER TABLE hosts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hosts can read own data" ON hosts
  FOR ALL USING (auth.uid() = id);

-- APARTMENTS
CREATE TABLE apartments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid REFERENCES hosts(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  address text,
  city text,
  check_in_instructions text,
  wifi_name text,
  wifi_password text,
  whatsapp_number text,
  created_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true
);
ALTER TABLE apartments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hosts manage own apartments" ON apartments
  FOR ALL USING (host_id = auth.uid());
CREATE INDEX idx_apartments_host_id ON apartments(host_id);
CREATE INDEX idx_apartments_whatsapp ON apartments(whatsapp_number);

-- KNOWLEDGE BASE
CREATE TABLE knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id uuid REFERENCES apartments(id) ON DELETE CASCADE NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  created_at timestamptz DEFAULT now(),
  times_used integer DEFAULT 0
);
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hosts manage own kb" ON knowledge_base
  FOR ALL USING (
    apartment_id IN (SELECT id FROM apartments WHERE host_id = auth.uid())
  );
CREATE INDEX idx_kb_apartment_id ON knowledge_base(apartment_id);

-- GUESTS
CREATE TABLE guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid REFERENCES hosts(id) ON DELETE CASCADE NOT NULL,
  phone text NOT NULL,
  name text,
  language text,
  first_seen timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now(),
  total_stays integer DEFAULT 0,
  notes text,
  UNIQUE(host_id, phone)
);
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hosts manage own guests" ON guests
  FOR ALL USING (host_id = auth.uid());
CREATE INDEX idx_guests_host_phone ON guests(host_id, phone);

-- BOOKINGS
CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id uuid REFERENCES apartments(id) ON DELETE CASCADE NOT NULL,
  guest_id uuid REFERENCES guests(id) ON DELETE CASCADE NOT NULL,
  check_in date NOT NULL,
  check_out date NOT NULL,
  status text DEFAULT 'active',   -- active | completed | cancelled
  source text,                    -- airbnb | booking | direct | other
  created_at timestamptz DEFAULT now()
);
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hosts manage own bookings" ON bookings
  FOR ALL USING (
    apartment_id IN (SELECT id FROM apartments WHERE host_id = auth.uid())
  );
CREATE INDEX idx_bookings_apartment_id ON bookings(apartment_id);
CREATE INDEX idx_bookings_guest_id ON bookings(guest_id);
CREATE INDEX idx_bookings_status_dates ON bookings(status, check_in, check_out);

-- Auto-increment total_stays when a booking is created
CREATE OR REPLACE FUNCTION increment_guest_total_stays()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE guests SET total_stays = total_stays + 1 WHERE id = NEW.guest_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_booking_increment_stays
  AFTER INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION increment_guest_total_stays();

-- MESSAGES
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  apartment_id uuid REFERENCES apartments(id) ON DELETE SET NULL NOT NULL,
  guest_id uuid REFERENCES guests(id) ON DELETE SET NULL NOT NULL,
  direction text NOT NULL,           -- inbound | outbound
  content text NOT NULL,
  was_ai_reply boolean DEFAULT false,
  was_escalated boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hosts read own messages" ON messages
  FOR ALL USING (
    apartment_id IN (SELECT id FROM apartments WHERE host_id = auth.uid())
  );
CREATE INDEX idx_messages_booking_id ON messages(booking_id);
CREATE INDEX idx_messages_guest_id ON messages(guest_id);
CREATE INDEX idx_messages_apartment_id ON messages(apartment_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);

-- ESCALATIONS
CREATE TABLE escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  apartment_id uuid REFERENCES apartments(id) ON DELETE SET NULL NOT NULL,
  guest_id uuid REFERENCES guests(id) ON DELETE SET NULL NOT NULL,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  guest_question text NOT NULL,
  status text DEFAULT 'open',        -- open | resolved
  host_reply text,
  resolved_at timestamptz,
  save_to_kb boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE escalations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hosts manage own escalations" ON escalations
  FOR ALL USING (
    apartment_id IN (SELECT id FROM apartments WHERE host_id = auth.uid())
  );
CREATE INDEX idx_escalations_status ON escalations(status);
CREATE INDEX idx_escalations_apartment_id ON escalations(apartment_id);

-- KB times_used atomic increment (called by bot after successful AI answer)
CREATE OR REPLACE FUNCTION increment_kb_times_used(p_apartment_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE knowledge_base
  SET times_used = times_used + 1
  WHERE apartment_id = p_apartment_id;
$$;
