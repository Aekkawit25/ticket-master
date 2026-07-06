-- ============================================================
-- Air Ticket Stock Management — Initial Schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Master Data Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS countries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS airlines (
  airline_code VARCHAR(10) PRIMARY KEY,
  airline_name VARCHAR(100) NOT NULL,
  airline_logo TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS airports (
  airport_code VARCHAR(10) PRIMARY KEY,
  airport_name VARCHAR(150) NOT NULL,
  city VARCHAR(100),
  country VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'Staff' CHECK (role IN ('Admin','Manager','Staff','Viewer')),
  status VARCHAR(20) NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Condition Templates (Master Template — NOT linked to PNR directly)
-- ============================================================

CREATE TABLE IF NOT EXISTS condition_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_code VARCHAR(50) UNIQUE NOT NULL,
  template_name VARCHAR(150) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS condition_template_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES condition_templates(id) ON DELETE CASCADE,
  stage_no INT NOT NULL,
  stage_name VARCHAR(100) NOT NULL,
  payment_type VARCHAR(50) NOT NULL CHECK (payment_type IN ('Deposit','Final Payment','Full Payment','Other')),
  amount_type VARCHAR(20) NOT NULL CHECK (amount_type IN ('Fixed','Percent','Remaining')),
  amount_value NUMERIC(15,2) NOT NULL DEFAULT 0,
  base_date_type VARCHAR(30) NOT NULL DEFAULT 'Travel Start' CHECK (base_date_type IN ('Travel Start','Created Date','Custom Date')),
  due_days_before INT NOT NULL DEFAULT 0,
  ttl_time VARCHAR(5) NOT NULL DEFAULT '18:00',
  status VARCHAR(20) NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Flight Series (Stock)
-- ============================================================

CREATE TABLE IF NOT EXISTS flight_series (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stock_code VARCHAR(50) UNIQUE NOT NULL,
  ticket_type VARCHAR(20) NOT NULL CHECK (ticket_type IN ('Group','FIT','Ticket + Land')),
  trip_type VARCHAR(20) NOT NULL DEFAULT 'Round-trip' CHECK (trip_type IN ('One-way','Round-trip','Multi-city')),
  group_name VARCHAR(200) NOT NULL,
  country_id UUID REFERENCES countries(id),
  destination VARCHAR(200),
  airline_code VARCHAR(10) NOT NULL REFERENCES airlines(airline_code),
  route_text VARCHAR(100),
  period_start DATE,
  period_end DATE,
  currency VARCHAR(10) NOT NULL DEFAULT 'THB',
  status VARCHAR(20) NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Active','Closed','Cancelled')),
  remark TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Flight Sectors (Template — not actual travel date)
-- ============================================================

CREATE TABLE IF NOT EXISTS flight_series_sector (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  series_id UUID NOT NULL REFERENCES flight_series(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  sector_type VARCHAR(20) NOT NULL CHECK (sector_type IN ('Outbound','Transit','Domestic','Return')),
  airline_code VARCHAR(10) NOT NULL,
  flight_no VARCHAR(20) NOT NULL,
  dep_airport_code VARCHAR(10) NOT NULL,
  arr_airport_code VARCHAR(10) NOT NULL,
  dep_time VARCHAR(5) NOT NULL DEFAULT '00:00',
  arr_time VARCHAR(5) NOT NULL DEFAULT '00:00',
  relative_day_type VARCHAR(20) NOT NULL DEFAULT 'Travel Start' CHECK (relative_day_type IN ('Travel Start','Return Date','Custom Day')),
  relative_day_no INT NOT NULL DEFAULT 1,
  day_offset INT NOT NULL DEFAULT 0,
  remark TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(series_id, seq)
);

-- ============================================================
-- Stock Conditions (Linked to a specific Stock)
-- ============================================================

CREATE TABLE IF NOT EXISTS flight_series_condition (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  series_id UUID NOT NULL REFERENCES flight_series(id) ON DELETE CASCADE,
  condition_code VARCHAR(50) NOT NULL,
  condition_name VARCHAR(150) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(series_id, condition_code)
);

CREATE TABLE IF NOT EXISTS flight_series_condition_stage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  condition_id UUID NOT NULL REFERENCES flight_series_condition(id) ON DELETE CASCADE,
  stage_no INT NOT NULL,
  stage_name VARCHAR(100) NOT NULL,
  payment_type VARCHAR(50) NOT NULL CHECK (payment_type IN ('Deposit','Final Payment','Full Payment','Other')),
  amount_type VARCHAR(20) NOT NULL CHECK (amount_type IN ('Fixed','Percent','Remaining')),
  amount_value NUMERIC(15,2) NOT NULL DEFAULT 0,
  base_date_type VARCHAR(30) NOT NULL DEFAULT 'Travel Start',
  due_days_before INT NOT NULL DEFAULT 0,
  ttl_time VARCHAR(5) NOT NULL DEFAULT '18:00',
  status VARCHAR(20) NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PNR (Actual travel booking — holds travel dates and seats)
-- ============================================================

CREATE TABLE IF NOT EXISTS flight_series_pnr (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  series_id UUID NOT NULL REFERENCES flight_series(id) ON DELETE CASCADE,
  condition_id UUID REFERENCES flight_series_condition(id) ON SET NULL,
  pnr_code VARCHAR(20),
  dummy_pnr VARCHAR(30),
  travel_start DATE,
  duration_days INT,
  travel_end DATE,
  seat_total INT NOT NULL DEFAULT 0,
  seat_used INT NOT NULL DEFAULT 0,
  seat_balance INT GENERATED ALWAYS AS (seat_total - seat_used) STORED,
  fare NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(15,2) GENERATED ALWAYS AS (fare + tax) STORED,
  next_ttl_datetime TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Confirmed','Ticketed','Cancelled','Expired','Closed')),
  remark TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Payment Schedule
-- ============================================================

CREATE TABLE IF NOT EXISTS flight_pnr_payment_schedule (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  series_id UUID NOT NULL REFERENCES flight_series(id),
  pnr_id UUID NOT NULL REFERENCES flight_series_pnr(id) ON DELETE CASCADE,
  condition_id UUID NOT NULL REFERENCES flight_series_condition(id),
  condition_stage_id UUID NOT NULL REFERENCES flight_series_condition_stage(id),
  stage_no INT NOT NULL,
  stage_name VARCHAR(100) NOT NULL,
  payment_type VARCHAR(50) NOT NULL,
  amount_due NUMERIC(15,2) NOT NULL DEFAULT 0,
  due_date DATE,
  ttl_datetime TIMESTAMPTZ,
  paid_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  payment_status VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (payment_status IN ('Pending','Paid','Overdue','Waived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Booking Seat Usage
-- ============================================================

CREATE TABLE IF NOT EXISTS booking_seat_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  series_id UUID NOT NULL REFERENCES flight_series(id),
  pnr_id UUID NOT NULL REFERENCES flight_series_pnr(id),
  booking_no VARCHAR(50),
  customer_name VARCHAR(100),
  seat_used INT NOT NULL DEFAULT 1,
  used_date DATE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Activity Logs
-- ============================================================

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module_name VARCHAR(50) NOT NULL,
  ref_id UUID,
  action VARCHAR(100) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_flight_series_status ON flight_series(status);
CREATE INDEX IF NOT EXISTS idx_flight_series_ticket_type ON flight_series(ticket_type);
CREATE INDEX IF NOT EXISTS idx_flight_series_airline ON flight_series(airline_code);
CREATE INDEX IF NOT EXISTS idx_flight_series_pnr_series ON flight_series_pnr(series_id);
CREATE INDEX IF NOT EXISTS idx_flight_series_pnr_status ON flight_series_pnr(status);
CREATE INDEX IF NOT EXISTS idx_payment_schedule_pnr ON flight_pnr_payment_schedule(pnr_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedule_status ON flight_pnr_payment_schedule(payment_status);
CREATE INDEX IF NOT EXISTS idx_activity_logs_ref ON activity_logs(ref_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_module ON activity_logs(module_name);

-- ============================================================
-- Seed: Default Airlines
-- ============================================================

INSERT INTO airlines (airline_code, airline_name, status) VALUES
  ('TG', 'Thai Airways', 'Active'),
  ('FD', 'Thai AirAsia', 'Active'),
  ('DD', 'Nok Air', 'Active'),
  ('PG', 'Bangkok Airways', 'Active'),
  ('JL', 'Japan Airlines', 'Active'),
  ('NH', 'ANA (All Nippon Airways)', 'Active'),
  ('KE', 'Korean Air', 'Active'),
  ('OZ', 'Asiana Airlines', 'Active'),
  ('CX', 'Cathay Pacific', 'Active'),
  ('SQ', 'Singapore Airlines', 'Active'),
  ('MH', 'Malaysia Airlines', 'Active'),
  ('EK', 'Emirates', 'Active'),
  ('QR', 'Qatar Airways', 'Active'),
  ('BA', 'British Airways', 'Active'),
  ('LH', 'Lufthansa', 'Active'),
  ('AF', 'Air France', 'Active'),
  ('CA', 'Air China', 'Active'),
  ('MU', 'China Eastern', 'Active'),
  ('VN', 'Vietnam Airlines', 'Active'),
  ('CI', 'China Airlines', 'Active')
ON CONFLICT (airline_code) DO NOTHING;

-- ============================================================
-- Seed: Default Airports
-- ============================================================

INSERT INTO airports (airport_code, airport_name, city, country, status) VALUES
  ('BKK', 'Suvarnabhumi Airport', 'Bangkok', 'Thailand', 'Active'),
  ('DMK', 'Don Mueang International Airport', 'Bangkok', 'Thailand', 'Active'),
  ('NRT', 'Narita International Airport', 'Tokyo', 'Japan', 'Active'),
  ('HND', 'Haneda Airport', 'Tokyo', 'Japan', 'Active'),
  ('KIX', 'Kansai International Airport', 'Osaka', 'Japan', 'Active'),
  ('ICN', 'Incheon International Airport', 'Seoul', 'South Korea', 'Active'),
  ('HKG', 'Hong Kong International Airport', 'Hong Kong', 'China', 'Active'),
  ('SIN', 'Singapore Changi Airport', 'Singapore', 'Singapore', 'Active'),
  ('KUL', 'Kuala Lumpur International Airport', 'Kuala Lumpur', 'Malaysia', 'Active'),
  ('LHR', 'London Heathrow Airport', 'London', 'United Kingdom', 'Active'),
  ('CDG', 'Paris Charles de Gaulle Airport', 'Paris', 'France', 'Active'),
  ('FRA', 'Frankfurt Airport', 'Frankfurt', 'Germany', 'Active'),
  ('DXB', 'Dubai International Airport', 'Dubai', 'UAE', 'Active'),
  ('DOH', 'Hamad International Airport', 'Doha', 'Qatar', 'Active'),
  ('PEK', 'Beijing Capital International Airport', 'Beijing', 'China', 'Active'),
  ('PVG', 'Shanghai Pudong International Airport', 'Shanghai', 'China', 'Active'),
  ('HAN', 'Noi Bai International Airport', 'Hanoi', 'Vietnam', 'Active'),
  ('SGN', 'Tan Son Nhat International Airport', 'Ho Chi Minh City', 'Vietnam', 'Active'),
  ('SYD', 'Sydney Airport', 'Sydney', 'Australia', 'Active'),
  ('LAX', 'Los Angeles International Airport', 'Los Angeles', 'USA', 'Active'),
  ('TPE', 'Taiwan Taoyuan International Airport', 'Taipei', 'Taiwan', 'Active')
ON CONFLICT (airport_code) DO NOTHING;

-- ============================================================
-- Seed: Default Countries
-- ============================================================

INSERT INTO countries (country_name, status) VALUES
  ('Japan', 'Active'),
  ('South Korea', 'Active'),
  ('China', 'Active'),
  ('Hong Kong', 'Active'),
  ('Taiwan', 'Active'),
  ('Singapore', 'Active'),
  ('Malaysia', 'Active'),
  ('Vietnam', 'Active'),
  ('Thailand', 'Active'),
  ('United Kingdom', 'Active'),
  ('France', 'Active'),
  ('Germany', 'Active'),
  ('Italy', 'Active'),
  ('Switzerland', 'Active'),
  ('UAE', 'Active'),
  ('Qatar', 'Active'),
  ('Australia', 'Active'),
  ('USA', 'Active'),
  ('Canada', 'Active'),
  ('New Zealand', 'Active')
ON CONFLICT DO NOTHING;
