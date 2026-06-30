import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.brand}>
          <span style={styles.dot} />
          SIGNAL
        </div>
        <p style={styles.tagline}>Command console for your Discord bot.</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            Email
            <input
              style={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label style={styles.label}>
            Password
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background:
      'radial-gradient(circle at 50% -10%, rgba(61, 220, 132, 0.06), transparent 60%), var(--bg)',
  },
  card: {
    width: 360,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: '32px 28px',
  },
  brand: {
    fontFamily: 'var(--font-mono)',
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: '0.12em',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'var(--signal-green)',
    boxShadow: '0 0 8px var(--signal-green)',
  },
  tagline: {
    color: 'var(--text-muted)',
    fontSize: 13,
    marginTop: 6,
    marginBottom: 28,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: 12,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  input: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '10px 12px',
    color: 'var(--text)',
    fontSize: 14,
    fontFamily: 'var(--font-sans)',
  },
  button: {
    marginTop: 8,
    background: 'var(--signal-green)',
    color: '#06140c',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    padding: '11px 0',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  },
  error: {
    background: 'rgba(255, 93, 93, 0.1)',
    border: '1px solid rgba(255, 93, 93, 0.3)',
    color: 'var(--signal-red)',
    fontSize: 13,
    padding: '8px 10px',
    borderRadius: 'var(--radius-sm)',
  },
};
