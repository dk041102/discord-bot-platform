import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function CommandsPage() {
  const [guilds, setGuilds] = useState([]);
  const [selectedGuild, setSelectedGuild] = useState('');
  const [configs, setConfigs] = useState([]);
  const [error, setError] = useState(null);
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    api.getGuilds().then((data) => {
      setGuilds(data.guilds);
      if (data.guilds.length > 0) setSelectedGuild(data.guilds[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedGuild) return;
    api
      .getCommandConfigs(selectedGuild)
      .then((data) => setConfigs(data.configs))
      .catch((err) => setError(err.message));
  }, [selectedGuild]);

  async function updateConfig(id, patch) {
    setSavingId(id);
    try {
      const { config } = await api.updateCommandConfig(id, patch);
      setConfigs((prev) => prev.map((c) => (c.id === id ? config : c)));
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  }

  if (guilds.length === 0) {
    return (
      <div>
        <h1 style={styles.title}>Command rules</h1>
        <p style={styles.sub}>Connect a server first on the Servers page — command rules are per-server.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={styles.title}>Command rules</h1>
      <p style={styles.sub}>Toggle behavior per command, without redeploying anything.</p>

      <select style={styles.select} value={selectedGuild} onChange={(e) => setSelectedGuild(e.target.value)}>
        {guilds.map((g) => (
          <option key={g.id} value={g.id}>
            {g.guild_name || g.guild_id}
          </option>
        ))}
      </select>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.list}>
        {configs.map((c) => (
          <div key={c.id} style={styles.card}>
            <div style={styles.cardHeader}>
              <span style={styles.cmdName}>/{c.command_name}</span>
              {savingId === c.id && <span style={styles.saving}>saving…</span>}
            </div>

            <Toggle
              label="Enabled"
              checked={c.enabled}
              onChange={(v) => updateConfig(c.id, { enabled: v })}
            />
            <Toggle
              label="Mirror to second channel"
              checked={c.mirror_enabled}
              onChange={(v) => updateConfig(c.id, { mirror_enabled: v })}
            />
            <Toggle
              label="AI triage (summarize + tag)"
              checked={c.ai_triage_enabled}
              onChange={(v) => updateConfig(c.id, { ai_triage_enabled: v })}
            />

            <label style={styles.label}>
              Reply template
              <input
                style={styles.input}
                defaultValue={c.reply_template}
                onBlur={(e) => {
                  if (e.target.value !== c.reply_template) {
                    updateConfig(c.id, { reply_template: e.target.value });
                  }
                }}
              />
              <span style={styles.hint}>Use {'{input}'} to insert the command's text.</span>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label style={styles.toggleRow}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

const styles = {
  title: { fontSize: 20, fontWeight: 600, margin: '0 0 6px' },
  sub: { color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 },
  select: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text)',
    padding: '8px 12px',
    fontSize: 13,
    marginBottom: 20,
  },
  list: { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 },
  card: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cmdName: { fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14 },
  saving: { fontSize: 11, color: 'var(--signal-amber)' },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 13,
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: 12,
    color: 'var(--text-muted)',
    marginTop: 4,
  },
  input: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '8px 10px',
    color: 'var(--text)',
    fontSize: 13,
    fontFamily: 'var(--font-mono)',
  },
  hint: { fontSize: 11, color: 'var(--text-dim)' },
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
