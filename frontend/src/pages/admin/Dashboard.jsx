// src/pages/admin/Dashboard.jsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getStats, getAppointments, updateAppointment, getTenant } from '../../lib/api';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { lv } from 'date-fns/locale';
import { useTenantStore } from '../../lib/store';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

export default function Dashboard() {
  const setTenant = useTenantStore(s => s.setTenant);
  const today = format(new Date(), 'yyyy-MM-dd');
  const [selectedAppt, setSelectedAppt] = useState(null);

  const { data: tenantData } = useQuery({ queryKey: ['tenant'], queryFn: getTenant });
  const { data: stats } = useQuery({
    queryKey: ['stats', 'month'],
    queryFn: () => getStats({
      from: startOfMonth(new Date()).toISOString(),
      to: endOfMonth(new Date()).toISOString(),
    }),
  });
  const { data: todayAppts } = useQuery({
    queryKey: ['appointments', 'today'],
    queryFn: () => getAppointments({ date: today }),
    refetchInterval: 30000,
  });

  const qc = useQueryClient();
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateAppointment(id, data),
    onSuccess: () => { qc.invalidateQueries(['appointments']); qc.invalidateQueries(['stats']); toast.success('Saglabāts'); },
  });

  useEffect(() => {
    if (tenantData) setTenant(tenantData);
  }, [tenantData]);

  const todayList = todayAppts?.appointments || [];
  const cancelled = todayList.filter(a => a.status === 'cancelled').length;
  const completed = todayList.filter(a => a.status === 'completed').length;

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 20, color: 'var(--color-text-primary)' }}>
        {format(new Date(), "EEEE, d. MMMM", { locale: lv })}
      </h1>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
        <MetricCard label="Šodienas pieraksti" value={todayList.length} sub={`${completed} pabeigti`} />
        <MetricCard label="Mēneša ieņēmumi" value={`${Math.round(stats?.revenue || 0)}€`} sub="šomēnes" />
        <MetricCard label="Jaunākie klienti" value={stats?.newClients || 0} sub="šomēnes" />
        <MetricCard label="Kredītu atlikums" value={`${parseFloat(tenantData?.credits?.balance || 0).toFixed(2)}€`} sub="WA + email" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>
        {/* Today's appointments */}
        <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ fontSize: 14, fontWeight: 500 }}>Šodienas pieraksti</h2>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{cancelled > 0 ? `${cancelled} atcelts` : `${todayList.length} kopā`}</span>
          </div>

          {todayList.length === 0 && (
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, textAlign: 'center', padding: 24 }}>Nav šodienas pierakstu</p>
          )}

          {todayList.map(appt => (
            <div key={appt.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
              <div style={{ width: 3, height: 36, borderRadius: 2, background: appt.service_color || 'var(--color-primary, #7F77DD)', flexShrink: 0 }}></div>
              <div style={{ minWidth: 40, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {format(new Date(appt.start_time), 'HH:mm')}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{appt.first_name} {appt.last_name}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{appt.service_name} · {appt.duration_minutes} min</div>
              </div>
              <StatusBadge status={appt.status} />
              {appt.status === 'confirmed' && (
                <button onClick={() => updateMutation.mutate({ id: appt.id, data: { status: 'completed' } })}
                  style={{ fontSize: 11, padding: '4px 8px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                  ✓
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Stats sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 500, marginBottom: 14 }}>Populārākie pakalpojumi</h2>
            {stats?.topServices?.map(s => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 13, flex: 1, color: 'var(--color-text-primary)' }}>{s.name}</span>
                <div style={{ width: 80, height: 6, background: 'var(--color-background-secondary)', borderRadius: 3, margin: '0 10px' }}>
                  <div style={{ width: `${Math.min(100, s.count * 3)}%`, height: '100%', borderRadius: 3, background: 'var(--color-primary, #7F77DD)' }}></div>
                </div>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', minWidth: 20 }}>{s.count}×</span>
              </div>
            ))}
          </div>

          <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 500, marginBottom: 14 }}>Ziņojumu statistika</h2>
            {stats?.messagingStats?.map(s => (
              <div key={s.channel} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: 13 }}>
                <span style={{ color: 'var(--color-text-secondary)', textTransform: 'capitalize' }}>{s.channel}</span>
                <span style={{ fontWeight: 500 }}>{s.sent} nosūtīts</span>
              </div>
            ))}
          </div>

          {/* Credit warning */}
          {tenantData?.credits?.balance < 2 && (
            <div style={{ background: '#FAEEDA', border: '0.5px solid #FAC775', borderRadius: 10, padding: 12 }}>
              <p style={{ fontSize: 13, color: '#633806', fontWeight: 500 }}>⚠ Kredīti beidzas</p>
              <p style={{ fontSize: 12, color: '#854F0B', marginTop: 4 }}>Atlikums: {parseFloat(tenantData.credits.balance).toFixed(2)}€. Papildiniet, lai atgādinājumi turpinātu darboties.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub }) {
  return (
    <div style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    confirmed: { bg: '#E1F5EE', color: '#085041', label: 'Apstiprināts' },
    pending: { bg: '#FAEEDA', color: '#633806', label: 'Gaida' },
    completed: { bg: '#E6F1FB', color: '#0C447C', label: 'Pabeigts' },
    cancelled: { bg: '#FCEBEB', color: '#791F1F', label: 'Atcelts' },
    no_show: { bg: '#F1EFE8', color: '#444441', label: 'Neieradās' },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 500 }}>
      {s.label}
    </span>
  );
}
