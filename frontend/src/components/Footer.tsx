import { Link } from 'react-router-dom';
export function Footer() {
  return <footer className="site-footer"><div className="page-width"><strong>TransitHub</strong><p>Search scheduled departures, choose your seat and keep your tickets in one place.</p><nav aria-label="Footer navigation"><Link to="/">Find a trip</Link><Link to="/client">My tickets</Link><Link to="/login">Staff sign in</Link></nav><small>© {new Date().getFullYear()} TransitHub. All trip times are West Africa Time (WAT).</small></div></footer>;
}
