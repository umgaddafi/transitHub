import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Bus,
  ArrowLeft,
  Sparkles,
  Zap,
  Star,
  Mail,
  Lock,
  Eye,
  EyeOff,
  User as UserIcon,
  Phone,
  AlertCircle,
  ArrowRight,
  Shield,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../services/api';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const next = params.get('next');
  const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (password !== passwordConfirmation) {
      setError('Passwords do not match. Please ensure both passwords match.');
      return;
    }

    if (password.length < 12) {
      setError('Password must be at least 12 characters in length.');
      return;
    }

    const payload = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      password,
      password_confirmation: passwordConfirmation,
    };

    setBusy(true);
    setError('');

    try {
      await register(payload);
      navigate(safeNext || '/client', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800 antialiased selection:bg-teal-500 selection:text-white relative overflow-hidden">
      {/* Ambient background glow effects */}
      <div
        className="animate-orb-1 absolute -top-40 -left-40 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="animate-orb-2 absolute top-1/2 -right-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#0d9488_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none"
        aria-hidden="true"
      />

      {/* Top Header */}
      <header className="w-full relative z-20 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 bg-gradient-to-tr from-teal-700 via-teal-600 to-amber-400 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-teal-700/20 group-hover:scale-105 group-hover:rotate-3 transition-all duration-300">
              <Bus className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-black tracking-tight text-slate-900 block leading-none">
                Transit<span className="text-teal-600">Hub</span>
              </span>
              <span className="text-[9px] uppercase tracking-widest font-bold text-slate-400">
                AI Smart Mobility
              </span>
            </div>
          </Link>

          <Link
            to={`/login${safeNext ? '?next=' + encodeURIComponent(safeNext) : ''}`}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-teal-700 bg-slate-100 hover:bg-teal-50 px-3.5 py-2 rounded-xl transition-all duration-200 border border-slate-200/80"
          >
            <ArrowLeft size={14} />
            <span>Sign In Instead</span>
          </Link>
        </div>
      </header>

      {/* Main Registration Section */}
      <main className="flex-grow flex items-center justify-center p-4 sm:p-6 lg:p-10 relative z-10">
        <div className="bg-white border border-slate-200/90 rounded-3xl shadow-2xl max-w-lg lg:max-w-5xl w-full flex flex-col lg:grid lg:grid-cols-12 overflow-hidden mx-auto">
          {/* ================= LEFT VISUAL SHOWCASE (Hidden on mobile, lg:col-span-5) ================= */}
          <div className="relative p-8 lg:p-10 hidden lg:flex lg:col-span-5 flex-col justify-between overflow-hidden bg-gradient-to-br from-teal-950 via-slate-900 to-slate-950 text-white">
            <div
              className="absolute -top-16 -left-16 w-60 h-60 bg-teal-500/20 rounded-full blur-3xl pointer-events-none"
              aria-hidden="true"
            />
            <div
              className="absolute -bottom-16 -right-16 w-60 h-60 bg-amber-500/15 rounded-full blur-3xl pointer-events-none"
              aria-hidden="true"
            />

            <div className="relative z-10 space-y-4">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-teal-300 bg-teal-900/60 border border-teal-500/30 px-3 py-1 rounded-full backdrop-blur-md">
                <Sparkles size={12} className="text-amber-400" /> New Passenger Member
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
                Unlock Seamless Inter-State Coach Travel
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 font-medium leading-relaxed">
                Create your verified account in 30 seconds to lock in low fares, store digital tickets, and board with instant QR passes.
              </p>
            </div>

            <div className="relative z-10 my-8">
              <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl group">
                <img
                  src="/images/bus_interior.png"
                  alt="TransitHub Executive Cabin"
                  className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />

                <div className="absolute bottom-3 left-3 right-3 bg-white/10 backdrop-blur-md border border-white/20 p-2.5 rounded-xl flex items-center justify-between text-[11px] text-white">
                  <span className="flex items-center gap-1.5 font-bold">
                    <CheckCircle2 size={13} className="text-teal-400" />
                    Guaranteed Seat Reservation
                  </span>
                  <span className="text-[10px] bg-teal-500/30 text-teal-200 px-2 py-0.5 rounded font-mono font-bold">
                    Free Forever
                  </span>
                </div>
              </div>
            </div>

            <div className="relative z-10 space-y-4 pt-4 border-t border-white/10">
              <div className="grid grid-cols-2 gap-3 text-xs text-slate-300 font-semibold">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0">
                    <Shield size={13} />
                  </div>
                  <span>256-Bit TLS 1.3</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                    <Zap size={13} />
                  </div>
                  <span>Instant Verification</span>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-[11px] text-slate-300 space-y-1">
                <div className="flex items-center gap-1 text-amber-400">
                  <Star size={11} fill="currentColor" />
                  <Star size={11} fill="currentColor" />
                  <Star size={11} fill="currentColor" />
                  <Star size={11} fill="currentColor" />
                  <Star size={11} fill="currentColor" />
                  <span className="text-white font-bold ml-1.5">5.0 / 5.0</span>
                </div>
                <p className="italic text-slate-300">
                  “The best online transport system in Nigeria. Transparent pricing and no hidden terminal charges.”
                </p>
                <p className="text-[10px] font-bold text-teal-300">— Emeka Okafor, Frequent Traveler</p>
              </div>
            </div>
          </div>

          {/* ================= RIGHT FORM SECTION (lg:col-span-7) ================= */}
          <div className="p-6 sm:p-10 lg:col-span-7 flex flex-col justify-between space-y-6">
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-black px-3 py-1 rounded-full border bg-teal-50 border-teal-200 text-teal-700">
                <UserIcon size={13} />
                Passenger Registration
              </span>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Create Your Account
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                Join over 50,000 smart travelers who book faster, securely, and with verified seat assignments.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-xl text-xs font-semibold flex items-start gap-2.5 animate-fadeIn shadow-xs"
              >
                <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-600" />
                <div className="flex-grow">
                  <p className="font-bold">Registration Error</p>
                  <p className="text-[11px] text-red-600 mt-0.5">{error}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                  Full Name
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-teal-600 transition-colors z-20">
                    <UserIcon size={16} />
                  </div>
                  <input
                    type="text"
                    required
                    autoComplete="name"
                    maxLength={100}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Babatunde Raji"
                    style={{ paddingLeft: '2.75rem' }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl input-with-icon pr-4 py-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition shadow-2xs"
                  />
                </div>
              </div>

              {/* Email & Phone Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                    Email Address
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-teal-600 transition-colors z-20">
                      <Mail size={16} />
                    </div>
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@domain.com"
                      style={{ paddingLeft: '2.75rem' }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl input-with-icon pr-4 py-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition shadow-2xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                    Phone Number
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-teal-600 transition-colors z-20">
                      <Phone size={16} />
                    </div>
                    <input
                      type="tel"
                      required
                      autoComplete="tel"
                      maxLength={30}
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="+234 800 000 0000"
                      style={{ paddingLeft: '2.75rem' }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl input-with-icon pr-4 py-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition shadow-2xs"
                    />
                  </div>
                </div>
              </div>

              {/* Passwords Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                    Password 
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-teal-600 transition-colors z-20">
                      <Lock size={16} />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={12}
                      autoComplete="new-password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      style={{ paddingLeft: '2.75rem', paddingRight: '2.75rem' }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl input-with-icon py-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition shadow-2xs font-mono"
                    />
                    <p className="text-[10px] font-normal text-slate-400">(Min. 12 chars)</p>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer z-20"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                    Confirm Password
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-teal-600 transition-colors z-20">
                      <Lock size={16} />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={12}
                      autoComplete="new-password"
                      value={passwordConfirmation}
                      onChange={e => setPasswordConfirmation(e.target.value)}
                      placeholder="••••••••••••"
                      style={{ paddingLeft: '2.75rem' }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl input-with-icon pr-4 py-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition shadow-2xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={busy}
                className="w-full bg-gradient-to-r from-teal-600 via-teal-700 to-teal-800 hover:from-teal-700 hover:to-teal-900 disabled:opacity-50 text-white font-extrabold py-3.5 px-6 rounded-xl shadow-lg shadow-teal-700/25 flex items-center justify-center gap-2 text-sm uppercase tracking-wider transition-all duration-200 transform active:scale-[0.99] cursor-pointer group mt-2"
              >
                {busy ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Creating Account…</span>
                  </>
                ) : (
                  <>
                    <span>Create Passenger Account</span>
                    <ArrowRight
                      size={16}
                      className="group-hover:translate-x-1 transition-transform"
                    />
                  </>
                )}
              </button>
            </form>

            <div className="text-center pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-500 font-medium">
                Already registered?{' '}
                <Link
                  to={`/login${safeNext ? '?next=' + encodeURIComponent(safeNext) : ''}`}
                  className="text-teal-600 font-bold hover:text-teal-700 hover:underline transition-colors"
                >
                  Sign in to your account
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Security & Compliance Footer */}
      <footer className="w-full border-t border-slate-200/80 bg-white/60 backdrop-blur-xs py-4 px-4 relative z-10">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-400 font-medium">
          <p>&copy; 2026 TransitHub Technologies Inc. All rights reserved.</p><span className="text-orange-500"> <a className="text-orange-500" href="http://kisprojectslab.com" target="_blank" rel="noopener noreferrer">Developed by Kendat Tech</a></span>
       
        </div>
      </footer>
    </div>
  );
}
