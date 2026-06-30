import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Shell() {
  const { logout, email } = useAuth();

  return (
    <div style={styles.shell}>
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <span style={styles.dot} />
          SIGNAL
        </div>

        <nav style={styles.nav}>
          <NavItem to="/" label="Log" />
          <NavItem to="/servers" label="Servers" />
          <NavItem to="/commands" label="Commands" />
        </nav>

        <div style={styles.footer}>
          <div style={styles.email}>{email || 'admin'}</div>
          <button style={styles.logout} onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      <main style={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, label }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        ...styles.navItem,
        ...(isActive ? styles.navItemActive : {}),
      })}
    >
      {label}
    </NavLink>
  );
}

const styles = {
  shell: {
    display: 'grid',
    gridTemplateColumns: '200px 1fr',
    height: '100%',
  },
  sidebar: {
    background: 'var(--panel)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    padding: '20px 16px',
  },
  brand: {
    fontFamily: 'var(--font-mono)',
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: '0.12em',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 32,
    paddingLeft: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'var(--signal-green)',
    boxShadow: '0 0 8px var(--signal-green)',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    flex: 1,
  },
  navItem: {
    color: 'var(--text-muted)',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 500,
    padding: '8px 12px',
    borderRadius: 'var(--radius-sm)',
  },
  navItemActive: {
    color: 'var(--text)',
    background: 'var(--panel-raised)',
  },
  footer: {
    borderTop: '1px solid var(--border)',
    paddingTop: 16,
  },
  email: {
    fontSize: 12,
    color: 'var(--text-dim)',
    fontFamily: 'var(--font-mono)',
    marginBottom: 8,
    paddingLeft: 12,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  logout: {
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text-muted)',
    fontSize: 12,
    padding: '7px 12px',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    width: '100%',
  },
  main: {
    overflow: 'auto',
    padding: '28px 32px',
  },
};
