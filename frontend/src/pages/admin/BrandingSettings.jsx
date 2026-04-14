// src/pages/admin/BrandingSettings.jsx
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTenant, updateBranding, updateIntegrations } from '../../lib/api';
import { useTenantStore } from '../../lib/store';
import toast from 'react-hot-toast';

const FONTS = ['Inter', 'Playfair Display', 'Montserrat', 'Raleway', 'Lato', 'Poppins', 'Cormorant Garamond'];
const PRESETS = [
  { name: 'Violets', primary: '#7F77DD', secondary: '#1D9E75' },
  { name: 'Rozā', primary: '#D4537E', secondary: '#534AB7' },
  { name: 'Zelta', primary: '#BA7517', secondary: '#533434' },
  { name: 'Zaļš', primary: '#1D9E75', secondary: '#534AB7' },
  { name: 'Tumšs', primary: '#2C2C2A', secondary: '#7F77DD' },
  { name: 'Koraļļu', primary: '#D85A30', secondary: '#1D9E75' },
];

export default function BrandingSettings() {
  const { data: tenant, isLoading } = useQuery({ queryKey: ['tenant'], queryFn: getTenant });
  const setTenant = useTenantStore(s => s.setTenant);
  const qc = useQueryClient();

  const [brand, setBrand] = useState({
    primary_color: '#7F77DD', secondary_color: '#1D9E75',
    font_choice: 'Inter', logo_url: '',
    booking_page_headline: '', booking_page_subline: '',
    address: '', phone: '', email: '', instagram: '', facebook: '',
  });

  const [integrations, setIntegrations] = useState({
    twilio_account_sid: '', twilio_auth_token: '', twilio_whatsapp_from: '',
    sendgrid_api_key: '', sendgrid_from_email: '', sendgrid_from_name: '',
    custom_domain: '',
  });

  const [showSecrets, setShowSecrets] = useState(false);

  useEffect(() => {
    if (tenant) {
      setBrand({
        primary_color: tenant.primary_color || '#7F77DD',
        secondary_color: tenant.secondary_color || '#1D9E75',
        font_choice: tenant.font_choice || 'Inter',
        logo_url: tenant.logo_url || '',
        booking_page_headline: tenant.booking_page_headline || '',
        booking_page_subline: tenant.booking_page_subline || '',
        address: tenant.address || '',
        phone: tenant.phone || '',
        email: tenant.email || '',
        instagram: tenant.instagram || '',
        facebook: tenant.facebook || '',
      });
      setIntegrations({
        twilio_account_sid: tenant.twilio_account_sid || '',
        twilio_auth_token: '',
        twilio_whatsapp_from: tenant.twilio_whatsapp_from || '',
        sendgrid_api_key: '',
        sendgrid_from_email: tenant.sendgrid_from_email || '',
        sendgrid_from_name: tenant.sendgrid_from_name || '',
        custom_domain: tenant.custom_domain || '',
      });
    }
  }, [tenant]);

  const brandMutation = useMutation({
    mutationFn: updateBranding,
    onSuccess: (data) => {
      setTenant(data);
      qc.invalidateQueries(['tenant']);
      toast.success('Dizains saglabāts!');
    },
    onError: () => toast.error('Kļūda saglabājot'),
  });

  const integrationsMutation = useMutation({
    mutationFn: updateIntegrations,
    onSuccess: () => toast.success('Integrācijas saglabātas!'),
    onError: () => toast.error('Kļūda saglabājot'),
  });

  if (isLoading) return <div style={{ padding: 40, color: 'var(--color-text-secondary)' }}>Ielādē...</div>;

  const bookingUrl = `https://${tenant?.slug}.beautybook.lv`;

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 24 }}>Dizains un branding</h1>

      {/* Live preview */}
      <div style={{ background: brand.primary_color, borderRadius: 12, padding: '20px 24px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          {brand.logo_url
            ? <img src={brand.logo_url} alt="Logo" style={{ maxHeight: 44, maxWidth: 200 }} />
            : <span style={{ color: '#fff', fontWeight: 700, fontSize: 20, fontFamily: `'${brand.font_choice}', sans-serif` }}>{tenant?.name}</span>
          }
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 6, fontFamily: `'${brand.font_choice}', sans-serif` }}>
            {brand.booking_page_headline || 'Rezervējiet savu vizīti'}
          </p>
        </div>
        <div style={{ background: brand.secondary_color, color: '#fff', padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
          Rezervēt
        </div>
      </div>

      <Card title="Krāsas">
        <div style={{ marginBottom: 16 }}>
          <Label>Ātrās izvēles</Label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {PRESETS.map(p => (
              <button key={p.name} onClick={() => setBrand(b => ({ ...b, primary_color: p.primary, secondary_color: p.secondary }))}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: '0.5px solid var(--color-border-secondary)', background: 'transparent', cursor: 'pointer' }}>
                <div style={{ width: 14, height: 14, borderRadius: '50%', background: p.primary }}></div>
                <div style={{ width: 14, height: 14, borderRadius: '50%', background: p.secondary }}></div>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{p.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <Label>Galvenā krāsa</Label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <input type="color" value={brand.primary_color} onChange={e => setBrand(b => ({ ...b, primary_color: e.target.value }))}
                style={{ width: 44, height: 36, border: '0.5px solid var(--color-border-secondary)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
              <input value={brand.primary_color} onChange={e => setBrand(b => ({ ...b, primary_color: e.target.value }))}
                style={{ flex: 1, padding: '8px 10px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 6, fontSize: 13, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }} />
            </div>
          </div>
          <div>
            <Label>Akcenta krāsa</Label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <input type="color" value={brand.secondary_color} onChange={e => setBrand(b => ({ ...b, secondary_color: e.target.value }))}
                style={{ width: 44, height: 36, border: '0.5px solid var(--color-border-secondary)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
              <input value={brand.secondary_color} onChange={e => setBrand(b => ({ ...b, secondary_color: e.target.value }))}
                style={{ flex: 1, padding: '8px 10px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 6, fontSize: 13, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }} />
            </div>
          </div>
        </div>
      </Card>

      <Card title="Fonts un teksts">
        <div style={{ marginBottom: 14 }}>
          <Label>Fonts</Label>
          <select value={brand.font_choice} onChange={e => setBrand(b => ({ ...b, font_choice: e.target.value }))}
            style={{ width: '100%', marginTop: 6, padding: '8px 10px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 6, fontSize: 13, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
            {FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 14 }}>
          <Label>Rezervācijas lapas virsraksts</Label>
          <input value={brand.booking_page_headline} onChange={e => setBrand(b => ({ ...b, booking_page_headline: e.target.value }))}
            placeholder="Rezervējiet savu vizīti"
            style={{ width: '100%', marginTop: 6, padding: '8px 10px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 6, fontSize: 13, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }} />
        </div>
        <div>
          <Label>Apakšvirsraksts</Label>
          <input value={brand.booking_page_subline} onChange={e => setBrand(b => ({ ...b, booking_page_subline: e.target.value }))}
            placeholder="Ērta tiešsaistes rezervācija"
            style={{ width: '100%', marginTop: 6, padding: '8px 10px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 6, fontSize: 13, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }} />
        </div>
      </Card>

      <Card title="Logo un kontakti">
        <div style={{ marginBottom: 14 }}>
          <Label>Logo URL (Cloudinary vai cits CDN)</Label>
          <input value={brand.logo_url} onChange={e => setBrand(b => ({ ...b, logo_url: e.target.value }))}
            placeholder="https://res.cloudinary.com/..."
            style={{ width: '100%', marginTop: 6, padding: '8px 10px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 6, fontSize: 13, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[['Adrese', 'address', 'Brīvības iela 42, Rīga'], ['Tālrunis', 'phone', '+371 2612 3456'], ['E-pasts', 'email', 'info@jususalon.lv'], ['Instagram', 'instagram', '@jususalon']].map(([label, key, ph]) => (
            <div key={key}>
              <Label>{label}</Label>
              <input value={brand[key]} onChange={e => setBrand(b => ({ ...b, [key]: e.target.value }))}
                placeholder={ph}
                style={{ width: '100%', marginTop: 6, padding: '8px 10px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 6, fontSize: 13, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }} />
            </div>
          ))}
        </div>
      </Card>

      <button onClick={() => brandMutation.mutate(brand)} disabled={brandMutation.isPending}
        style={{ padding: '10px 24px', background: 'var(--color-primary, #534AB7)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500, marginBottom: 32 }}>
        {brandMutation.isPending ? 'Saglabā...' : 'Saglabāt dizainu'}
      </button>

      {/* Integrations */}
      <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 16 }}>Integrācijas</h1>

      <div style={{ background: '#E1F5EE', border: '0.5px solid #9FE1CB', borderRadius: 10, padding: 14, marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: '#085041', fontWeight: 500, marginBottom: 4 }}>Jūsu rezervāciju lapa</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <a href={bookingUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#0F6E56', textDecoration: 'none', fontWeight: 500 }}>{bookingUrl}</a>
          <button onClick={() => { navigator.clipboard.writeText(bookingUrl); toast.success('Nokopēts!'); }}
            style={{ fontSize: 11, padding: '3px 8px', border: '0.5px solid #5DCAA5', borderRadius: 4, background: 'transparent', cursor: 'pointer', color: '#0F6E56' }}>
            Kopēt
          </button>
        </div>
      </div>

      <Card title="WhatsApp (Twilio)">
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 14, lineHeight: 1.6 }}>
          Reģistrējieties <a href="https://twilio.com" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>twilio.com</a>, aktivizējiet WhatsApp Business API un ievadiet kredenciāļus zemāk.
          Mūsu platforma pārskaita atgādinājumus ar uzcenojumu — jūs maksājat per-ziņa.
        </p>
        <div style={{ display: 'grid', gap: 12 }}>
          <FormField label="Account SID" value={integrations.twilio_account_sid} onChange={v => setIntegrations(p => ({ ...p, twilio_account_sid: v }))} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
          <FormField label="Auth Token" value={integrations.twilio_auth_token} onChange={v => setIntegrations(p => ({ ...p, twilio_auth_token: v }))} type={showSecrets ? 'text' : 'password'} placeholder="Atstājiet tukšu, lai nemainītu" />
          <FormField label="WhatsApp numurs (no Twilio)" value={integrations.twilio_whatsapp_from} onChange={v => setIntegrations(p => ({ ...p, twilio_whatsapp_from: v }))} placeholder="+14155238886" />
        </div>
      </Card>

      <Card title="E-pasts (SendGrid)">
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 14 }}>
          Reģistrējieties <a href="https://sendgrid.com" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>sendgrid.com</a>, izveidojiet API atslēgu un iestatiet sūtītāja verifikāciju.
        </p>
        <div style={{ display: 'grid', gap: 12 }}>
          <FormField label="API Key" value={integrations.sendgrid_api_key} onChange={v => setIntegrations(p => ({ ...p, sendgrid_api_key: v }))} type={showSecrets ? 'text' : 'password'} placeholder="SG.xxxxxxxxxx..." />
          <FormField label="Sūtītāja e-pasts" value={integrations.sendgrid_from_email} onChange={v => setIntegrations(p => ({ ...p, sendgrid_from_email: v }))} placeholder="info@jususalon.lv" />
          <FormField label="Sūtītāja vārds" value={integrations.sendgrid_from_name} onChange={v => setIntegrations(p => ({ ...p, sendgrid_from_name: v }))} placeholder="Bloom Salons" />
        </div>
      </Card>

      <Card title="Custom domēns">
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 14, lineHeight: 1.6 }}>
          Pievienojiet sava domēna CNAME ierakstu: <code style={{ background: 'var(--color-background-secondary)', padding: '2px 6px', borderRadius: 4 }}>booking.jusudomens.lv → cname.beautybook.lv</code>
        </p>
        <FormField label="Jūsu domēns" value={integrations.custom_domain} onChange={v => setIntegrations(p => ({ ...p, custom_domain: v }))} placeholder="booking.jusudomens.lv" />
      </Card>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 40 }}>
        <button onClick={() => integrationsMutation.mutate(integrations)} disabled={integrationsMutation.isPending}
          style={{ padding: '10px 24px', background: 'var(--color-primary, #534AB7)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}>
          {integrationsMutation.isPending ? 'Saglabā...' : 'Saglabāt integrācijas'}
        </button>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 13, color: 'var(--color-text-secondary)' }}>
          <input type="checkbox" checked={showSecrets} onChange={e => setShowSecrets(e.target.checked)} />
          Rādīt atslēgas
        </label>
      </div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 14, color: 'var(--color-text-primary)' }}>{title}</h3>
      {children}
    </div>
  );
}

function Label({ children }) {
  return <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block' }}>{children}</label>;
}

function FormField({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <Label>{label}</Label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', marginTop: 6, padding: '8px 10px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 6, fontSize: 13, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)' }} />
    </div>
  );
}
