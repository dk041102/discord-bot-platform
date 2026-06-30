import { createContext, useContext, useState, useCallback } from 'react';
import { api, setToken, clearToken, hasToken } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [isAuthed, setIsAuthed] = useState(hasToken());
  const [email, setEmail] = useState(null);

  const login = useCallback(async (emailInput, password) => {
    const data = await api.login(emailInput, password);
    setToken(data.token);
    setEmail(data.email);
    setIsAuthed(true);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setIsAuthed(false);
    setEmail(null);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthed, email, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
