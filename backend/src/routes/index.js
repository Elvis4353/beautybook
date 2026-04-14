// src/routes/index.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../models/db');
const { authenticate, requireRole, requireTenant } = require('../middleware/auth');
const {
  sendWhatsApp, sendEmail, buildEmailHtml, getTenantCredentials,
  buildConfirmationWhatsApp, CREDIT_COSTS, PLATFORM_MARKUP,
} = require('../services/messaging');

const router = express.Router();

// ─── Auth ────────────────────────────────────────────────────────────────

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password, tenantSlug } = req.body;
    const r = await query(
      `SELECT u.*, t.slug FROM users u
       JOIN tenants t ON u.tenant_id = t.id
       WHERE u.email = $1 AND t.slug = $2 AND u.is_active = true`,
      [email.toLowerCase(), tenantSlug]
    );
    const user = r.rows[0];
    if (!user) return res.status(401).json({ error: 'Nepareizs e-pasts vai parole' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Nepareizs e-pasts vai parole' });

    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const token = jwt.sign(
      { userId: user.id, tenantId: user.tenant_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role, tenant_id: user.tenant_id },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auth/register-tenant', async (req, res) => {
  try {
    const { tenantName, slug, ownerName, ownerEmail, ownerPassword, salonName, salonAddress } = req.body;

    const existing = await query('SELECT id FROM tenants WHERE slug = $1', [slug]);
    if (existing.rows[0]) return res.status(400).json({ error: 'Šis slug jau ir aizņemts' });

    const passwordHash = await bcrypt.hash(ownerPassword, 12);

    const tenantRes = await query(
      `INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id`,
      [tenantName, slug]
    );
    const tenantId = tenantRes.rows[0].id;

    await query(
      `INSERT INTO credit_accounts (tenant_id, balance) VALUES ($1, 5.00)`,
      [tenantId]
    );

    const salonRes = await query(
      `INSERT INTO salons (tenant_id, name, address) VALUES ($1, $2, $3) RETURNING id`,
      [tenantId, salonName || tenantName, salonAddress || '']
    );

    await query(
      `INSERT INTO users (tenant_id, email, password_hash, full_name, role, salon_id)
       VALUES ($1, $2, $3, $4, 'owner', $5)`,
      [tenantId, ownerEmail.toLowerCase(), passwordHash, ownerName, salonRes.rows[0].id]
    );

    const defaultTemplates = [
      { type: 'reminder_24h', channel: 'email', subject: 'Atgādinājums: vizīte rīt', body: 'Atgādinājums par jūsu pierakstu.' },
      { type: 'confirmation', channel: 'email', subject: 'Pieraksts apstiprināts', body: 'Jūsu pieraksts ir apstiprināts.' },
    ];
    for (const t of defaultTemplates) {
      await query(
        `INSERT INTO message_templates (tenant_id, type, channel, subject, body) VALUES ($1,$2,$3,$4,$5)`,
        [tenantId, t.type, t.channel, t.subject, t.body]
      );
    }

    const token = jwt.sign(
      { userId: (await query(`SELECT id FROM users WHERE tenant_id=$1 AND role='owner'`, [tenantId])).rows[0].id, tenantId, role: 'owner' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({ token, tenantId, slug, bonusCredits: 5.00 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Tenant / Branding ───────────────────────────────────────────────────

router.get('/tenant', authenticate, async (req, res) => {
  const r = await query('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
  const credits = await query('SELECT * FROM credit_accounts WHERE tenant_id = $1', [req.tenantId]);
  res.json({ ...r.rows[0], credits: credits.rows[0] });
});

router.patch('/tenant/branding', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { primary_color, secondary_color, font_choice, logo_url,
            booking_page_headline, booking_page_subline, address, phone, email,
            website, instagram, facebook } = req.body;
    const r = await query(
      `UPDATE tenants SET
        primary_color = COALESCE($2, primary_color),
        secondary_color = COALESCE($3, secondary_color),
        font_choice = COALESCE($4, font_choice),
        logo_url = COALESCE($5, logo_url),
        booking_page_headline = COALESCE($6, booking_page_headline),
        booking_page_subline = COALESCE($7, booking_page_subline),
        address = COALESCE($8, address),
        phone = COALESCE($9, phone),
        email = COALESCE($10, email),
        website = COALESCE($11, website),
        instagram = COALESCE($12, instagram),
        facebook = COALESCE($13, facebook),
        updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.tenantId, primary_color, secondary_color, font_choice, logo_url,
       booking_page_headline, booking_page_subline, address, phone, email,
       website, instagram, facebook]
    );
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/tenant/integrations', authenticate, requireRole('owner'), async (req, res) => {
  try {
    const { twilio_account_sid, twilio_auth_token, twilio_whatsapp_from,
            sendgrid_api_key, sendgrid_from_email, sendgrid_from_name,
            custom_domain } = req.body;
    await query(
      `UPDATE tenants SET
        twilio_account_sid = COALESCE($2, twilio_account_sid),
        twilio_auth_token = COALESCE($3, twilio_auth_token),
        twilio_whatsapp_from = COALESCE($4, twilio_whatsapp_from),
        sendgrid_api_key = COALESCE($5, sendgrid_api_key),
        sendgrid_from_email = COALESCE($6, sendgrid_from_email),
        sendgrid_from_name = COALESCE($7, sendgrid_from_name),
        custom_domain = COALESCE($8, custom_domain),
        updated_at = NOW()
       WHERE id = $1`,
      [req.tenantId, twilio_account_sid, twilio_auth_token, twilio_whatsapp_from,
       sendgrid_api_key, sendgrid_from_email, sendgrid_from_name, custom_domain]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Public booking page data ─────────────────────────────────────────────

router.get('/public/tenant/:slug', async (req, res) => {
  try {
    const r = await query(
      `SELECT id, name, slug, logo_url, primary_color, secondary_color, font_choice,
              booking_page_headline, booking_page_subline, address, phone, email,
              website, instagram, facebook, timezone, locale, currency
       FROM tenants WHERE slug = $1 AND is_active = true`,
      [req.params.slug]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });

    const salons = await query(
      'SELECT id, name, address, city, phone, working_hours FROM salons WHERE tenant_id = $1 AND is_active = true',
      [r.rows[0].id]
    );
    const services = await query(
      `SELECT id, name, description, category, duration_minutes, price_from, price_to, color
       FROM services WHERE tenant_id = $1 AND is_active = true ORDER BY sort_order, name`,
      [r.rows[0].id]
    );
    const staffList = await query(
      `SELECT id, full_name, title, bio, avatar_url, salon_id, service_ids
       FROM staff WHERE tenant_id = $1 AND is_active = true AND accepts_bookings = true`,
      [r.rows[0].id]
    );

    res.json({ tenant: r.rows[0], salons: salons.rows, services: services.rows, staff: staffList.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Public: get available slots ─────────────────────────────────────────

router.get('/public/slots', async (req, res) => {
  try {
    const { tenantId, salonId, staffId, serviceId, date } = req.query;

    const serviceRes = await query('SELECT duration_minutes FROM services WHERE id = $1', [serviceId]);
    const duration = serviceRes.rows[0]?.duration_minutes || 60;

    // Get working hours
    const salonRes = await query('SELECT working_hours FROM salons WHERE id = $1', [salonId]);
    const dayName = ['sun','mon','tue','wed','thu','fri','sat'][new Date(date).getDay()];
    const wh = salonRes.rows[0]?.working_hours?.[dayName];

    if (!wh || wh.closed) return res.json({ slots: [] });

    // Get existing appointments for that day
    const booked = await query(
      `SELECT start_time, end_time FROM appointments
       WHERE salon_id = $1
         AND (staff_id = $2 OR $2::uuid IS NULL)
         AND status NOT IN ('cancelled')
         AND start_time::date = $3::date`,
      [salonId, staffId || null, date]
    );

    const slots = [];
    const [openH, openM] = wh.open.split(':').map(Number);
    const [closeH, closeM] = wh.close.split(':').map(Number);
    const startMinutes = openH * 60 + openM;
    const endMinutes = closeH * 60 + closeM;

    for (let m = startMinutes; m + duration <= endMinutes; m += 30) {
      const slotStart = new Date(date);
      slotStart.setHours(Math.floor(m / 60), m % 60, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + duration * 60000);

      const conflict = booked.rows.some(b => {
        const bs = new Date(b.start_time);
        const be = new Date(b.end_time);
        return slotStart < be && slotEnd > bs;
      });

      if (!conflict && slotStart > new Date()) {
        slots.push({
          time: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
          datetime: slotStart.toISOString(),
          available: true,
        });
      }
    }

    res.json({ slots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Public: create booking ───────────────────────────────────────────────

router.post('/public/book', async (req, res) => {
  try {
    const { tenantSlug, salonId, serviceId, staffId, datetime, clientFirstName,
            clientLastName, clientPhone, clientEmail, clientWhatsapp,
            notes, gdprConsent, marketingConsent } = req.body;

    const tenantRes = await query('SELECT id FROM tenants WHERE slug = $1', [tenantSlug]);
    const tenantId = tenantRes.rows[0]?.id;
    if (!tenantId) return res.status(404).json({ error: 'Tenant not found' });

    const serviceRes = await query('SELECT duration_minutes, price_from, name FROM services WHERE id = $1', [serviceId]);
    const service = serviceRes.rows[0];
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const startTime = new Date(datetime);
    const endTime = new Date(startTime.getTime() + service.duration_minutes * 60000);

    // Find or create client
    let client;
    const existingClient = await query(
      'SELECT * FROM clients WHERE tenant_id = $1 AND phone = $2',
      [tenantId, clientPhone]
    );

    if (existingClient.rows[0]) {
      client = existingClient.rows[0];
      await query(
        `UPDATE clients SET first_name=$2, last_name=$3, email=$4,
         whatsapp_phone=$5, marketing_consent=$6, updated_at=NOW() WHERE id=$1`,
        [client.id, clientFirstName, clientLastName, clientEmail,
         clientWhatsapp || clientPhone, marketingConsent]
      );
    } else {
      const newClient = await query(
        `INSERT INTO clients (tenant_id, first_name, last_name, phone, email,
          whatsapp_phone, gdpr_consent, gdpr_consent_at, marketing_consent, preferred_salon_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8,$9) RETURNING *`,
        [tenantId, clientFirstName, clientLastName, clientPhone, clientEmail,
         clientWhatsapp || clientPhone, gdprConsent, marketingConsent, salonId]
      );
      client = newClient.rows[0];
    }

    const apptRes = await query(
      `INSERT INTO appointments
         (tenant_id, salon_id, client_id, service_id, staff_id, start_time, end_time, price, notes, source, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'booking_page','pending')
       RETURNING *`,
      [tenantId, salonId, client.id, serviceId, staffId || null,
       startTime, endTime, service.price_from, notes]
    );
    const appt = apptRes.rows[0];

    // Send confirmation WhatsApp if phone provided
    try {
      const tenantData = await query(
        `SELECT t.*, sl.name AS salon_name, sl.address AS salon_address
         FROM tenants t JOIN salons sl ON sl.id = $2
         WHERE t.id = $1`,
        [tenantId, salonId]
      );
      const apptFull = {
        ...appt,
        client_first_name: clientFirstName,
        service_name: service.name,
        staff_name: null,
        salon_name: tenantData.rows[0].salon_name,
        salon_address: tenantData.rows[0].salon_address,
      };
      const waMessage = buildConfirmationWhatsApp(apptFull, tenantData.rows[0]);
      await sendWhatsApp(tenantId, clientWhatsapp || clientPhone, waMessage, {
        appointmentId: appt.id,
        clientId: client.id,
        type: 'confirmation',
      });
      await query('UPDATE appointments SET confirmation_sent=true WHERE id=$1', [appt.id]);
    } catch (msgErr) {
      console.error('Confirmation message failed (non-fatal):', msgErr.message);
    }

    res.status(201).json({
      appointment: {
        id: appt.id,
        booking_token: appt.booking_token,
        start_time: appt.start_time,
        status: appt.status,
        service_name: service.name,
      },
      message: 'Pieraksts izveidots! WhatsApp apstiprinājums nosūtīts.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Appointments (admin) ─────────────────────────────────────────────────

router.get('/appointments', authenticate, async (req, res) => {
  try {
    const { date, salonId, staffId, status, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const conditions = ['a.tenant_id = $1'];
    const params = [req.tenantId];
    let i = 2;

    if (date) { conditions.push(`a.start_time::date = $${i++}`); params.push(date); }
    if (salonId) { conditions.push(`a.salon_id = $${i++}`); params.push(salonId); }
    if (staffId) { conditions.push(`a.staff_id = $${i++}`); params.push(staffId); }
    if (status) { conditions.push(`a.status = $${i++}`); params.push(status); }

    const r = await query(
      `SELECT a.*, c.first_name, c.last_name, c.phone, c.email,
              sv.name AS service_name, sv.color AS service_color, sv.duration_minutes,
              st.full_name AS staff_name, sl.name AS salon_name
       FROM appointments a
       JOIN clients c ON a.client_id = c.id
       JOIN services sv ON a.service_id = sv.id
       JOIN salons sl ON a.salon_id = sl.id
       LEFT JOIN staff st ON a.staff_id = st.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY a.start_time DESC
       LIMIT $${i} OFFSET $${i+1}`,
      [...params, limit, offset]
    );
    res.json({ appointments: r.rows, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/appointments', authenticate, async (req, res) => {
  try {
    const { salonId, clientId, serviceId, staffId, startTime, price, notes, internalNotes } = req.body;

    const serviceRes = await query('SELECT duration_minutes, price_from FROM services WHERE id = $1', [serviceId]);
    const service = serviceRes.rows[0];
    const endTime = new Date(new Date(startTime).getTime() + service.duration_minutes * 60000);

    const r = await query(
      `INSERT INTO appointments (tenant_id, salon_id, client_id, service_id, staff_id, start_time, end_time, price, notes, internal_notes, source, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'admin','confirmed') RETURNING id`,
      [req.tenantId, salonId, clientId, serviceId, staffId || null,
       startTime, endTime, price || service.price_from, notes, internalNotes]
    );
    res.status(201).json({ id: r.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/appointments/:id', authenticate, async (req, res) => {
  try {
    const { status, notes, internalNotes, price, staffId } = req.body;
    const r = await query(
      `UPDATE appointments SET
        status = COALESCE($3, status),
        notes = COALESCE($4, notes),
        internal_notes = COALESCE($5, internal_notes),
        price = COALESCE($6, price),
        staff_id = COALESCE($7, staff_id),
        updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, req.tenantId, status, notes, internalNotes, price, staffId]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });

    if (status === 'completed') {
      await query(
        `UPDATE clients SET total_visits = total_visits + 1, last_visit_at = NOW(),
         total_spent = total_spent + COALESCE($2, 0) WHERE id = $3`,
        [r.rows[0].price, r.rows[0].client_id]
      );
    }

    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Clients ─────────────────────────────────────────────────────────────

router.get('/clients', authenticate, async (req, res) => {
  try {
    const { search, page = 1, limit = 50, tag } = req.query;
    const offset = (page - 1) * limit;
    const params = [req.tenantId];
    let where = 'tenant_id = $1';
    let i = 2;

    if (search) {
      where += ` AND (first_name ILIKE $${i} OR last_name ILIKE $${i} OR phone ILIKE $${i} OR email ILIKE $${i})`;
      params.push(`%${search}%`); i++;
    }
    if (tag) {
      where += ` AND $${i} = ANY(tags)`;
      params.push(tag); i++;
    }

    const r = await query(
      `SELECT *, CONCAT(first_name, ' ', COALESCE(last_name,'')) AS full_name
       FROM clients WHERE ${where}
       ORDER BY last_visit_at DESC NULLS LAST, client_since DESC
       LIMIT $${i} OFFSET $${i+1}`,
      [...params, limit, offset]
    );
    const count = await query(`SELECT COUNT(*) FROM clients WHERE ${where}`, params.slice(0, i-2));
    res.json({ clients: r.rows, total: parseInt(count.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/clients', authenticate, async (req, res) => {
  try {
    const { firstName, lastName, phone, email, whatsappPhone, birthday, notes, tags, marketingConsent } = req.body;
    const r = await query(
      `INSERT INTO clients (tenant_id, first_name, last_name, phone, email, whatsapp_phone, birthday, notes, tags, marketing_consent, gdpr_consent, gdpr_consent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,NOW()) RETURNING *`,
      [req.tenantId, firstName, lastName, phone, email, whatsappPhone || phone, birthday, notes, tags || [], marketingConsent || false]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/clients/:id', authenticate, async (req, res) => {
  try {
    const client = await query('SELECT * FROM clients WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
    if (!client.rows[0]) return res.status(404).json({ error: 'Not found' });

    const appointments = await query(
      `SELECT a.*, sv.name AS service_name, sl.name AS salon_name, st.full_name AS staff_name
       FROM appointments a
       JOIN services sv ON a.service_id = sv.id
       JOIN salons sl ON a.salon_id = sl.id
       LEFT JOIN staff st ON a.staff_id = st.id
       WHERE a.client_id = $1 ORDER BY a.start_time DESC LIMIT 20`,
      [req.params.id]
    );

    const messages = await query(
      'SELECT * FROM message_logs WHERE client_id=$1 ORDER BY sent_at DESC LIMIT 20',
      [req.params.id]
    );

    res.json({ client: client.rows[0], appointments: appointments.rows, messages: messages.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Manual messaging ─────────────────────────────────────────────────────

router.post('/messages/send-whatsapp', authenticate, async (req, res) => {
  try {
    const { clientId, message } = req.body;
    const clientRes = await query('SELECT * FROM clients WHERE id=$1 AND tenant_id=$2', [clientId, req.tenantId]);
    const client = clientRes.rows[0];
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const phone = client.whatsapp_phone || client.phone;
    if (!phone) return res.status(400).json({ error: 'Client has no phone number' });

    await sendWhatsApp(req.tenantId, phone, message, { clientId, type: 'manual' });
    res.json({ success: true });
  } catch (err) {
    if (err.message === 'INSUFFICIENT_CREDITS') {
      return res.status(402).json({ error: 'Nepietiek kredītu. Lūdzu, papildiniet kontu.' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.post('/messages/send-email', authenticate, async (req, res) => {
  try {
    const { clientId, subject, htmlBody } = req.body;
    const clientRes = await query('SELECT * FROM clients WHERE id=$1 AND tenant_id=$2', [clientId, req.tenantId]);
    const client = clientRes.rows[0];
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!client.email) return res.status(400).json({ error: 'Client has no email' });

    const tenantRes = await query('SELECT * FROM tenants WHERE id=$1', [req.tenantId]);
    const finalHtml = buildEmailHtml(tenantRes.rows[0], { subject, heading: subject, body: htmlBody });
    await sendEmail(req.tenantId, client.email, subject, finalHtml, { clientId, type: 'manual' });
    res.json({ success: true });
  } catch (err) {
    if (err.message === 'INSUFFICIENT_CREDITS') {
      return res.status(402).json({ error: 'Nepietiek kredītu.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ─── Email campaigns ──────────────────────────────────────────────────────

router.post('/campaigns', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { name, subject, body, targetSegment, scheduledAt } = req.body;
    const r = await query(
      `INSERT INTO email_campaigns (tenant_id, name, subject, body, target_segment, scheduled_at, status)
       VALUES ($1,$2,$3,$4,$5,$6, $7) RETURNING *`,
      [req.tenantId, name, subject, body, targetSegment || 'all',
       scheduledAt, scheduledAt ? 'scheduled' : 'draft']
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/campaigns/:id/send', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const campaign = await query('SELECT * FROM email_campaigns WHERE id=$1 AND tenant_id=$2', [req.params.id, req.tenantId]);
    if (!campaign.rows[0]) return res.status(404).json({ error: 'Not found' });
    const c = campaign.rows[0];

    const tenantRes = await query('SELECT * FROM tenants WHERE id=$1', [req.tenantId]);
    const tenant = tenantRes.rows[0];

    let clientQuery = 'SELECT * FROM clients WHERE tenant_id=$1 AND marketing_consent=true AND email IS NOT NULL';
    const clients = await query(clientQuery, [req.tenantId]);

    await query('UPDATE email_campaigns SET status=$2, sent_at=NOW(), recipient_count=$3 WHERE id=$1',
      [req.params.id, 'sending', clients.rows.length]);

    let sent = 0;
    for (const client of clients.rows) {
      try {
        const html = buildEmailHtml(tenant, {
          subject: c.subject,
          heading: c.subject,
          body: c.body.replace('{{vards}}', client.first_name),
        });
        await sendEmail(req.tenantId, client.email, c.subject, html, { type: 'campaign' });
        sent++;
      } catch (e) {
        console.error(`Campaign email failed for ${client.email}:`, e.message);
      }
    }

    await query('UPDATE email_campaigns SET status=$2 WHERE id=$1', [req.params.id, 'sent']);
    res.json({ sent, total: clients.rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Credits ─────────────────────────────────────────────────────────────

router.get('/credits', authenticate, async (req, res) => {
  const balance = await query('SELECT * FROM credit_accounts WHERE tenant_id=$1', [req.tenantId]);
  const transactions = await query(
    'SELECT * FROM credit_transactions WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50',
    [req.tenantId]
  );
  res.json({ account: balance.rows[0], transactions: transactions.rows, costs: CREDIT_COSTS, markup: PLATFORM_MARKUP });
});

router.post('/credits/add', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const { tenantId, amount, description } = req.body;
    const r = await query(
      `UPDATE credit_accounts SET balance=balance+$2, total_purchased=total_purchased+$2, updated_at=NOW()
       WHERE tenant_id=$1 RETURNING balance`,
      [tenantId, amount]
    );
    await query(
      `INSERT INTO credit_transactions (tenant_id, type, amount, description, balance_after)
       VALUES ($1,'purchase',$2,$3,$4)`,
      [tenantId, amount, description || 'Manual top-up', r.rows[0].balance]
    );
    res.json({ newBalance: r.rows[0].balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Stats ────────────────────────────────────────────────────────────────

router.get('/stats/overview', authenticate, async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateFrom = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const dateTo = to || new Date().toISOString();

    const [revenue, apptCount, newClients, topServices, msgStats] = await Promise.all([
      query(`SELECT COALESCE(SUM(price),0) AS total FROM appointments WHERE tenant_id=$1 AND status='completed' AND start_time BETWEEN $2 AND $3`, [req.tenantId, dateFrom, dateTo]),
      query(`SELECT status, COUNT(*) FROM appointments WHERE tenant_id=$1 AND start_time BETWEEN $2 AND $3 GROUP BY status`, [req.tenantId, dateFrom, dateTo]),
      query(`SELECT COUNT(*) FROM clients WHERE tenant_id=$1 AND client_since BETWEEN $2 AND $3`, [req.tenantId, dateFrom, dateTo]),
      query(`SELECT sv.name, COUNT(*) AS count, SUM(a.price) AS revenue FROM appointments a JOIN services sv ON a.service_id=sv.id WHERE a.tenant_id=$1 AND a.status='completed' AND a.start_time BETWEEN $2 AND $3 GROUP BY sv.name ORDER BY count DESC LIMIT 5`, [req.tenantId, dateFrom, dateTo]),
      query(`SELECT channel, COUNT(*) AS sent FROM message_logs WHERE tenant_id=$1 AND sent_at BETWEEN $2 AND $3 GROUP BY channel`, [req.tenantId, dateFrom, dateTo]),
    ]);

    res.json({
      revenue: parseFloat(revenue.rows[0].total),
      appointments: apptCount.rows,
      newClients: parseInt(newClients.rows[0].count),
      topServices: topServices.rows,
      messagingStats: msgStats.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Services & Staff ─────────────────────────────────────────────────────

router.get('/services', authenticate, async (req, res) => {
  const r = await query(
    'SELECT * FROM services WHERE tenant_id=$1 ORDER BY sort_order, name',
    [req.tenantId]
  );
  res.json(r.rows);
});

router.post('/services', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { name, description, category, durationMinutes, priceFrom, priceTo, color, salonId } = req.body;
    const r = await query(
      `INSERT INTO services (tenant_id, salon_id, name, description, category, duration_minutes, price_from, price_to, color)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.tenantId, salonId || null, name, description, category, durationMinutes, priceFrom, priceTo, color || '#7F77DD']
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/staff', authenticate, async (req, res) => {
  const r = await query(
    'SELECT * FROM staff WHERE tenant_id=$1 AND is_active=true ORDER BY full_name',
    [req.tenantId]
  );
  res.json(r.rows);
});

router.post('/staff', authenticate, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { fullName, title, bio, salonId, serviceIds, phone, email } = req.body;
    const r = await query(
      `INSERT INTO staff (tenant_id, salon_id, full_name, title, bio, service_ids, phone, email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.tenantId, salonId, fullName, title, bio, serviceIds || [], phone, email]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/salons', authenticate, async (req, res) => {
  const r = await query('SELECT * FROM salons WHERE tenant_id=$1 AND is_active=true', [req.tenantId]);
  res.json(r.rows);
});

module.exports = router;
