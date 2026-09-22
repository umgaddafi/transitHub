import { Link } from 'react-router-dom';
import { Bus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { rolePath } from '../services/api';
export function Navbar() {
  const { user, logout } = useAuth();
  return <header className="site-header"><div className="site-nav">
    <Link to="/" className="brand"><span className="brand-icon"><Bus aria-hidden="true" /></span><span>Transit<span className="text-teal-700">Hub</span><small>Book your next journey</small></span></Link>
    <nav aria-label="Main navigation" className="nav-links"><Link to="/">Find a trip</Link>{user ? <><Link to={rolePath[user.role]}>{user.role === 'passenger' ? 'My tickets' : user.role === 'admin' ? 'Admin Dashboard' : 'Workspace'}</Link><button className="button secondary" onClick={() => { void logout().catch(() => {}); }}>Sign out</button></> : <><Link to="/login">Sign in</Link><Link className="button" to="/register">Create account</Link></>}</nav>
  </div></header>;
}
