import { Link } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

export default function Header() {
  const { user, logout } = useAuth();
  return (
    <header className="header">
      <Link to="/" className="brand">🀄 Mahjong Tracker</Link>
      {user && (
        <div className="row">
          <span className="muted">{user.username}</span>
          <button className="btn-secondary" onClick={logout}>Log out</button>
        </div>
      )}
    </header>
  );
}
