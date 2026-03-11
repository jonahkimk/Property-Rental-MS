/**
 * seed.js — Rental Management System
 * Matches rmsdb.sql schema exactly.
 * Run from backend folder: node seed.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'rental_management',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD,
});

const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;
const log    = (msg) => console.log(`  ✔  ${msg}`);
const title  = (msg) => console.log(`\n── ${msg} ${'─'.repeat(Math.max(0, 50 - msg.length))}`);

// ── 1. CLEAR ─────────────────────────────────────────────────
async function clearAll(client) {
  title('Clearing existing data');
  await client.query(`
    TRUNCATE TABLE
      audit_logs, financial_summaries,
      maintenance_schedules,
      ticket_replies, request_tickets,
      messages, notifications,
      payments, invoices,
      utility_readings, utility_meters, utility_rates,
      tenants, landlord_properties,
      units, properties, users
    RESTART IDENTITY CASCADE
  `);
  log('All tables cleared.');
}

// ── 2. USERS ─────────────────────────────────────────────────
async function seedUsers(client) {
  title('Seeding users');

  const { rows: [manager] } = await client.query(
    `INSERT INTO users (full_name, username, password_hash, role, email, phone)
     VALUES ($1,$2,$3,'manager',$4,$5) RETURNING id`,
    ['James Mwangi','manager', await bcrypt.hash('manager123',ROUNDS),
     'manager@rentalms.co.ke','+254712000001']
  );
  log('Manager : James Mwangi  (manager / manager123)');

  const { rows: [landlord1] } = await client.query(
    `INSERT INTO users (full_name, username, password_hash, role, email, phone)
     VALUES ($1,$2,$3,'landlord',$4,$5) RETURNING id`,
    ['Alice Njeri','admin', await bcrypt.hash('admin123',ROUNDS),
     'alice@rentalms.co.ke','+254712000002']
  );
  log('Landlord: Alice Njeri   (admin / admin123)');

  const { rows: [landlord2] } = await client.query(
    `INSERT INTO users (full_name, username, password_hash, role, email, phone)
     VALUES ($1,$2,$3,'landlord',$4,$5) RETURNING id`,
    ['Peter Kamau','landlord2', await bcrypt.hash('admin123',ROUNDS),
     'peter@rentalms.co.ke','+254712000003']
  );
  log('Landlord: Peter Kamau   (landlord2 / admin123)');

  return { manager, landlord1, landlord2 };
}

// ── 3. PROPERTIES ─────────────────────────────────────────────
async function seedProperties(client, { landlord1, landlord2 }) {
  title('Seeding properties');

  const { rows: [prop1] } = await client.query(
    `INSERT INTO properties (name, address, city, county, total_units, description)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    ['Sunset Apartments','Westlands Road, off Waiyaki Way',
     'Nairobi','Nairobi',10,
     'Modern apartment complex with backup generator and borehole water.']
  );
  log('Property 1: Sunset Apartments (Westlands, Nairobi)');

  const { rows: [prop2] } = await client.query(
    `INSERT INTO properties (name, address, city, county, total_units, description)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    ['Green View Estate','Thika Road, Kasarani',
     'Nairobi','Nairobi',6,
     'Serene estate close to schools and shopping centres.']
  );
  log('Property 2: Green View Estate (Kasarani, Nairobi)');

  // landlord_properties uses landlord_id (not user_id)
  await client.query(
    `INSERT INTO landlord_properties (landlord_id, property_id)
     VALUES ($1,$2),($3,$4)`,
    [landlord1.id, prop1.id, landlord2.id, prop2.id]
  );
  log('Landlords linked to properties.');

  return { prop1, prop2 };
}

// ── 4. UNITS ──────────────────────────────────────────────────
async function seedUnits(client, { prop1, prop2 }) {
  title('Seeding units');

  const p1Defs = [
    { unit_number:'1A', unit_type:'2BR', floor:'Ground', monthly_rent:25000 },
    { unit_number:'1B', unit_type:'2BR', floor:'Ground', monthly_rent:25000 },
    { unit_number:'2A', unit_type:'3BR', floor:'1st',    monthly_rent:28000 },
    { unit_number:'2B', unit_type:'3BR', floor:'1st',    monthly_rent:28000 },
    { unit_number:'3A', unit_type:'3BR', floor:'2nd',    monthly_rent:30000 },
    { unit_number:'3B', unit_type:'3BR', floor:'2nd',    monthly_rent:30000 },
    { unit_number:'4A', unit_type:'4BR', floor:'3rd',    monthly_rent:35000 },
    { unit_number:'4B', unit_type:'4BR', floor:'3rd',    monthly_rent:35000 },
    { unit_number:'S1', unit_type:'1BR', floor:'Ground', monthly_rent:15000 },
    { unit_number:'S2', unit_type:'1BR', floor:'Ground', monthly_rent:15000 },
  ];

  const p2Defs = [
    { unit_number:'A1', unit_type:'2BR', floor:'Ground', monthly_rent:20000 },
    { unit_number:'A2', unit_type:'2BR', floor:'Ground', monthly_rent:20000 },
    { unit_number:'B1', unit_type:'2BR', floor:'1st',    monthly_rent:22000 },
    { unit_number:'B2', unit_type:'2BR', floor:'1st',    monthly_rent:22000 },
    { unit_number:'C1', unit_type:'3BR', floor:'2nd',    monthly_rent:25000 },
    { unit_number:'C2', unit_type:'3BR', floor:'2nd',    monthly_rent:25000 },
  ];

  const insertUnits = async (defs, property_id) => {
    const rows = [];
    for (const d of defs) {
      const { rows:[u] } = await client.query(
        `INSERT INTO units (property_id, unit_number, unit_type, floor, monthly_rent)
         VALUES ($1,$2,$3,$4,$5) RETURNING id, unit_number, monthly_rent`,
        [property_id, d.unit_number, d.unit_type, d.floor, d.monthly_rent]
      );
      rows.push(u);
    }
    return rows;
  };

  const prop1Units = await insertUnits(p1Defs, prop1.id);
  log(`${prop1Units.length} units inserted for Sunset Apartments.`);
  const prop2Units = await insertUnits(p2Defs, prop2.id);
  log(`${prop2Units.length} units inserted for Green View Estate.`);

  return { prop1Units, prop2Units };
}

// ── 5. TENANTS ────────────────────────────────────────────────
async function seedTenants(client, { prop1, prop2, prop1Units, prop2Units, landlord1, landlord2 }) {
  title('Seeding tenants');

  const defs = [
    // Sunset Apartments — 1A..4B occupied; S1,S2 vacant
    { name:'John Otieno',    uname:'1A', email:'john@gmail.com',    phone:'+254700111001', unit:prop1Units[0], prop:prop1, ll:landlord1, lease:'2024-01-01' },
    { name:'Mary Wanjiru',   uname:'1B', email:'mary@gmail.com',    phone:'+254700111002', unit:prop1Units[1], prop:prop1, ll:landlord1, lease:'2024-02-01' },
    { name:'David Kipchoge', uname:'2A', email:'david@gmail.com',   phone:'+254700111003', unit:prop1Units[2], prop:prop1, ll:landlord1, lease:'2023-11-01' },
    { name:'Grace Achieng',  uname:'2B', email:'grace@gmail.com',   phone:'+254700111004', unit:prop1Units[3], prop:prop1, ll:landlord1, lease:'2024-03-01' },
    { name:'Samuel Maina',   uname:'3A', email:'samuel@gmail.com',  phone:'+254700111005', unit:prop1Units[4], prop:prop1, ll:landlord1, lease:'2024-01-15' },
    { name:'Faith Chebet',   uname:'3B', email:'faith@gmail.com',   phone:'+254700111006', unit:prop1Units[5], prop:prop1, ll:landlord1, lease:'2023-09-01' },
    { name:'Kevin Odhiambo', uname:'4A', email:'kevin@gmail.com',   phone:'+254700111007', unit:prop1Units[6], prop:prop1, ll:landlord1, lease:'2024-05-01' },
    { name:'Esther Waweru',  uname:'4B', email:'esther@gmail.com',  phone:'+254700111008', unit:prop1Units[7], prop:prop1, ll:landlord1, lease:'2024-04-01' },
    // Green View Estate — A1..B2 occupied; C1,C2 vacant
    { name:'Brian Mutua',    uname:'A1', email:'brian@gmail.com',   phone:'+254700222001', unit:prop2Units[0], prop:prop2, ll:landlord2, lease:'2024-01-01' },
    { name:'Cynthia Njoki',  uname:'A2', email:'cynthia@gmail.com', phone:'+254700222002', unit:prop2Units[1], prop:prop2, ll:landlord2, lease:'2024-06-01' },
    { name:'George Wafula',  uname:'B1', email:'george@gmail.com',  phone:'+254700222003', unit:prop2Units[2], prop:prop2, ll:landlord2, lease:'2023-12-01' },
    { name:'Ann Kemunto',    uname:'B2', email:'ann@gmail.com',     phone:'+254700222004', unit:prop2Units[3], prop:prop2, ll:landlord2, lease:'2024-02-15' },
  ];

  const tenants = [];
  for (const d of defs) {
    const { rows:[user] } = await client.query(
      `INSERT INTO users (full_name, username, password_hash, role, email, phone)
       VALUES ($1,$2,$3,'tenant',$4,$5) RETURNING id`,
      [d.name, d.uname, await bcrypt.hash('tenant123',ROUNDS), d.email, d.phone]
    );
    const { rows:[tenant] } = await client.query(
      `INSERT INTO tenants
         (user_id, unit_id, property_id, landlord_id, lease_start,
          deposit_amount, deposit_paid)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE) RETURNING id`,
      [user.id, d.unit.id, d.prop.id, d.ll.id, d.lease,
       parseFloat(d.unit.monthly_rent) * 2]
    );
    // Occupancy handled by trigger trg_tenant_occupancy
    tenants.push({ user_id:user.id, tenant_id:tenant.id, full_name:d.name, unit:d.unit, prop:d.prop });
    log(`${d.name.padEnd(16)} (${d.uname.padEnd(3)} / tenant123)  →  ${d.unit.unit_number}`);
  }
  return tenants;
}

// ── 6. UTILITY METERS ─────────────────────────────────────────
async function seedMeters(client, tenants) {
  title('Seeding utility meters');
  const meters = {};   // unit_id → { water, electricity, garbage }
  let   seq    = 1;

  for (const t of tenants) {
    if (meters[t.unit.id]) continue;
    meters[t.unit.id] = {};
    for (const type of ['water','electricity','garbage']) {
      const prefix = type === 'water' ? 'WM' : type === 'electricity' ? 'EM' : 'GB';
      const { rows:[m] } = await client.query(
        `INSERT INTO utility_meters (unit_id, utility_type, meter_number)
         VALUES ($1,$2,$3) RETURNING id`,
        [t.unit.id, type, `${prefix}-${t.unit.unit_number}-${String(seq++).padStart(3,'0')}`]
      );
      meters[t.unit.id][type] = m.id;
    }
  }
  log(`Meters created for ${Object.keys(meters).length} units (3 each).`);
  return meters;
}

// ── 7. UTILITY RATES ──────────────────────────────────────────
async function seedRates(client, { prop1, prop2 }, { landlord1, landlord2 }) {
  title('Seeding utility rates');
  const data = [
    [prop1.id, landlord1.id, 'water',       175, '2025-01-01'],
    [prop1.id, landlord1.id, 'electricity',  22, '2025-01-01'],
    [prop1.id, landlord1.id, 'garbage',     500, '2025-01-01'],
    [prop2.id, landlord2.id, 'water',       160, '2025-01-01'],
    [prop2.id, landlord2.id, 'electricity',  20, '2025-01-01'],
    [prop2.id, landlord2.id, 'garbage',     450, '2025-01-01'],
  ];
  for (const [pid, uid, type, rate, from] of data) {
    await client.query(
      `INSERT INTO utility_rates
         (property_id, utility_type, rate_per_unit, effective_from, set_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [pid, type, rate, from, uid]
    );
  }
  log('Rates set for both properties.');
}

// ── 8. UTILITY READINGS ───────────────────────────────────────
async function seedReadings(client, tenants, meters, { landlord1, landlord2 }) {
  title('Seeding utility readings (Jan & Feb 2026)');

  const prop1Id = tenants[0].prop.id;
  const rateFor = (propId, type) => {
    const r1 = { water:175, electricity:22, garbage:500 };
    const r2 = { water:160, electricity:20, garbage:450 };
    return (propId === prop1Id ? r1 : r2)[type];
  };

  let baseW = 100, baseE = 500;
  for (const t of tenants) {
    const um  = meters[t.unit.id];
    const rec = t.prop.id === prop1Id ? landlord1.id : landlord2.id;

    // ── January ──
    const wS1 = baseW,      wE1 = wS1 + 12 + Math.floor(Math.random()*8);
    const eS1 = baseE,      eE1 = eS1 + 50 + Math.floor(Math.random()*30);

    for (const [mid, rs, re, type] of [
      [um.water,       wS1, wE1, 'water'],
      [um.electricity, eS1, eE1, 'electricity'],
      [um.garbage,     0,   1,   'garbage'],
    ]) {
      await client.query(
        `INSERT INTO utility_readings
           (meter_id, unit_id, property_id, recorded_by, billing_month,
            reading_start, reading_end, rate_per_unit, is_submitted, submitted_at)
         VALUES ($1,$2,$3,$4,'2026-01-01',$5,$6,$7,TRUE,NOW())`,
        [mid, t.unit.id, t.prop.id, rec, rs, re, rateFor(t.prop.id, type)]
      );
    }

    // ── February ── (reading_start supplied explicitly = Jan's end)
    const wE2 = wE1 + 10 + Math.floor(Math.random()*8);
    const eE2 = eE1 + 45 + Math.floor(Math.random()*25);

    for (const [mid, rs, re, type] of [
      [um.water,       wE1, wE2, 'water'],
      [um.electricity, eE1, eE2, 'electricity'],
      [um.garbage,     0,   1,   'garbage'],
    ]) {
      await client.query(
        `INSERT INTO utility_readings
           (meter_id, unit_id, property_id, recorded_by, billing_month,
            reading_start, reading_end, rate_per_unit, is_submitted, submitted_at)
         VALUES ($1,$2,$3,$4,'2026-02-01',$5,$6,$7,TRUE,NOW())`,
        [mid, t.unit.id, t.prop.id, rec, rs, re, rateFor(t.prop.id, type)]
      );
    }

    baseW = wE2 + 5;
    baseE = eE2 + 10;
  }
  log('Readings inserted for Jan & Feb 2026 for all occupied units.');
}

// ── 9. INVOICES ───────────────────────────────────────────────
async function seedInvoices(client, tenants) {
  title('Seeding invoices');

  // total_amount is a GENERATED column — never insert it directly
  const months = [
    { billing_month:'2025-12-01', due_date:'2025-12-05', status:'paid'    },
    { billing_month:'2026-01-01', due_date:'2026-01-05', status:'paid'    },
    { billing_month:'2026-02-01', due_date:'2026-02-05', status:'paid'    },
    { billing_month:'2026-03-01', due_date:'2026-03-05', status:'pending' },
  ];

  const prop1Id = tenants[0].prop.id;
  const rateFor = (propId, type) => {
    const r1 = { water:175, electricity:22, garbage:500 };
    const r2 = { water:160, electricity:20, garbage:450 };
    return (propId === prop1Id ? r1 : r2)[type];
  };

  const invoices = [];
  for (const m of months) {
    for (const t of tenants) {
      const rent  = parseFloat(t.unit.monthly_rent);
      const rates = { w: rateFor(t.prop.id,'water'), e: rateFor(t.prop.id,'electricity'), g: rateFor(t.prop.id,'garbage') };
      const water       = (12 + Math.floor(Math.random()*8))  * rates.w;
      const electricity = (50 + Math.floor(Math.random()*30)) * rates.e;
      const garbage     = rates.g;

      const { rows:[inv] } = await client.query(
        `INSERT INTO invoices
           (tenant_id, unit_id, property_id, billing_month, due_date,
            rent_amount, water_bill, electricity_bill, garbage_bill,
            penalty_amount, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10)
         RETURNING id, total_amount`,
        [t.tenant_id, t.unit.id, t.prop.id,
         m.billing_month, m.due_date,
         rent, water, electricity, garbage, m.status]
      );
      invoices.push({ ...m, invoice_id:inv.id, total:parseFloat(inv.total_amount), tenant:t });
    }
    log(`Invoices for ${m.billing_month}  [${m.status}]`);
  }
  return invoices;
}

// ── 10. PAYMENTS ──────────────────────────────────────────────
async function seedPayments(client, invoices, { landlord1, landlord2 }) {
  title('Seeding payments');
  const methods = ['mpesa','cash','bank'];
  const prop1Id = invoices[0]?.tenant.prop.id;
  let   count   = 0;

  for (const inv of invoices.filter(i => i.status === 'paid')) {
    const method = methods[count % 3];
    const recvBy = inv.tenant.prop.id === prop1Id ? landlord1.id : landlord2.id;
    await client.query(
      `INSERT INTO payments
         (invoice_id, tenant_id, property_id,
          amount_paid, payment_method, mpesa_code, received_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [inv.invoice_id, inv.tenant.tenant_id, inv.tenant.prop.id,
       inv.total, method,
       method === 'mpesa' ? `QA${Math.random().toString(36).slice(2,10).toUpperCase()}` : null,
       recvBy]
    );
    count++;
  }
  log(`${count} payments recorded.`);
}

// ── 11. REQUEST TICKETS ───────────────────────────────────────
async function seedTickets(client, tenants) {
  title('Seeding request tickets');
  const defs = [
    { idx:0, subject:'Water pressure too low in bathroom',  cat:'plumbing',   pri:'high',   status:'open',        desc:'The water pressure in my bathroom has been very low for the past week. Showering takes too long.' },
    { idx:1, subject:'Broken window latch',                  cat:'general',    pri:'normal', status:'in_progress', desc:'The latch on my bedroom window is broken and does not lock properly. This is a security concern.' },
    { idx:2, subject:'Electrical socket not working',         cat:'electrical', pri:'urgent', status:'open',        desc:'The main socket in the kitchen has stopped working. I cannot use my appliances.' },
    { idx:3, subject:'Request for extra parking space',       cat:'general',    pri:'low',    status:'resolved',    desc:'I have a second vehicle and would like to know if an additional parking space is available.' },
    { idx:4, subject:'Garbage not collected on Tuesday',      cat:'cleaning',   pri:'normal', status:'resolved',    desc:'The garbage was not collected on the usual Tuesday schedule. The bins are overflowing.' },
    { idx:5, subject:'Security light outside unit is out',    cat:'security',   pri:'high',   status:'open',        desc:'The outdoor security light near my unit has been off for 3 days. Very dark at night.' },
  ];

  for (const d of defs) {
    if (d.idx >= tenants.length) continue;
    const t = tenants[d.idx];
    await client.query(
      `INSERT INTO request_tickets
         (tenant_id, tenant_name, unit_number, property_id, unit_id,
          subject, description, category, priority, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [t.tenant_id, t.full_name, t.unit.unit_number,
       t.prop.id, t.unit.id,
       d.subject, d.desc, d.cat, d.pri, d.status]
    );
  }
  log(`${defs.length} tickets inserted.`);
}

// ── 12. NOTIFICATIONS ─────────────────────────────────────────
async function seedNotifications(client, { prop1, prop2 }, { landlord1, landlord2 }, tenants) {
  title('Seeding notifications');

  const notices = [
    { sender:landlord1, sname:'Alice Njeri', prop:prop1,
      title:'Rent Due Reminder',
      msg:'Rent for March 2026 is due by 5th March. Please ensure timely payment to avoid late penalties.' },
    { sender:landlord1, sname:'Alice Njeri', prop:prop1,
      title:'Water Interruption Notice',
      msg:'Water interruption on Saturday 8th March, 8AM–2PM due to maintenance works. Please store water in advance.' },
    { sender:landlord2, sname:'Peter Kamau', prop:prop2,
      title:'Scheduled Maintenance',
      msg:'Routine inspection of all units on 10th March 2026. Please ensure access to your unit during this time.' },
    { sender:landlord1, sname:'Alice Njeri', prop:prop1,
      title:'Security Advisory',
      msg:'Please lock your doors and windows at all times. Suspicious activity has been reported in the neighbourhood.' },
  ];

  let total = 0;
  for (const n of notices) {
    const propTenants = tenants.filter(t => t.prop.id === n.prop.id);
    for (const t of propTenants) {
      await client.query(
        `INSERT INTO notifications
           (property_id, sent_by, sender_name, recipient_id, recipient_name,
            title, message, channel)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'{in_app}')`,
        [n.prop.id, n.sender.id, n.sname,
         t.user_id, t.full_name, n.title, n.msg]
      );
      total++;
    }
  }
  log(`${total} notifications sent across ${notices.length} broadcasts.`);
}

// ── 13. MAINTENANCE ───────────────────────────────────────────
async function seedMaintenance(client, { prop1, prop2, prop1Units, prop2Units }) {
  title('Seeding maintenance schedules');

  const jobs = [
    { pid:prop1.id, uid:prop1Units[0].id, title:'Fix water pipe — Unit 1A',    mtype:'repair',     date:'2026-03-10', status:'scheduled',   cost:3500,  done:null,         desc:'Leaking pipe under kitchen sink needs replacement.' },
    { pid:prop1.id, uid:null,              title:'Generator servicing',          mtype:'inspection', date:'2026-03-15', status:'scheduled',   cost:8000,  done:null,         desc:'Routine monthly service of the backup generator.' },
    { pid:prop1.id, uid:prop1Units[2].id, title:'Repaint interior — Unit 2A',   mtype:'upgrade',    date:'2026-02-20', status:'completed',   cost:12000, done:'2026-02-22', desc:'Interior walls repainted before new tenant moved in.' },
    { pid:prop2.id, uid:null,              title:'Gate motor replacement',        mtype:'repair',     date:'2026-03-05', status:'in_progress', cost:45000, done:null,         desc:'Main gate motor broken down, needs full replacement.' },
    { pid:prop2.id, uid:prop2Units[1].id, title:'Replace ceiling fan — Unit A2', mtype:'repair',     date:'2026-03-12', status:'scheduled',   cost:4500,  done:null,         desc:'Ceiling fan making noise. To be replaced.' },
  ];

  for (const j of jobs) {
    await client.query(
      `INSERT INTO maintenance_schedules
         (property_id, unit_id, title, description, maintenance_type,
          scheduled_date, completed_date, status, cost)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [j.pid, j.uid, j.title, j.desc, j.mtype,
       j.date, j.done, j.status, j.cost]
    );
  }
  log(`${jobs.length} maintenance schedules inserted.`);
}

// ── 14. MESSAGES ──────────────────────────────────────────────
async function seedMessages(client, tenants, { landlord1, landlord2 }, { prop1, prop2 }) {
  title('Seeding messages');

  const msgs = [
    { from_id:tenants[0].user_id, from_name:tenants[0].full_name,
      to_id:landlord1.id,         to_name:'Alice Njeri',
      prop_id:prop1.id, subject:'Parking query',
      body:'Good morning, I wanted to ask whether there is a designated visitor parking area within the compound.' },
    { from_id:tenants[1].user_id, from_name:tenants[1].full_name,
      to_id:landlord1.id,         to_name:'Alice Njeri',
      prop_id:prop1.id, subject:'Lease renewal',
      body:'My lease expires at the end of March. I would like to renew for another year. Please advise on the process.' },
    { from_id:landlord1.id,       from_name:'Alice Njeri',
      to_id:tenants[0].user_id,   to_name:tenants[0].full_name,
      prop_id:prop1.id, subject:'Re: Parking query',
      body:'Hello John, yes there are 2 visitor parking slots near the gate. Available on a first-come basis.' },
    { from_id:tenants[8].user_id, from_name:tenants[8].full_name,
      to_id:landlord2.id,         to_name:'Peter Kamau',
      prop_id:prop2.id, subject:'Noise complaint',
      body:'There has been loud noise from unit A2 late at night over the weekends. Kindly look into this matter.' },
  ];

  for (const m of msgs) {
    await client.query(
      `INSERT INTO messages
         (property_id, sender_id, sender_name,
          recipient_id, recipient_name, subject, body)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [m.prop_id, m.from_id, m.from_name,
       m.to_id, m.to_name, m.subject, m.body]
    );
  }
  log(`${msgs.length} messages inserted.`);
}

// ── MAIN ──────────────────────────────────────────────────────
async function seed() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║        Rental MS — Database Seeder               ║');
  console.log('╚══════════════════════════════════════════════════╝');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await clearAll(client);

    const { manager, landlord1, landlord2 }  = await seedUsers(client);
    const { prop1, prop2 }                   = await seedProperties(client, { landlord1, landlord2 });
    const { prop1Units, prop2Units }          = await seedUnits(client, { prop1, prop2 });
    const tenants                             = await seedTenants(client, { prop1, prop2, prop1Units, prop2Units, landlord1, landlord2 });
    const meters                              = await seedMeters(client, tenants);

    await seedRates(client, { prop1, prop2 }, { landlord1, landlord2 });
    await seedReadings(client, tenants, meters, { landlord1, landlord2 });

    const invoices = await seedInvoices(client, tenants);
    await seedPayments(client, invoices, { landlord1, landlord2 });

    await seedTickets(client, tenants);
    await seedNotifications(client, { prop1, prop2 }, { landlord1, landlord2 }, tenants);
    await seedMaintenance(client, { prop1, prop2, prop1Units, prop2Units });
    await seedMessages(client, tenants, { landlord1, landlord2 }, { prop1, prop2 });

    await client.query('COMMIT');

    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║           Seeding Complete!  ✔                   ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('\n  Login credentials:');
    console.log('  Manager   →  manager   / manager123');
    console.log('  Landlord  →  admin     / admin123');
    console.log('  Landlord  →  landlord2 / admin123');
    console.log('  Tenants   →  1A 1B 2A 2B 3A 3B 4A 4B A1 A2 B1 B2  /  tenant123');
    console.log('\n  Properties:');
    console.log('  • Sunset Apartments  — 10 units (8 occupied, 2 vacant: S1, S2)');
    console.log('  • Green View Estate  —  6 units (4 occupied, 2 vacant: C1, C2)\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n  ✘  Seeding failed:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();