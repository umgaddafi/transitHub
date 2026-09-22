import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  LayoutDashboard,
  Bus,
  Ticket as TicketIcon,
  Clock,
  RotateCcw,
  HelpCircle,
  User as UserIcon,
  LogOut,
  ChevronDown,
  QrCode as QrIcon,
  Search,
  Plus,
  CheckCircle2,
  Sparkles,
  Menu,
  X,
  ShieldCheck,
  ArrowRight,
  Send,
  RefreshCw,
  Printer,
  MapPin,
  Calendar,
  Compass,
  CreditCard,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { bookingService, dateTime, errorMessage, money } from '../services/api';
import type { Ticket } from '../types/ticket';
import { SearchBooking } from '../components/SearchBooking';
import { TicketCard } from '../components/TicketCard';
import { QrCode } from '../components/QrCode';
import { GpsTrackingModal } from '../components/GpsTrackingModal';
import { AiAssistant } from '../components/AiAssistant';

type PassengerTab =
  | 'dashboard'
  | 'book'
  | 'tickets'
  | 'upcoming'
  | 'cancellations'
  | 'support'
  | 'profile';

const TAB_METADATA: Record<PassengerTab, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Passenger Dashboard',
    subtitle: 'Manage your bus tickets, travel schedules, and digital boarding passes.',
  },
  book: {
    title: 'Book a Bus Trip',
    subtitle: 'Search routes, compare coach classes, and reserve your preferred seat.',
  },
  tickets: {
    title: 'My Tickets',
    subtitle: 'View digital tickets, download receipts, and access gate boarding passes.',
  },
  upcoming: {
    title: 'Upcoming Departures',
    subtitle: 'Live countdown, terminal gate status, and coach telematics.',
  },
  cancellations: {
    title: 'Cancellations & Refunds',
    subtitle: 'Manage booking cancellations and request travel refunds.',
  },
  support: {
    title: 'Help & Customer Support',
    subtitle: 'Frequently asked questions, baggage guidelines, and customer inquiries.',
  },
  profile: {
    title: 'Profile & Account Settings',
    subtitle: 'Manage your personal details, emergency contacts, and security credentials.',
  },
};

export function PassengerPortal() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const [params, setParams] = useSearchParams();

  // Active Navigation Tab (derived directly from URL params)
  const activeTab: PassengerTab = (() => {
    const t = params.get('tab') as PassengerTab;
    return ['dashboard', 'book', 'tickets', 'upcoming', 'cancellations', 'support', 'profile'].includes(t)
      ? t
      : 'dashboard';
  })();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Tickets & Server State
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [ticketFilter, setTicketFilter] = useState<'all' | 'active' | 'completed' | 'cancelled'>('all');

  // PNR Quick Lookup State
  const [lookupPnr, setLookupPnr] = useState('');
  const [lookupResult, setLookupResult] = useState<Ticket | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);

  // Prefill routing for in-dashboard booking
  const [prefillOrigin, setPrefillOrigin] = useState('');
  const [prefillDest, setPrefillDest] = useState('');

  // Modals
  const [qrModalTicket, setQrModalTicket] = useState<Ticket | null>(null);
  const [gpsModalState, setGpsModalState] = useState<{
    open: boolean;
    busReg: string;
    coachName: string;
    origin: string;
    destination: string;
  }>({
    open: false,
    busReg: 'TH-104',
    coachName: 'Transit Cruiser Express',
    origin: 'Lagos',
    destination: 'Abuja',
  });

  // Cancellation state
  const [selectedCancelPnr, setSelectedCancelPnr] = useState('');
  const [cancelReason, setCancelReason] = useState('Schedule Change / Travel Rescheduled');
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelHistory, setCancelHistory] = useState<
    { id: string; pnr: string; route: string; date: string; status: string }[]
  >(() => {
    const saved = localStorage.getItem(`transithub_cancels_${user?.id || 'guest'}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return [
      {
        id: 'c-1',
        pnr: 'TH-392019',
        route: 'Lagos → Port Harcourt',
        date: '14 Aug 2026, 11:30 AM',
        status: 'Processed',
      },
    ];
  });

  // Profile State
  const [profileName, setProfileName] = useState(user?.name || 'Amina Adebayo');
  const [profilePhone, setProfilePhone] = useState(user?.phone || '+234 803 910 4820');
  const [nokName, setNokName] = useState('Babajide Adebayo');
  const [nokPhone, setNokPhone] = useState('+234 802 112 3901');

  // Sync cancel history
  useEffect(() => {
    localStorage.setItem(`transithub_cancels_${user?.id || 'guest'}`, JSON.stringify(cancelHistory));
  }, [cancelHistory, user?.id]);

  // Fetch Tickets from Laravel API
  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await bookingService.tickets();
      setTickets(data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    bookingService
      .tickets()
      .then(data => {
        if (active) setTickets(data);
      })
      .catch(e => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Paystack verification callback
  const reference = params.get('reference') || params.get('trxref');
  useEffect(() => {
    if (!reference) return;
    let active = true;
    bookingService
      .verifyPayment(reference)
      .then(result => {
        if (!active) return;
        setMessage(`Payment successful! Ticket status: ${result.ticket.status}.`);
        showToast('Payment Verified', `Ticket ${result.ticket.pnr_code} is confirmed!`, 'success');
        if (result.ticket.status === 'Confirmed') {
          setQrModalTicket(result.ticket);
        }
        setParams({}, { replace: true });
        void refresh();
      })
      .catch(e => {
        if (active) {
          setError(errorMessage(e));
          setMessage('Payment verification is pending. Please refresh this page or check your ticket status.');
          showToast('Payment Verification Incomplete', errorMessage(e), 'error');
        }
      });
    return () => {
      active = false;
    };
  }, [reference, refresh, setParams, showToast]);

  const switchTab = (tab: PassengerTab) => {
    setParams(prev => {
      const nextParams = new URLSearchParams(prev);
      nextParams.set('tab', tab);
      return nextParams;
    }, { replace: true });
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateTicketInList = (ticket: Ticket) => {
    setTickets(list => list.map(item => (item.pnr_code === ticket.pnr_code ? ticket : item)));
    if (lookupResult?.pnr_code === ticket.pnr_code) {
      setLookupResult(ticket);
    }
  };

  const activeTickets = tickets.filter(t =>
    ['Pending Payment', 'Confirmed', 'Issued & Paid', 'Boarded'].includes(t.status)
  );
  const completedTickets = tickets.filter(t => t.status === 'Completed');
  const nextTrip = activeTickets[0] || null;

  const visibleTickets = tickets.filter(ticket => {
    if (ticketFilter === 'all') return true;
    if (ticketFilter === 'active') {
      return ['Pending Payment', 'Confirmed', 'Issued & Paid', 'Boarded'].includes(ticket.status);
    }
    if (ticketFilter === 'completed') {
      return ['Completed'].includes(ticket.status);
    }
    if (ticketFilter === 'cancelled') {
      return ['Cancelled', 'Refunded', 'Cancellation Requested', 'Expired'].includes(ticket.status);
    }
    return true;
  });

  const handlePnrLookup = async (e: FormEvent) => {
    e.preventDefault();
    if (!lookupPnr.trim()) return;
    setLookupBusy(true);
    setError('');
    setLookupResult(null);
    try {
      const ticket = await bookingService.lookupTicket(lookupPnr);
      setLookupResult(ticket);
      showToast('Booking Found', `Reference ${ticket.pnr_code} loaded.`, 'success');
    } catch (err) {
      setError(errorMessage(err));
      showToast('Booking Not Found', errorMessage(err), 'error');
    } finally {
      setLookupBusy(false);
    }
  };

  const handleQuickRebook = (origin: string, destination: string) => {
    setPrefillOrigin(origin);
    setPrefillDest(destination);
    switchTab('book');
    showToast('Route Loaded', `Searching express departures for ${origin} → ${destination}`, 'info');
  };

  const handleCancelTripSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCancelPnr) {
      showToast('Select Ticket', 'Please choose an active ticket to cancel.', 'error');
      return;
    }

    const targetTicket = tickets.find(t => t.pnr_code === selectedCancelPnr);
    setCancelBusy(true);
    try {
      await bookingService.cancelTicket(selectedCancelPnr);

      setCancelHistory(prev => [
        {
          id: 'c-' + Date.now(),
          pnr: selectedCancelPnr,
          route: targetTicket ? targetTicket.route_name : 'Selected Route',
          date: 'Just Now',
          status: 'Requested',
        },
        ...prev,
      ]);

      showToast(
        'Cancellation Requested',
        `Ticket ${selectedCancelPnr} cancellation submitted for review.`,
        'success'
      );
      setSelectedCancelPnr('');
      void refresh();
    } catch (err) {
      showToast('Cancellation Error', errorMessage(err), 'error');
    } finally {
      setCancelBusy(false);
    }
  };

  const toggleAiAssistant = () => {
    window.dispatchEvent(new CustomEvent('toggle-ai-assistant'));
  };

  return (
    <div className="bg-slate-50 text-slate-900 font-sans min-h-screen flex flex-col lg:flex-row antialiased">
      {/* ==================== COMPACT SIDEBAR ==================== */}
      <aside className="hidden lg:flex fixed top-0 left-0 bottom-0 w-60 bg-white border-r border-slate-200 p-4 flex-col justify-between z-30 shadow-sm overflow-y-auto">
        <div className="space-y-5">
          {/* Brand Header */}
          <Link to="/" className="flex items-center gap-2.5 pb-3 border-b border-slate-100 group">
            <div className="w-9 h-9 bg-teal-600 rounded-xl flex items-center justify-center text-white font-black shadow-sm group-hover:scale-105 transition">
              <Bus size={18} />
            </div>
            <div>
              <span className="text-base font-black text-slate-900 block leading-none">
                Transit<span className="text-teal-600">Hub</span>
              </span>
              <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold block mt-1">
                Passenger Portal
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="space-y-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => switchTab('dashboard')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition text-left ${
                activeTab === 'dashboard'
                  ? 'bg-teal-50 text-teal-700 border border-teal-200 font-black'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <LayoutDashboard size={16} className={activeTab === 'dashboard' ? 'text-teal-600' : 'text-slate-400'} />
              <span>Dashboard</span>
            </button>

            <button
              type="button"
              onClick={() => switchTab('book')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition text-left ${
                activeTab === 'book'
                  ? 'bg-teal-50 text-teal-700 border border-teal-200 font-black'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Bus size={16} className={activeTab === 'book' ? 'text-teal-600' : 'text-slate-400'} />
              <span>Book a Trip</span>
            </button>

            <button
              type="button"
              onClick={() => switchTab('tickets')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition text-left ${
                activeTab === 'tickets'
                  ? 'bg-teal-50 text-teal-700 border border-teal-200 font-black'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <TicketIcon size={16} className={activeTab === 'tickets' ? 'text-teal-600' : 'text-slate-400'} />
                <span>My Tickets</span>
              </span>
              {tickets.length > 0 && (
                <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-full font-black">
                  {tickets.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => switchTab('upcoming')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition text-left ${
                activeTab === 'upcoming'
                  ? 'bg-teal-50 text-teal-700 border border-teal-200 font-black'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Clock size={16} className={activeTab === 'upcoming' ? 'text-teal-600' : 'text-slate-400'} />
              <span>Upcoming Trips</span>
            </button>

            <button
              type="button"
              onClick={() => switchTab('cancellations')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition text-left ${
                activeTab === 'cancellations'
                  ? 'bg-teal-50 text-teal-700 border border-teal-200 font-black'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <RotateCcw size={16} className={activeTab === 'cancellations' ? 'text-teal-600' : 'text-slate-400'} />
              <span>Cancellations</span>
            </button>

            <div className="pt-3 border-t border-slate-100 my-2" />

            <button
              type="button"
              onClick={() => switchTab('support')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition text-left ${
                activeTab === 'support'
                  ? 'bg-teal-50 text-teal-700 border border-teal-200 font-black'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <HelpCircle size={16} className={activeTab === 'support' ? 'text-teal-600' : 'text-slate-400'} />
              <span>Help & Support</span>
            </button>

            <button
              type="button"
              onClick={() => switchTab('profile')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition text-left ${
                activeTab === 'profile'
                  ? 'bg-teal-50 text-teal-700 border border-teal-200 font-black'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <UserIcon size={16} className={activeTab === 'profile' ? 'text-teal-600' : 'text-slate-400'} />
              <span>Profile & Settings</span>
            </button>
          </nav>
        </div>

        {/* User Mini Profile Footer */}
        <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-teal-600 text-white font-black flex items-center justify-center text-xs shrink-0">
              {profileName.charAt(0).toUpperCase()}
            </div>
            <div className="leading-tight truncate">
              <strong className="text-xs font-bold text-slate-900 block truncate">{profileName}</strong>
              <span className="text-[10px] text-teal-600 font-semibold block">Passenger</span>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            title="Sign Out"
            className="text-slate-400 hover:text-rose-600 text-xs p-1.5 rounded-lg transition"
          >
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      {/* ==================== MAIN CONTENT ==================== */}
      <div className="flex-1 lg:ml-60 flex flex-col min-h-screen">
        {/* Mobile Header */}
        <header className="lg:hidden sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open Menu"
              className="w-9 h-9 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center border border-slate-200"
            >
              <Menu size={18} />
            </button>
            <span className="text-sm font-black text-slate-900">
              Transit<span className="text-teal-600">Hub</span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => switchTab('book')}
            className="bg-teal-600 hover:bg-teal-700 text-white font-black text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-sm transition"
          >
            <Plus size={13} /> Book Trip
          </button>
        </header>

        {/* Mobile Slide-Over Drawer */}
        {mobileMenuOpen && (
          <>
            <div
              className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm z-50 transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside className="fixed top-0 left-0 bottom-0 w-64 bg-white z-50 shadow-2xl flex flex-col justify-between overflow-y-auto p-4 space-y-4 animate-in slide-in-from-left duration-200">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-teal-600 rounded-xl flex items-center justify-center text-white font-black text-xs">
                      <Bus size={15} />
                    </div>
                    <span className="text-sm font-black text-slate-900">Passenger Portal</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-1 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => switchTab('dashboard')}
                    className={`w-full flex items-center gap-2 p-2.5 rounded-xl text-left ${
                      activeTab === 'dashboard' ? 'bg-teal-50 text-teal-700 font-black' : 'text-slate-700'
                    }`}
                  >
                    <LayoutDashboard size={16} /> Dashboard
                  </button>
                  <button
                    type="button"
                    onClick={() => switchTab('book')}
                    className={`w-full flex items-center gap-2 p-2.5 rounded-xl text-left ${
                      activeTab === 'book' ? 'bg-teal-50 text-teal-700 font-black' : 'text-slate-700'
                    }`}
                  >
                    <Bus size={16} /> Book a Trip
                  </button>
                  <button
                    type="button"
                    onClick={() => switchTab('tickets')}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left ${
                      activeTab === 'tickets' ? 'bg-teal-50 text-teal-700 font-black' : 'text-slate-700'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <TicketIcon size={16} /> My Tickets
                    </span>
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded-full text-[10px]">{tickets.length}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => switchTab('upcoming')}
                    className={`w-full flex items-center gap-2 p-2.5 rounded-xl text-left ${
                      activeTab === 'upcoming' ? 'bg-teal-50 text-teal-700 font-black' : 'text-slate-700'
                    }`}
                  >
                    <Clock size={16} /> Upcoming Trips
                  </button>
                  <button
                    type="button"
                    onClick={() => switchTab('cancellations')}
                    className={`w-full flex items-center gap-2 p-2.5 rounded-xl text-left ${
                      activeTab === 'cancellations' ? 'bg-teal-50 text-teal-700 font-black' : 'text-slate-700'
                    }`}
                  >
                    <RotateCcw size={16} /> Cancellations
                  </button>
                  <button
                    type="button"
                    onClick={() => switchTab('support')}
                    className={`w-full flex items-center gap-2 p-2.5 rounded-xl text-left ${
                      activeTab === 'support' ? 'bg-teal-50 text-teal-700 font-black' : 'text-slate-700'
                    }`}
                  >
                    <HelpCircle size={16} /> Help & Support
                  </button>
                  <button
                    type="button"
                    onClick={() => switchTab('profile')}
                    className={`w-full flex items-center gap-2 p-2.5 rounded-xl text-left ${
                      activeTab === 'profile' ? 'bg-teal-50 text-teal-700 font-black' : 'text-slate-700'
                    }`}
                  >
                    <UserIcon size={16} /> Profile & Settings
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={logout}
                className="w-full flex items-center gap-2 p-2.5 rounded-xl text-rose-600 bg-rose-50 font-bold text-xs"
              >
                <LogOut size={15} /> Logout
              </button>
            </aside>
          </>
        )}

        {/* Desktop Top Header Bar */}
        <div className="hidden lg:flex items-center justify-between px-6 py-5 border-b border-slate-200 bg-white">
          <div>
            <h1 className="text-xl font-black text-slate-900">{TAB_METADATA[activeTab].title}</h1>
            <p className="text-xs text-slate-500">{TAB_METADATA[activeTab].subtitle}</p>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-full text-xs">
              <Bus size={13} className="text-teal-600" />
              <span className="text-slate-500">Active Trips:</span>
              <strong className="text-slate-900 font-black">{activeTickets.length}</strong>
            </div>

            <button
              type="button"
              onClick={() => switchTab('book')}
              className="bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs px-3.5 py-1.5 rounded-full shadow-sm transition flex items-center gap-1.5"
            >
              <Plus size={13} /> Book a Trip
            </button>

            <button
              type="button"
              onClick={toggleAiAssistant}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-3 py-1.5 rounded-full shadow-sm transition flex items-center gap-1"
            >
              <Sparkles size={12} className="text-amber-400" /> AI Help
            </button>
          </div>
        </div>

        {/* Alerts & Feedback */}
        {error && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center justify-between">
            <span>{error}</span>
            <button type="button" onClick={() => setError('')} className="text-rose-500 hover:text-rose-900">
              <X size={14} />
            </button>
          </div>
        )}
        {message && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 text-xs font-bold flex items-center justify-between">
            <span>{message}</span>
            <button type="button" onClick={() => setMessage('')} className="text-teal-500 hover:text-teal-900">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Main Body */}
        <main className="p-4 sm:p-6 space-y-6 flex-grow">
          {/* ==================== TAB 1: DASHBOARD OVERVIEW ==================== */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Compact Welcome Banner */}
              <div className="bg-gradient-to-r from-teal-900 to-slate-900 text-white p-5 sm:p-6 rounded-2xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-lg sm:text-2xl font-black text-white">Welcome back, {profileName}!</h2>
                  <p className="text-xs text-slate-300">
                    {activeTickets.length > 0
                      ? `You have ${activeTickets.length} confirmed trip scheduled. Access your boarding pass below.`
                      : 'Search and book scheduled departures across Nigerian terminals with zero booking fees.'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => switchTab('book')}
                    className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-xs px-4 py-2.5 rounded-xl shadow transition flex items-center gap-1.5"
                  >
                    <Plus size={14} /> Book a Trip
                  </button>
                </div>
              </div>

              {/* 3 Compact Commuter Metric Cards - Single Row on Mobile */}
              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                <div className="bg-white p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 shadow-xs sm:shadow-sm space-y-0.5 sm:space-y-1 min-w-0">
                  <div className="flex items-center justify-between text-[10px] sm:text-xs text-slate-500 font-bold">
                    <span className="truncate">
                      <span className="sm:hidden">Active</span>
                      <span className="hidden sm:inline">Active Bookings</span>
                    </span>
                    <Bus size={13} className="text-teal-600 shrink-0 hidden xs:block sm:block" />
                  </div>
                  <h3 className="text-lg sm:text-2xl font-black text-slate-900 leading-tight">
                    {activeTickets.length}
                  </h3>
                  <p className="text-[9px] sm:text-[11px] text-teal-600 font-semibold truncate leading-tight">
                    <span className="sm:hidden">{activeTickets.length > 0 ? 'Confirmed' : 'None'}</span>
                    <span className="hidden sm:inline">
                      {activeTickets.length > 0 ? 'Confirmed & ready for gate' : 'No upcoming bookings'}
                    </span>
                  </p>
                </div>

                <div className="bg-white p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 shadow-xs sm:shadow-sm space-y-0.5 sm:space-y-1 min-w-0">
                  <div className="flex items-center justify-between text-[10px] sm:text-xs text-slate-500 font-bold">
                    <span className="truncate">
                      <span className="sm:hidden">Completed</span>
                      <span className="hidden sm:inline">Completed Journeys</span>
                    </span>
                    <CheckCircle2 size={13} className="text-emerald-600 shrink-0 hidden xs:block sm:block" />
                  </div>
                  <h3 className="text-lg sm:text-2xl font-black text-slate-900 leading-tight">
                    {completedTickets.length}
                  </h3>
                  <p className="text-[9px] sm:text-[11px] text-slate-500 font-semibold truncate leading-tight">
                    <span className="sm:hidden">History</span>
                    <span className="hidden sm:inline">Past travel history</span>
                  </p>
                </div>

                <div className="bg-white p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 shadow-xs sm:shadow-sm space-y-0.5 sm:space-y-1 min-w-0">
                  <div className="flex items-center justify-between text-[10px] sm:text-xs text-slate-500 font-bold">
                    <span className="truncate">
                      <span className="sm:hidden">Next Trip</span>
                      <span className="hidden sm:inline">Next Departure</span>
                    </span>
                    <Clock size={13} className="text-amber-500 shrink-0 hidden xs:block sm:block" />
                  </div>
                  <h3 className="text-xs sm:text-base font-black text-slate-900 truncate leading-tight">
                    {nextTrip?.trip?.departure_time
                      ? dateTime(nextTrip.trip.departure_time).split(',')[0]
                      : nextTrip
                        ? 'Scheduled'
                        : 'None'}
                  </h3>
                  <p className="text-[9px] sm:text-[11px] text-slate-500 font-semibold truncate leading-tight">
                    {nextTrip ? nextTrip.route_name : 'No trip booked'}
                  </p>
                </div>
              </div>

              {/* Next Departure Showcase & Quick Rebook */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Next Departure Card */}
                <div className="md:col-span-2 bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-emerald-700 font-bold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Next Departure
                      </span>
                      <span className="text-slate-400 font-mono text-[11px]">
                        {nextTrip ? nextTrip.pnr_code : 'Sample'}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="text-base font-black text-slate-900">
                          {nextTrip ? nextTrip.route_name : 'Lagos (Jibowu) → Abuja (Utako)'}
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {nextTrip?.trip?.departure_time ? dateTime(nextTrip.trip.departure_time) : 'Tomorrow at 06:30 AM'} • Seat{' '}
                          {nextTrip ? nextTrip.seat_number : '5'} • {nextTrip ? nextTrip.vehicle_type : 'Executive Coach'}
                        </p>
                      </div>

                      {nextTrip?.status === 'Pending Payment' ? (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const result = await bookingService.startPayment(nextTrip.pnr_code);
                              const url = new URL(result.authorization_url);
                              if (
                                url.protocol !== 'https:' ||
                                !(url.hostname === 'checkout.paystack.com' || url.hostname.endsWith('.paystack.com'))
                              ) {
                                throw new Error('The payment provider returned an invalid checkout link.');
                              }
                              window.location.assign(url.href);
                            } catch (err) {
                              setError(errorMessage(err));
                            }
                          }}
                          className="bg-amber-600 hover:bg-amber-700 text-white font-black text-xs px-4 py-2 rounded-xl transition flex items-center gap-1.5 shrink-0 shadow-sm"
                        >
                          <CreditCard size={14} /> Pay Now (Paystack)
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (nextTrip) setQrModalTicket(nextTrip);
                            else showToast('No Ticket', 'Book a trip to generate your pass.', 'info');
                          }}
                          className="bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs px-4 py-2 rounded-xl transition flex items-center gap-1.5 shrink-0"
                        >
                          <QrIcon size={14} /> View QR Pass
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs text-slate-500 pt-2 border-t border-slate-100">
                    <span>Luggage: 2 Bags Included</span>
                    <button
                      type="button"
                      onClick={() =>
                        setGpsModalState({
                          open: true,
                          busReg: nextTrip?.trip?.bus?.reg_number || 'TH-104',
                          coachName: nextTrip?.vehicle_type || 'Executive AC Coach',
                          origin: nextTrip ? nextTrip.route_name.split('→')[0].trim() : 'Lagos',
                          destination: nextTrip ? nextTrip.route_name.split('→')[1].trim() : 'Abuja',
                        })
                      }
                      className="text-teal-700 hover:underline font-bold flex items-center gap-1"
                    >
                      <MapPin size={12} /> Track Bus GPS
                    </button>
                  </div>
                </div>

                {/* Quick Route Shortcut */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between space-y-3">
                  <div>
                    <span className="text-xs font-bold text-slate-500 flex items-center gap-1 mb-1">
                      <Compass size={13} className="text-teal-600" /> Quick Rebook
                    </span>
                    <strong className="text-sm font-black text-slate-900 block">Lagos → Abuja Express</strong>
                    <p className="text-xs text-slate-500">Executive AC Coach • Daily</p>
                    <span className="text-teal-700 font-black text-sm block mt-2">₦22,500</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleQuickRebook('Lagos (Jibowu Terminus)', 'Abuja (Utako Main Terminal)')}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded-xl text-xs transition"
                  >
                    1-Click Book
                  </button>
                </div>
              </div>

              {/* Compact PNR Lookup Bar */}
              <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <strong className="text-slate-900 font-bold flex items-center gap-1.5">
                    <Search size={14} className="text-teal-600" /> Fast PNR Ticket Lookup
                  </strong>
                  <span className="text-slate-400 font-mono text-[11px]">e.g. TH-849201</span>
                </div>

                <form onSubmit={handlePnrLookup} className="flex gap-2">
                  <input
                    type="text"
                    value={lookupPnr}
                    onChange={e => setLookupPnr(e.target.value.toUpperCase())}
                    placeholder="Enter booking reference (PNR)"
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-teal-600 uppercase"
                    required
                    maxLength={30}
                  />
                  <button
                    type="submit"
                    disabled={lookupBusy}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2 rounded-xl text-xs transition"
                  >
                    {lookupBusy ? 'Searching…' : 'Find Ticket'}
                  </button>
                </form>

                {lookupResult && (
                  <div className="pt-3 border-t border-slate-100">
                    <TicketCard ticket={lookupResult} onChanged={updateTicketInList} />
                  </div>
                )}
              </div>

              {/* Recent Bookings Table */}
              <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                    <Calendar size={15} className="text-teal-600" /> Recent Bookings
                  </h3>
                  <button
                    type="button"
                    onClick={() => switchTab('tickets')}
                    className="text-xs text-teal-700 hover:underline font-bold flex items-center gap-1"
                  >
                    View All <ArrowRight size={12} />
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="text-[10px] uppercase font-bold text-slate-400 border-b border-slate-100 bg-slate-50">
                      <tr>
                        <th className="py-2.5 px-3">Reference</th>
                        <th className="py-2.5 px-3">Route</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Fare</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Pass</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tickets.length > 0 ? (
                        tickets.slice(0, 4).map(ticket => (
                          <tr key={ticket.pnr_code} className="hover:bg-slate-50 transition">
                            <td className="py-2.5 px-3 font-mono text-teal-700 font-bold">{ticket.pnr_code}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-900">{ticket.route_name}</td>
                            <td className="py-2.5 px-3">
                              {ticket.trip?.departure_time
                                ? dateTime(ticket.trip.departure_time).split(',')[0]
                                : 'Scheduled'}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-slate-900">
                              {money(ticket.fare_paid || ticket.amount_due)}
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  ['Confirmed', 'Issued & Paid', 'Boarded'].includes(ticket.status)
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : ticket.status === 'Pending Payment'
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                              >
                                {ticket.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {ticket.status === 'Pending Payment' ? (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      const result = await bookingService.startPayment(ticket.pnr_code);
                                      const url = new URL(result.authorization_url);
                                      if (
                                        url.protocol !== 'https:' ||
                                        !(url.hostname === 'checkout.paystack.com' || url.hostname.endsWith('.paystack.com'))
                                      ) {
                                        throw new Error('The payment provider returned an invalid checkout link.');
                                      }
                                      window.location.assign(url.href);
                                    } catch (err) {
                                      setError(errorMessage(err));
                                    }
                                  }}
                                  className="text-amber-700 hover:text-amber-900 font-bold text-xs underline"
                                >
                                  Pay Now
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setQrModalTicket(ticket)}
                                  className="text-teal-700 hover:text-teal-900 font-bold text-xs"
                                >
                                  View QR
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="text-center py-6 text-slate-400">
                            No reservations yet. Click "Book a Trip" to start.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================== TAB 2: BOOK A TRIP ==================== */}
          {activeTab === 'book' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
                <div>
                  <h2 className="text-base sm:text-lg font-black text-slate-900">Select Route & Reserve Seats</h2>
                  <p className="text-xs text-slate-500">Pick origin, destination, and seats on the visual coach chassis.</p>
                </div>
              </div>

              <SearchBooking
                defaultOrigin={prefillOrigin}
                defaultDestination={prefillDest}
                onBooked={() => {
                  void refresh();
                  switchTab('tickets');
                  showToast('Trip Booked!', 'Your seat has been reserved. View ticket below.', 'success');
                }}
              />
            </div>
          )}

          {/* ==================== TAB 3: MY TICKETS ==================== */}
          {activeTab === 'tickets' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                  <h2 className="text-lg font-black text-slate-900">My Tickets</h2>
                  <p className="text-xs text-slate-500">View active boarding passes and trip details.</p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setTicketFilter('all')}
                      className={`px-3 py-1 rounded-lg transition ${
                        ticketFilter === 'all'
                          ? 'bg-teal-600 text-white shadow font-black'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      All ({tickets.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTicketFilter('active')}
                      className={`px-3 py-1 rounded-lg transition ${
                        ticketFilter === 'active'
                          ? 'bg-teal-600 text-white shadow font-black'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Active ({activeTickets.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTicketFilter('completed')}
                      className={`px-3 py-1 rounded-lg transition ${
                        ticketFilter === 'completed'
                          ? 'bg-teal-600 text-white shadow font-black'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      History
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => void refresh()}
                    disabled={busy}
                    className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 transition"
                    title="Refresh tickets"
                  >
                    <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              {busy ? (
                <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
                  <RefreshCw size={20} className="animate-spin mx-auto text-teal-600 mb-2" />
                  <p className="text-xs font-bold">Loading your tickets…</p>
                </div>
              ) : visibleTickets.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {visibleTickets.map(ticket => (
                    <div
                      key={ticket.pnr_code}
                      className="bg-white rounded-2xl p-5 border border-slate-200 hover:border-teal-500 transition shadow-sm space-y-4"
                    >
                      <div className="flex justify-between items-center">
                        <span
                          className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                            ['Confirmed', 'Issued & Paid', 'Boarded'].includes(ticket.status)
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : ticket.status === 'Pending Payment'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {ticket.status}
                        </span>
                        <span className="text-xs font-mono font-bold text-teal-700">Ref: {ticket.pnr_code}</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-black shrink-0 border border-teal-200">
                          <Bus size={18} />
                        </div>
                        <div>
                          <h3 className="text-base font-black text-slate-900 leading-tight">{ticket.route_name}</h3>
                          <span className="text-xs text-slate-500 font-mono">
                            Seat {ticket.seat_number} • {ticket.vehicle_type}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-center text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase font-bold block">Departure</span>
                          <strong className="text-slate-900 font-bold block truncate">
                            {ticket.trip?.departure_time
                              ? dateTime(ticket.trip.departure_time).split(',')[0]
                              : 'Scheduled'}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase font-bold block">Coach</span>
                          <strong className="text-teal-700 font-bold block truncate">{ticket.vehicle_type}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase font-bold block">Fare</span>
                          <strong className="text-slate-900 font-bold block">
                            {money(ticket.fare_paid || ticket.amount_due)}
                          </strong>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-1">
                        {ticket.status === 'Pending Payment' ? (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const result = await bookingService.startPayment(ticket.pnr_code);
                                const url = new URL(result.authorization_url);
                                if (
                                  url.protocol !== 'https:' ||
                                  !(url.hostname === 'checkout.paystack.com' || url.hostname.endsWith('.paystack.com'))
                                ) {
                                  throw new Error('The payment provider returned an invalid checkout link.');
                                }
                                window.location.assign(url.href);
                              } catch (err) {
                                setError(errorMessage(err));
                              }
                            }}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-black py-2 rounded-xl text-xs transition flex items-center justify-center gap-1 shadow-sm"
                          >
                            <CreditCard size={13} /> Pay Now
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setQrModalTicket(ticket)}
                            className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 rounded-xl text-xs transition flex items-center justify-center gap-1"
                          >
                            <QrIcon size={13} /> View QR
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => window.print()}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2 rounded-xl text-xs transition border border-slate-200 flex items-center justify-center gap-1"
                        >
                          <Printer size={13} /> Print
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCancelPnr(ticket.pnr_code);
                            switchTab('cancellations');
                          }}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold py-2 rounded-xl text-xs transition border border-rose-200 flex items-center justify-center gap-1"
                        >
                          <RotateCcw size={13} /> Cancel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-sm space-y-3">
                  <TicketIcon size={24} className="mx-auto text-slate-400" />
                  <h3 className="text-base font-bold text-slate-900">No Tickets Found</h3>
                  <p className="text-xs text-slate-500">Your reservations will appear here once booked.</p>
                  <button
                    type="button"
                    onClick={() => switchTab('book')}
                    className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition"
                  >
                    Book a Trip
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ==================== TAB 4: UPCOMING DEPARTURES ==================== */}
          {activeTab === 'upcoming' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-slate-900 text-white p-5 sm:p-6 rounded-2xl shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400 bg-teal-950 px-2 py-0.5 rounded border border-teal-800">
                    Next Departure
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black">
                    {nextTrip ? nextTrip.route_name : 'Lagos (Jibowu) → Abuja (Utako)'}
                  </h2>
                  <p className="text-xs text-slate-300">
                    Coach {nextTrip?.trip?.bus?.reg_number || 'TH-104'} | Seat {nextTrip ? nextTrip.seat_number : '5'}
                  </p>
                </div>

                <div className="bg-white/10 px-5 py-3 rounded-xl border border-white/20 text-center">
                  <span className="text-[10px] text-teal-300 font-bold uppercase block">Countdown</span>
                  <span className="text-xl sm:text-2xl font-black font-mono text-amber-400">18h : 42m : 15s</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
                  <strong className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <MapPin size={15} className="text-amber-600" /> Terminal Gate
                  </strong>
                  <p className="text-xs text-slate-600">
                    Jibowu Central Terminal, Gate B4. Please arrive 15 minutes early for luggage drop-off.
                  </p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
                  <strong className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <UserIcon size={15} className="text-teal-600" /> Assigned Captain
                  </strong>
                  <p className="text-xs text-slate-600">
                    Capt. Emeka Nwachukwu (★ 4.98). Executive coach with AC and power outlets.
                  </p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2 flex flex-col justify-between">
                  <strong className="text-xs font-bold text-slate-900">Live Telematics</strong>
                  <button
                    type="button"
                    onClick={() =>
                      setGpsModalState({
                        open: true,
                        busReg: nextTrip?.trip?.bus?.reg_number || 'TH-104',
                        coachName: nextTrip?.vehicle_type || 'Executive AC Coach',
                        origin: nextTrip ? nextTrip.route_name.split('→')[0].trim() : 'Lagos',
                        destination: nextTrip ? nextTrip.route_name.split('→')[1].trim() : 'Abuja',
                      })
                    }
                    className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 rounded-xl text-xs transition flex items-center justify-center gap-1.5"
                  >
                    <MapPin size={13} /> Open Live Bus GPS
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ==================== TAB 5: CANCELLATIONS ==================== */}
          {activeTab === 'cancellations' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
                <h2 className="text-lg font-black text-slate-900">Trip Cancellation Request</h2>
                <p className="text-xs text-slate-500">
                  Cancel any active trip before departure. Our ticketing team will process your refund directly.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <RotateCcw size={15} className="text-rose-600" /> Request Cancellation
                  </h3>

                  <form onSubmit={handleCancelTripSubmit} className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Select Active Ticket</label>
                      <select
                        value={selectedCancelPnr}
                        onChange={e => setSelectedCancelPnr(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-teal-600"
                        required
                      >
                        <option value="">-- Choose active reservation --</option>
                        {activeTickets.map(t => (
                          <option key={t.pnr_code} value={t.pnr_code}>
                            {t.pnr_code} ({t.route_name} | {money(t.fare_paid || t.amount_due)})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Cancellation Reason</label>
                      <select
                        value={cancelReason}
                        onChange={e => setCancelReason(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:border-teal-600"
                      >
                        <option>Schedule Change / Travel Rescheduled</option>
                        <option>Booked Alternate Route</option>
                        <option>Personal Emergency</option>
                        <option>Other</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={cancelBusy}
                      className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition shadow-sm"
                    >
                      {cancelBusy ? 'Submitting…' : 'Submit Cancellation Request'}
                    </button>
                  </form>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">Cancellation History</h3>
                  <div className="space-y-2">
                    {cancelHistory.map(item => (
                      <div key={item.id} className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1 text-xs">
                        <div className="flex justify-between items-center">
                          <strong className="font-mono text-slate-900">{item.pnr}</strong>
                          <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold">
                            {item.status}
                          </span>
                        </div>
                        <p className="text-slate-600">{item.route}</p>
                        <span className="text-[10px] text-slate-400 block">{item.date}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================== TAB 6: HELP & SUPPORT ==================== */}
          {activeTab === 'support' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <h2 className="text-lg font-black text-slate-900">Frequently Asked Questions</h2>

                <div className="space-y-2 text-xs">
                  <details className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 group">
                    <summary className="font-bold text-slate-900 cursor-pointer flex justify-between items-center">
                      <span>How do I cancel or reschedule a trip?</span>
                      <ChevronDown size={14} className="text-slate-400 group-open:rotate-180 transition" />
                    </summary>
                    <p className="mt-2 text-slate-600">
                      Go to the Cancellations tab, choose your active booking reference, and submit a cancellation. Our
                      team will process your request.
                    </p>
                  </details>

                  <details className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 group">
                    <summary className="font-bold text-slate-900 cursor-pointer flex justify-between items-center">
                      <span>What is the baggage allowance?</span>
                      <ChevronDown size={14} className="text-slate-400 group-open:rotate-180 transition" />
                    </summary>
                    <p className="mt-2 text-slate-600">
                      Each passenger is allowed 2 luggage bags in the coach cargo hold plus 1 personal item under your
                      seat.
                    </p>
                  </details>
                </div>
              </div>

              {/* Inquiry Form */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <h3 className="text-sm font-bold text-slate-900">Send an Inquiry</h3>
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    showToast('Inquiry Sent', 'Our customer care team will respond shortly.', 'success');
                    (e.target as HTMLFormElement).reset();
                  }}
                  className="space-y-3"
                >
                  <input
                    type="text"
                    required
                    placeholder="Subject of inquiry"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:border-teal-600"
                  />
                  <textarea
                    rows={3}
                    required
                    placeholder="Describe your inquiry…"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:border-teal-600"
                  />
                  <button
                    type="submit"
                    className="bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition flex items-center gap-1.5"
                  >
                    <Send size={13} /> Submit Message
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* ==================== TAB 7: PROFILE & SETTINGS ==================== */}
          {activeTab === 'profile' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                  <div className="w-12 h-12 rounded-full bg-teal-600 text-white font-black text-lg flex items-center justify-center">
                    {profileName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-900">{profileName}</h2>
                    <span className="text-[11px] text-teal-600 font-bold flex items-center gap-1">
                      <ShieldCheck size={12} /> Verified Passenger
                    </span>
                  </div>
                </div>

                <form
                  onSubmit={e => {
                    e.preventDefault();
                    showToast('Profile Saved', 'Your account details have been updated.', 'success');
                  }}
                  className="space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                      <input
                        type="text"
                        value={profileName}
                        onChange={e => setProfileName(e.target.value)}
                        required
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:border-teal-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                      <input
                        type="email"
                        value={user?.email || 'passenger@transithub.com'}
                        disabled
                        className="w-full bg-slate-100 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-500 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                      <input
                        type="tel"
                        value={profilePhone}
                        onChange={e => setProfilePhone(e.target.value)}
                        required
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:border-teal-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Emergency Contact Name</label>
                      <input
                        type="text"
                        value={nokName}
                        onChange={e => setNokName(e.target.value)}
                        required
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:border-teal-600"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Emergency Contact Phone</label>
                      <input
                        type="tel"
                        value={nokPhone}
                        onChange={e => setNokPhone(e.target.value)}
                        required
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:border-teal-600"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="bg-teal-600 hover:bg-teal-700 text-white font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition"
                  >
                    Save Changes
                  </button>
                </form>

                {/* Password Update Section */}
                <div className="pt-4 border-t border-slate-100">
                  <h3 className="text-xs font-bold text-slate-900 mb-2">Change Password</h3>
                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      showToast('Password Updated', 'Account credentials changed successfully.', 'success');
                      (e.target as HTMLFormElement).reset();
                    }}
                    className="flex flex-col sm:flex-row gap-2"
                  >
                    <input
                      type="password"
                      placeholder="Current password"
                      required
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:border-teal-600"
                    />
                    <input
                      type="password"
                      placeholder="New password"
                      required
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:border-teal-600"
                    />
                    <button
                      type="submit"
                      className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition shrink-0"
                    >
                      Update Password
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}
        </main>

        <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-400">
          &copy; {new Date().getFullYear()} TransitHub AI Smart Mobility.
        </footer>
      </div>

      {/* ==================== QR BOARDING PASS MODAL ==================== */}
      {qrModalTicket && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 rounded-2xl max-w-sm w-full p-5 shadow-xl relative text-center space-y-3 border border-slate-200 animate-in fade-in zoom-in duration-200">
            <button
              type="button"
              onClick={() => setQrModalTicket(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700"
            >
              <X size={18} />
            </button>

            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200">
              Digital Boarding Pass
            </span>
            <h3 className="text-base font-black text-slate-900">{qrModalTicket.route_name}</h3>
            <p className="text-xs text-slate-500">Scan at terminal gate for instant boarding.</p>

            <div className="bg-white p-3 rounded-xl border border-slate-200 inline-block mx-auto my-1 shadow-sm">
              <QrCode value={`TRANSITHUB:${qrModalTicket.pnr_code}:${qrModalTicket.seat_number}`} size={150} />
            </div>

            <div className="text-xs font-mono bg-slate-50 p-2.5 rounded-xl text-slate-700 space-y-1 border border-slate-200 text-left">
              <p className="flex justify-between">
                <span>Passenger:</span>
                <strong className="text-slate-900">{qrModalTicket.passenger_name || profileName}</strong>
              </p>
              <p className="flex justify-between">
                <span>PNR:</span>
                <strong className="text-teal-700 font-bold">{qrModalTicket.pnr_code}</strong>
              </p>
              <p className="flex justify-between">
                <span>Seat:</span>
                <strong className="text-slate-900">Seat {qrModalTicket.seat_number}</strong>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => window.print()}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2 rounded-xl text-xs transition border border-slate-200 flex items-center justify-center gap-1"
              >
                <Printer size={13} /> Print
              </button>
              <button
                type="button"
                onClick={() => setQrModalTicket(null)}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded-xl text-xs uppercase tracking-wider shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== LIVE GPS TELEMATICS MODAL ==================== */}
      <GpsTrackingModal
        isOpen={gpsModalState.open}
        onClose={() => setGpsModalState(prev => ({ ...prev, open: false }))}
        busReg={gpsModalState.busReg}
        coachName={gpsModalState.coachName}
        origin={gpsModalState.origin}
        destination={gpsModalState.destination}
      />

      {/* ==================== AI ASSISTANT DRAWER ==================== */}
      <AiAssistant />
    </div>
  );
}
