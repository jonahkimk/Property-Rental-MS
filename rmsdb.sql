-- ============================================================
--  RENTAL MANAGEMENT SYSTEM - PostgreSQL Database Schema v2
--  Stack: React + Node.js + PostgreSQL
-- ============================================================

-- Enable UUID extension for secure primary keys
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. PROPERTIES
-- Each property has its own separate dashboard (per design doc)
-- ============================================================
CREATE TABLE properties (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(150) NOT NULL,
    address         TEXT NOT NULL,
    city            VARCHAR(100),
    county          VARCHAR(100),
    total_units     INTEGER NOT NULL DEFAULT 0,
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. USERS (All roles in one table — role-based access)
-- Roles: 'manager', 'landlord', 'tenant'
-- Theme and font size are handled on the frontend (localStorage/context)
-- ============================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name       VARCHAR(150) NOT NULL,
    email           VARCHAR(150) UNIQUE,
    phone           VARCHAR(20),
    role            VARCHAR(20) NOT NULL CHECK (role IN ('manager', 'landlord', 'tenant')),
    username        VARCHAR(100) UNIQUE NOT NULL,               -- unit number for tenants e.g. "1A"
    password_hash   VARCHAR(255) NOT NULL,                      -- bcrypt hashed
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. UNITS / HOUSES
-- monthly_rent is set by the manager upon unit registration — no default
-- ============================================================
CREATE TABLE units (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    unit_number     VARCHAR(20) NOT NULL,                       -- e.g. "1A", "2B", "SHOP 1"
    unit_type       VARCHAR(50),                                -- e.g. "bedsitter", "1BR", "shop"
    floor           VARCHAR(20),
    monthly_rent    NUMERIC(12,2) NOT NULL,                     -- entered by manager at unit creation
    is_occupied     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(property_id, unit_number)
);

-- ============================================================
-- 4. TENANTS
-- Links a user (role=tenant) to a unit
-- ============================================================
CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    unit_id         UUID NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
    property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    landlord_id     UUID REFERENCES users(id),
    lease_start     DATE NOT NULL,
    lease_end       DATE,
    deposit_amount  NUMERIC(12,2) DEFAULT 0.00,
    deposit_paid    BOOLEAN DEFAULT FALSE,
    emergency_contact_name    VARCHAR(150),
    emergency_contact_phone   VARCHAR(20),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. LANDLORD <-> PROPERTY ASSIGNMENT
-- ============================================================
CREATE TABLE landlord_properties (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    landlord_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    assigned_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(landlord_id, property_id)
);

-- ============================================================
-- 6. UTILITY METERS
-- One meter per utility type per unit
-- ============================================================
CREATE TABLE utility_meters (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    unit_id         UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    utility_type    VARCHAR(20) NOT NULL CHECK (utility_type IN ('water', 'electricity', 'garbage')),
    meter_number    VARCHAR(50),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(unit_id, utility_type)
);

-- ============================================================
-- 7. UTILITY RATES
-- Rates are configurable per property and utility type.
-- A new row is inserted whenever the manager changes the rate.
-- effective_from determines which rate applies to a billing month.
-- ============================================================
CREATE TABLE utility_rates (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    utility_type    VARCHAR(20) NOT NULL CHECK (utility_type IN ('water', 'electricity', 'garbage')),
    rate_per_unit   NUMERIC(10,2) NOT NULL,                     -- KSH per unit; set by manager
    effective_from  DATE NOT NULL,                              -- applies from this date onwards
    set_by          UUID REFERENCES users(id),                  -- manager who configured the rate
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 8. UTILITY READINGS
-- Monthly meter readings per unit.
-- reading_start is auto-populated from the previous month's reading_end
-- via the trigger below. Landlord only needs to enter reading_end.
-- On first-time setup (no prior record), landlord enters reading_start manually.
-- rate_per_unit is looked up from utility_rates at the time of capture.
-- ============================================================
CREATE TABLE utility_readings (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meter_id            UUID NOT NULL REFERENCES utility_meters(id) ON DELETE RESTRICT,
    unit_id             UUID NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
    property_id         UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    recorded_by         UUID REFERENCES users(id),              -- landlord who captured the reading
    billing_month       DATE NOT NULL,                          -- e.g. 2026-01-01 = January 2026
    reading_start       NUMERIC(10,3) NOT NULL,                 -- auto-populated from previous month's reading_end
    reading_end         NUMERIC(10,3) NOT NULL,                 -- entered by landlord
    consumption_units   NUMERIC(10,3) GENERATED ALWAYS AS (reading_end - reading_start) STORED,
    rate_per_unit       NUMERIC(10,2) NOT NULL,                 -- copied from utility_rates at time of capture
    total_bill          NUMERIC(12,2) GENERATED ALWAYS AS ((reading_end - reading_start) * rate_per_unit) STORED,
    is_submitted        BOOLEAN NOT NULL DEFAULT FALSE,         -- supports offline capture; submit when online
    submitted_at        TIMESTAMP,
    notes               TEXT,
    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(unit_id, meter_id, billing_month)
);

-- ============================================================
-- 9. INVOICES
-- rent_amount is snapshotted from units.monthly_rent at the time
-- of invoice generation so historical records stay accurate even
-- if the rent is later updated.
-- ============================================================
CREATE TABLE invoices (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    unit_id         UUID NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
    property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    billing_month   DATE NOT NULL,
    rent_amount     NUMERIC(12,2) NOT NULL,                     -- snapshot of unit rent at invoice generation time
    water_bill      NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    electricity_bill NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    garbage_bill    NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    penalty_amount  NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    penalty_reason  VARCHAR(255),
    total_amount    NUMERIC(12,2) GENERATED ALWAYS AS (
                        rent_amount + water_bill + electricity_bill + garbage_bill + penalty_amount
                    ) STORED,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'paid', 'overdue', 'partial')),
    due_date        DATE NOT NULL,
    generated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, billing_month)
);

-- ============================================================
-- 10. PAYMENTS
-- ============================================================
CREATE TABLE payments (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id          UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    property_id         UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    amount_paid         NUMERIC(12,2) NOT NULL,
    payment_method      VARCHAR(20) NOT NULL CHECK (payment_method IN ('mpesa', 'bank', 'cash')),
    mpesa_code          VARCHAR(50),
    bank_reference      VARCHAR(100),
    received_by         UUID REFERENCES users(id),
    payment_date        TIMESTAMP NOT NULL DEFAULT NOW(),
    notes               TEXT,
    created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 11. REQUEST TICKETS
-- tenant_name and unit_number are stored as snapshots so the ticket
-- remains readable even if the tenant later moves or is deleted.
-- ============================================================
CREATE TABLE request_tickets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tenant_name     VARCHAR(150) NOT NULL,                      -- snapshot of users.full_name
    unit_number     VARCHAR(20) NOT NULL,                       -- snapshot of units.unit_number
    property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    unit_id         UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    subject         VARCHAR(255) NOT NULL,
    description     TEXT NOT NULL,
    category        VARCHAR(50) DEFAULT 'general'
                        CHECK (category IN ('plumbing', 'electrical', 'security', 'cleaning', 'general', 'other')),
    priority        VARCHAR(20) DEFAULT 'normal'
                        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    status          VARCHAR(20) NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    resolved_at     TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Ticket replies — sender_name stored for display without extra joins
CREATE TABLE ticket_replies (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id       UUID NOT NULL REFERENCES request_tickets(id) ON DELETE CASCADE,
    sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_name     VARCHAR(150) NOT NULL,                      -- snapshot of users.full_name
    message         TEXT NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 12. MESSAGES (Communication Platform)
-- Sender and recipient names stored for display without extra joins.
-- recipient_id NULL = broadcast to all tenants in the property.
-- ============================================================
CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_name     VARCHAR(150) NOT NULL,                      -- snapshot of users.full_name
    recipient_id    UUID REFERENCES users(id),
    recipient_name  VARCHAR(150),                               -- NULL when broadcast to all
    subject         VARCHAR(255),
    body            TEXT NOT NULL,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 13. NOTIFICATIONS
-- Sender and recipient names stored directly on the record.
-- recipient_id NULL = broadcast to all tenants in the property.
-- Read tracking removed (notification_reads table dropped).
-- ============================================================
CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    sent_by         UUID NOT NULL REFERENCES users(id),
    sender_name     VARCHAR(150) NOT NULL,                      -- snapshot of users.full_name
    recipient_id    UUID REFERENCES users(id),
    recipient_name  VARCHAR(150),                               -- NULL when broadcast
    title           VARCHAR(255) NOT NULL,
    message         TEXT NOT NULL,
    channel         VARCHAR(20)[] NOT NULL DEFAULT '{"in_app"}', -- ['in_app','sms','email']
    target_role     VARCHAR(20) DEFAULT 'tenant',
    is_scheduled    BOOLEAN NOT NULL DEFAULT FALSE,
    scheduled_at    TIMESTAMP,
    sent_at         TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 14. MAINTENANCE & INSPECTIONS
-- ============================================================
CREATE TABLE maintenance_schedules (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id         UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    unit_id             UUID REFERENCES units(id),
    assigned_to         UUID REFERENCES users(id),
    title               VARCHAR(255) NOT NULL,
    description         TEXT,
    maintenance_type    VARCHAR(50) CHECK (maintenance_type IN ('inspection', 'repair', 'cleaning', 'upgrade', 'other')),
    scheduled_date      DATE NOT NULL,
    completed_date      DATE,
    status              VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                            CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
    cost                NUMERIC(12,2) DEFAULT 0.00,
    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 15. FINANCIAL SUMMARIES (Manager dashboard cache)
-- ============================================================
CREATE TABLE financial_summaries (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id                 UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    report_month                DATE NOT NULL,
    total_rent_billed           NUMERIC(12,2) DEFAULT 0.00,
    total_rent_collected        NUMERIC(12,2) DEFAULT 0.00,
    total_utilities_billed      NUMERIC(12,2) DEFAULT 0.00,
    total_water_billed          NUMERIC(12,2) DEFAULT 0.00,
    total_electricity_billed    NUMERIC(12,2) DEFAULT 0.00,
    total_garbage_billed        NUMERIC(12,2) DEFAULT 0.00,
    total_penalties             NUMERIC(12,2) DEFAULT 0.00,
    total_outstanding           NUMERIC(12,2) DEFAULT 0.00,
    occupancy_rate              NUMERIC(5,2)  DEFAULT 0.00,
    generated_at                TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(property_id, report_month)
);

-- ============================================================
-- 16. AUDIT LOG
-- ip_address removed. Tracks user, action, and before/after values.
-- ============================================================
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id),
    action          VARCHAR(100) NOT NULL,                      -- e.g. 'PAYMENT_RECORDED', 'TENANT_DELETED'
    table_name      VARCHAR(50),
    record_id       UUID,
    old_values      JSONB,
    new_values      JSONB,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_units_property             ON units(property_id);
CREATE INDEX idx_tenants_property           ON tenants(property_id);
CREATE INDEX idx_tenants_unit               ON tenants(unit_id);
CREATE INDEX idx_invoices_tenant            ON invoices(tenant_id);
CREATE INDEX idx_invoices_month             ON invoices(billing_month);
CREATE INDEX idx_invoices_status            ON invoices(status);
CREATE INDEX idx_payments_invoice           ON payments(invoice_id);
CREATE INDEX idx_payments_tenant            ON payments(tenant_id);
CREATE INDEX idx_payments_date              ON payments(payment_date);
CREATE INDEX idx_utility_rates_lookup       ON utility_rates(property_id, utility_type, effective_from DESC);
CREATE INDEX idx_utility_readings_unit      ON utility_readings(unit_id);
CREATE INDEX idx_utility_readings_meter     ON utility_readings(meter_id);
CREATE INDEX idx_utility_readings_month     ON utility_readings(billing_month);
CREATE INDEX idx_notifications_property     ON notifications(property_id);
CREATE INDEX idx_notifications_recipient    ON notifications(recipient_id);
CREATE INDEX idx_notifications_scheduled    ON notifications(scheduled_at) WHERE is_scheduled = TRUE;
CREATE INDEX idx_tickets_tenant             ON request_tickets(tenant_id);
CREATE INDEX idx_tickets_status             ON request_tickets(status);
CREATE INDEX idx_messages_recipient         ON messages(recipient_id);
CREATE INDEX idx_messages_sender            ON messages(sender_id);
CREATE INDEX idx_audit_logs_user            ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created         ON audit_logs(created_at);

-- ============================================================
-- TRIGGER FUNCTION: Auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_properties_updated       BEFORE UPDATE ON properties              FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_users_updated            BEFORE UPDATE ON users                   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_units_updated            BEFORE UPDATE ON units                   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_tenants_updated          BEFORE UPDATE ON tenants                 FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_readings_updated         BEFORE UPDATE ON utility_readings        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_invoices_updated         BEFORE UPDATE ON invoices                FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_tickets_updated          BEFORE UPDATE ON request_tickets         FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_maintenance_updated      BEFORE UPDATE ON maintenance_schedules   FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TRIGGER: Auto-sync unit occupancy on tenant insert/update
-- ============================================================
CREATE OR REPLACE FUNCTION sync_unit_occupancy()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.is_active = TRUE THEN
        UPDATE units SET is_occupied = TRUE  WHERE id = NEW.unit_id;
    ELSIF TG_OP = 'UPDATE' AND NEW.is_active = FALSE THEN
        UPDATE units SET is_occupied = FALSE WHERE id = NEW.unit_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenant_occupancy
    AFTER INSERT OR UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION sync_unit_occupancy();

-- ============================================================
-- TRIGGER: Auto-populate reading_start from previous month's reading_end
--
-- How it works:
--   When a new utility reading row is inserted, the trigger looks up
--   the most recent reading_end for the same meter (earlier billing month).
--   If found, it sets reading_start = that value automatically.
--   If NOT found (first-time setup), the landlord must supply reading_start.
--   If the landlord explicitly passes a non-zero reading_start, it is kept as-is.
-- ============================================================
CREATE OR REPLACE FUNCTION auto_populate_reading_start()
RETURNS TRIGGER AS $$
DECLARE
    prev_end NUMERIC(10,3);
BEGIN
    SELECT reading_end
    INTO   prev_end
    FROM   utility_readings
    WHERE  meter_id       = NEW.meter_id
      AND  billing_month  < NEW.billing_month
    ORDER  BY billing_month DESC
    LIMIT  1;

    IF prev_end IS NOT NULL AND (NEW.reading_start IS NULL OR NEW.reading_start = 0) THEN
        NEW.reading_start := prev_end;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_reading_start
    BEFORE INSERT ON utility_readings
    FOR EACH ROW EXECUTE FUNCTION auto_populate_reading_start();

-- ============================================================
-- VIEW: Current utility rate per property & utility type
-- Returns the latest effective rate — used when capturing readings
-- ============================================================
CREATE VIEW current_utility_rates AS
SELECT DISTINCT ON (property_id, utility_type)
    property_id,
    utility_type,
    rate_per_unit,
    effective_from,
    set_by
FROM utility_rates
ORDER BY property_id, utility_type, effective_from DESC;

-- ============================================================
-- VIEW: Utility report — matches water bill PDF layout exactly
-- Usage: SELECT * FROM v_utility_report
--        WHERE billing_month = '2026-01-01'
--          AND utility_type  = 'water'
--          AND property_id   = '<uuid>';
-- ============================================================
CREATE VIEW v_utility_report AS
SELECT
    p.id                                        AS property_id,
    p.name                                      AS property_name,
    u.unit_number                               AS house_no,
    um.utility_type,
    ur.billing_month,
    ur.reading_start,
    ur.reading_end,
    ur.consumption_units,
    ur.rate_per_unit,
    ur.total_bill,
    ur.is_submitted
FROM utility_readings ur
JOIN utility_meters um  ON ur.meter_id    = um.id
JOIN units u            ON ur.unit_id     = u.id
JOIN properties p       ON ur.property_id = p.id
ORDER BY u.unit_number;