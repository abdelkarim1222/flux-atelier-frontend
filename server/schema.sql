CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('administration', 'chef_atelier', 'reception', 'chef_equipe')),
  assigned_team TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vehicles (
  id BIGSERIAL PRIMARY KEY,
  record_type TEXT NOT NULL CHECK (record_type IN ('flux', 'reception', 'vin')),
  record_key TEXT NOT NULL,
  no_or TEXT,
  chassis TEXT,
  team TEXT,
  status TEXT,
  advancement TEXT,
  location TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (record_type, record_key)
);

CREATE INDEX IF NOT EXISTS vehicles_no_or_idx ON vehicles (no_or);
CREATE INDEX IF NOT EXISTS vehicles_chassis_idx ON vehicles (chassis);
CREATE INDEX IF NOT EXISTS vehicles_team_idx ON vehicles (team);
CREATE INDEX IF NOT EXISTS vehicles_status_idx ON vehicles (status);

CREATE SEQUENCE IF NOT EXISTS vehicle_inventory_source_row_seq;

CREATE TABLE IF NOT EXISTS vehicle_inventory (
  source_row BIGINT PRIMARY KEY DEFAULT nextval('vehicle_inventory_source_row_seq'),
  serial_no TEXT NOT NULL,
  vin TEXT,
  vin_key TEXT,
  brand_code TEXT,
  model_code TEXT,
  model_description TEXT,
  registration TEXT,
  stock_status TEXT,
  warehouse_code TEXT,
  location_code TEXT,
  customer_code TEXT,
  customer_name TEXT,
  raw_data JSONB NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vehicle_inventory
  ALTER COLUMN source_row SET DEFAULT nextval('vehicle_inventory_source_row_seq');
ALTER SEQUENCE vehicle_inventory_source_row_seq OWNED BY vehicle_inventory.source_row;
ALTER TABLE vehicle_inventory ADD COLUMN IF NOT EXISTS vin_key TEXT;

DELETE FROM vehicle_inventory a
USING vehicle_inventory b
WHERE a.source_row < b.source_row
  AND a.vin IS NOT NULL
  AND b.vin IS NOT NULL
  AND BTRIM(a.vin) <> ''
  AND UPPER(BTRIM(a.vin)) = UPPER(BTRIM(b.vin));

UPDATE vehicle_inventory
SET vin_key = NULLIF(UPPER(BTRIM(vin)), '')
WHERE vin_key IS DISTINCT FROM NULLIF(UPPER(BTRIM(vin)), '');

SELECT setval(
  'vehicle_inventory_source_row_seq',
  GREATEST(COALESCE(MAX(source_row), 1), (SELECT last_value FROM vehicle_inventory_source_row_seq)),
  TRUE
)
FROM vehicle_inventory;

CREATE INDEX IF NOT EXISTS vehicle_inventory_serial_idx ON vehicle_inventory (serial_no);
CREATE INDEX IF NOT EXISTS vehicle_inventory_vin_idx ON vehicle_inventory (vin);
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_inventory_vin_key_uidx ON vehicle_inventory (vin_key) WHERE vin_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS vehicle_inventory_registration_idx ON vehicle_inventory (registration);
CREATE INDEX IF NOT EXISTS vehicle_inventory_customer_idx ON vehicle_inventory (customer_code);

CREATE TABLE IF NOT EXISTS app_records (
  collection TEXT NOT NULL CHECK (collection IN (
    'teams', 'averages', 'purchases', 'quotes', 'essai_controls',
    'vehicle_times', 'transfers', 'reassignments', 'essais', 'devis_notifications', 'entree_notifications'
  )),
  record_key TEXT NOT NULL,
  vehicle_key TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (collection, record_key)
);

CREATE INDEX IF NOT EXISTS app_records_vehicle_idx ON app_records (vehicle_key);
CREATE INDEX IF NOT EXISTS app_records_collection_updated_idx ON app_records (collection, updated_at DESC);

ALTER TABLE app_records DROP CONSTRAINT IF EXISTS app_records_collection_check;
ALTER TABLE app_records ADD CONSTRAINT app_records_collection_check CHECK (collection IN (
  'teams', 'averages', 'purchases', 'quotes', 'essai_controls',
  'vehicle_times', 'transfers', 'reassignments', 'essais', 'devis_notifications', 'entree_notifications'
));
