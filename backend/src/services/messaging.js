// src/services/messaging.js
const twilio = require('twilio');
const sgMail = require('@sendgrid/mail');
const { query } = require('../models/db');
const { format, parseISO } = require('date-fns');
const { lv } = require('date-fns/locale');

// Credit costs (EUR cents stored as decimals)
const CREDIT_COSTS = {
  whatsapp: 0.05,  // 5 euro cents per WA message
  email: 0.005,    // 0.5 cents per email
  sms: 0.08,       // 8 cents per SMS
};

// Platform markup multiplier (2x = 100% markup)
const PLATFORM_MARKUP = 2.0;

async function getTenantCredentials(tenantId) {
  const res = await query(
    `SELECT twilio_account_sid, twilio_auth_token, twilio_whatsapp_from,
            sendgrid_api_key, sendgrid_from_email, sendgrid_from_name,
            name, primary_color, locale
     FROM tenants WHERE id = $1`,
    [tenantId]
  );
  return res.rows[0];
}

async function checkAndDeductCredits(tenantId, channel, count = 1) {
  const cost = CREDIT_COSTS[channel] * PLATFORM_MARKUP * count;

  const res = await query(
    `UPDATE credit_accounts
     SET balance = balance - $2, total_spent = total_spent + $2, updated_at = NOW()
     WHERE tenant_id = $1 AND balance >= $2
     RETURNING balance`,
    [tenantId, cost]
  );

  if (res.rowCount === 0) {
    throw new Error('INSUFFICIENT_CREDITS');
  }

  await query(
    `INSERT INTO credit_transactions (tenant_id, type, amount, description, balance_after)
     VALUES ($1, 'spend', $2, $3, $4)`,
    [tenantId, -cost, `${channel} message sent`, res.rows[0].balance]
  );

  return { cost, remainingBalance: res.rows[0].balance };
}

async function logMessage(tenantId, data) {
  await query(
    `INSERT INTO message_logs
     (tenant_id, appointment_id, client_id, channel, type, to_address, subject, body, status, provider_message_id, cost_credits)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      tenantId, data.appointmentId, data.clientId, data.channel, data.type,
      data.to, data.subject, data.body, data.status,
      data.providerMessageId, data.cost || 0
    ]
  );
}

function formatAppointmentText(appointment, tenant) {
  const date = format(parseISO(appointment.start_time), "EEEE, d. MMMM 'plkst.' HH:mm", { locale: lv });
  return {
    date,
    clientName: appointment.client_first_name,
    serviceName: appointment.service_name,
    staffName: appointment.staff_name || 'mūsu speciālistam',
    salonName: appointment.salon_name,
    salonAddress: appointment.salon_address,
    price: appointment.price ? `${appointment.price}€` : '',
    bookingToken: appointment.booking_token,
  };
}

// ─── WhatsApp via Twilio ───────────────────────────────────────────────────

async function sendWhatsApp(tenantId, toPhone, message, opts = {}) {
  const creds = await getTenantCredentials(tenantId);

  if (!creds.twilio_account_sid || !creds.twilio_auth_token) {
    throw new Error('Twilio credentials not configured for this tenant');
  }

  // Deduct credits first
  const { cost } = await checkAndDeductCredits(tenantId, 'whatsapp');

  const client = twilio(creds.twilio_account_sid, creds.twilio_auth_token);

  // Format phone: ensure +371 prefix for Latvia
  const formattedPhone = toPhone.startsWith('+') ? toPhone : `+371${toPhone}`;

  try {
    const msg = await client.messages.create({
      from: `whatsapp:${creds.twilio_whatsapp_from}`,
      to: `whatsapp:${formattedPhone}`,
      body: message,
    });

    await logMessage(tenantId, {
      appointmentId: opts.appointmentId,
      clientId: opts.clientId,
      channel: 'whatsapp',
      type: opts.type || 'manual',
      to: formattedPhone,
      body: message,
      status: 'sent',
      providerMessageId: msg.sid,
      cost,
    });

    return { success: true, messageSid: msg.sid };
  } catch (err) {
    await logMessage(tenantId, {
      appointmentId: opts.appointmentId,
      clientId: opts.clientId,
      channel: 'whatsapp',
      type: opts.type || 'manual',
      to: formattedPhone,
      body: message,
      status: 'failed',
      error: err.message,
      cost: 0,
    });
    // Refund credits on failure
    await query(
      `UPDATE credit_accounts SET balance = balance + $2, total_spent = total_spent - $2
       WHERE tenant_id = $1`,
      [tenantId, cost]
    );
    throw err;
  }
}

// ─── Email via SendGrid ───────────────────────────────────────────────────

async function sendEmail(tenantId, toEmail, subject, htmlBody, opts = {}) {
  const creds = await getTenantCredentials(tenantId);

  if (!creds.sendgrid_api_key) {
    throw new Error('SendGrid API key not configured');
  }

  const { cost } = await checkAndDeductCredits(tenantId, 'email');

  sgMail.setApiKey(creds.sendgrid_api_key);

  const msg = {
    to: toEmail,
    from: {
      email: creds.sendgrid_from_email,
      name: creds.sendgrid_from_name || creds.name,
    },
    subject,
    html: htmlBody,
    trackingSettings: {
      clickTracking: { enable: true },
      openTracking: { enable: true },
    },
  };

  try {
    const [response] = await sgMail.send(msg);

    await logMessage(tenantId, {
      appointmentId: opts.appointmentId,
      clientId: opts.clientId,
      channel: 'email',
      type: opts.type || 'manual',
      to: toEmail,
      subject,
      body: htmlBody,
      status: 'sent',
      providerMessageId: response.headers['x-message-id'],
      cost,
    });

    return { success: true };
  } catch (err) {
    await logMessage(tenantId, {
      channel: 'email',
      type: opts.type || 'manual',
      to: toEmail,
      subject,
      status: 'failed',
      cost: 0,
    });
    await query(
      `UPDATE credit_accounts SET balance = balance + $2, total_spent = total_spent - $2
       WHERE tenant_id = $1`,
      [tenantId, cost]
    );
    throw err;
  }
}

// ─── Email HTML builder ───────────────────────────────────────────────────

function buildEmailHtml(tenant, content) {
  const primaryColor = tenant.primary_color || '#7F77DD';
  return `
<!DOCTYPE html>
<html lang="lv">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${content.subject}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden">
      <tr><td style="background:${primaryColor};padding:24px 32px;text-align:center">
        ${tenant.logo_url ? `<img src="${tenant.logo_url}" height="48" alt="${tenant.name}" style="max-height:48px">` : `<h1 style="color:#fff;margin:0;font-size:22px">${tenant.name}</h1>`}
      </td></tr>
      <tr><td style="padding:32px">
        <h2 style="color:#1a1a1a;margin:0 0 16px;font-size:20px">${content.heading}</h2>
        <p style="color:#555;line-height:1.7;margin:0 0 24px">${content.body}</p>
        ${content.details ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:8px;padding:16px;margin:0 0 24px">
          ${content.details.map(d => `
          <tr>
            <td style="color:#888;font-size:13px;padding:4px 0;width:140px">${d.label}</td>
            <td style="color:#1a1a1a;font-size:13px;font-weight:bold;padding:4px 0">${d.value}</td>
          </tr>`).join('')}
        </table>` : ''}
        ${content.cta ? `
        <table cellpadding="0" cellspacing="0"><tr><td>
          <a href="${content.cta.url}" style="display:inline-block;background:${primaryColor};color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px">${content.cta.label}</a>
        </td></tr></table>` : ''}
      </td></tr>
      <tr><td style="padding:16px 32px;border-top:1px solid #eee;text-align:center">
        <p style="color:#aaa;font-size:12px;margin:0">${tenant.name} · ${tenant.address || ''}</p>
        <p style="color:#ccc;font-size:11px;margin:4px 0 0">Šis ir automātisks paziņojums. Lai atceltu pierakstu, sazinieties ar salonu.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// ─── Reminder message builders ────────────────────────────────────────────

function build24hWhatsApp(appt, tenant) {
  const { date, clientName, serviceName, staffName, salonName, salonAddress } = formatAppointmentText(appt, tenant);
  return `Sveika, ${clientName}! 👋

Atgādinām, ka *rīt ${date}* jums ir pieraksts:

✂️ *${serviceName}*
👤 ${staffName}
📍 ${salonName}, ${salonAddress}

Ja nepieciešams pārcelt vai atcelt, lūdzu sazinieties ar mums.

_${tenant.name}_`;
}

function build2hWhatsApp(appt, tenant) {
  const { date, clientName, serviceName, salonAddress } = formatAppointmentText(appt, tenant);
  return `Sveika, ${clientName}! ⏰

Atgādinājums — *pēc 2 stundām* jūs gaidām:

✂️ *${serviceName}*
📍 ${salonAddress}

Uz tikšanos! 🌸

_${tenant.name}_`;
}

function buildConfirmationWhatsApp(appt, tenant) {
  const { date, clientName, serviceName, salonName, salonAddress, price } = formatAppointmentText(appt, tenant);
  return `Sveika, ${clientName}! ✅

Jūsu pieraksts ir apstiprināts:

📅 *${date}*
✂️ *${serviceName}*
📍 ${salonName}, ${salonAddress}
${price ? `💰 ${price}` : ''}

Paldies, ka izvēlējāties mūs!

_${tenant.name}_`;
}

function buildBirthdayWhatsApp(client, tenant) {
  const year = new Date().getFullYear();
  return `Sveika, ${client.first_name}! 🎂🎉

*Daudz laimes dzimšanas dienā!* Vēlam veselību un skaistumu!

Kā dāvanu no mums — *15% atlaide* nākamajam apmeklējumam šomēnes.

Kods: *BD${String(year).slice(-2)}*

Ar labākajiem novēlējumiem,
_${tenant.name}_ 🌸`;
}

function buildAfterVisitWhatsApp(appt, tenant) {
  const { clientName, serviceName } = formatAppointmentText(appt, tenant);
  return `Paldies, ${clientName}! 🙏

Ceram, ka bijāt apmierināta ar *${serviceName}*!

Ja vēlaties rezervēt nākamo vizīti, vienkārši atbildiet uz šo ziņu vai apmeklējiet:
🔗 ${tenant.booking_url || `https://${tenant.slug}.beautybook.lv`}

Uz tikšanos nākamreiz! ✨

_${tenant.name}_`;
}

module.exports = {
  sendWhatsApp,
  sendEmail,
  buildEmailHtml,
  build24hWhatsApp,
  build2hWhatsApp,
  buildConfirmationWhatsApp,
  buildBirthdayWhatsApp,
  buildAfterVisitWhatsApp,
  CREDIT_COSTS,
  PLATFORM_MARKUP,
  checkAndDeductCredits,
  getTenantCredentials,
};
