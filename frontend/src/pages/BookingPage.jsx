// src/pages/BookingPage.jsx
import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getPublicTenant, getSlots, createBooking } from '../lib/api';
import { format, addDays, parseISO } from 'date-fns';
import { lv } from 'date-fns/locale';
import toast from 'react-hot-toast';

const STEPS = ['Pakalpojums', 'Speciālists', 'Laiks', 'Kontakti', 'Apstiprinājums'];

export default function BookingPage() {
  const { slug } = useParams();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState({
    service: null, staff: null, salon: null, slot: null, date: new Date(),
  });
  const [clientData, setClientData] = useState({
    firstName: '', lastName: '', phone: '', email: '', whatsapp: '',
    notes: '', gdprConsent: false, marketingConsent: false,
  });
  const [booked, setBooked] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['public-tenant', slug],
    queryFn: () => getPublicTenant(slug),
  });

  const { data: slotsData, isLoading: slotsLoading } = useQuery({
    queryKey: ['slots', selected.salon?.id, selected.staff?.id, selected.service?.id, format(selected.date, 'yyyy-MM-dd')],
    queryFn: () => getSlots({
      tenantId: data?.tenant?.id,
      salonId: selected.salon?.id,
      staffId: selected.staff?.id,
      serviceId: selected.service?.id,
      date: format(selected.date, 'yyyy-MM-dd'),
    }),
    enabled: step === 2 && !!selected.service && !!selected.salon,
  });

  const bookMutation = useMutation({
    mutationFn: createBooking,
    onSuccess: (data) => setBooked(data),
    onError: (err) => toast.error(err.response?.data?.error || 'Kļūda rezervējot'),
  });

  // Apply tenant branding
  useEffect(() => {
    if (data?.tenant) {
      const t = data.tenant;
      document.documentElement.style.setProperty('--bp', t.primary_color || '#7F77DD');
      document.documentElement.style.setProperty('--bs', t.secondary_color || '#1D9E75');
      if (t.logo_url) {
        const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
        link.rel = 'shortcut icon';
        link.href = t.logo_url;
        document.head.appendChild(link);
      }
      document.title = `Rezervēt — ${t.name}`;
    }
    // Auto-select salon if only one
    if (data?.salons?.length === 1) {
      setSelected(s => ({ ...s, salon: data.salons[0] }));
    }
  }, [data]);

  if (isLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: '#888' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #eee', borderTopColor: 'var(--bp, #7F77DD)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }}></div>
        Ielādē...
      </div>
    </div>
  );

  if (error || !data) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 18, color: '#555' }}>Salons nav atrasts</p>
    </div>
  );

  const { tenant, salons, services, staff } = data;
  const primary = tenant.primary_color || '#7F77DD';

  const submit = () => {
    if (!clientData.gdprConsent) { toast.error('Lūdzu, piekrītiet datu apstrādes noteikumiem'); return; }
    bookMutation.mutate({
      tenantSlug: slug,
      salonId: selected.salon?.id || salons[0]?.id,
      serviceId: selected.service.id,
      staffId: selected.staff?.id,
      datetime: selected.slot.datetime,
      clientFirstName: clientData.firstName,
      clientLastName: clientData.lastName,
      clientPhone: clientData.phone,
      clientEmail: clientData.email,
      clientWhatsapp: clientData.whatsapp || clientData.phone,
      notes: clientData.notes,
      gdprConsent: clientData.gdprConsent,
      marketingConsent: clientData.marketingConsent,
    });
  };

  if (booked) return (
    <div style={{ minHeight: '100vh', background: '#f9f9f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 40, maxWidth: 440, width: '100%', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>✓</div>
        <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8, color: '#1a1a1a' }}>Rezervācija apstiprināta!</h2>
        <p style={{ color: '#666', marginBottom: 24, lineHeight: 1.6 }}>
          WhatsApp apstiprinājums nosūtīts uz {clientData.phone}.<br />
          Atgādinājumu saņemsiet 24h un 2h pirms vizītes.
        </p>
        <div style={{ background: '#f5f5f5', borderRadius: 10, padding: 16, textAlign: 'left', marginBottom: 20 }}>
          <Row label="Pakalpojums" value={selected.service?.name} />
          <Row label="Datums" value={selected.slot ? format(parseISO(selected.slot.datetime), "EEEE, d. MMMM 'plkst.' HH:mm", { locale: lv }) : ''} />
          <Row label="Speciālists" value={selected.staff?.full_name || 'Jebkurš pieejamais'} />
        </div>
        {tenant.logo_url ? <img src={tenant.logo_url} alt={tenant.name} style={{ maxHeight: 36, margin: '0 auto', display: 'block', opacity: 0.7 }} /> : <p style={{ color: '#aaa', fontSize: 13 }}>{tenant.name}</p>}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', fontFamily: `'Inter', sans-serif` }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>

      {/* Header */}
      <div style={{ background: primary, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {tenant.logo_url
          ? <img src={tenant.logo_url} alt={tenant.name} style={{ maxHeight: 40 }} />
          : <span style={{ color: '#fff', fontWeight: 700, fontSize: 20 }}>{tenant.name}</span>
        }
        <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>Tiešsaistes rezervācija</span>
      </div>

      {/* Hero */}
      <div style={{ background: primary, padding: '0 24px 32px', color: '#fff', textAlign: 'center' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>{tenant.booking_page_headline}</h1>
        <p style={{ opacity: 0.8, fontSize: 15 }}>{tenant.booking_page_subline}</p>
      </div>

      {/* Progress */}
      <div style={{ background: '#fff', borderBottom: '1px solid #eee', padding: '12px 24px' }}>
        <div style={{ display: 'flex', gap: 0, maxWidth: 560, margin: '0 auto' }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: i < step ? primary : '#eee', marginRight: 4 }}></div>}
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', fontSize: 11, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: i <= step ? primary : '#eee',
                  color: i <= step ? '#fff' : '#aaa',
                }}>{i < step ? '✓' : i + 1}</div>
                {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: i < step - 1 ? primary : '#eee', marginLeft: 4 }}></div>}
              </div>
              <span style={{ fontSize: 10, color: i === step ? primary : '#aaa', fontWeight: i === step ? 600 : 400 }}>{s}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 580, margin: '0 auto', padding: '24px 16px' }}>

        {/* Step 0: Service */}
        {step === 0 && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: '#1a1a1a' }}>Izvēlieties pakalpojumu</h2>
            {salons.length > 1 && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>Salons</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {salons.map(s => (
                    <button key={s.id} onClick={() => setSelected(p => ({ ...p, salon: s }))}
                      style={{ padding: '8px 16px', borderRadius: 8, border: `2px solid ${selected.salon?.id === s.id ? primary : '#e0e0e0'}`, background: selected.salon?.id === s.id ? primary + '15' : '#fff', color: selected.salon?.id === s.id ? primary : '#555', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {Object.entries(groupBy(services, 'category')).map(([cat, svcs]) => (
              <div key={cat} style={{ marginBottom: 20 }}>
                {cat && cat !== 'null' && <p style={{ fontSize: 12, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{cat}</p>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {svcs.map(s => (
                    <button key={s.id} onClick={() => { setSelected(p => ({ ...p, service: s })); setStep(1); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 10, border: `2px solid ${selected.service?.id === s.id ? primary : '#e8e8e8'}`, background: '#fff', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s' }}>
                      <div style={{ width: 8, height: 40, borderRadius: 4, background: s.color || primary, flexShrink: 0 }}></div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 15, color: '#1a1a1a' }}>{s.name}</div>
                        {s.description && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{s.description}</div>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 700, color: primary, fontSize: 15 }}>
                          {s.price_from && s.price_to && s.price_from !== s.price_to ? `${s.price_from}–${s.price_to}€` : s.price_from ? `${s.price_from}€` : ''}
                        </div>
                        <div style={{ fontSize: 12, color: '#aaa' }}>{s.duration_minutes} min</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Step 1: Staff */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: '#1a1a1a' }}>Izvēlieties speciālistu</h2>
            <button onClick={() => { setSelected(p => ({ ...p, staff: null })); setStep(2); }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 10, border: '2px solid #e8e8e8', background: '#fff', cursor: 'pointer', width: '100%', marginBottom: 8, textAlign: 'left' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>✦</div>
              <div><div style={{ fontWeight: 600, fontSize: 15, color: '#1a1a1a' }}>Jebkurš pieejamais</div><div style={{ fontSize: 12, color: '#888' }}>Pieraksts pie pirmā brīvā speciālista</div></div>
            </button>
            {staff.filter(st => !selected.service || !st.service_ids?.length || st.service_ids.includes(selected.service.id)).map(st => (
              <button key={st.id} onClick={() => { setSelected(p => ({ ...p, staff: st })); setStep(2); }}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 10, border: `2px solid ${selected.staff?.id === st.id ? primary : '#e8e8e8'}`, background: '#fff', cursor: 'pointer', width: '100%', marginBottom: 8, textAlign: 'left' }}>
                {st.avatar_url
                  ? <img src={st.avatar_url} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} alt={st.full_name} />
                  : <div style={{ width: 44, height: 44, borderRadius: '50%', background: primary + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: primary, fontSize: 16 }}>{st.full_name.charAt(0)}</div>
                }
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: '#1a1a1a' }}>{st.full_name}</div>
                  {st.title && <div style={{ fontSize: 12, color: '#888' }}>{st.title}</div>}
                </div>
              </button>
            ))}
            <button onClick={() => setStep(0)} style={{ marginTop: 12, background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 13 }}>← Atpakaļ</button>
          </div>
        )}

        {/* Step 2: Time slot */}
        {step === 2 && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: '#1a1a1a' }}>Izvēlieties laiku</h2>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 16 }}>
              {Array.from({ length: 14 }).map((_, i) => {
                const d = addDays(new Date(), i);
                const isSelected = format(d, 'yyyy-MM-dd') === format(selected.date, 'yyyy-MM-dd');
                return (
                  <button key={i} onClick={() => setSelected(p => ({ ...p, date: d, slot: null }))}
                    style={{ flexShrink: 0, padding: '8px 12px', borderRadius: 10, border: `2px solid ${isSelected ? primary : '#e8e8e8'}`, background: isSelected ? primary : '#fff', color: isSelected ? '#fff' : '#555', cursor: 'pointer', textAlign: 'center', minWidth: 56 }}>
                    <div style={{ fontSize: 11, opacity: 0.8 }}>{format(d, 'EEE', { locale: lv })}</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{format(d, 'd')}</div>
                  </button>
                );
              })}
            </div>
            {slotsLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>Ielādē brīvos laikus...</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {slotsData?.slots?.map(slot => (
                  <button key={slot.time} onClick={() => { setSelected(p => ({ ...p, slot })); setStep(3); }}
                    style={{ padding: '10px 0', borderRadius: 8, border: `2px solid ${selected.slot?.time === slot.time ? primary : '#e8e8e8'}`, background: selected.slot?.time === slot.time ? primary : '#fff', color: selected.slot?.time === slot.time ? '#fff' : '#1a1a1a', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                    {slot.time}
                  </button>
                ))}
                {!slotsData?.slots?.length && (
                  <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 32, color: '#aaa', fontSize: 14 }}>
                    Nav brīvu laiku šajā dienā. Lūdzu, izvēlieties citu datumu.
                  </div>
                )}
              </div>
            )}
            <button onClick={() => setStep(1)} style={{ marginTop: 16, background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 13 }}>← Atpakaļ</button>
          </div>
        )}

        {/* Step 3: Contact info */}
        {step === 3 && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: '#1a1a1a' }}>Jūsu kontaktinformācija</h2>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>Atgādinājumi tiks sūtīti uz norādīto WhatsApp numuru.</p>

            <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid #f0f0f0' }}>
              <Row label="Pakalpojums" value={selected.service?.name} />
              <Row label="Laiks" value={selected.slot ? format(parseISO(selected.slot.datetime), "EEEE, d. MMMM 'plkst.' HH:mm", { locale: lv }) : ''} />
              <Row label="Speciālists" value={selected.staff?.full_name || 'Jebkurš pieejamais'} />
              {selected.service?.price_from && <Row label="Cena" value={`${selected.service.price_from}€`} />}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <Field label="Vārds *" value={clientData.firstName} onChange={v => setClientData(p => ({ ...p, firstName: v }))} />
              <Field label="Uzvārds" value={clientData.lastName} onChange={v => setClientData(p => ({ ...p, lastName: v }))} />
            </div>
            <Field label="Tālrunis / WhatsApp *" value={clientData.phone} onChange={v => setClientData(p => ({ ...p, phone: v }))} placeholder="+371 ________" style={{ marginBottom: 12 }} />
            <Field label="E-pasts (neobligāts)" value={clientData.email} onChange={v => setClientData(p => ({ ...p, email: v }))} placeholder="jusu@epasts.lv" style={{ marginBottom: 12 }} />
            <Field label="Piezīmes (neobligāts)" value={clientData.notes} onChange={v => setClientData(p => ({ ...p, notes: v }))} placeholder="Alerģijas, vēlmes..." style={{ marginBottom: 16 }} />

            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={clientData.gdprConsent} onChange={e => setClientData(p => ({ ...p, gdprConsent: e.target.checked }))} style={{ marginTop: 2, accentColor: primary }} />
              <span style={{ fontSize: 12, color: '#666', lineHeight: 1.5 }}>* Piekrītu, ka {tenant.name} apstrādā manus personas datus rezervācijas veikšanai saskaņā ar GDPR.</span>
            </label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 20, cursor: 'pointer' }}>
              <input type="checkbox" checked={clientData.marketingConsent} onChange={e => setClientData(p => ({ ...p, marketingConsent: e.target.checked }))} style={{ marginTop: 2, accentColor: primary }} />
              <span style={{ fontSize: 12, color: '#666', lineHeight: 1.5 }}>Piekrītu saņemt atgādinājumus un speciālos piedāvājumus WhatsApp vai e-pastā.</span>
            </label>

            <button onClick={submit} disabled={bookMutation.isPending || !clientData.firstName || !clientData.phone}
              style={{ width: '100%', padding: 16, background: primary, color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer', opacity: bookMutation.isPending ? 0.7 : 1 }}>
              {bookMutation.isPending ? 'Rezervē...' : 'Apstiprināt rezervāciju'}
            </button>

            <button onClick={() => setStep(2)} style={{ marginTop: 12, background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 13, width: '100%' }}>← Atpakaļ</button>
          </div>
        )}
      </div>

      {/* Powered by (small, unobtrusive) */}
      <div style={{ textAlign: 'center', padding: '16px 0 32px', color: '#ccc', fontSize: 11 }}>
        Powered by BeautyBook
      </div>
    </div>
  );
}

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f5f5f5', fontSize: 13 }}>
      <span style={{ color: '#888' }}>{label}</span>
      <span style={{ color: '#1a1a1a', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, style }) {
  return (
    <div style={style}>
      <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 4 }}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 14, outline: 'none', color: '#1a1a1a', background: '#fff' }} />
    </div>
  );
}

function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key] || 'null';
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}
