// src/jobs/reminders.js
const cron = require('node-cron');
const { query } = require('../models/db');
const {
  sendWhatsApp, sendEmail, buildEmailHtml, getTenantCredentials,
  build24hWhatsApp, build2hWhatsApp, buildConfirmationWhatsApp,
  buildBirthdayWhatsApp, buildAfterVisitWhatsApp,
} = require('../services/messaging');

// ─── 24h reminders — runs every hour at :05 ───────────────────────────────
async function send24hReminders() {
  console.log('[CRON] Checking 24h reminders...');
  try {
    const res = await query(`
      SELECT
        a.id, a.start_time, a.booking_token, a.price,
        a.tenant_id,
        c.first_name AS client_first_name, c.phone, c.whatsapp_phone, c.email,
        c.id AS client_id,
        sv.name AS service_name,
        st.full_name AS staff_name,
        sl.name AS salon_name, sl.address AS salon_address,
        t.whatsapp_reminder_24h, t.email_reminder_24h,
        t.primary_color, t.name AS tenant_name, t.logo_url, t.address AS tenant_address
      FROM appointments a
      JOIN clients c ON a.client_id = c.id
      JOIN services sv ON a.service_id = sv.id
      JOIN salons sl ON a.salon_id = sl.id
      JOIN tenants t ON a.tenant_id = t.id
      LEFT JOIN staff st ON a.staff_id = st.id
      WHERE a.status IN ('confirmed','pending')
        AND a.reminder_24h_sent = false
        AND a.start_time BETWEEN NOW() + INTERVAL '23 hours' AND NOW() + INTERVAL '25 hours'
    `);

    for (const appt of res.rows) {
      try {
        // WhatsApp reminder
        if (appt.whatsapp_reminder_24h && (appt.whatsapp_phone || appt.phone)) {
          const message = build24hWhatsApp(appt, {
            name: appt.tenant_name,
            primary_color: appt.primary_color,
          });
          await sendWhatsApp(appt.tenant_id, appt.whatsapp_phone || appt.phone, message, {
            appointmentId: appt.id,
            clientId: appt.client_id,
            type: 'reminder_24h',
          });
        }

        // Email reminder
        if (appt.email_reminder_24h && appt.email) {
          const creds = await getTenantCredentials(appt.tenant_id);
          const html = buildEmailHtml(
            { ...creds, name: appt.tenant_name, logo_url: appt.logo_url, address: appt.tenant_address, primary_color: appt.primary_color },
            {
              subject: `Atgādinājums: jūsu vizīte rīt — ${appt.service_name}`,
              heading: `Atgādinājums par vizīti`,
              body: `Sveika, ${appt.client_first_name}! Atgādinām, ka jums ir pieraksts uz rītdienu.`,
              details: [
                { label: 'Pakalpojums', value: appt.service_name },
                { label: 'Speciālists', value: appt.staff_name || 'Mūsu speciālists' },
                { label: 'Salons', value: appt.salon_name },
                { label: 'Adrese', value: appt.salon_address },
                { label: 'Laiks', value: new Date(appt.start_time).toLocaleString('lv-LV', { dateStyle: 'full', timeStyle: 'short' }) },
                ...(appt.price ? [{ label: 'Cena', value: `${appt.price}€` }] : []),
              ],
            }
          );
          await sendEmail(
            appt.tenant_id, appt.email,
            `Atgādinājums: jūsu vizīte rīt — ${appt.service_name}`,
            html,
            { appointmentId: appt.id, clientId: appt.client_id, type: 'reminder_24h' }
          );
        }

        await query(
          'UPDATE appointments SET reminder_24h_sent = true WHERE id = $1',
          [appt.id]
        );
        console.log(`[CRON] 24h reminder sent for appt ${appt.id}`);
      } catch (err) {
        if (err.message === 'INSUFFICIENT_CREDITS') {
          console.warn(`[CRON] Insufficient credits for tenant ${appt.tenant_id}`);
        } else {
          console.error(`[CRON] Failed reminder for appt ${appt.id}:`, err.message);
        }
      }
    }

    console.log(`[CRON] 24h reminders done. Processed: ${res.rows.length}`);
  } catch (err) {
    console.error('[CRON] 24h reminder job error:', err);
  }
}

// ─── 2h reminders — runs every 15 minutes ────────────────────────────────
async function send2hReminders() {
  try {
    const res = await query(`
      SELECT
        a.id, a.start_time, a.tenant_id,
        c.first_name AS client_first_name, c.phone, c.whatsapp_phone,
        c.id AS client_id,
        sv.name AS service_name,
        sl.address AS salon_address,
        t.whatsapp_reminder_2h, t.name AS tenant_name, t.primary_color
      FROM appointments a
      JOIN clients c ON a.client_id = c.id
      JOIN services sv ON a.service_id = sv.id
      JOIN salons sl ON a.salon_id = sl.id
      JOIN tenants t ON a.tenant_id = t.id
      WHERE a.status IN ('confirmed','pending')
        AND a.reminder_2h_sent = false
        AND a.start_time BETWEEN NOW() + INTERVAL '1 hour 45 min' AND NOW() + INTERVAL '2 hours 15 min'
    `);

    for (const appt of res.rows) {
      try {
        if (appt.whatsapp_reminder_2h && (appt.whatsapp_phone || appt.phone)) {
          const message = build2hWhatsApp(appt, { name: appt.tenant_name });
          await sendWhatsApp(appt.tenant_id, appt.whatsapp_phone || appt.phone, message, {
            appointmentId: appt.id,
            clientId: appt.client_id,
            type: 'reminder_2h',
          });
        }
        await query(
          'UPDATE appointments SET reminder_2h_sent = true WHERE id = $1',
          [appt.id]
        );
      } catch (err) {
        console.error(`[CRON] 2h reminder failed for ${appt.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[CRON] 2h reminder job error:', err);
  }
}

// ─── After-visit messages — runs every hour at :30 ───────────────────────
async function sendAfterVisitMessages() {
  try {
    const res = await query(`
      SELECT
        a.id, a.start_time, a.tenant_id,
        c.first_name AS client_first_name, c.phone, c.whatsapp_phone,
        c.id AS client_id,
        sv.name AS service_name,
        t.whatsapp_after_visit, t.name AS tenant_name, t.slug
      FROM appointments a
      JOIN clients c ON a.client_id = c.id
      JOIN services sv ON a.service_id = sv.id
      JOIN tenants t ON a.tenant_id = t.id
      WHERE a.status = 'completed'
        AND a.end_time BETWEEN NOW() - INTERVAL '2 hours' AND NOW() - INTERVAL '30 minutes'
        AND NOT EXISTS (
          SELECT 1 FROM message_logs ml
          WHERE ml.appointment_id = a.id AND ml.type = 'after_visit'
        )
    `);

    for (const appt of res.rows) {
      try {
        if (appt.whatsapp_after_visit && (appt.whatsapp_phone || appt.phone)) {
          const message = buildAfterVisitWhatsApp(appt, {
            name: appt.tenant_name,
            slug: appt.slug,
          });
          await sendWhatsApp(appt.tenant_id, appt.whatsapp_phone || appt.phone, message, {
            appointmentId: appt.id,
            clientId: appt.client_id,
            type: 'after_visit',
          });
        }
      } catch (err) {
        console.error(`[CRON] After-visit failed for ${appt.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[CRON] After-visit job error:', err);
  }
}

// ─── Birthday messages — runs daily at 09:00 ─────────────────────────────
async function sendBirthdayMessages() {
  try {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    const res = await query(`
      SELECT
        c.id, c.first_name, c.phone, c.whatsapp_phone, c.tenant_id,
        t.whatsapp_birthday, t.name AS tenant_name
      FROM clients c
      JOIN tenants t ON c.tenant_id = t.id
      WHERE EXTRACT(MONTH FROM c.birthday) = $1
        AND EXTRACT(DAY FROM c.birthday) = $2
        AND c.marketing_consent = true
        AND t.whatsapp_birthday = true
        AND NOT EXISTS (
          SELECT 1 FROM message_logs ml
          WHERE ml.client_id = c.id
            AND ml.type = 'birthday'
            AND EXTRACT(YEAR FROM ml.sent_at) = EXTRACT(YEAR FROM NOW())
        )
    `, [month, day]);

    for (const client of res.rows) {
      try {
        if (client.whatsapp_phone || client.phone) {
          const message = buildBirthdayWhatsApp(client, { name: client.tenant_name });
          await sendWhatsApp(client.tenant_id, client.whatsapp_phone || client.phone, message, {
            clientId: client.id,
            type: 'birthday',
          });
        }
      } catch (err) {
        console.error(`[CRON] Birthday failed for client ${client.id}:`, err.message);
      }
    }

    console.log(`[CRON] Birthday messages sent: ${res.rows.length}`);
  } catch (err) {
    console.error('[CRON] Birthday job error:', err);
  }
}

// ─── Register all cron jobs ───────────────────────────────────────────────
function startJobs() {
  // 24h reminders — every hour at minute 5
  cron.schedule('5 * * * *', send24hReminders, { timezone: 'Europe/Riga' });

  // 2h reminders — every 15 minutes
  cron.schedule('*/15 * * * *', send2hReminders, { timezone: 'Europe/Riga' });

  // After-visit — every hour at minute 30
  cron.schedule('30 * * * *', sendAfterVisitMessages, { timezone: 'Europe/Riga' });

  // Birthdays — daily at 09:00 Riga time
  cron.schedule('0 9 * * *', sendBirthdayMessages, { timezone: 'Europe/Riga' });

  console.log('✅ Cron jobs registered (24h, 2h, after-visit, birthday)');
}

module.exports = { startJobs, send24hReminders, send2hReminders, sendBirthdayMessages };
