import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const MARKETS = [
  'Atlanta, GA', 'Chattanooga, TN', 'Knoxville, TN',
  'Asheville, NC', 'Nashville, TN', 'Birmingham, AL'
];

const PROPERTY_TYPES = ['Single Family', 'Multi Family', 'Condo', 'Townhouse'];

export default function AlertCriteriaSettings({ user }) {
  const [criteria, setCriteria] = useState({
    markets: [],
    min_coc: 8,
    max_price: 300000,
    property_types: ['Single Family'],
    email_alerts: true,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load existing criteria on mount
  useEffect(() => {
    if (!user) return;
    supabase
      .from('user_alert_criteria')
      .select('*')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data) setCriteria(data);
      });
  }, [user]);

  const toggleItem = (field, value) => {
    setCriteria(prev => {
      const arr = prev[field];
      return {
        ...prev,
        [field]: arr.includes(value)
          ? arr.filter(v => v !== value)
          : [...arr, value]
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('user_alert_criteria')
      .upsert({ ...criteria, user_id: user.id }, { onConflict: 'user_id' });

    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: 480 }}>
      <h3 style={{ marginBottom: '1rem' }}>🔔 Deal Alert Preferences</h3>

      {/* Markets */}
      <label style={{ fontWeight: 600 }}>Markets to watch</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '8px 0 16px' }}>
        {MARKETS.map(m => (
          <button
            key={m}
            onClick={() => toggleItem('markets', m)}
            style={{
              padding: '4px 12px',
              borderRadius: 20,
              border: '1.5px solid',
              borderColor: criteria.markets.includes(m) ? '#2563eb' : '#d1d5db',
              background: criteria.markets.includes(m) ? '#eff6ff' : 'white',
              color: criteria.markets.includes(m) ? '#2563eb' : '#374151',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Property Types */}
      <label style={{ fontWeight: 600 }}>Property types</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '8px 0 16px' }}>
        {PROPERTY_TYPES.map(t => (
          <button
            key={t}
            onClick={() => toggleItem('property_types', t)}
            style={{
              padding: '4px 12px',
              borderRadius: 20,
              border: '1.5px solid',
              borderColor: criteria.property_types.includes(t) ? '#2563eb' : '#d1d5db',
              background: criteria.property_types.includes(t) ? '#eff6ff' : 'white',
              color: criteria.property_types.includes(t) ? '#2563eb' : '#374151',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Min CoC */}
      <label style={{ fontWeight: 600 }}>
        Minimum Cash-on-Cash Return: <span style={{ color: '#2563eb' }}>{criteria.min_coc}%</span>
      </label>
      <input
        type="range" min={4} max={20} step={0.5}
        value={criteria.min_coc}
        onChange={e => setCriteria(p => ({ ...p, min_coc: parseFloat(e.target.value) }))}
        style={{ width: '100%', margin: '8px 0 16px' }}
      />

      {/* Max Price */}
      <label style={{ fontWeight: 600 }}>
        Max Purchase Price: <span style={{ color: '#2563eb' }}>${criteria.max_price.toLocaleString()}</span>
      </label>
      <input
        type="range" min={50000} max={750000} step={5000}
        value={criteria.max_price}
        onChange={e => setCriteria(p => ({ ...p, max_price: parseInt(e.target.value) }))}
        style={{ width: '100%', margin: '8px 0 16px' }}
      />

      {/* Email Alerts Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <label style={{ fontWeight: 600 }}>Email alerts</label>
        <div
          onClick={() => setCriteria(p => ({ ...p, email_alerts: !p.email_alerts }))}
          style={{
            width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
            background: criteria.email_alerts ? '#2563eb' : '#d1d5db',
            position: 'relative', transition: 'background 0.2s'
          }}
        >
          <div style={{
            position: 'absolute', top: 3,
            left: criteria.email_alerts ? 22 : 3,
            width: 18, height: 18, borderRadius: '50%',
            background: 'white', transition: 'left 0.2s'
          }} />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          width: '100%', padding: '10px 0',
          background: saved ? '#16a34a' : '#2563eb',
          color: 'white', border: 'none',
          borderRadius: 8, fontWeight: 600,
          fontSize: 15, cursor: 'pointer'
        }}
      >
        {saving ? 'Saving…' : saved ? '✅ Saved!' : 'Save Alert Preferences'}
      </button>
    </div>
  );
}