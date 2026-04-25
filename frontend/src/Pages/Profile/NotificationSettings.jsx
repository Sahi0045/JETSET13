import React, { useState, useEffect } from 'react';
import { Bell, Mail, Phone, MessageSquare, Smartphone, CheckCircle, AlertCircle, Save, Loader } from 'lucide-react';
import supabase from '../../lib/supabase';

export default function NotificationSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [preferences, setPreferences] = useState({
    emailOptIn: true,
    smsOptIn: false,
    pushOptIn: true,
    marketingOptIn: false,
    phone: '',
    language: 'en'
  });

  useEffect(() => {
    loadUserPreferences();
  }, []);

  const loadUserPreferences = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        setUser(authUser);
        
        const { data } = await supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', authUser.id)
          .single();
        
        if (data) {
          setPreferences({
            emailOptIn: data.email_opt_in !== false,
            smsOptIn: data.sms_opt_in || false,
            pushOptIn: data.push_opt_in !== false,
            marketingOptIn: data.marketing_opt_in || false,
            phone: data.phone || '',
            language: data.language || 'en'
          });
        }
      }
    } catch (err) {
      console.log('Using default preferences');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const { error: upsertError } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: user?.id,
          email_opt_in: preferences.emailOptIn,
          sms_opt_in: preferences.smsOptIn,
          push_opt_in: preferences.pushOptIn,
          marketing_opt_in: preferences.marketingOptIn,
          phone: preferences.phone,
          language: preferences.language,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (upsertError) throw upsertError;
      
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePushPermission = async () => {
    if (!('Notification' in window)) {
      setError('Push notifications not supported in this browser');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      console.log('Push permission granted');
    } else {
      setError('Push notification permission denied');
    }
  };

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'fr', name: 'French' },
    { code: 'es', name: 'Spanish' },
    { code: 'de', name: 'German' },
    { code: 'zh', name: 'Chinese' },
    { code: 'ar', name: 'Arabic' }
  ];

  const Toggle = ({ enabled, onChange, label, description, icon: Icon }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: '#1e293b', borderRadius: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {Icon && <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={20} color="white" /></div>}
        <div>
          <div style={{ fontWeight: '500', marginBottom: '4px' }}>{label}</div>
          {description && <div style={{ fontSize: '14px', color: '#94a3b8' }}>{description}</div>}
        </div>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        style={{
          width: '52px', height: '28px', borderRadius: '14px', border: 'none',
          background: enabled ? '#10b981' : '#475569', position: 'relative', cursor: 'pointer',
          transition: 'background 0.2s'
        }}
      >
        <div style={{
          width: '22px', height: '22px', borderRadius: '50%', background: 'white',
          position: 'absolute', top: '3px', left: enabled ? '27px' : '3px', transition: 'left 0.2s'
        }} />
      </button>
    </div>
  );

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading preferences...</div>;

  return (
    <div style={{ padding: '24px', color: '#f1f5f9', maxWidth: '700px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '600', margin: 0 }}>Notification Settings</h1>
        <p style={{ color: '#94a3b8', margin: '8px 0 0' }}>Manage how you receive updates and alerts</p>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: '#fef2f2', borderRadius: '8px', color: '#dc2626', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {saved && (
        <div style={{ padding: '12px 16px', background: '#064e3b', borderRadius: '8px', color: '#10b981', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle size={16} /> Settings saved successfully!
        </div>
      )}

      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bell size={20} /> Notification Channels
        </h2>
        <div style={{ display: 'grid', gap: '12px' }}>
          <Toggle enabled={preferences.emailOptIn} onChange={(v) => setPreferences({ ...preferences, emailOptIn: v })} label="Email Notifications" description="Receive updates via email" icon={Mail} />
          <Toggle enabled={preferences.smsOptIn} onChange={(v) => setPreferences({ ...preferences, smsOptIn: v })} label="SMS Notifications" description="Get text messages for important alerts" icon={MessageSquare} />
          <Toggle enabled={preferences.pushOptIn} onChange={(v) => { setPreferences({ ...preferences, pushOptIn: v }); if (v) handlePushPermission(); }} label="Push Notifications" description="Browser notifications for real-time updates" icon={Smartphone} />
        </div>
      </div>

      {preferences.smsOptIn && (
        <div style={{ marginBottom: '24px', padding: '16px', background: '#1e293b', borderRadius: '12px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}><Phone size={18} /> Phone Number</h3>
          <input type="tel" value={preferences.phone} onChange={(e) => setPreferences({ ...preferences, phone: e.target.value })} placeholder="+1 234 567 8900" style={{ width: '100%', padding: '12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9', fontSize: '16px' }} />
          <p style={{ marginTop: '8px', fontSize: '14px', color: '#64748b' }}>Required for SMS notifications</p>
        </div>
      )}

      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Marketing Preferences</h2>
        <Toggle enabled={preferences.marketingOptIn} onChange={(v) => setPreferences({ ...preferences, marketingOptIn: v })} label="Marketing Emails" description="Receive promotions, deals, and travel inspiration" />
      </div>

      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Language</h2>
        <select value={preferences.language} onChange={(e) => setPreferences({ ...preferences, language: e.target.value })} style={{ width: '100%', padding: '12px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9', fontSize: '16px' }}>
          {languages.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
      </div>

      <button onClick={handleSave} disabled={saving} style={{ width: '100%', padding: '14px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: '500', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
        {saving ? <Loader size={18} className="animate-spin" /> : <Save size={18} />}
        Save Preferences
      </button>
    </div>
  );
}