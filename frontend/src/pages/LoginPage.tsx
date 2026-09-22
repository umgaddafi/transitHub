import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
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
  AlertCircle,
  ArrowRight,
  Shield,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { errorMessage, rolePath } from '../services/api';

export function LoginPage() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const next = params.get('next');
  const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : null;

  if (!loading && user) {
    return <Navigate to={safeNext || rolePath[user.role]} replace />;
  }


  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please provide both your email and password.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const account = await login(email.trim(), password);
      navigate(safeNext || rolePath[account.role], { replace: true });
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

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-700 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>System Operational</span>
            </div>

            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-teal-700 bg-slate-100 hover:bg-teal-50 px-3.5 py-2 rounded-xl transition-all duration-200 border border-slate-200/80"
            >
              <ArrowLeft size={14} />
              <span>Back to Home</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Authentication Section */}
      <main className="flex-grow flex items-center justify-center p-4 sm:p-6 lg:p-10 relative z-10">
        <div className="bg-white border border-slate-200/90 rounded-3xl shadow-2xl max-w-lg lg:max-w-5xl w-full flex flex-col lg:grid lg:grid-cols-12 overflow-hidden mx-auto">
          {/* ================= LEFT VISUAL SHOWCASE (Hidden on mobile, lg:col-span-5) ================= */}
          <div className="relative p-8 lg:p-10 hidden lg:flex lg:col-span-5 flex-col justify-between overflow-hidden bg-gradient-to-br from-teal-950 via-slate-900 to-slate-950 text-white">
            {/* Mesh gradient orbs */}
            <div
              className="absolute -top-16 -left-16 w-60 h-60 bg-teal-500/20 rounded-full blur-3xl pointer-events-none"
              aria-hidden="true"
            />
            <div
              className="absolute -bottom-16 -right-16 w-60 h-60 bg-amber-500/15 rounded-full blur-3xl pointer-events-none"
              aria-hidden="true"
            />

            {/* Showcase Header */}
            <div className="relative z-10 space-y-4">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-teal-300 bg-teal-900/60 border border-teal-500/30 px-3 py-1 rounded-full backdrop-blur-md">
                <Sparkles size={12} className="text-amber-400" /> Unified Mobility Platform
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
                Empowering Nigeria’s Modern Transit Infrastructure
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 font-medium leading-relaxed">
                Access real-time seat reservation, live telemetry tracking, and bank-grade digital mobility infrastructure.
              </p>
            </div>

            {/* Showcase Image & Floating Cards */}
            <div className="relative z-10 my-8">
              <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl group">
                <img
                  src="/images/luxury_bus.png"
                  alt="TransitHub Executive Coach"
                  className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />

                {/* Floating telemetry badge */}
                <div className="absolute top-3 right-3 bg-slate-900/80 backdrop-blur-md border border-white/20 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-lg">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-[10px] font-bold text-white tracking-wide">
                    Live GPS Telemetry
                  </span>
                </div>

                {/* Floating feature badge */}
                <div className="absolute bottom-3 left-3 right-3 bg-white/10 backdrop-blur-md border border-white/20 p-2.5 rounded-xl flex items-center justify-between text-[11px] text-white">
                  <span className="flex items-center gap-1.5 font-bold">
                    <CheckCircle2 size={13} className="text-teal-400" />
                    Zero Double-Booking Guarantee
                  </span>
                  <span className="text-[10px] bg-teal-500/30 text-teal-200 px-2 py-0.5 rounded font-mono font-bold">
                    15m Hold Lock
                  </span>
                </div>
              </div>
            </div>

            {/* Showcase Footer & Verified Rating */}
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
                  <span>Instant QR Boarding</span>
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
                  “The smoothest booking experience in Nigeria. Instant gate boarding in under 4 seconds.”
                </p>
                <p className="text-[10px] font-bold text-teal-300">— Amina Adebayo, Verified Traveler</p>
              </div>
            </div>
          </div>

          {/* ================= RIGHT FORM SECTION (lg:col-span-7) ================= */}
          <div className="p-6 sm:p-10 lg:col-span-7 flex flex-col justify-between space-y-6">
            {/* Header */}
            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-black px-3 py-1 rounded-full border bg-teal-50 border-teal-200 text-teal-700">
                  <Lock size={13} />
                  Secure Sign In
                </span>

                <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">
                  Enterprise Security
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                Sign In to TransitHub
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                Enter your registered email and password to access your account.
              </p>
            </div>

            {/* Error Message Box */}
            {error && (
              <div
                role="alert"
                className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-xl text-xs font-semibold flex items-start gap-2.5 animate-fadeIn shadow-xs"
              >
                <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-600" />
                <div className="flex-grow">
                  <p className="font-bold">Authentication Failed</p>
                  <p className="text-[11px] text-red-600 mt-0.5">{error}</p>
                </div>
              </div>
            )}

            {/* Authentication Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email Address */}
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
                    autoComplete="username"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    style={{ paddingLeft: '2.75rem' }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl input-with-icon pr-4 py-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition shadow-2xs"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                    Password
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-xs font-bold text-teal-600 hover:text-teal-700 hover:underline transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-teal-600 transition-colors z-20">
                    <Lock size={16} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    style={{ paddingLeft: '2.75rem', paddingRight: '2.75rem' }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl input-with-icon py-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition shadow-2xs font-mono"
                  />
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

              {/* Remember Me Checkbox */}
              <div className="pt-1">
                <label className="checkbox-label !flex !flex-row items-center gap-2.5 cursor-pointer select-none m-0 p-0">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    className="!w-4 !h-4 !min-h-0 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer shrink-0 m-0"
                  />
                  <span className="text-xs font-bold text-slate-600 select-none">
                    Keep me signed in on this device
                  </span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={busy || loading}
                className="w-full bg-gradient-to-r from-teal-600 via-teal-700 to-teal-800 hover:from-teal-700 hover:to-teal-900 disabled:opacity-50 text-white font-extrabold py-3.5 px-6 rounded-xl shadow-lg shadow-teal-700/25 flex items-center justify-center gap-2 text-sm uppercase tracking-wider transition-all duration-200 transform active:scale-[0.99] cursor-pointer group"
              >
                {busy ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Authenticating…</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight
                      size={16}
                      className="group-hover:translate-x-1 transition-transform"
                    />
                  </>
                )}
              </button>
            </form>

            {/* Bottom Registration CTA */}
            <div className="text-center pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-500 font-medium">
                Don&apos;t have an account?{' '}
                <Link
                  to={`/register${safeNext ? '?next=' + encodeURIComponent(safeNext) : ''}`}
                  className="text-teal-600 font-bold hover:text-teal-700 hover:underline transition-colors"
                >
                  Create an account
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
