import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Shell from './components/Shell.jsx';
import LoginPage from './pages/LoginPage.jsx';
import LogPage from './pages/LogPage.jsx';
import ServersPage from './pages/ServersPage.jsx';
import CommandsPage from './pages/CommandsPage.jsx';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Shell />
            </ProtectedRoute>
          }
        >
          <Route index element={<LogPage />} />
          <Route path="servers" element={<ServersPage />} />
          <Route path="commands" element={<CommandsPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
