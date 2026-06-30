import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import StatusPipeline from '../components/StatusPipeline.jsx';

const POLL_MS = 5000;

export default function LogPage() {
  const [interactions, setInteractions] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    try {
      const [logData, statsData] = await Promise.all([
        api.getInteractions(filter ? { status: filter } : {}),
        api.getStats(),
      ]);
      setInteractions(logData.interactions);
      setStats(statsData);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [filter]);

  useEffect(() => {
    load();
    // Simple poll rather than a websocket — appropriate for a 72-hour build
    // and a free-tier host; "live" here means "refreshes every few seconds,"
    // which is honest about what it is rather than over-promising real-time.
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.title}>Command log</h1>
        <div style={styles.statRow}>
          <Stat label="total" value={stats?.total} />
          <Stat label="last 24h" value={stats?.last_24h} />
          <Stat label="failed" value={stats?.failed} tone="red" />
          <Stat label="mirror pending" value={stats?.mirror_pending} tone="amber" />
        </div>
      </div>

      <div style={styles.filters}>
        {['', 'received', 'processing', 'responded', 'mirrored', 'failed'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              ...styles.filterBtn,
              ...(filter === s ? styles.filterBtnActive : {}),
            }}
          >
            {s || 'all'}
          </button>
        ))}
      </div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <Th>time</Th>
              <Th>command</Th>
              <Th>user</Th>
              <Th>input</Th>
              <Th>response</Th>
              <Th>pipeline</Th>
            </tr>
          </thead>
          <tbody>
            {interactions.length === 0 && (
              <tr>
                <td colSpan={6} style={styles.empty}>
                  No commands yet — run /report or /status in your connected server to see it appear here.
                </td>
              </tr>
            )}
            {interactions.map((row) => (
              <tr key={row.id} style={styles.row}>
                <Td mono dim>
                  {formatTime(row.created_at)}
                </Td>
                <Td mono>/{row.command_name}</Td>
                <Td>{row.username || '—'}</Td>
                <Td truncate>{row.command_input || '—'}</Td>
                <Td truncate>{row.response_text || '—'}</Td>
                <Td>
                  <StatusPipeline status={row.status} mirrorStatus={row.mirror_status} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div style={styles.stat}>
      <div style={{ ...styles.statValue, color: tone === 'red' ? 'var(--signal-red)' : tone === 'amber' ? 'var(--signal-amber)' : 'var(--text)' }}>
        {value ?? '–'}
      </div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

function Th({ children }) {
  return <th style={styles.th}>{children}</th>;
}

function Td({ children, mono, dim, truncate }) {
  return (
    <td
      style={{
        ...styles.td,
        fontFamily: mono ? 'var(--font-mono)' : 'inherit',
        color: dim ? 'var(--text-dim)' : 'var(--text)',
        maxWidth: truncate ? 220 : undefined,
        overflow: truncate ? 'hidden' : undefined,
        textOverflow: truncate ? 'ellipsis' : undefined,
        whiteSpace: truncate ? 'nowrap' : undefined,
      }}
    >
      {children}
    </td>
  );
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const styles = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 20,
    flexWrap: 'wrap',
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 600,
    margin: 0,
  },
  statRow: {
    display: 'flex',
    gap: 24,
  },
  stat: {
    textAlign: 'right',
  },
  statValue: {
    fontFamily: 'var(--font-mono)',
    fontSize: 20,
    fontWeight: 700,
  },
  statLabel: {
    fontSize: 11,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  filters: {
    display: 'flex',
    gap: 6,
    marginBottom: 16,
  },
  filterBtn: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    color: 'var(--text-muted)',
    fontSize: 12,
    padding: '6px 12px',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    textTransform: 'uppercase',
  },
  filterBtnActive: {
    color: 'var(--text)',
    borderColor: 'var(--signal-green)',
  },
  tableWrap: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    textAlign: 'left',
    padding: '10px 16px',
    color: 'var(--text-dim)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid var(--border)',
    fontWeight: 500,
  },
  td: {
    padding: '10px 16px',
    borderBottom: '1px solid var(--border-soft)',
  },
  row: {},
  empty: {
    padding: '32px 16px',
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: 13,
  },
  error: {
    background: 'rgba(255, 93, 93, 0.1)',
    border: '1px solid rgba(255, 93, 93, 0.3)',
    color: 'var(--signal-red)',
    padding: '10px 14px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 13,
    marginBottom: 16,
  },
};
