import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function ServersPage() {
  const [guilds, setGuilds] = useState([]);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    guild_id: '',
    guild_name: '',
    primary_channel_id: '',
    mirror_type: 'discord_webhook',
    mirror_webhook_url: '',
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const data = await api.getGuilds();
      setGuilds(data.guilds);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createGuild(form);
      setForm({ guild_id: '', guild_name: '', primary_channel_id: '', mirror_type: 'discord_webhook', mirror_webhook_url: '' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Disconnect this server?')) return;
    await api.deleteGuild(id);
    await load();
  }

  return (
    <div>
      <h1 style={styles.title}>Connected servers</h1>
      <p style={styles.sub}>
        Connect the Discord server your bot is running in, and where command activity should mirror to.
      </p>

      {error && <div style={styles.error}>{error}</div>}

      <form onSubmit={handleSubmit} style={styles.form}>
        <Field label="Server (guild) ID" value={form.guild_id} onChange={(v) => setForm({ ...form, guild_id: v })} required />
        <Field label="Server name (optional)" value={form.guild_name} onChange={(v) => setForm({ ...form, guild_name: v })} />
        <Field
          label="Primary channel ID"
          value={form.primary_channel_id}
          onChange={(v) => setForm({ ...form, primary_channel_id: v })}
        />

        <label style={styles.label}>
          Mirror destination
          <select
            style={styles.input}
            value={form.mirror_type}
            onChange={(e) => setForm({ ...form, mirror_type: e.target.value })}
          >
            <option value="discord_webhook">Second Discord channel (webhook)</option>
            <option value="slack_webhook">Slack (incoming webhook)</option>
            <option value="none">None</option>
          </select>
        </label>

        {form.mirror_type !== 'none' && (
          <Field
            label="Mirror webhook URL"
            value={form.mirror_webhook_url}
            onChange={(v) => setForm({ ...form, mirror_webhook_url: v })}
            placeholder="https://discord.com/api/webhooks/... or https://hooks.slack.com/services/..."
          />
        )}

        <button type="submit" style={styles.button} disabled={saving}>
          {saving ? 'Connecting…' : 'Connect server'}
        </button>
      </form>

      <div style={styles.list}>
        {guilds.map((g) => (
          <div key={g.id} style={styles.card}>
            <div>
              <div style={styles.cardName}>{g.guild_name || g.guild_id}</div>
              <div style={styles.cardMeta}>
                guild_id: {g.guild_id} · mirror: {g.mirror_type}
              </div>
            </div>
            <button style={styles.deleteBtn} onClick={() => handleDelete(g.id)}>
              Disconnect
            </button>
          </div>
        ))}
        {guilds.length === 0 && <div style={styles.emptyCard}>No servers connected yet.</div>}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, required, placeholder }) {
  return (
    <label style={styles.label}>
      {label}
      <input
        style={styles.input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
      />
    </label>
  );
}

const styles = {
  title: { fontSize: 20, fontWeight: 600, margin: '0 0 6px' },
  sub: { color: 'var(--text-muted)', fontSize: 13, marginBottom: 24, maxWidth: 560 },
  form: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    maxWidth: 480,
    marginBottom: 28,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  input: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '9px 11px',
    color: 'var(--text)',
    fontSize: 13,
    fontFamily: 'var(--font-mono)',
  },
  button: {
    background: 'var(--signal-green)',
    color: '#06140c',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    padding: '10px 0',
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    marginTop: 6,
  },
  list: { display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 600 },
  card: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '12px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardName: { fontSize: 14, fontWeight: 600 },
  cardMeta: { fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: 2 },
  deleteBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--signal-red)',
    fontSize: 12,
    padding: '6px 12px',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
  },
  emptyCard: {
    color: 'var(--text-muted)',
    fontSize: 13,
    padding: '16px 0',
  },
  error: {
    background: 'rgba(255, 93, 93, 0.1)',
    border: '1px solid rgba(255, 93, 93, 0.3)',
    color: 'var(--signal-red)',
    padding: '10px 14px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 13,
    marginBottom: 16,
    maxWidth: 480,
  },
};
