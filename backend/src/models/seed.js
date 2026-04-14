// src/models/seed.js — Demo datu imports testēšanai
const { pool, query } = require('./db');
const bcrypt = require('bcryptjs');

async function seed() {
  console.log('🌱 Seeding demo data...');

  // Create demo tenant
  const tenantRes = await query(`
    INSERT INTO tenants (name, slug, primary_color, secondary_color,
      booking_page_headline, booking_page_subline, address, phone, email,
      whatsapp_reminder_24h, whatsapp_reminder_2h, whatsapp_after_visit, whatsapp_birthday,
      email_reminder_24h, email_confirmation)
    VALUES (
      'Bloom Salons', 'bloom', '#7F77DD', '#1D9E75',
      'Rezervējiet savu vizīti', 'Ērta tiešsaistes rezervācija',
      'Brīvības iela 42, Rīga', '+371 2612 3456', 'info@bloomsalons.lv',
      true, true, true, true, true, true
    )
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `);
  const tenantId = tenantRes.rows[0].id;
  console.log('✓ Tenant:', tenantId);

  // Credit account
  await query(`
    INSERT INTO credit_accounts (tenant_id, balance, total_purchased)
    VALUES ($1, 10.00, 10.00)
    ON CONFLICT (tenant_id) DO NOTHING
  `, [tenantId]);

  // Salons
  const s1 = await query(`
    INSERT INTO salons (tenant_id, name, address, city, phone)
    VALUES ($1, 'Bloom Centra salons', 'Brīvības iela 42', 'Rīga', '+371 2612 3456')
    RETURNING id
  `, [tenantId]);
  const s2 = await query(`
    INSERT INTO salons (tenant_id, name, address, city, phone)
    VALUES ($1, 'Bloom Pārdaugava', 'Aglonas iela 11', 'Rīga', '+371 2623 4567')
    RETURNING id
  `, [tenantId]);
  const salonId = s1.rows[0].id;
  console.log('✓ Salons created');

  // Owner user
  const hash = await bcrypt.hash('demo1234', 12);
  await query(`
    INSERT INTO users (tenant_id, email, password_hash, full_name, role, salon_id)
    VALUES ($1, 'demo@bloomsalons.lv', $2, 'Anna Kalniņa', 'owner', $3)
    ON CONFLICT (tenant_id, email) DO NOTHING
  `, [tenantId, hash, salonId]);
  console.log('✓ Owner user: demo@bloomsalons.lv / demo1234');

  // Services
  const services = [
    ['Krāsošana', 'Mati', 90, 65, 120, '#7F77DD'],
    ['Griezums + veidošana', 'Mati', 60, 35, 55, '#534AB7'],
    ['Manikīrs', 'Nagi', 60, 25, 25, '#D4537E'],
    ['Pedikīrs', 'Nagi', 75, 35, 35, '#993556'],
    ['Sejas kopšana', 'Āda', 45, 45, 65, '#1D9E75'],
    ['Uzacu korekcija', 'Acu zona', 30, 18, 18, '#BA7517'],
    ['Skropstu lamināšana', 'Acu zona', 90, 55, 55, '#854F0B'],
  ];
  const serviceIds = [];
  for (const [name, cat, dur, pf, pt, color] of services) {
    const r = await query(`
      INSERT INTO services (tenant_id, name, category, duration_minutes, price_from, price_to, color)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id
    `, [tenantId, name, cat, dur, pf, pt, color]);
    serviceIds.push(r.rows[0].id);
  }
  console.log('✓ Services created');

  // Staff
  const staffData = [
    ['Līga Krastiņa', 'Stilists', [0, 1]],
    ['Daina Pētersone', 'Naglu meistare', [2, 3]],
    ['Ruta Simsone', 'Kosmetologs', [4, 5, 6]],
  ];
  for (const [name, title, svcIdxs] of staffData) {
    await query(`
      INSERT INTO staff (tenant_id, salon_id, full_name, title, service_ids)
      VALUES ($1,$2,$3,$4,$5)
    `, [tenantId, salonId, name, title, svcIdxs.map(i => serviceIds[i])]);
  }
  console.log('✓ Staff created');

  // Demo clients
  const clients = [
    ['Anna', 'Kalniņa', '+37126123456', 'anna@gmail.com', '1990-03-15'],
    ['Marta', 'Ozola', '+37126987654', 'marta@inbox.lv', '1985-07-22'],
    ['Ilze', 'Bērziņa', '+37126345678', 'ilze@gmail.com', '1992-11-08'],
    ['Sandra', 'Liepiņa', '+37126459012', null, '1988-04-13'],
    ['Kristīne', 'Jansone', '+37126563456', 'kristine@gmail.com', '1995-09-30'],
  ];
  const clientIds = [];
  for (const [fn, ln, phone, email, bday] of clients) {
    const r = await query(`
      INSERT INTO clients (tenant_id, first_name, last_name, phone, whatsapp_phone, email, birthday,
        gdpr_consent, gdpr_consent_at, marketing_consent, preferred_salon_id)
      VALUES ($1,$2,$3,$4,$4,$5,$6,true,NOW(),true,$7) RETURNING id
    `, [tenantId, fn, ln, phone, email, bday, salonId]);
    clientIds.push(r.rows[0].id);
  }
  console.log('✓ Clients created');

  // Demo appointments (today + future)
  const now = new Date();
  const appts = [
    [0, 0, '09:00', 'confirmed'],
    [1, 2, '10:30', 'confirmed'],
    [2, 4, '12:00', 'pending'],
    [3, 5, '14:00', 'confirmed'],
    [4, 2, '15:30', 'confirmed'],
  ];

  for (const [ci, si, time, status] of appts) {
    const [h, m] = time.split(':').map(Number);
    const start = new Date(now);
    start.setHours(h, m, 0, 0);
    const svc = await query('SELECT duration_minutes, price_from FROM services WHERE id=$1', [serviceIds[si]]);
    const dur = svc.rows[0].duration_minutes;
    const end = new Date(start.getTime() + dur * 60000);

    await query(`
      INSERT INTO appointments (tenant_id, salon_id, client_id, service_id, start_time, end_time, status, price, source)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'admin')
    `, [tenantId, salonId, clientIds[ci], serviceIds[si], start, end, status, svc.rows[0].price_from]);
  }
  console.log('✓ Demo appointments created');

  console.log('\n🎉 Seed complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Admin login:');
  console.log('  Slug:     bloom');
  console.log('  Email:    demo@bloomsalons.lv');
  console.log('  Parole:   demo1234');
  console.log('');
  console.log('Rezervāciju lapa:');
  console.log('  http://localhost:5173/book/bloom');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await pool.end();
}

seed().catch(err => { console.error(err); process.exit(1); });
