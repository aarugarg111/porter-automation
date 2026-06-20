CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY, nickname TEXT NOT NULL, relationship TEXT NOT NULL,
  contact_person TEXT, phone TEXT, address TEXT, lat REAL, lng REAL,
  default_direction TEXT, default_vehicle TEXT, default_payer TEXT DEFAULT 'ME',
  landmark_notes TEXT, is_home INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY, direction TEXT NOT NULL,
  pickup_location_id INTEGER, drop_location_id INTEGER, status TEXT NOT NULL DEFAULT 'INTENT',
  porter_order_id TEXT, driver_name TEXT, driver_phone TEXT, amount INTEGER,
  payer TEXT NOT NULL DEFAULT 'ME', payment_status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT, payment_qr_url TEXT, payment_upi_id TEXT, drop_address_text TEXT,
  expected_minutes INTEGER, started_at TEXT, reached_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY, delivery_id INTEGER NOT NULL, status TEXT NOT NULL,
  source TEXT NOT NULL, raw_text TEXT, created_at TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'status');
CREATE TABLE IF NOT EXISTS capture_inbox (
  id INTEGER PRIMARY KEY, raw_text TEXT NOT NULL, parsed_json TEXT, created_at TEXT NOT NULL);
