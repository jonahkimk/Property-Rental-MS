const pool = require('../config/db');
const { ok, fail } = require('../utils/response');

// ── GET /api/utilities/rates ──────────────────────────────────
const getRates = async (req, res) => {
  const propId = req.query.property_id || req.user.property_id || null;
  try {
    // current_utility_rates view returns latest rate per property+type
    const { rows } = await pool.query(
      `SELECT * FROM current_utility_rates
        WHERE ($1::uuid IS NULL OR property_id = $1)
        ORDER BY utility_type`,
      [propId]
    );
    return ok(res, rows);
  } catch (err) {
    console.error('getRates:', err);
    return fail(res, 'Failed to fetch utility rates.', 500);
  }
};

// ── POST /api/utilities/rates ─────────────────────────────────
const setRate = async (req, res) => {
  const { utility_type, rate_per_unit, effective_from, property_id } = req.body;
  if (!utility_type || !rate_per_unit)
    return fail(res, 'utility_type and rate_per_unit are required.', 400);

  const propId = property_id || req.user.property_id;
  if (!propId) return fail(res, 'property_id is required.', 400);

  try {
    const { rows } = await pool.query(
      `INSERT INTO utility_rates
         (property_id, utility_type, rate_per_unit, effective_from, set_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [propId, utility_type,
       parseFloat(rate_per_unit),
       effective_from || new Date().toISOString().split('T')[0],
       req.user.id]
    );
    return ok(res, rows[0], 'Rate updated.', 201);
  } catch (err) {
    console.error('setRate:', err);
    return fail(res, 'Failed to set rate.', 500);
  }
};

// ── GET /api/utilities/prev-readings ─────────────────────────
// Returns the most recent reading_end per meter for use as opening readings
// utility_type lives on utility_meters, NOT on utility_readings
const getPrevReadings = async (req, res) => {
  const { utility_type, billing_month } = req.query;
  const propId = req.query.property_id || req.user.property_id || null;

  if (!utility_type) return fail(res, 'utility_type is required.', 400);

  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (ur.unit_id)
              ur.unit_id,
              u.unit_number,
              ur.reading_end   AS prev_reading,
              ur.billing_month AS prev_month,
              um.meter_number,
              um.id            AS meter_id
         FROM utility_readings ur
         JOIN utility_meters um ON um.id       = ur.meter_id
         JOIN units          u  ON u.id        = ur.unit_id
        WHERE um.utility_type = $1
          AND ($2::uuid IS NULL OR ur.property_id = $2)
          AND ($3::date IS NULL OR ur.billing_month < $3::date)
        ORDER BY ur.unit_id, ur.billing_month DESC`,
      [utility_type, propId, billing_month || null]
    );
    return ok(res, rows);
  } catch (err) {
    console.error('getPrevReadings:', err);
    return fail(res, 'Failed to fetch previous readings.', 500);
  }
};

// ── POST /api/utilities/readings/bulk ────────────────────────
// Expects: { billing_month, readings: [{ unit_id, utility_type, reading_end, reading_start?,
//            rate_per_unit?, notes?, override_total?, total_bill? }] }
// For garbage: pass override_total=true, reading_end=amount, reading_start=0, rate_per_unit=1
const bulkSave = async (req, res) => {
  const { billing_month, readings } = req.body;
  if (!billing_month || !Array.isArray(readings) || !readings.length)
    return fail(res, 'billing_month and readings[] are required.', 400);

  const propId = req.user.property_id || null;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const saved = [];
    for (const r of readings) {
      const { unit_id, utility_type, reading_end, reading_start,
              rate_per_unit, notes, override_total } = r;
      if (!unit_id) continue;

      // Auto-resolve meter_id from unit + utility_type
      const meterRes = await client.query(
        `SELECT id FROM utility_meters
          WHERE unit_id = $1 AND utility_type = $2 LIMIT 1`,
        [unit_id, utility_type]
      );

      let meterId = meterRes.rows[0]?.id;

      // Auto-create meter if it doesn't exist yet
      if (!meterId) {
        const newMeter = await client.query(
          `INSERT INTO utility_meters (unit_id, property_id, utility_type)
           VALUES ($1, COALESCE($2,(SELECT property_id FROM units WHERE id=$1)), $3)
           RETURNING id`,
          [unit_id, propId, utility_type]
        );
        meterId = newMeter.rows[0].id;
      }

      // For garbage override: reading_start=0, reading_end=amount, rate=1 → total_bill=amount
      // For water/electricity: use provided rate or look up current rate
      let resolvedRate = rate_per_unit != null ? parseFloat(rate_per_unit) : null;
      if (resolvedRate == null) {
        const rateRes = await client.query(
          `SELECT rate_per_unit FROM current_utility_rates
            WHERE utility_type = $1
              AND property_id = COALESCE($2,(SELECT property_id FROM units WHERE id=$3))
            LIMIT 1`,
          [utility_type, propId, unit_id]
        );
        resolvedRate = parseFloat(rateRes.rows[0]?.rate_per_unit || 0);
      }

      const rStart = override_total ? 0 : (reading_start ?? 0);
      const rEnd   = override_total ? parseFloat(reading_end) : parseFloat(reading_end);
      const rRate  = override_total ? 1 : resolvedRate;

      if (rEnd == null || isNaN(rEnd)) continue;

      const { rows } = await client.query(
        `INSERT INTO utility_readings
           (meter_id, unit_id, property_id, recorded_by, billing_month,
            reading_start, reading_end, rate_per_unit, notes,
            is_submitted, submitted_at)
         VALUES ($1,$2,
           COALESCE($3,(SELECT property_id FROM units WHERE id=$2)),
           $4,$5,$6,$7,$8,$9,TRUE,NOW())
         ON CONFLICT (unit_id, meter_id, billing_month)
         DO UPDATE SET
           reading_end   = EXCLUDED.reading_end,
           reading_start = EXCLUDED.reading_start,
           rate_per_unit = EXCLUDED.rate_per_unit,
           notes         = EXCLUDED.notes,
           is_submitted  = TRUE,
           submitted_at  = NOW(),
           updated_at    = NOW()
         RETURNING *`,
        [meterId, unit_id, propId, req.user.id, billing_month,
         rStart, rEnd, rRate, notes || null]
      );
      saved.push(rows[0]);
    }

    await client.query('COMMIT');
    return ok(res, saved, `${saved.length} readings saved.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('bulkSave:', err);
    return fail(res, 'Failed to save readings.', 500);
  } finally {
    client.release();
  }
};

// ── GET /api/utilities/my-readings  (tenant) ─────────────────
// Returns readings grouped by utility_type with averages
const myReadings = async (req, res) => {
  const unitId = req.user.unit_id;
  if (!unitId) return fail(res, 'No unit found for this tenant.', 400);

  try {
    const { rows } = await pool.query(
      `SELECT ur.id, ur.billing_month,
              ur.reading_start, ur.reading_end,
              ur.consumption_units, ur.rate_per_unit, ur.total_bill,
              ur.notes,
              um.utility_type,
              um.meter_number
         FROM utility_readings ur
         JOIN utility_meters um ON um.id = ur.meter_id
        WHERE ur.unit_id = $1
          AND ur.is_submitted = TRUE
        ORDER BY um.utility_type, ur.billing_month DESC`,
      [unitId]
    );

    // Group by utility_type, compute averages
    const grouped = {};
    for (const r of rows) {
      const t = r.utility_type;
      if (!grouped[t]) grouped[t] = [];
      grouped[t].push(r);
    }

    // Attach avg_units and avg_bill per type
    const result = {};
    for (const [type, readings] of Object.entries(grouped)) {
      const totalUnits = readings.reduce((s, r) => s + Number(r.consumption_units || 0), 0);
      const totalBill  = readings.reduce((s, r) => s + Number(r.total_bill || 0), 0);
      const count      = readings.length;
      result[type] = {
        readings,
        avg_units: count ? +(totalUnits / count).toFixed(2) : 0,
        avg_bill:  count ? +(totalBill  / count).toFixed(2) : 0,
        count,
      };
    }

    return ok(res, result);
  } catch (err) {
    console.error('myReadings:', err);
    return fail(res, 'Failed to fetch utility readings.', 500);
  }
};

module.exports = { getRates, setRate, getPrevReadings, bulkSave, myReadings };