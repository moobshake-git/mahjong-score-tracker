import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import Header from './components/Header.jsx';
import LoginPage from './pages/LoginPage.jsx';
import LobbiesPage from './pages/LobbiesPage.jsx';
import LobbyPage from './pages/LobbyPage.jsx';
import JoinPage from './pages/JoinPage.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p className="center muted">Loading…</p>;
  // Remember where we were going (e.g. an invite link) so login can send us back.
  return user ? children : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

export default function App() {
  return (
    <>
      <Header />
      <main className="container">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RequireAuth><LobbiesPage /></RequireAuth>} />
          <Route path="/lobbies/:id" element={<RequireAuth><LobbyPage /></RequireAuth>} />
          <Route path="/join/:id/:code" element={<RequireAuth><JoinPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
