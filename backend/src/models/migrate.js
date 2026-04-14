// src/models/migrate.js
const { pool } = require('./db');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        custom_domain VARCHAR(255) UNIQUE,
        logo_url TEXT,
        primary_color VARCHAR(7) DEFAULT '#7F77DD',
        secondary_color VARCHAR(7) DEFAULT '#1D9E75',
        font_choice VARCHAR(50) DEFAULT 'Inter',
        booking_page_headline TEXT DEFAULT 'Rezervējiet savu vizīti',
        booking_page_subline TEXT DEFAULT 'Ērta tiešsaistes rezervācija',
        address TEXT,
        phone VARCHAR(50),
        email VARCHAR(255),
        website VARCHAR(255),
        instagram VARCHAR(100),
        facebook VARCHAR(100),
        timezone VARCHAR(50) DEFAULT 'Europe/Riga',
        locale VARCHAR(10) DEFAULT 'lv',
        currency VARCHAR(3) DEFAULT 'EUR',
        twilio_account_sid VARCHAR(100),
        twilio_auth_token VARCHAR(100),
        twilio_whatsapp_from VARCHAR(50),
        sendgrid_api_key VARCHAR(100),
        sendgrid_from_email VARCHAR(255),
        sendgrid_from_name VARCHAR(255),
        whatsapp_reminder_24h BOOLEAN DEFAULT true,
        whatsapp_reminder_2h BOOLEAN DEFAULT true,
        whatsapp_after_visit BOOLEAN DEFAULT true,
        whatsapp_birthday BOOLEAN DEFAULT true,
        email_reminder_24h BOOLEAN DEFAULT true,
        email_confirmation BOOLEAN DEFAULT true,
        plan VARCHAR(20) DEFAULT 'starter',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS salons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        address TEXT,
        city VARCHAR(100),
        phone VARCHAR(50),
        email VARCHAR(255),
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        working_hours JSONB DEFAULT '{"mon":{"open":"09:00","close":"18:00","closed":false},"tue":{"open":"09:00","close":"18:00","closed":false},"wed":{"open":"09:00","close":"18:00","closed":false},"thu":{"open":"09:00","close":"18:00","closed":false},"fri":{"open":"09:00","close":"18:00","closed":false},"sat":{"open":"10:00","close":"16:00","closed":false},"sun":{"open":"10:00","close":"16:00","closed":true}}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'staff' CHECK (role IN ('superadmin','owner','manager','staff')),
        salon_id UUID REFERENCES salons(id),
        avatar_url TEXT,
        phone VARCHAR(50),
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tenant_id, email)
      );

      CREATE TABLE IF NOT EXISTS services (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        salon_id UUID REFERENCES salons(id),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        duration_minutes INTEGER NOT NULL DEFAULT 60,
        price_from DECIMAL(8,2),
        price_to DECIMAL(8,2),
        color VARCHAR(7) DEFAULT '#7F77DD',
        is_active BOOLEAN DEFAULT true,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS staff (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id),
        full_name VARCHAR(255) NOT NULL,
        title VARCHAR(100),
        bio TEXT,
        avatar_url TEXT,
        phone VARCHAR(50),
        email VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        accepts_bookings BOOLEAN DEFAULT true,
        service_ids UUID[],
        working_hours JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS clients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100),
        email VARCHAR(255),
        phone VARCHAR(50),
        whatsapp_phone VARCHAR(50),
        birthday DATE,
        notes TEXT,
        tags TEXT[],
        preferred_salon_id UUID REFERENCES salons(id),
        preferred_staff_id UUID REFERENCES staff(id),
        gdpr_consent BOOLEAN DEFAULT false,
        gdpr_consent_at TIMESTAMPTZ,
        marketing_consent BOOLEAN DEFAULT false,
        total_visits INTEGER DEFAULT 0,
        total_spent DECIMAL(10,2) DEFAULT 0,
        last_visit_at TIMESTAMPTZ,
        client_since TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS appointments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        salon_id UUID NOT NULL REFERENCES salons(id),
        client_id UUID NOT NULL REFERENCES clients(id),
        staff_id UUID REFERENCES staff(id),
        service_id UUID NOT NULL REFERENCES services(id),
        start_time TIMESTAMPTZ NOT NULL,
        end_time TIMESTAMPTZ NOT NULL,
        status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled','completed','no_show')),
        price DECIMAL(8,2),
        notes TEXT,
        internal_notes TEXT,
        source VARCHAR(30) DEFAULT 'admin' CHECK (source IN ('admin','booking_page','whatsapp','phone')),
        reminder_24h_sent BOOLEAN DEFAULT false,
        reminder_2h_sent BOOLEAN DEFAULT false,
        confirmation_sent BOOLEAN DEFAULT false,
        cancel_reason TEXT,
        cancelled_at TIMESTAMPTZ,
        booking_token UUID DEFAULT gen_random_uuid(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS message_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        channel VARCHAR(20) NOT NULL CHECK (channel IN ('whatsapp','email','sms')),
        language VARCHAR(10) DEFAULT 'lv',
        subject VARCHAR(255),
        body TEXT NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS message_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        appointment_id UUID REFERENCES appointments(id),
        client_id UUID REFERENCES clients(id),
        channel VARCHAR(20) NOT NULL,
        type VARCHAR(50) NOT NULL,
        to_address VARCHAR(255) NOT NULL,
        subject VARCHAR(255),
        body TEXT,
        status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent','delivered','failed','bounced')),
        provider_message_id VARCHAR(255),
        error_message TEXT,
        cost_credits DECIMAL(6,4) DEFAULT 0,
        sent_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS credit_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
        balance DECIMAL(10,4) DEFAULT 0,
        total_purchased DECIMAL(10,2) DEFAULT 0,
        total_spent DECIMAL(10,2) DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS credit_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL CHECK (type IN ('purchase','spend','refund','bonus')),
        amount DECIMAL(10,4) NOT NULL,
        description TEXT,
        reference_id UUID,
        balance_after DECIMAL(10,4),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS email_campaigns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        target_segment VARCHAR(50) DEFAULT 'all',
        status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','sent','cancelled')),
        scheduled_at TIMESTAMPTZ,
        sent_at TIMESTAMPTZ,
        recipient_count INTEGER DEFAULT 0,
        open_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_appointments_tenant_start ON appointments(tenant_id, start_time);
      CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments(client_id);
      CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(tenant_id, phone);
      CREATE INDEX IF NOT EXISTS idx_message_logs_tenant ON message_logs(tenant_id, sent_at);
    `);

    await client.query('COMMIT');
    console.log('✅ Migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
