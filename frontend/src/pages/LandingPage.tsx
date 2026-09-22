import { useState, useRef, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Bus,
  Sparkles,
  MapPin,
  ChevronDown,
  ArrowRight,
  ShieldCheck,
  Zap,
  Building2,
  Ticket,
  Headphones,
  Wallet,
  Clock,
  Menu,
  X,
  FileSpreadsheet,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Users,
  Gauge,
  Radio,
  Search,
  CalendarDays,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { rolePath, bookingService, today } from '../services/api';
import type { Trip } from '../types/ticket';
import { SearchBooking } from '../components/SearchBooking';
import { FareForecastModal } from '../components/FareForecastModal';
import { PnrLookupModal } from '../components/PnrLookupModal';
import { CorporateCharterModal } from '../components/CorporateCharterModal';
import { NoScheduleModal } from '../components/NoScheduleModal';
import { AiAssistant } from '../components/AiAssistant';

export function LandingPage() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();

  // Modals state
  const [isForecastOpen, setIsForecastOpen] = useState(false);
  const [isPnrOpen, setIsPnrOpen] = useState(false);
  const [isCorporateOpen, setIsCorporateOpen] = useState(false);
  const [isNoScheduleOpen, setIsNoScheduleOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // No Schedule Modal data
  const [noScheduleData, setNoScheduleData] = useState({
    origin: 'Lagos (Jibowu / Ojota)',
    destination: 'Abuja (Utako Terminus)',
    date: today() <= '2026-09-22' ? '2026-09-22' : today(),
  });

  // Hero "Find AI Tickets" form state
  const defaultSearchDate = today() <= '2026-09-22' ? '2026-09-22' : today();
  const [heroOrigin, setHeroOrigin] = useState('Lagos (Jibowu / Ojota)');
  const [heroDestination, setHeroDestination] = useState('Abuja (Utako Terminus)');
  const [heroDate, setHeroDate] = useState(defaultSearchDate);
  const [isSearching, setIsSearching] = useState(false);

  // Quick route select state passed to SearchBooking
  const [selectedOrigin, setSelectedOrigin] = useState('Lagos');
  const [selectedDestination, setSelectedDestination] = useState('Abuja');
  const [selectedDate, setSelectedDate] = useState(defaultSearchDate);
  const [initialSearchResults, setInitialSearchResults] = useState<Trip[] | undefined>(undefined);
  const [searchTimestamp, setSearchTimestamp] = useState<number | undefined>(undefined);

  // FAQ open/collapse state
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Newsletter state
  const [newsletterEmail, setNewsletterEmail] = useState('');

  // Reviews carousel ref
  const reviewsCarouselRef = useRef<HTMLDivElement>(null);

  // Fleet Video player state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [isVideoMuted, setIsVideoMuted] = useState(true);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isVideoPlaying) {
      videoRef.current.pause();
      setIsVideoPlaying(false);
    } else {
      void videoRef.current.play();
      setIsVideoPlaying(true);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isVideoMuted;
    setIsVideoMuted(!isVideoMuted);
  };

  const toggleFullscreen = () => {
    if (!videoRef.current) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void videoRef.current.requestFullscreen();
    }
  };

  const scrollReviews = (direction: 'left' | 'right') => {
    if (reviewsCarouselRef.current) {
      const scrollAmount = direction === 'left' ? -340 : 340;
      reviewsCarouselRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const quickSearch = (from: string, to: string) => {
    setSelectedOrigin(from);
    setSelectedDestination(to);
    const departures = document.getElementById('departures-section');
    departures?.scrollIntoView({ behavior: 'smooth' });
    showToast('Route Selected', `Searching express departures for ${from} → ${to}`, 'info');
  };

  const handleNewsletter = (e: FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail) return;
    showToast('Subscribed!', `You will receive instant AI fare drop alerts at ${newsletterEmail}`, 'success');
    setNewsletterEmail('');
  };

  const toggleAiAssistant = () => {
    window.dispatchEvent(new CustomEvent('toggle-ai-assistant'));
  };

  const handleFindAiTickets = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (heroOrigin === heroDestination) {
      showToast('Invalid Route', 'Origin and destination cannot be the same.', 'warning');
      return;
    }

    setIsSearching(true);
    try {
      const results = await bookingService.search(heroOrigin, heroDestination, heroDate);
      if (results && results.length > 0) {
        // "takes someone to the right one"
        setSelectedOrigin(heroOrigin);
        setSelectedDestination(heroDestination);
        setSelectedDate(heroDate);
        setInitialSearchResults(results);
        setSearchTimestamp(Date.now());

        // Smooth scroll to departures section
        const departures = document.getElementById('departures-section');
        departures?.scrollIntoView({ behavior: 'smooth' });

        showToast(
          'Schedules Found!',
          `Found ${results.length} active departure(s) for ${heroOrigin} → ${heroDestination}`,
          'success'
        );
      } else {
        // "pop a modal saying there is no schedule for this"
        setNoScheduleData({
          origin: heroOrigin,
          destination: heroDestination,
          date: heroDate,
        });
        setIsNoScheduleOpen(true);
      }
    } catch {
      setNoScheduleData({
        origin: heroOrigin,
        destination: heroDestination,
        date: heroDate,
      });
      setIsNoScheduleOpen(true);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectAlternativeRoute = (origin: string, destination: string, date?: string) => {
    const targetDate = date || heroDate;
    setHeroOrigin(origin);
    setHeroDestination(destination);
    setHeroDate(targetDate);

    void (async () => {
      setIsSearching(true);
      try {
        const results = await bookingService.search(origin, destination, targetDate);
        if (results && results.length > 0) {
          setSelectedOrigin(origin);
          setSelectedDestination(destination);
          setSelectedDate(targetDate);
          setInitialSearchResults(results);
          setSearchTimestamp(Date.now());
          const departures = document.getElementById('departures-section');
          departures?.scrollIntoView({ behavior: 'smooth' });
          showToast('Schedules Found', `Showing ${results.length} departure(s) for ${origin} → ${destination}`, 'success');
        } else {
          setNoScheduleData({ origin, destination, date: targetDate });
          setIsNoScheduleOpen(true);
        }
      } catch {
        setNoScheduleData({ origin, destination, date: targetDate });
        setIsNoScheduleOpen(true);
      } finally {
        setIsSearching(false);
      }
    })();
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800 antialiased selection:bg-teal-500 selection:text-white">
      {/* ==================== HEADER / NAVIGATION ==================== */}
      <header className="sticky top-0 z-40 glass-nav border-b border-slate-200/80 shadow-sm transition-all duration-300 bg-white/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 sm:w-11 sm:h-11 bg-gradient-to-tr from-teal-700 via-teal-600 to-amber-400 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-teal-700/20 group-hover:scale-105 group-hover:rotate-3 transition-all duration-300">
              <Bus className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <span className="text-lg sm:text-xl font-black tracking-tight text-slate-900 block leading-none">
                Transit<span className="text-teal-600">Hub</span>
              </span>
              
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-semibold text-slate-600">
            <Link to="/" className="text-teal-600 font-bold hover:text-teal-700 transition-colors">
              Home
            </Link>
            <a href="#destinations" className="hover:text-teal-600 transition-colors">
              Destinations
            </a>
            <a href="#fleet" className="hover:text-teal-600 transition-colors">
              Luxury Fleet
            </a>
            <a href="#departures-section" className="hover:text-teal-600 transition-colors">
              Schedules
            </a>
            <button
              onClick={() => setIsCorporateOpen(true)}
              className="hover:text-teal-600 transition-colors flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer"
            >
              <Building2 size={15} className="text-amber-500" /> Corporate Charters
            </button>
            <button
              onClick={() => setIsPnrOpen(true)}
              className="hover:text-teal-700 transition-colors flex items-center gap-1.5 font-semibold text-teal-700 bg-teal-50 px-3.5 py-1 rounded-full border border-teal-200 cursor-pointer shadow-sm"
            >
              <Ticket size={15} className="text-teal-600" /> Track PNR
            </button>
          </nav>

          {/* Header Action Buttons & Mobile Hamburger */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={toggleAiAssistant}
              className="hidden md:flex items-center gap-2 text-xs font-bold uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-full hover:bg-teal-100 transition-all shadow-sm cursor-pointer"
            >
              <Sparkles size={14} className="text-teal-600 animate-pulse" /> AI Assist
            </button>

            {user ? (
              <div className="flex items-center gap-2">
                <Link
                  to={rolePath[user.role]}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs uppercase tracking-wider px-4 py-2 sm:px-5 sm:py-2.5 rounded-full transition-all shadow-md flex items-center gap-1.5"
                >
                  <span>
                    {user.role === 'passenger'
                      ? 'My Tickets'
                      : user.role === 'admin'
                      ? 'Admin Dashboard'
                      : user.role === 'finance'
                      ? 'Treasury Vault'
                      : user.role === 'driver'
                      ? 'Driver Cockpit'
                      : user.role === 'marshal'
                      ? 'Marshal Station'
                      : user.role === 'dispatch'
                      ? 'Dispatch HQ'
                      : user.role === 'pos'
                      ? 'POS Cash Desk'
                      : 'Staff Portal'}
                  </span>
                  <span className="text-[9px] bg-white/20 px-1.5 py-0.5 rounded uppercase font-bold">
                    {user.role}
                  </span>
                </Link>
                <button
                  onClick={() => { void logout().catch(() => {}); }}
                  className="hidden sm:inline-flex text-xs font-bold text-slate-500 hover:text-rose-600 px-2.5 py-1 transition"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="hidden sm:inline-flex bg-slate-900 hover:bg-teal-600 text-white font-bold text-xs uppercase tracking-wider px-4 py-2 sm:px-5 sm:py-2.5 rounded-full transition-all shadow-md shimmer-btn"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="hidden sm:inline-flex bg-teal-50 text-teal-700 hover:bg-teal-100 font-bold text-xs uppercase tracking-wider px-4 py-2 sm:px-4 sm:py-2.5 rounded-full border border-teal-200 transition-all"
                >
                  Register
                </Link>
              </div>
            )}

            {/* Mobile Hamburger Button */}
            <button
              onClick={() => setMobileMenuOpen(prev => !prev)}
              aria-label="Toggle Navigation Menu"
              className="lg:hidden flex items-center justify-center w-10 h-10 rounded-xl bg-slate-900 text-white hover:bg-teal-600 transition shadow-sm cursor-pointer"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-slate-950 text-white border-b border-slate-800 shadow-2xl animate-in slide-in-from-top-4 duration-200">
            <div className="max-w-7xl mx-auto px-5 py-6 space-y-6">
              <div className="grid grid-cols-2 gap-3 text-sm font-bold border-b border-slate-800 pb-5">
                <Link
                  to="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 bg-slate-900 p-3 rounded-2xl text-teal-400 border border-slate-800"
                >
                  <Bus size={16} /> Home
                </Link>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setIsPnrOpen(true);
                  }}
                  className="flex items-center gap-2.5 bg-slate-900 p-3 rounded-2xl text-amber-400 border border-slate-800 text-left"
                >
                  <Ticket size={16} /> Track PNR Code
                </button>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setIsCorporateOpen(true);
                  }}
                  className="flex items-center gap-2.5 bg-slate-900 p-3 rounded-2xl text-emerald-400 border border-slate-800 text-left"
                >
                  <Building2 size={16} /> Group Charters
                </button>
                <a
                  href="#destinations"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 bg-slate-900 p-3 rounded-2xl text-slate-300 border border-slate-800"
                >
                  <MapPin size={16} className="text-amber-400" /> Destinations
                </a>
              </div>

              {/* Quick links */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-semibold text-slate-300">
                <a
                  href="#fleet"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2.5 bg-slate-900/60 rounded-xl hover:text-white"
                >
                  Luxury Fleet Showcase
                </a>
                <a
                  href="#departures-section"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2.5 bg-slate-900/60 rounded-xl hover:text-white"
                >
                  Live Departure Schedules
                </a>
                <a
                  href="#features"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2.5 bg-slate-900/60 rounded-xl hover:text-white"
                >
                  Why Choose TransitHub
                </a>
                <a
                  href="#faqs"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2.5 bg-slate-900/60 rounded-xl hover:text-white"
                >
                  Frequently Asked Questions
                </a>
              </div>

              {/* Portal shortcuts */}
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3">
                  Quick Portals & Dashboard Access
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <Link
                    to="/client"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex flex-col items-center justify-center bg-slate-900 hover:bg-teal-600 text-white font-bold p-3 rounded-xl text-xs border border-slate-800 transition text-center"
                  >
                    <Ticket size={16} className="text-amber-400 mb-1" />
                    <span>Passenger</span>
                  </Link>
                  <Link
                    to="/driver"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex flex-col items-center justify-center bg-slate-900 hover:bg-teal-600 text-white font-bold p-3 rounded-xl text-xs border border-slate-800 transition text-center"
                  >
                    <Bus size={16} className="text-teal-400 mb-1" />
                    <span>Driver HUD</span>
                  </Link>
                  <Link
                    to="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex flex-col items-center justify-center bg-slate-900 hover:bg-teal-600 text-white font-bold p-3 rounded-xl text-xs border border-slate-800 transition text-center"
                  >
                    <ShieldCheck size={16} className="text-purple-400 mb-1" />
                    <span>Executive</span>
                  </Link>
                </div>
              </div>

              {/* Mobile Action Bar */}
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-800">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    toggleAiAssistant();
                  }}
                  className="flex-1 flex items-center justify-center gap-2 bg-teal-500/10 text-teal-300 border border-teal-500/30 p-3 rounded-xl text-xs font-bold"
                >
                  <Sparkles size={14} className="text-teal-400" /> Launch AI Assist
                </button>
                {user ? (
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      void logout().catch(() => {});
                    }}
                    className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-extrabold p-3 rounded-xl text-xs uppercase tracking-wider text-center"
                  >
                    Sign Out
                  </button>
                ) : (
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-extrabold p-3 rounded-xl text-xs uppercase tracking-wider text-center shimmer-btn"
                  >
                    Sign In / Register
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ==================== HERO SECTION WITH AMBIENT ORBS ==================== */}
      <section className="relative bg-slate-950 text-white pt-12 sm:pt-16 pb-24 sm:pb-36 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Ambient Glowing Background Orbs & Radial Grid */}
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none"></div>
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-gradient-to-br from-teal-500/30 to-amber-500/20 rounded-full blur-3xl pointer-events-none animate-orb-1"></div>
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-gradient-to-tr from-cyan-500/20 to-teal-700/30 rounded-full blur-3xl pointer-events-none animate-orb-2"></div>

        <div className="max-w-5xl mx-auto relative z-10 text-center">
          {/* Neural Engine Badge */}
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 px-4 py-2 rounded-full text-xs font-semibold text-teal-200 mb-6 shadow-xl animate-float">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <Sparkles size={14} className="text-amber-400" />
            <span>Next-Gen Neural Transit Engine v3.0</span>
          </div>

          {/* Headline */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white mb-4 sm:mb-6 leading-tight">
            Travel Smarter. Book Faster with <span className="gradient-text">Kendat TransitHub.</span>
          </h1>
          <p className="text-slate-300 text-xs sm:text-lg max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed font-normal">
            Experience zero booking fees, dynamic fare predictions, instant interactive seat selection, and high-speed executive coach luxury across all major inter-state terminals.
          </p>

          {/* Quick jump to Schedules CTA */}
          <div className="flex flex-wrap items-center justify-center gap-4 mb-10">
            <a
              href="#departures-section"
              className="bg-gradient-to-r from-teal-600 via-teal-700 to-teal-800 hover:from-teal-700 hover:to-teal-900 !text-white font-extrabold px-6 py-3.5 rounded-2xl shadow-xl shadow-teal-700/30 flex items-center gap-2 text-sm transition transform hover:-translate-y-0.5 active:scale-95 shimmer-btn cursor-pointer"
            >
              <span className="!text-white font-black tracking-wide">Explore Live Bus Schedules</span>
              <ArrowRight size={16} className="!text-white shrink-0" />
            </a>
          </div>

          {/* Live Platform Statistics Counter */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mt-10 sm:mt-14 max-w-4xl mx-auto text-center border-t border-white/10 pt-6 sm:pt-8">
            <div className="p-2 sm:p-3 hover:scale-105 transition-transform duration-300">
              <span className="block text-xl sm:text-3xl font-black text-white">2.5M+</span>
              <span className="text-[10px] sm:text-xs text-slate-400 font-medium">Happy Passengers</span>
            </div>
            <div className="p-2 sm:p-3 hover:scale-105 transition-transform duration-300">
              <span className="block text-xl sm:text-3xl font-black text-teal-400">99.8%</span>
              <span className="text-[10px] sm:text-xs text-slate-400 font-medium">On-Time Reliability</span>
            </div>
            <div className="p-2 sm:p-3 hover:scale-105 transition-transform duration-300">
              <span className="block text-xl sm:text-3xl font-black text-amber-400">50+</span>
              <span className="text-[10px] sm:text-xs text-slate-400 font-medium">Connected Terminals</span>
            </div>
            <div className="p-2 sm:p-3 hover:scale-105 transition-transform duration-300">
              <span className="block text-xl sm:text-3xl font-black text-white">4.9 ★</span>
              <span className="text-[10px] sm:text-xs text-slate-400 font-medium">Customer Rating</span>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== FIND AI TICKETS SEARCH BAR ==================== */}
      <div id="hero-find-tickets" className="max-w-6xl mx-auto -mt-8 sm:-mt-10 relative z-30 px-4 w-full text-left" style={{ textAlign: 'left' }}>
        <form
          onSubmit={handleFindAiTickets}
          className="hero-search-bar bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-2xl border border-slate-100 flex flex-col md:flex-row md:flex-nowrap md:items-end gap-3.5 md:gap-3"
        >
          {/* Origin - Full width on mobile, flexible horizontal on desktop */}
          <div className="w-full md:flex-1 min-w-0 text-left" style={{ textAlign: 'left' }}>
            <label
              htmlFor="hero-origin-select"
              className="inline-label hero-search-label text-xs font-black tracking-wider text-slate-500 uppercase mb-2 text-left"
              style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', textAlign: 'left', gap: '6px', whiteSpace: 'nowrap' }}
            >
              <MapPin size={14} className="text-teal-600 shrink-0" />
              <span className="leading-none" style={{ lineHeight: 1 }}>ORIGIN</span>
            </label>
            <div className="relative">
              <select
                id="hero-origin-select"
                value={heroOrigin}
                onChange={e => {
                  const val = e.target.value;
                  setHeroOrigin(val);
                  if (val === heroDestination) {
                    setHeroDestination(val.includes('Abuja') ? 'Lagos (Jibowu / Ojota)' : 'Abuja (Utako Terminus)');
                  }
                }}
                className="w-full h-[46px] bg-slate-50/70 border border-slate-200 hover:border-teal-500 focus:border-teal-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition appearance-none cursor-pointer pr-9"
              >
                <option value="Lagos (Jibowu / Ojota)">Lagos (Jibowu / Ojota)</option>
                <option value="Abuja (Utako Terminus)">Abuja (Utako Terminus)</option>
                <option value="Port Harcourt (Waterlines)">Port Harcourt (Waterlines)</option>
                <option value="Benin City (Ramat Park)">Benin City (Ramat Park)</option>
                <option value="Kano (Naibawa Terminal)">Kano (Naibawa Terminal)</option>
                <option value="Enugu Holy Ghost Terminal">Enugu (Holy Ghost)</option>
                <option value="Ibadan (Iwo Road / Challenge Hub)">Ibadan (Iwo Road)</option>
                <option value="Asaba / Warri Terminal">Delta (Asaba / Warri)</option>
                <option value="Calabar Central Park">Calabar Central Park</option>
                <option value="Jos Plateau Main Park">Jos Plateau Main Park</option>
                <option value="Kaduna Central Express Hub">Kaduna Express Hub</option>
                <option value="Owerri Control Post Hub">Owerri Control Post</option>
                <option value="Uyo Central Terminal">Akwa Ibom (Uyo)</option>
                <option value="Sokoto Sultan Abubakar Hub">Sokoto Central Hub</option>
              </select>
              <ChevronDown size={14} className="text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Destination - Full width on mobile, flexible horizontal on desktop */}
          <div className="w-full md:flex-1 min-w-0 text-left" style={{ textAlign: 'left' }}>
            <label
              htmlFor="hero-dest-select"
              className="inline-label hero-search-label text-xs font-black tracking-wider text-slate-500 uppercase mb-2 text-left"
              style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', textAlign: 'left', gap: '6px', whiteSpace: 'nowrap' }}
            >
              <MapPin size={14} className="text-amber-500 shrink-0" />
              <span className="leading-none" style={{ lineHeight: 1 }}>DESTINATION</span>
            </label>
            <div className="relative">
              <select
                id="hero-dest-select"
                value={heroDestination}
                onChange={e => {
                  const val = e.target.value;
                  setHeroDestination(val);
                  if (val === heroOrigin) {
                    setHeroOrigin(val.includes('Lagos') ? 'Abuja (Utako Terminus)' : 'Lagos (Jibowu / Ojota)');
                  }
                }}
                className="w-full h-[46px] bg-slate-50/70 border border-slate-200 hover:border-teal-500 focus:border-teal-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition appearance-none cursor-pointer pr-9"
              >
                <option value="Abuja (Utako Terminus)">Abuja (Utako Terminus)</option>
                <option value="Lagos (Jibowu / Ojota)">Lagos (Jibowu / Ojota)</option>
                <option value="Port Harcourt (Waterlines)">Port Harcourt (Waterlines)</option>
                <option value="Benin City (Ramat Park)">Benin City (Ramat Park)</option>
                <option value="Kano (Naibawa Terminal)">Kano (Naibawa Terminal)</option>
                <option value="Enugu Holy Ghost Terminal">Enugu (Holy Ghost)</option>
                <option value="Ibadan (Iwo Road / Challenge Hub)">Ibadan (Iwo Road)</option>
                <option value="Asaba / Warri Terminal">Delta (Asaba / Warri)</option>
                <option value="Calabar Central Park">Calabar Central Park</option>
                <option value="Jos Plateau Main Park">Jos Plateau Main Park</option>
                <option value="Kaduna Central Express Hub">Kaduna Express Hub</option>
                <option value="Owerri Control Post Hub">Owerri Control Post</option>
                <option value="Uyo Central Terminal">Akwa Ibom (Uyo)</option>
                <option value="Sokoto Sultan Abubakar Hub">Sokoto Central Hub</option>
              </select>
              <ChevronDown size={14} className="text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Travel Date - Full width on mobile, fixed horizontal on desktop */}
          <div className="w-full md:w-48 lg:w-52 shrink-0 text-left" style={{ textAlign: 'left' }}>
            <label
              htmlFor="hero-travel-date"
              className="inline-label hero-search-label text-xs font-black tracking-wider text-slate-500 uppercase mb-2 text-left"
              style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', textAlign: 'left', gap: '6px', whiteSpace: 'nowrap' }}
            >
              <CalendarDays size={14} className="text-teal-600 shrink-0" />
              <span className="leading-none" style={{ lineHeight: 1 }}>TRAVEL DATE</span>
            </label>
            <input
              id="hero-travel-date"
              type="date"
              min={today()}
              value={heroDate}
              onChange={e => setHeroDate(e.target.value)}
              required
              className="w-full h-[46px] bg-slate-50/70 border border-slate-200 hover:border-teal-500 focus:border-teal-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition cursor-pointer"
            />
          </div>

          {/* Find AI Tickets Button - Full width on mobile, auto width on desktop */}
          <div className="w-full md:w-auto shrink-0 flex items-end">
            <button
              type="submit"
              disabled={isSearching}
              className="w-full md:w-auto h-[46px] bg-[#0f766e] hover:bg-[#115e59] text-white font-extrabold px-6 sm:px-7 rounded-xl md:rounded-2xl flex items-center justify-center gap-2 shadow-md shadow-teal-900/10 hover:shadow-lg transition-all active:scale-95 cursor-pointer disabled:opacity-60 whitespace-nowrap text-xs sm:text-sm"
            >
              {isSearching ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <Search size={16} />
                  <span>Find AI Tickets</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* ==================== POPULAR DESTINATIONS SHOWCASE ==================== */}
      <section id="destinations" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
          <span className="text-xs font-black tracking-widest text-teal-600 uppercase bg-teal-50 px-3.5 py-1.5 rounded-full border border-teal-200 shadow-sm">
            Top Inter-State Routes
          </span>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-3">
            Explore Popular Travel Destinations
          </h2>
          <p className="text-slate-500 text-xs sm:text-sm mt-2">
            Daily luxury coach schedules available with real-time seat availability and dynamic price lock guarantee.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Destination 1: Lagos */}
          <div className="bg-white rounded-3xl overflow-hidden border border-slate-200/80 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group flex flex-col justify-between">
            <div className="relative h-52 overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1618828665011-0abd973f7ab8?auto=format&fit=crop&w=800&q=80"
                alt="Lagos City Destination"
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent"></div>
              <span className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md text-white text-[10px] uppercase font-bold tracking-wider px-3 py-1 rounded-full border border-white/20">
                🔥 Most Popular
              </span>
              <div className="absolute bottom-3 left-3 text-white">
                <h3 className="text-xl font-extrabold leading-tight">Lagos</h3>
                <p className="text-xs text-slate-300">Jibowu / Ojota Terminus</p>
              </div>
            </div>
            <div className="p-5 flex-grow flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>
                  <Clock size={12} className="inline text-teal-600 mr-1" /> 9h 15m Express
                </span>
                <span>
                  <Zap size={12} className="inline text-amber-500 mr-1" /> 12 Daily Trips
                </span>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Starting From</span>
                  <span className="text-xl font-black text-slate-900">₦22,500</span>
                </div>
                <button
                  type="button"
                  onClick={() => quickSearch('Lagos', 'Abuja')}
                  className="bg-teal-50 hover:bg-teal-600 hover:text-white text-teal-700 text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                >
                  Book Route <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </div>

          {/* Destination 2: Abuja */}
          <div className="bg-white rounded-3xl overflow-hidden border border-slate-200/80 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group flex flex-col justify-between">
            <div className="relative h-52 overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1578637387939-43c525550085?auto=format&fit=crop&w=800&q=80"
                alt="Abuja Destination"
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent"></div>
              <span className="absolute top-3 left-3 bg-teal-600 text-white text-[10px] uppercase font-bold tracking-wider px-3 py-1 rounded-full shadow-md">
                Capital Hub
              </span>
              <div className="absolute bottom-3 left-3 text-white">
                <h3 className="text-xl font-extrabold leading-tight">Abuja</h3>
                <p className="text-xs text-slate-300">Utako Central Park</p>
              </div>
            </div>
            <div className="p-5 flex-grow flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>
                  <Clock size={12} className="inline text-teal-600 mr-1" /> 8h 45m Direct
                </span>
                <span>
                  <Zap size={12} className="inline text-amber-500 mr-1" /> 10 Daily Trips
                </span>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Starting From</span>
                  <span className="text-xl font-black text-slate-900">₦28,000</span>
                </div>
                <button
                  type="button"
                  onClick={() => quickSearch('Abuja', 'Lagos')}
                  className="bg-teal-50 hover:bg-teal-600 hover:text-white text-teal-700 text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                >
                  Book Route <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </div>

          {/* Destination 3: Port Harcourt */}
          <div className="bg-white rounded-3xl overflow-hidden border border-slate-200/80 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group flex flex-col justify-between">
            <div className="relative h-52 overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=800&q=80"
                alt="Port Harcourt Destination"
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent"></div>
              <span className="absolute top-3 left-3 bg-amber-500 text-slate-950 text-[10px] uppercase font-black tracking-wider px-3 py-1 rounded-full shadow-md">
                Coastal Route
              </span>
              <div className="absolute bottom-3 left-3 text-white">
                <h3 className="text-xl font-extrabold leading-tight">Port Harcourt</h3>
                <p className="text-xs text-slate-300">Waterlines Station</p>
              </div>
            </div>
            <div className="p-5 flex-grow flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>
                  <Clock size={12} className="inline text-teal-600 mr-1" /> 8h 30m Express
                </span>
                <span>
                  <Zap size={12} className="inline text-amber-500 mr-1" /> 8 Daily Trips
                </span>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Starting From</span>
                  <span className="text-xl font-black text-slate-900">₦24,000</span>
                </div>
                <button
                  type="button"
                  onClick={() => quickSearch('Port Harcourt', 'Lagos')}
                  className="bg-teal-50 hover:bg-teal-600 hover:text-white text-teal-700 text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                >
                  Book Route <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </div>

          {/* Destination 4: Benin City */}
          <div className="bg-white rounded-3xl overflow-hidden border border-slate-200/80 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group flex flex-col justify-between">
            <div className="relative h-52 overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1570125909232-eb263c188f7e?auto=format&fit=crop&w=800&q=80"
                alt="Benin City Destination"
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent"></div>
              <span className="absolute top-3 left-3 bg-emerald-600 text-white text-[10px] uppercase font-bold tracking-wider px-3 py-1 rounded-full shadow-md">
                Fast Connection
              </span>
              <div className="absolute bottom-3 left-3 text-white">
                <h3 className="text-xl font-extrabold leading-tight">Benin City</h3>
                <p className="text-xs text-slate-300">Ramat Park Hub</p>
              </div>
            </div>
            <div className="p-5 flex-grow flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>
                  <Clock size={12} className="inline text-teal-600 mr-1" /> 5h 45m Shuttle
                </span>
                <span>
                  <Zap size={12} className="inline text-amber-500 mr-1" /> 14 Daily Trips
                </span>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Starting From</span>
                  <span className="text-xl font-black text-slate-900">₦14,500</span>
                </div>
                <button
                  type="button"
                  onClick={() => quickSearch('Benin City', 'Abuja')}
                  className="bg-teal-50 hover:bg-teal-600 hover:text-white text-teal-700 text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                >
                  Book Route <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== LUXURY FLEET IN MOTION (VIDEO & SHOWCASE) ==================== */}
      <section id="fleet" className="bg-slate-950 text-white py-16 sm:py-24 relative overflow-hidden border-t border-slate-800/80">
        {/* Ambient background glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-teal-500/10 blur-[120px] pointer-events-none rounded-full"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 space-y-12 sm:space-y-16">
          {/* Section Heading */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-black tracking-widest text-teal-400 uppercase bg-teal-500/10 px-3.5 py-1.5 rounded-full border border-teal-500/20 mb-3">
                <Radio size={14} className="animate-pulse text-emerald-400" />
                <span>Live Expressway Fleet Telematics</span>
              </div>
              <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white leading-tight">
                7 & 14-Seater Express Fleet <span className="gradient-text">In Motion.</span>
              </h2>
            </div>
            <p className="text-slate-400 text-xs sm:text-sm max-w-md leading-relaxed">
              Watch our certified 14-seater standard cruiser coaches and 7-seater executive VIP minivans cruising live on interstate expressways with passengers and captains inside.
            </p>
          </div>

          {/* ==================== CINEMATIC VIDEO PLAYER ==================== */}
          <div className="relative rounded-3xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-900 group">
            {/* Video Element */}
            <div className="relative aspect-video w-full max-h-[640px] bg-black">
              <video
                ref={videoRef}
                autoPlay
                loop
                muted={isVideoMuted}
                playsInline
                poster="/images/fleet_highway_poster.jpg"
                className="w-full h-full object-cover"
                onPlay={() => setIsVideoPlaying(true)}
                onPause={() => setIsVideoPlaying(false)}
              >
                <source src="/videos/fleet_highway_motion.mp4" type="video/mp4" />
                <source src="/videos/fleet_highway_motion.webm" type="video/webm" />
                Your browser does not support the video tag.
              </video>

              {/* Gradient Vignette Overlays */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/50 pointer-events-none"></div>

              {/* Top HUD Telemetry Bar */}
              <div className="absolute top-4 sm:top-6 left-4 sm:left-6 right-4 sm:right-6 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
                <div className="flex items-center gap-2 bg-slate-950/80 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 text-xs font-mono font-bold">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-emerald-400 tracking-wider">LIVE HIGHWAY FEED</span>
                  <span className="text-slate-500">•</span>
                  <span className="text-slate-300">LAGOS - IBADAN CORRIDOR</span>
                </div>

                <div className="hidden sm:flex items-center gap-2">
                  <span className="bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[11px] font-mono font-bold px-3 py-1 rounded-full backdrop-blur-md">
                    14-SEATER COACH + 7-SEATER VIP
                  </span>
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-mono font-bold px-3 py-1 rounded-full backdrop-blur-md">
                    100% SEATED
                  </span>
                </div>
              </div>

              {/* Bottom Telemetry & Custom Video Controls */}
              <div className="absolute bottom-4 sm:bottom-6 left-4 sm:left-6 right-4 sm:right-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                {/* Vehicle Speed & Cabin Telemetry */}
                <div className="space-y-2 pointer-events-none">
                  <div className="flex items-center gap-2">
                    <span className="bg-emerald-500 text-slate-950 font-black text-[10px] uppercase px-2 py-0.5 rounded shadow-sm">
                      CAPTAINS AT WHEEL
                    </span>
                    <span className="text-xs font-bold text-white drop-shadow-md">
                      Passengers & Drivers Onboard
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono text-slate-300">
                    <span className="flex items-center gap-1 bg-slate-950/70 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10">
                      <Gauge size={13} className="text-teal-400" />
                      <strong>Speed: 95 km/h</strong>
                    </span>
                    <span className="flex items-center gap-1 bg-slate-950/70 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10">
                      <Users size={13} className="text-amber-400" />
                      <strong>21 Passengers</strong>
                    </span>
                    <span className="hidden sm:flex items-center gap-1 bg-slate-950/70 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10">
                      <ShieldCheck size={13} className="text-emerald-400" />
                      <strong>FRSC Speed-Limited</strong>
                    </span>
                  </div>
                </div>

                {/* Player Control Buttons */}
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={togglePlay}
                    title={isVideoPlaying ? 'Pause Video' : 'Play Video'}
                    className="p-3 rounded-2xl bg-slate-950/80 hover:bg-teal-600 text-white border border-white/15 backdrop-blur-md transition shadow-lg cursor-pointer"
                  >
                    {isVideoPlaying ? <Pause size={16} /> : <Play size={16} className="fill-white" />}
                  </button>

                  <button
                    type="button"
                    onClick={toggleMute}
                    title={isVideoMuted ? 'Unmute Audio' : 'Mute Audio'}
                    className="p-3 rounded-2xl bg-slate-950/80 hover:bg-teal-600 text-white border border-white/15 backdrop-blur-md transition shadow-lg cursor-pointer"
                  >
                    {isVideoMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>

                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    title="Fullscreen Mode"
                    className="p-3 rounded-2xl bg-slate-950/80 hover:bg-teal-600 text-white border border-white/15 backdrop-blur-md transition shadow-lg cursor-pointer"
                  >
                    <Maximize2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ==================== 14-SEAT & 7-SEAT SPECIFICATION CARDS ==================== */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
            {/* Card 1: 14-Seater HiAce Coach */}
            <div className="bg-slate-900/90 rounded-3xl overflow-hidden border border-slate-800 shadow-xl flex flex-col group hover:border-teal-500/50 transition-all duration-300">
              <div className="relative h-64 sm:h-72 overflow-hidden">
                <img
                  src="/images/fleet_motion_1.jpg"
                  alt="14-Seater Executive Coach with passengers and driver"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent"></div>
                <div className="absolute top-4 right-4">
                  <span className="bg-teal-600 text-white text-[10px] uppercase font-black px-3 py-1 rounded-full shadow-md">
                    14-Seater Express
                  </span>
                </div>
                <div className="absolute bottom-4 left-6 right-6">
                  <span className="text-[11px] uppercase font-mono font-bold text-teal-400 block">
                    Toyota HiAce Super Long Wheelbase
                  </span>
                  <h3 className="text-xl sm:text-2xl font-black text-white mt-0.5">
                    14-Passenger Highway Cruiser
                  </h3>
                </div>
              </div>
              <div className="p-6 space-y-4 flex-grow flex flex-col justify-between">
                <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                  The backbone of inter-city transit. Equipped with a professional certified captain, spacious panoramic passenger windows, overhead AC ducts, ergonomic recliners, and standard baggage cargo capacity.
                </p>
                <div className="grid grid-cols-3 gap-2.5 pt-2">
                  <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800 text-center">
                    <span className="text-teal-400 text-base mb-0.5 block font-mono font-black">14 Seats</span>
                    <span className="text-[10px] font-bold text-slate-400">High-Back</span>
                  </div>
                  <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800 text-center">
                    <span className="text-teal-400 text-base mb-0.5 block font-mono font-black">Dual AC</span>
                    <span className="text-[10px] font-bold text-slate-400">Climate Vents</span>
                  </div>
                  <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800 text-center">
                    <span className="text-teal-400 text-base mb-0.5 block font-mono font-black">100 km/h</span>
                    <span className="text-[10px] font-bold text-slate-400">Speed Limiter</span>
                  </div>
                </div>
                <a
                  href="#departures-section"
                  className="w-full py-3 bg-teal-600/20 hover:bg-teal-600 text-teal-300 hover:text-white border border-teal-500/40 rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Book 14-Seater Coach</span>
                  <ArrowRight size={14} />
                </a>
              </div>
            </div>

            {/* Card 2: 7-Seater VIP Sienna Minivan */}
            <div className="bg-slate-900/90 rounded-3xl overflow-hidden border border-slate-800 shadow-xl flex flex-col group hover:border-amber-500/50 transition-all duration-300">
              <div className="relative h-64 sm:h-72 overflow-hidden">
                <img
                  src="/images/fleet_motion_2.jpg"
                  alt="7-Seater VIP Minivan with driver and passengers"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent"></div>
                <div className="absolute top-4 right-4">
                  <span className="bg-amber-500 text-slate-950 text-[10px] uppercase font-black px-3 py-1 rounded-full shadow-md">
                    7-Seater VIP First-Class
                  </span>
                </div>
                <div className="absolute bottom-4 left-6 right-6">
                  <span className="text-[11px] uppercase font-mono font-bold text-amber-400 block">
                    Toyota Sienna Executive Edition
                  </span>
                  <h3 className="text-xl sm:text-2xl font-black text-white mt-0.5">
                    7-Passenger Luxury Minivan
                  </h3>
                </div>
              </div>
              <div className="p-6 space-y-4 flex-grow flex flex-col justify-between">
                <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                  First-class luxury travel for busy professionals and families. Features 7 individual plush leather captain armchairs in a 2-2-3 layout, dedicated personal device chargers, Starlink Wi-Fi, and priority highway corridor dispatch.
                </p>
                <div className="grid grid-cols-3 gap-2.5 pt-2">
                  <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800 text-center">
                    <span className="text-amber-400 text-base mb-0.5 block font-mono font-black">7 Seats</span>
                    <span className="text-[10px] font-bold text-slate-400">VIP Captains</span>
                  </div>
                  <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800 text-center">
                    <span className="text-amber-400 text-base mb-0.5 block font-mono font-black">Starlink</span>
                    <span className="text-[10px] font-bold text-slate-400">Fast Wi-Fi</span>
                  </div>
                  <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800 text-center">
                    <span className="text-amber-400 text-base mb-0.5 block font-mono font-black">Express</span>
                    <span className="text-[10px] font-bold text-slate-400">Non-Stop Ride</span>
                  </div>
                </div>
                <a
                  href="#departures-section"
                  className="w-full py-3 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/40 rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Book 7-Seater VIP Minivan</span>
                  <ArrowRight size={14} />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== SCHEDULES & SEARCH BOOKING ENGINE ==================== */}
      <main id="departures-section" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 flex-grow w-full">
        <SearchBooking
          hideSearchCard
          defaultOrigin={selectedOrigin}
          defaultDestination={selectedDestination}
          defaultDate={selectedDate}
          initialResults={initialSearchResults}
          searchTimestamp={searchTimestamp}
          onNoSchedule={(orig, dest, dt) => {
            setNoScheduleData({ origin: orig, destination: dest, date: dt });
            setIsNoScheduleOpen(true);
          }}
        />
      </main>

      {/* ==================== WHY CHOOSE TRANSITHUB (FEATURES) ==================== */}
      <section id="features" className="bg-slate-100 py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
            <span className="text-xs font-black tracking-widest text-teal-600 uppercase bg-white px-3.5 py-1.5 rounded-full border border-teal-200 shadow-sm">
              Why Choose TransitHub
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-3">
              Redefining Inter-State Travel Technology
            </h2>
            <p className="text-slate-500 text-xs sm:text-sm mt-2">
              Engineered for passenger comfort, safety, and price transparency.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {/* Feature 1 */}
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-lg transition">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center text-xl shrink-0">
                  <Sparkles size={24} />
                </div>
                <h3 className="text-lg font-extrabold text-slate-900 leading-snug">
                  Neural Fare Prediction
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                Our AI algorithm monitors terminal demand, traffic patterns, and weather conditions to lock in guaranteed best prices.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-lg transition">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl shrink-0">
                  <MapPin size={24} />
                </div>
                <h3 className="text-lg font-extrabold text-slate-900 leading-snug">
                  Real-Time GPS Tracking
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                Share live bus locations with friends and family. Track exact arrival times down to the minute.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-lg transition">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl shrink-0">
                  <Bus size={24} />
                </div>
                <h3 className="text-lg font-extrabold text-slate-900 leading-snug">
                  Instant Seat Selection
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                Choose window, aisle, or front seats directly on our interactive map before making payment.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-lg transition">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl shrink-0">
                  <ShieldCheck size={24} />
                </div>
                <h3 className="text-lg font-extrabold text-slate-900 leading-snug">
                  Zero Booking Fees
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                What you see is what you pay. Transparent pricing with no hidden service surcharges or unexpected taxes.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-lg transition">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center text-xl shrink-0">
                  <Wallet size={24} />
                </div>
                <h3 className="text-lg font-extrabold text-slate-900 leading-snug">
                  Instant Wallet Refunds
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                Need to change plans? Cancel 4+ hours prior to departure for instant 100% wallet credit refund.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-lg transition">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-xl shrink-0">
                  <Headphones size={24} />
                </div>
                <h3 className="text-lg font-extrabold text-slate-900 leading-snug">
                  24/7 AI Passenger Care
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                Automated instant assistance for baggage questions, terminal navigation, schedule updates, and re-booking.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== HOW IT WORKS ==================== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
          <span className="text-xs font-black tracking-widest text-teal-600 uppercase bg-teal-50 px-3.5 py-1.5 rounded-full border border-teal-200 shadow-sm">
            Simple 4-Step Process
          </span>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-3">
            How Booking Works on TransitHub
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          {/* Step 1 */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm text-center hover:-translate-y-1 transition">
            <span className="w-10 h-10 rounded-full bg-slate-900 text-white font-black text-sm flex items-center justify-center mx-auto mb-4 shadow-md">
              1
            </span>
            <h3 className="font-extrabold text-slate-900 text-base mb-2">Search Routes</h3>
            <p className="text-xs text-slate-500">
              Select origin, destination, and travel date for AI-optimized coach routes.
            </p>
          </div>

          {/* Step 2 */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm text-center hover:-translate-y-1 transition">
            <span className="w-10 h-10 rounded-full bg-teal-600 text-white font-black text-sm flex items-center justify-center mx-auto mb-4 shadow-md">
              2
            </span>
            <h3 className="font-extrabold text-slate-900 text-base mb-2">Compare Fares</h3>
            <p className="text-xs text-slate-500">
              Filter departures by luxury class, travel time, and amenity preferences.
            </p>
          </div>

          {/* Step 3 */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm text-center hover:-translate-y-1 transition">
            <span className="w-10 h-10 rounded-full bg-amber-500 text-slate-950 font-black text-sm flex items-center justify-center mx-auto mb-4 shadow-md">
              3
            </span>
            <h3 className="font-extrabold text-slate-900 text-base mb-2">Select Seats</h3>
            <p className="text-xs text-slate-500">
              Pick your favorite seat position visually on the interactive seating map.
            </p>
          </div>

          {/* Step 4 */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm text-center hover:-translate-y-1 transition">
            <span className="w-10 h-10 rounded-full bg-emerald-600 text-white font-black text-sm flex items-center justify-center mx-auto mb-4 shadow-md">
              4
            </span>
            <h3 className="font-extrabold text-slate-900 text-base mb-2">QR Boarding Pass</h3>
            <p className="text-xs text-slate-500">
              Pay securely and receive your instant digital ticket with QR boarding scan.
            </p>
          </div>
        </div>
      </section>

      {/* ==================== PASSENGER REVIEWS & SOCIAL PROOF ==================== */}
      <section className="bg-slate-900 text-white py-16 sm:py-24 overflow-hidden relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-10">
            <div>
              <span className="text-xs font-black tracking-widest text-teal-400 uppercase bg-teal-500/10 px-3.5 py-1.5 rounded-full border border-teal-500/20">
                Verified Passenger Reviews
              </span>
              <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight mt-3">
                Loved by Thousands of Frequent Travelers
              </h2>
            </div>

            {/* Carousel Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => scrollReviews('left')}
                aria-label="Previous Review"
                className="w-11 h-11 rounded-full bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white flex items-center justify-center transition shadow-md cursor-pointer"
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => scrollReviews('right')}
                aria-label="Next Review"
                className="w-11 h-11 rounded-full bg-teal-600 border border-teal-500 hover:bg-teal-500 text-white flex items-center justify-center transition shadow-md cursor-pointer"
              >
                →
              </button>
            </div>
          </div>

          {/* Sliding Reviews Track */}
          <div
            ref={reviewsCarouselRef}
            className="flex gap-6 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-4 no-scrollbar"
          >
            {/* Review 1 */}
            <div className="snap-start shrink-0 w-80 sm:w-96 bg-slate-800/90 p-6 sm:p-8 rounded-3xl border border-slate-700/80 shadow-xl space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex text-amber-400 text-sm gap-1">
                  {'★'.repeat(5)}
                </div>
                <p className="text-slate-300 text-xs sm:text-sm leading-relaxed italic">
                  "Booking my Lagos to Abuja ticket took less than 60 seconds! The bus was spotless, climate control was perfect, and seat selection was exact."
                </p>
              </div>
              <div className="flex items-center gap-3 pt-4 border-t border-slate-700/60">
                <img
                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80"
                  alt="Passenger"
                  className="w-10 h-10 rounded-full object-cover border-2 border-teal-500"
                />
                <div>
                  <h4 className="font-extrabold text-sm text-white">Amina Adebayo</h4>
                  <span className="text-[10px] text-teal-400 font-semibold block">
                    Verified Frequent Rider • Lagos to Abuja
                  </span>
                </div>
              </div>
            </div>

            {/* Review 2 */}
            <div className="snap-start shrink-0 w-80 sm:w-96 bg-slate-800/90 p-6 sm:p-8 rounded-3xl border border-slate-700/80 shadow-xl space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex text-amber-400 text-sm gap-1">
                  {'★'.repeat(5)}
                </div>
                <p className="text-slate-300 text-xs sm:text-sm leading-relaxed italic">
                  "The AI prediction recommended booking 2 days early and saved me over ₦5,000 on my family trip to Port Harcourt. Excellent service!"
                </p>
              </div>
              <div className="flex items-center gap-3 pt-4 border-t border-slate-700/60">
                <img
                  src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80"
                  alt="Passenger"
                  className="w-10 h-10 rounded-full object-cover border-2 border-teal-500"
                />
                <div>
                  <h4 className="font-extrabold text-sm text-white">Emeka Nwosu</h4>
                  <span className="text-[10px] text-teal-400 font-semibold block">
                    Verified Business Traveler • Abuja to PH
                  </span>
                </div>
              </div>
            </div>

            {/* Review 3 */}
            <div className="snap-start shrink-0 w-80 sm:w-96 bg-slate-800/90 p-6 sm:p-8 rounded-3xl border border-slate-700/80 shadow-xl space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex text-amber-400 text-sm gap-1">
                  {'★'.repeat(5)}
                </div>
                <p className="text-slate-300 text-xs sm:text-sm leading-relaxed italic">
                  "No paper tickets needed! Just showed the QR code on my phone at the terminal and boarded right away. Super smooth app design."
                </p>
              </div>
              <div className="flex items-center gap-3 pt-4 border-t border-slate-700/60">
                <img
                  src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80"
                  alt="Passenger"
                  className="w-10 h-10 rounded-full object-cover border-2 border-teal-500"
                />
                <div>
                  <h4 className="font-extrabold text-sm text-white">Funke Ibrahim</h4>
                  <span className="text-[10px] text-teal-400 font-semibold block">
                    Verified Commuter • Lagos to Benin
                  </span>
                </div>
              </div>
            </div>

            {/* Review 4 */}
            <div className="snap-start shrink-0 w-80 sm:w-96 bg-slate-800/90 p-6 sm:p-8 rounded-3xl border border-slate-700/80 shadow-xl space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex text-amber-400 text-sm gap-1">
                  {'★'.repeat(5)}
                </div>
                <p className="text-slate-300 text-xs sm:text-sm leading-relaxed italic">
                  "Instant wallet refund when my meeting was rescheduled. Was able to pick a sleeper coach for the evening departure effortlessly."
                </p>
              </div>
              <div className="flex items-center gap-3 pt-4 border-t border-slate-700/60">
                <img
                  src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80"
                  alt="Passenger"
                  className="w-10 h-10 rounded-full object-cover border-2 border-teal-500"
                />
                <div>
                  <h4 className="font-extrabold text-sm text-white">Chidi Okonkwo</h4>
                  <span className="text-[10px] text-teal-400 font-semibold block">
                    Verified Corporate Booker • Abuja to Kano
                  </span>
                </div>
              </div>
            </div>

            {/* Review 5 */}
            <div className="snap-start shrink-0 w-80 sm:w-96 bg-slate-800/90 p-6 sm:p-8 rounded-3xl border border-slate-700/80 shadow-xl space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex text-amber-400 text-sm gap-1">
                  {'★'.repeat(5)}
                </div>
                <p className="text-slate-300 text-xs sm:text-sm leading-relaxed italic">
                  "The live GPS bus tracking feature gave my family total peace of mind while I traveled overnight. TransitHub is miles ahead."
                </p>
              </div>
              <div className="flex items-center gap-3 pt-4 border-t border-slate-700/60">
                <img
                  src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&q=80"
                  alt="Passenger"
                  className="w-10 h-10 rounded-full object-cover border-2 border-teal-500"
                />
                <div>
                  <h4 className="font-extrabold text-sm text-white">Zainab Bello</h4>
                  <span className="text-[10px] text-teal-400 font-semibold block">
                    Verified Rider • Kaduna to Lagos
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== CORPORATE & GROUP CHARTERS ==================== */}
      <section className="py-16 sm:py-24 bg-slate-100 border-y border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
            <span className="text-xs font-black tracking-widest text-teal-600 uppercase bg-teal-50 px-3.5 py-1.5 rounded-full border border-teal-200 shadow-sm">
              Corporate & Group Charter Engine
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-3">
              Bulk Travel Management for Enterprises & Schools
            </h2>
            <p className="text-slate-500 text-xs sm:text-sm mt-3 leading-relaxed">
              Streamline group bookings for corporate retreats, educational trips, and private bus charters with centralized PO invoicing and instant passenger manifest uploads.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            {/* Corporate Card 1 */}
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4 hover:-translate-y-1 transition flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center text-xl font-bold border border-teal-200 shadow-sm shrink-0">
                    <Wallet size={24} />
                  </div>
                  <h3 className="text-lg font-extrabold text-slate-900 leading-snug">
                    Centralized PO & Invoicing
                  </h3>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Consolidate team travel into monthly purchase order invoices with 30-day payment credit terms for registered corporate accounts.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCorporateOpen(true)}
                className="w-full bg-slate-900 hover:bg-teal-600 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition cursor-pointer"
              >
                Request Corporate Credit
              </button>
            </div>

            {/* Corporate Card 2 */}
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4 hover:-translate-y-1 transition flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl font-bold border border-amber-200 shadow-sm shrink-0">
                    <FileSpreadsheet size={24} />
                  </div>
                  <h3 className="text-lg font-extrabold text-slate-900 leading-snug">
                    Bulk Passenger CSV Upload
                  </h3>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Upload employee or student rosters (.CSV / Excel) to automatically generate 50+ individual QR boarding passes in a single click.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCorporateOpen(true)}
                className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition cursor-pointer"
              >
                Upload Roster Manifest
              </button>
            </div>

            {/* Corporate Card 3 */}
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4 hover:-translate-y-1 transition flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl font-bold border border-emerald-200 shadow-sm shrink-0">
                    <Bus size={24} />
                  </div>
                  <h3 className="text-lg font-extrabold text-slate-900 leading-snug">
                    Full Coach Private Charter
                  </h3>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Reserve entire 14-seater shuttles or 50-passenger Executive Luxury coaches with custom departure pick-up points.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCorporateOpen(true)}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition cursor-pointer"
              >
                Calculate Charter Rate
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== MOBILE APP DOWNLOAD CTA ==================== */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="bg-gradient-to-r from-teal-900 via-teal-800 to-slate-900 rounded-3xl p-6 sm:p-12 text-white relative overflow-hidden shadow-2xl flex flex-col lg:flex-row items-center justify-between gap-8 sm:gap-12">
          <div className="max-w-xl space-y-4 sm:space-y-6 z-10 text-center lg:text-left">
            <span className="text-xs font-black tracking-widest text-amber-300 uppercase bg-white/10 px-3.5 py-1.5 rounded-full border border-white/20 inline-block">
              Get the TransitHub App
            </span>
            <h2 className="text-2xl sm:text-5xl font-black leading-tight">
              Your Smart Bus Boarding Pass in Your Pocket
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
              Download the official TransitHub app for exclusive mobile-only discounts, offline QR boarding passes, live bus driver location tracking, and instant ticket notifications.
            </p>
            <div className="flex flex-wrap justify-center lg:justify-start gap-3 sm:gap-4 pt-2">
              <button
                type="button"
                onClick={() => showToast('Mobile App', 'iOS App Store build in TestFlight beta preview.', 'info')}
                className="bg-white hover:bg-slate-100 text-slate-900 font-extrabold px-5 py-3 sm:px-6 sm:py-3.5 rounded-2xl flex items-center gap-3 text-xs shadow-lg transition transform hover:-translate-y-1 cursor-pointer"
              >
                <span className="text-xl"></span>
                <div className="text-left leading-none">
                  <span className="text-[9px] uppercase text-slate-500 font-bold block">Download on</span>
                  <span className="text-sm font-extrabold">App Store</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => showToast('Mobile App', 'Google Play APK available in open beta.', 'info')}
                className="bg-slate-950 hover:bg-slate-900 text-white font-extrabold px-5 py-3 sm:px-6 sm:py-3.5 rounded-2xl flex items-center gap-3 text-xs shadow-lg border border-slate-700 transition transform hover:-translate-y-1 cursor-pointer"
              >
                <span className="text-xl text-teal-400">▶</span>
                <div className="text-left leading-none">
                  <span className="text-[9px] uppercase text-slate-400 font-bold block">Get it on</span>
                  <span className="text-sm font-extrabold">Google Play</span>
                </div>
              </button>
            </div>
          </div>

          <div className="relative z-10 w-full max-w-xs sm:max-w-sm flex justify-center">
            <img
              src="/images/mobile_app.png"
              alt="TransitHub Mobile App"
              className="w-64 sm:w-80 hover:scale-105 transition-transform duration-500 drop-shadow-2xl animate-float-slow"
            />
          </div>
        </div>
      </section>

      {/* ==================== FREQUENTLY ASKED QUESTIONS (FAQ) ==================== */}
      <section id="faqs" className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 w-full">
        <div className="text-center mb-10 sm:mb-14">
          <span className="text-xs font-black tracking-widest text-teal-600 uppercase bg-teal-50 px-3.5 py-1.5 rounded-full border border-teal-200 shadow-sm">
            Got Questions?
          </span>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-3">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-4">
          {[
            {
              q: 'How does the AI Route Engine price guarantee work?',
              a: 'Our AI algorithm monitors seat booking velocity across all terminals to ensure you receive the lowest price locked at the time of search. If fares drop within 1 hour of your booking, we automatically refund the difference to your TransitHub wallet.',
            },
            {
              q: 'What is the standard luggage allowance per passenger?',
              a: 'Every ticket includes 2 checked luggage bags (up to 30kg total) placed in the secure lower bus cargo hold, plus 1 personal hand bag to keep under your seat or in the overhead compartment. Excess weight can be added during online seat checkout.',
            },
            {
              q: 'Can I reschedule or cancel my booking?',
              a: 'Yes! Cancellations or date changes requested 4 hours before departure receive 100% instant refund credit to your wallet with zero penalty. Cancellations within 2-4 hours carry a minor 10% terminal fee.',
            },
            {
              q: 'Do I need to print a paper ticket before boarding?',
              a: 'No paper ticket is needed! Simply display the digital QR code boarding pass on your mobile phone to the terminal marshal for instant contactless scanning.',
            },
          ].map((item, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div
                key={item.q}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden transition"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full p-4 sm:p-5 text-left flex justify-between items-center font-extrabold text-slate-900 text-xs sm:text-base cursor-pointer"
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    size={18}
                    className={`text-teal-600 transition-transform duration-200 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-4 sm:px-5 pb-4 sm:pb-5 text-xs sm:text-sm text-slate-500 leading-relaxed border-t border-slate-100 pt-3">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ==================== ENTERPRISE MULTI-COLUMN FOOTER ==================== */}
      <footer className="bg-slate-950 text-slate-400 py-12 sm:py-16 border-t border-slate-800 text-xs mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 sm:gap-10">
          {/* Brand & Info */}
          <div className="space-y-4">
            <Link to="/" className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-tr from-teal-700 via-teal-600 to-amber-400 rounded-xl flex items-center justify-center text-white shadow-md">
                <Bus size={20} />
              </div>
              <span className="text-xl font-black text-white">
                Transit<span className="text-teal-400">Hub</span>
              </span>
            </Link>
            <p className="text-slate-400 text-xs leading-relaxed">
              AI-driven smart mobility platform connecting travelers across top inter-state bus terminals with dynamic price optimization and instant QR tickets.
            </p>
            <div className="flex items-center gap-3 text-slate-300">
              <span className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center hover:bg-teal-600 hover:text-white transition cursor-pointer">
                f
              </span>
              <span className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center hover:bg-teal-600 hover:text-white transition cursor-pointer">
                𝕏
              </span>
              <span className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center hover:bg-teal-600 hover:text-white transition cursor-pointer">
                in
              </span>
            </div>
          </div>

          {/* Popular Routes */}
          <div>
            <h4 className="text-white font-extrabold text-sm uppercase tracking-wider mb-4">
              Popular Routes
            </h4>
            <ul className="space-y-2.5">
              <li>
                <button
                  type="button"
                  onClick={() => quickSearch('Lagos', 'Abuja')}
                  className="hover:text-teal-400 transition cursor-pointer text-left"
                >
                  Lagos to Abuja Express
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => quickSearch('Abuja', 'Port Harcourt')}
                  className="hover:text-teal-400 transition cursor-pointer text-left"
                >
                  Abuja to Port Harcourt
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => quickSearch('Lagos', 'Benin City')}
                  className="hover:text-teal-400 transition cursor-pointer text-left"
                >
                  Lagos to Benin City Shuttle
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => quickSearch('Abuja', 'Kano')}
                  className="hover:text-teal-400 transition cursor-pointer text-left"
                >
                  Abuja to Kano Terminus
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => quickSearch('Port Harcourt', 'Lagos')}
                  className="hover:text-teal-400 transition cursor-pointer text-left"
                >
                  Port Harcourt to Lagos
                </button>
              </li>
            </ul>
          </div>

          {/* Main Terminals */}
          <div>
            <h4 className="text-white font-extrabold text-sm uppercase tracking-wider mb-4">
              Major Terminals
            </h4>
            <ul className="space-y-2.5 text-slate-300">
              <li>Jibowu Central Terminal, Lagos</li>
              <li>Utako Park, Abuja</li>
              <li>Waterlines Station, Port Harcourt</li>
              <li>Ramat Park Hub, Benin City</li>
              <li>Naibawa Park, Kano</li>
            </ul>
          </div>

          {/* Newsletter & Payments */}
          <div className="space-y-4">
            <h4 className="text-white font-extrabold text-sm uppercase tracking-wider mb-2">
              Subscribe to Fare Alerts
            </h4>
            <p className="text-xs text-slate-400">
              Get notified when AI price drops occur on your favorite routes.
            </p>
            <form onSubmit={handleNewsletter} className="flex gap-2">
              <input
                type="email"
                required
                value={newsletterEmail}
                onChange={e => setNewsletterEmail(e.target.value)}
                placeholder="Enter your email"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-teal-500"
              />
              <button
                type="submit"
                className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl font-bold transition cursor-pointer"
              >
                Join
              </button>
            </form>
            <div className="pt-2">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block mb-2">
                Accepted Payment Options
              </span>
              <div className="flex items-center gap-3 text-slate-400 text-xs font-mono">
                <span className="px-2 py-1 bg-slate-900 rounded border border-slate-800">VISA</span>
                <span className="px-2 py-1 bg-slate-900 rounded border border-slate-800">Mastercard</span>
                <span className="px-2 py-1 bg-slate-900 rounded border border-slate-800">Verve</span>
                <span className="px-2 py-1 bg-slate-900 rounded border border-slate-800">Bank Wire</span>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10 mt-8 sm:mt-10 border-t border-slate-900 flex flex-col sm:flex-row justify-between items-center gap-4 text-[11px] text-slate-500">
          <p>&copy; 2026 TransitHub Technologies Inc. All rights reserved.</p>
          <span className="text-orange-500">
            <a className="text-orange-500 hover:underline" href="http://kisprojectslab.com" target="_blank" rel="noopener noreferrer">
              Developed by Kendat Tech
            </a>
          </span>
        </div>
      </footer>

      {/* Floating AI Assistant Copilot */}
      <AiAssistant />

      {/* Modals */}
      <FareForecastModal
        isOpen={isForecastOpen}
        onClose={() => setIsForecastOpen(false)}
      />

      <PnrLookupModal
        isOpen={isPnrOpen}
        onClose={() => setIsPnrOpen(false)}
      />

      <CorporateCharterModal
        isOpen={isCorporateOpen}
        onClose={() => setIsCorporateOpen(false)}
      />

      <NoScheduleModal
        isOpen={isNoScheduleOpen}
        onClose={() => setIsNoScheduleOpen(false)}
        origin={noScheduleData.origin}
        destination={noScheduleData.destination}
        date={noScheduleData.date}
        onSelectAlternative={handleSelectAlternativeRoute}
      />
    </div>
  );
}
