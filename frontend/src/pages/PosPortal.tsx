import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Barcode,
  Bus as BusIcon,
  CheckCircle2,
  Clock,
  Compass,
  CreditCard,
  DollarSign,
  LogOut,
  Luggage,
  Menu,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  ShieldCheck,
  Tag,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, dateTime, errorMessage, money } from '../services/api';
import type { Ticket } from '../types/ticket';
import type { RouteItem } from '../types/route';
import type { Bus } from '../types/bus';

export interface ScheduledTrip {
  id: number;
  route: RouteItem;
  bus: Bus;
  driver_id: number;
  departure_time: string;
  arrival_time: string;
  fare: number;
  status: string;
  confirmed_count: number;
  boarded_count: number;
}

export interface PosOperationsData {
  routes: RouteItem[];
  buses: Bus[];
  drivers: { id: number; name: string }[];
  trips: ScheduledTrip[];
}

type PosTab = 'counter' | 'luggage' | 'lookup' | 'handover' | 'departures';

const TAB_CONFIG: Record<
  PosTab,
  { label: string; icon: typeof Receipt; description: string }
> = {
  counter: {
    label: 'Walk-in Cash Desk',
    icon: Receipt,
    description: 'Instant station counter ticketing, seat selection, and cash collection.',
  },
  luggage: {
    label: 'Baggage Tag Station',
    icon: Luggage,
    description: 'Cargo hold luggage claim tags with serialized barcodes.',
  },
  lookup: {
    label: 'Ticket Lookup & Reprint',
    icon: Search,
    description: 'Search booking by PNR, verify payment, and reprint boarding passes.',
  },
  handover: {
    label: 'Drawer Reconciliation',
    icon: Wallet,
    description: 'End-of-shift physical cash drawer handover to treasury vault.',
  },
  departures: {
    label: 'Station Timetable',
    icon: BusIcon,
    description: 'Live departure schedules, fares, and seat availability for passenger inquiries.',
  },
};

export function PosPortal() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Core Operations State
  const [data, setData] = useState<PosOperationsData>({
    routes: [],
    buses: [],
    drivers: [],
    trips: [],
  });
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<PosTab>('counter');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Counter Ticketing State
  const [selectedTripId, setSelectedTripId] = useState<number | ''>('');
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [cashConfirmed, setCashConfirmed] = useState(true);
  const [issuingTicket, setIssuingTicket] = useState(false);
  const [issuedTicket, setIssuedTicket] = useState<Ticket | null>(null);

  // Luggage Tag State
  const [luggagePnr, setLuggagePnr] = useState('');
  const [luggageCount, setLuggageCount] = useState<number>(1);
  const [generatingTags, setGeneratingTags] = useState(false);
  const [generatedTags, setGeneratedTags] = useState<string[]>([]);

  // Ticket Lookup State
  const [lookupPnr, setLookupPnr] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [lookedUpTicket, setLookedUpTicket] = useState<Ticket | null>(null);

  // Handover State
  const [handoverAmount, setHandoverAmount] = useState<number | ''>('');
  const [handoverNote, setHandoverNote] = useState('');
  const [submittingHandover, setSubmittingHandover] = useState(false);
  const [handoverSuccess, setHandoverSuccess] = useState(false);
  const handoverKey = useRef(crypto.randomUUID());

  // Session Statistics
  const [sessionTicketsCount, setSessionTicketsCount] = useState(0);
  const [sessionCashTotal, setSessionCashTotal] = useState(0);

  // Telematics & Clock
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Operations
  const fetchData = useCallback(async (isBackground = false) => {
    if (!isBackground) setRefreshing(true);
    setError('');
    try {
      const res = await api.get<PosOperationsData>('/operations');
      setData(res.data);

      if (res.data.trips.length > 0 && !selectedTripId) {
        const scheduled = res.data.trips.find(t => ['Scheduled', 'Boarding'].includes(t.status));
        if (scheduled) setSelectedTripId(scheduled.id);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      setRefreshing(false);
    }
  }, [selectedTripId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Selected Trip details
  const activeTrip = useMemo(() => {
    return data.trips.find(t => t.id === selectedTripId) || null;
  }, [data.trips, selectedTripId]);

  // Occupied seats calculation for active trip
  const occupiedSeats = useMemo(() => {
    if (!activeTrip) return new Set<number>();
    // For visual simulation, pre-populate standard seats based on confirmed count
    const occupied = new Set<number>();
    const count = activeTrip.confirmed_count || 0;
    for (let i = 1; i <= count; i++) {
      occupied.add(i);
    }
    return occupied;
  }, [activeTrip]);

  // Total seat capacity of active trip
  const activeTripCapacity = useMemo(() => {
    return activeTrip?.bus?.capacity || 14;
  }, [activeTrip]);

  // Issue Walk-in Cash Ticket
  const handleIssueCashTicket = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedTripId || !selectedSeat || !passengerName.trim() || !passengerPhone.trim()) {
      showToast('Validation Error', 'Please select trip, seat number, and passenger contact details.', 'error');
      return;
    }
    if (!cashConfirmed) {
      showToast('Cash Verification', 'Please check the box confirming physical cash has been collected.', 'error');
      return;
    }

    setIssuingTicket(true);
    try {
      const res = await api.post<{ ticket: Ticket }>('/pos/issue', {
        trip_id: Number(selectedTripId),
        seat_number: Number(selectedSeat),
        passenger_name: passengerName.trim(),
        passenger_phone: passengerPhone.trim(),
        emergency_contact: emergencyContact.trim() || undefined,
        emergency_phone: emergencyPhone.trim() || undefined,
        payment_method: 'Cash',
        cash_received: true,
      });

      const ticket = res.data.ticket;
      setIssuedTicket(ticket);
      setSessionTicketsCount(prev => prev + 1);
      setSessionCashTotal(prev => prev + (activeTrip?.fare || 0));

      showToast('Ticket Issued', `PNR: ${ticket.pnr_code} for Seat #${ticket.seat_number} successfully printed.`, 'success');

      // Reset Form fields
      setSelectedSeat(null);
      setPassengerName('');
      setPassengerPhone('');
      setEmergencyContact('');
      setEmergencyPhone('');

      // Refresh operations
      await fetchData(true);
    } catch (err) {
      showToast('Issuance Failed', errorMessage(err), 'error');
    } finally {
      setIssuingTicket(false);
    }
  };

  // Generate Luggage Tags
  const handleGenerateLuggageTags = async (e: FormEvent) => {
    e.preventDefault();
    if (!luggagePnr.trim()) {
      showToast('Validation Error', 'Enter the passenger ticket PNR code.', 'error');
      return;
    }
    setGeneratingTags(true);
    try {
      const res = await api.post<{ luggage_tags: string[] }>('/pos/luggage-tags', {
        pnr_code: luggagePnr.trim().toUpperCase(),
        luggage_count: Number(luggageCount),
      });

      setGeneratedTags(res.data.luggage_tags || []);
      showToast('Luggage Tags Generated', `${res.data.luggage_tags.length} barcode tags generated for cargo hold.`, 'success');
    } catch (err) {
      showToast('Tag Generation Failed', errorMessage(err), 'error');
    } finally {
      setGeneratingTags(false);
    }
  };

  // Lookup Ticket
  const handleLookupTicket = async (e: FormEvent) => {
    e.preventDefault();
    if (!lookupPnr.trim()) return;
    setLookingUp(true);
    setLookedUpTicket(null);
    try {
      const res = await api.get<{ ticket: Ticket }>(
        `/tickets/lookup/${encodeURIComponent(lookupPnr.trim().toUpperCase())}`
      );
      setLookedUpTicket(res.data.ticket);
    } catch (err) {
      showToast('Ticket Not Found', errorMessage(err), 'error');
    } finally {
      setLookingUp(false);
    }
  };

  // Submit Shift Cash Handover
  const handleSubmitHandover = async (e: FormEvent) => {
    e.preventDefault();
    if (!handoverAmount || Number(handoverAmount) <= 0) {
      showToast('Validation Error', 'Please enter a valid cash handover amount.', 'error');
      return;
    }
    setSubmittingHandover(true);
    try {
      await api.post('/finance/handover', {
        amount: Number(handoverAmount),
        note: handoverNote.trim() || 'POS Station Counter Shift Cash Reconciled',
        handover_key: handoverKey.current,
      });

      setHandoverSuccess(true);
      showToast('Handover Logged', `₦${Number(handoverAmount).toLocaleString()} transferred to Treasury Vault.`, 'success');
      handoverKey.current = crypto.randomUUID();
      setHandoverAmount('');
      setHandoverNote('');
    } catch (err) {
      showToast('Handover Failed', errorMessage(err), 'error');
    } finally {
      setSubmittingHandover(false);
    }
  };

  // Top Metrics
  const metrics = useMemo(() => {
    const totalScheduled = data.trips.filter(t => ['Scheduled', 'Boarding'].includes(t.status)).length;
    const totalAvailableSeats = data.trips.reduce((acc, t) => {
      const cap = t.bus?.capacity || 14;
      const booked = t.confirmed_count || 0;
      return acc + Math.max(0, cap - booked);
    }, 0);

    return {
      sessionTicketsCount,
      sessionCashTotal,
      totalScheduled,
      totalAvailableSeats,
    };
  }, [data.trips, sessionTicketsCount, sessionCashTotal]);

  const switchTab = (tab: PosTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (busy) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center mx-auto shadow-lg animate-pulse">
            <Receipt size={24} />
          </div>
          <p className="text-sm font-bold text-slate-800">Initializing POS Counter Terminal…</p>
          <p className="text-xs text-slate-500 font-mono">Syncing cash drawer session, seat maps & baggage system</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 text-slate-900 min-h-screen font-sans flex flex-col lg:flex-row antialiased selection:bg-amber-500 selection:text-white">
      {/* ==================== DESKTOP SIDEBAR ==================== */}
      <aside className="hidden lg:flex w-64 xl:w-72 bg-white border-r border-slate-200/80 p-5 flex-col justify-between shrink-0 sticky top-0 h-screen overflow-y-auto z-30 shadow-2xs">
        <div className="space-y-6">
          {/* Brand Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 via-amber-600 to-slate-900 flex items-center justify-center text-white shadow-md shadow-amber-600/20">
                <Receipt size={20} />
              </div>
              <div>
                <span className="text-base font-black tracking-tight text-slate-900 block leading-tight">
                  Transit<span className="text-amber-600">Hub</span>
                </span>
                <span className="text-[10px] uppercase font-mono tracking-wider text-amber-700 font-extrabold flex items-center gap-1">
                  <CreditCard size={11} /> POS Cash Desk
                </span>
              </div>
            </div>
            <Link
              to="/"
              title="Return to Public Site"
              className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition"
            >
              <Compass size={16} />
            </Link>
          </div>

          {/* Drawer Session Indicator */}
          <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Cash Drawer: OPEN
              </span>
              <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                Active
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono text-slate-700 pt-1 border-t border-slate-200/50">
              <span className="flex items-center gap-1">
                <Clock size={12} className="text-slate-400" />
                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} WAT
              </span>
              <span className="text-[10px] font-bold text-slate-500 font-mono">
                {metrics.sessionTicketsCount} tickets
              </span>
            </div>
          </div>

          {/* Module Navigation */}
          <nav className="space-y-1">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold block px-2 mb-2">
              Counter Desks
            </span>
            {(Object.keys(TAB_CONFIG) as PosTab[]).map(tabKey => {
              const item = TAB_CONFIG[tabKey];
              const Icon = item.icon;
              const isActive = activeTab === tabKey;

              return (
                <button
                  key={tabKey}
                  type="button"
                  onClick={() => switchTab(tabKey)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition text-xs font-bold text-left cursor-pointer group ${
                    isActive
                      ? 'bg-amber-50 text-amber-900 border border-amber-200/80 shadow-2xs font-extrabold'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon
                      size={17}
                      className={
                        isActive
                          ? 'text-amber-600'
                          : 'text-slate-400 group-hover:text-slate-600 transition'
                      }
                    />
                    <span>{item.label}</span>
                  </span>
                  {tabKey === 'counter' && metrics.totalAvailableSeats > 0 && (
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                        isActive
                          ? 'bg-amber-600 text-white'
                          : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
                      }`}
                    >
                      {metrics.totalAvailableSeats} seats
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Counter Officer Profile Card */}
        <div className="pt-4 border-t border-slate-200/80">
          <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'P'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate leading-tight">
                  {user?.name || 'Counter Cashier'}
                </p>
                <span className="text-[10px] text-amber-700 font-mono font-semibold uppercase tracking-wider block truncate">
                  POS Counter
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                void logout().then(() => navigate('/login'));
              }}
              title="Sign Out"
              className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-white transition cursor-pointer shrink-0"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* ==================== MOBILE HEADER & DRAWER ==================== */}
      <div className="lg:hidden sticky top-0 z-40 bg-white border-b border-slate-200/80 px-4 py-3 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="p-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <Menu size={18} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
              <Receipt size={14} />
            </div>
            <span className="font-extrabold text-sm text-slate-900 tracking-tight">
              Transit<span className="text-amber-600">Hub</span>
              <span className="text-[10px] text-amber-700 font-mono uppercase ml-1.5 px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded">
                POS
              </span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchData(false)}
            disabled={refreshing}
            className="p-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin text-amber-600' : ''} />
          </button>
          <button
            type="button"
            onClick={() => {
              void logout().then(() => navigate('/login'));
            }}
            className="p-1.5 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 hover:bg-slate-50 cursor-pointer"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[80vw] bg-white h-full p-5 flex flex-col justify-between shadow-2xl z-10 overflow-y-auto">
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold">
                    <Receipt size={16} />
                  </div>
                  <div>
                    <p className="font-black text-slate-900 text-sm">POS Counter</p>
                    <p className="text-[10px] font-mono text-amber-700">Cash Ticketing Desk</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              <nav className="space-y-1">
                {(Object.keys(TAB_CONFIG) as PosTab[]).map(tabKey => {
                  const item = TAB_CONFIG[tabKey];
                  const Icon = item.icon;
                  const isActive = activeTab === tabKey;

                  return (
                    <button
                      key={tabKey}
                      type="button"
                      onClick={() => switchTab(tabKey)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold text-left ${
                        isActive
                          ? 'bg-amber-50 text-amber-900 border border-amber-200'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon size={16} className={isActive ? 'text-amber-600' : 'text-slate-400'} />
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  void logout().then(() => navigate('/login'));
                }}
                className="w-full py-2.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition flex items-center justify-center gap-2"
              >
                <LogOut size={14} />
                <span>Sign Out of Counter</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MAIN WORKSPACE ==================== */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Global Error Banner */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between text-xs font-medium">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => void fetchData(false)}
              className="px-3 py-1 bg-rose-600 text-white rounded-lg font-bold hover:bg-rose-700 transition"
            >
              Retry
            </button>
          </div>
        )}

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
              <span>{TAB_CONFIG[activeTab].label}</span>
              <span className="text-xs font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2.5 py-1 rounded-full uppercase tracking-wider">
                Cash Terminal
              </span>
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1">
              {TAB_CONFIG[activeTab].description}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 bg-white border border-slate-200/80 rounded-xl text-xs font-mono font-bold text-slate-700 shadow-2xs flex items-center gap-2">
              <Clock size={13} className="text-amber-600" />
              <span>{currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            </div>
          </div>
        </div>

        {/* ==================== 5 TOP POS KPI CARDS ==================== */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {/* Card 1: Shift Cash Intake */}
          <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                Shift Intake
              </span>
              <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <DollarSign size={14} />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-black text-slate-900">
              {money(metrics.sessionCashTotal)}
            </p>
            <p className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
              <CheckCircle2 size={11} /> Physical Cash in Till
            </p>
          </div>

          {/* Card 2: Tickets Printed */}
          <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                Tickets Printed
              </span>
              <div className="w-7 h-7 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                <Receipt size={14} />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-black text-slate-900">
              {metrics.sessionTicketsCount}
            </p>
            <p className="text-[10px] text-slate-500 font-medium">
              Issued at this counter
            </p>
          </div>

          {/* Card 3: Seat Inventory */}
          <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                Seats Available
              </span>
              <div className="w-7 h-7 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                <Users size={14} />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-black text-slate-900">
              {metrics.totalAvailableSeats}
            </p>
            <p className="text-[10px] text-blue-700 font-bold">
              Vacant on today's departures
            </p>
          </div>

          {/* Card 4: Staged Departures */}
          <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                Departures Today
              </span>
              <div className="w-7 h-7 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                <BusIcon size={14} />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-black text-slate-900">
              {metrics.totalScheduled}
            </p>
            <p className="text-[10px] text-indigo-700 font-bold">
              Scheduled Intercity Trips
            </p>
          </div>

          {/* Card 5: Drawer Security */}
          <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-1.5 col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                Till Status
              </span>
              <div className="w-7 h-7 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                <ShieldCheck size={14} />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-black text-teal-800">
              BALANCED
            </p>
            <p className="text-[10px] text-teal-700 font-bold flex items-center gap-1">
              <Wallet size={11} /> Ready for Handover
            </p>
          </div>
        </div>

        {/* ==================== WORKSPACE 1: WALK-IN CASH DESK ==================== */}
        {activeTab === 'counter' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 7 Columns: Form & Seat Picker */}
              <div className="lg:col-span-7 space-y-6">
                <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-7 shadow-xs space-y-6">
                  <div className="pb-4 border-b border-slate-100">
                    <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                      <Receipt size={18} className="text-amber-600" />
                      <span>Issue Walk-in Cash Ticket</span>
                    </h2>
                    <p className="text-xs text-slate-500 font-medium">
                      Select departure trip, pick vacant seat on the coach diagram, enter passenger contact details, and collect cash.
                    </p>
                  </div>

                  <form onSubmit={handleIssueCashTicket} className="space-y-5">
                    {/* Departure Trip Selector */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                        1. Select Departure Service *
                      </label>
                      <select
                        value={selectedTripId}
                        onChange={e => {
                          setSelectedTripId(Number(e.target.value));
                          setSelectedSeat(null);
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:bg-white focus:border-amber-600 outline-hidden transition cursor-pointer"
                        required
                      >
                        <option value="" disabled>-- Select Departure Trip --</option>
                        {data.trips
                          .filter(t => ['Scheduled', 'Boarding'].includes(t.status))
                          .map(trip => (
                            <option key={trip.id} value={trip.id}>
                              Trip #{trip.id}: {trip.route?.origin} ➔ {trip.route?.destination} ({trip.bus?.reg_number} - {trip.bus?.vehicle_type}) [{money(trip.fare)}]
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Interactive Coach Seat Map */}
                    {activeTrip && (
                      <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700 font-mono uppercase">
                            2. Pick Passenger Seat ({activeTrip.bus?.vehicle_type})
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono font-bold">
                            Fare: {money(activeTrip.fare)}
                          </span>
                        </div>

                        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                          {Array.from({ length: activeTripCapacity }, (_, i) => i + 1).map(seatNum => {
                            const isOccupied = occupiedSeats.has(seatNum);
                            const isSelected = selectedSeat === seatNum;

                            return (
                              <button
                                key={seatNum}
                                type="button"
                                disabled={isOccupied}
                                onClick={() => setSelectedSeat(seatNum)}
                                className={`p-3 rounded-xl text-xs font-mono font-bold flex flex-col items-center justify-center gap-1 transition cursor-pointer ${
                                  isOccupied
                                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                                    : isSelected
                                    ? 'bg-amber-500 text-white shadow-md font-black ring-2 ring-amber-500/50'
                                    : 'bg-white hover:bg-amber-50 text-slate-800 border border-slate-200 hover:border-amber-300'
                                }`}
                              >
                                <span>#{seatNum}</span>
                                <span className="text-[8px] uppercase tracking-tighter">
                                  {isOccupied ? 'Booked' : isSelected ? 'Selected' : 'Open'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Passenger & Emergency Contact Details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                          Passenger Full Name *
                        </label>
                        <input
                          type="text"
                          value={passengerName}
                          onChange={e => setPassengerName(e.target.value)}
                          placeholder="e.g. Chukwuma Obi"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:bg-white focus:border-amber-600 outline-hidden transition"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                          Passenger Phone Number *
                        </label>
                        <input
                          type="tel"
                          value={passengerPhone}
                          onChange={e => setPassengerPhone(e.target.value)}
                          placeholder="e.g. +234 803 123 4567"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-800 focus:bg-white focus:border-amber-600 outline-hidden transition"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                          Next-of-Kin Contact Name
                        </label>
                        <input
                          type="text"
                          value={emergencyContact}
                          onChange={e => setEmergencyContact(e.target.value)}
                          placeholder="e.g. Ngozi Obi (Spouse)"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:bg-white focus:border-amber-600 outline-hidden transition"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                          Next-of-Kin Telephone
                        </label>
                        <input
                          type="tel"
                          value={emergencyPhone}
                          onChange={e => setEmergencyPhone(e.target.value)}
                          placeholder="e.g. +234 802 987 6543"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-800 focus:bg-white focus:border-amber-600 outline-hidden transition"
                        />
                      </div>
                    </div>

                    {/* Cash Collection Confirmation */}
                    <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="cashCheck"
                        checked={cashConfirmed}
                        onChange={e => setCashConfirmed(e.target.checked)}
                        className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                        required
                      />
                      <label htmlFor="cashCheck" className="text-xs text-amber-900 font-bold cursor-pointer">
                        Physical Cash Payment Verified: Collected {activeTrip ? money(activeTrip.fare) : 'full fare'} into counter cash drawer.
                      </label>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex justify-end">
                      <button
                        type="submit"
                        disabled={issuingTicket || !selectedSeat}
                        className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-2xs cursor-pointer disabled:opacity-50"
                      >
                        {issuingTicket ? <RefreshCw size={14} className="animate-spin" /> : <Printer size={14} />}
                        <span>Issue & Print Boarding Pass</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              {/* Right 5 Columns: Thermal Boarding Pass Preview & Actions */}
              <div className="lg:col-span-5 space-y-6">
                <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-5">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                      <Receipt size={16} className="text-amber-600" />
                      <span>Boarding Pass Receipt Preview</span>
                    </h3>
                    <span className="text-[10px] font-mono text-slate-400 font-bold">
                      Thermal 80mm
                    </span>
                  </div>

                  {issuedTicket ? (
                    <div className="p-5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-4 font-mono text-xs text-slate-800">
                      <div className="text-center pb-3 border-b border-dashed border-slate-300">
                        <strong className="text-sm font-black text-slate-900 block font-sans">
                          TransitHub Express Lines
                        </strong>
                        <span className="text-[10px] text-slate-500 block">
                          Official Passenger Boarding Pass
                        </span>
                        <span className="text-xs font-bold text-amber-700 mt-1 block">
                          PNR: {issuedTicket.pnr_code}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Passenger:</span>
                          <strong className="text-slate-900">{issuedTicket.passenger_name}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Seat Number:</span>
                          <strong className="text-amber-700 text-sm font-black">
                            #{issuedTicket.seat_number}
                          </strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Fare Paid:</span>
                          <strong className="text-emerald-700">{money(issuedTicket.fare_paid || issuedTicket.amount_due || 0)} (CASH)</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Issued At:</span>
                          <span>{dateTime(issuedTicket.created_at)}</span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-dashed border-slate-300 text-center space-y-2">
                        <div className="flex items-center justify-center gap-1 font-mono text-slate-400 text-[10px]">
                          <Barcode size={32} className="mx-auto text-slate-700" />
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono block">
                          *{issuedTicket.pnr_code}*
                        </span>

                        <button
                          type="button"
                          onClick={() => window.print()}
                          className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer font-sans"
                        >
                          <Printer size={13} />
                          <span>Print Thermal Slip</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="py-16 text-center text-slate-400 space-y-2">
                      <Receipt size={36} className="mx-auto text-slate-300 stroke-1" />
                      <p className="text-xs font-medium">No ticket currently issued.</p>
                      <p className="text-[11px] text-slate-400">
                        Complete passenger details on the left to issue a boarding pass.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== WORKSPACE 2: BAGGAGE TAG STATION ==================== */}
        {activeTab === 'luggage' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-7 shadow-xs space-y-6 max-w-2xl">
              <div className="pb-4 border-b border-slate-100">
                <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Luggage size={18} className="text-amber-600" />
                  <span>Cargo Hold Baggage Tag Station</span>
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  Enter verified ticket PNR code and number of bags to generate serialized thermal baggage claim tags.
                </p>
              </div>

              <form onSubmit={handleGenerateLuggageTags} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                    Ticket PNR Booking Code *
                  </label>
                  <input
                    type="text"
                    value={luggagePnr}
                    onChange={e => setLuggagePnr(e.target.value.toUpperCase())}
                    placeholder="e.g. TH-ABC1234"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold uppercase tracking-wider text-slate-800 focus:bg-white focus:border-amber-600 outline-hidden transition"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                    Number of Bags (Pieces) *
                  </label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map(num => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setLuggageCount(num)}
                        className={`flex-1 py-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer ${
                          luggageCount === num
                            ? 'bg-amber-600 text-white shadow-sm'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {num} Bag{num > 1 ? 's' : ''}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex justify-end">
                  <button
                    type="submit"
                    disabled={generatingTags}
                    className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                  >
                    {generatingTags ? <RefreshCw size={14} className="animate-spin" /> : <Tag size={14} />}
                    <span>Generate Serialized Baggage Tags</span>
                  </button>
                </div>
              </form>

              {/* Generated Baggage Tags Preview */}
              {generatedTags.length > 0 && (
                <div className="p-5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-800">
                      Generated Tags for PNR: {luggagePnr}
                    </span>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-3 py-1 bg-slate-900 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <Printer size={12} />
                      <span>Print Label Sheet</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {generatedTags.map((tag, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-white border border-slate-200 rounded-xl space-y-1 font-mono text-xs"
                      >
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>TRANSITHUB CARGO</span>
                          <span>TAG {idx + 1} / {generatedTags.length}</span>
                        </div>
                        <strong className="text-sm font-black text-slate-900 block">
                          {tag}
                        </strong>
                        <div className="pt-1 flex items-center justify-center">
                          <Barcode size={28} className="text-slate-700" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== WORKSPACE 3: TICKET LOOKUP & REPRINT ==================== */}
        {activeTab === 'lookup' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-7 shadow-xs space-y-6 max-w-2xl">
              <div className="pb-4 border-b border-slate-100">
                <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Search size={18} className="text-amber-600" />
                  <span>Ticket Lookup & Reprint Desk</span>
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  Search booking record by passenger PNR code to verify travel status or reissue thermal boarding pass.
                </p>
              </div>

              <form onSubmit={handleLookupTicket} className="flex gap-2">
                <input
                  type="text"
                  value={lookupPnr}
                  onChange={e => setLookupPnr(e.target.value.toUpperCase())}
                  placeholder="Enter 8-digit PNR (e.g. TH-ABC1234)"
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold uppercase text-slate-800 focus:bg-white focus:border-amber-600 outline-hidden transition"
                  required
                />
                <button
                  type="submit"
                  disabled={lookingUp}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {lookingUp ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                  <span>Search Ticket</span>
                </button>
              </form>

              {lookedUpTicket && (
                <div className="p-5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                    <div>
                      <strong className="text-sm font-bold text-slate-900">
                        {lookedUpTicket.passenger_name}
                      </strong>
                      <span className="text-xs font-mono text-slate-500 block">
                        PNR: {lookedUpTicket.pnr_code} • Seat #{lookedUpTicket.seat_number}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-mono font-extrabold uppercase px-2 py-0.5 rounded-full ${
                        lookedUpTicket.status === 'Paid' || lookedUpTicket.status === 'Confirmed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {lookedUpTicket.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 font-mono block">Passenger Phone</span>
                      <span className="font-bold text-slate-800">{lookedUpTicket.passenger_phone || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-mono block">Ticket Fare</span>
                      <span className="font-mono font-bold text-emerald-700">{money(lookedUpTicket.fare_paid || lookedUpTicket.amount_due || 0)}</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIssuedTicket(lookedUpTicket);
                        setActiveTab('counter');
                      }}
                      className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Printer size={13} />
                      <span>Reissue Boarding Pass Slip</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== WORKSPACE 4: SHIFT CASH DRAWER HANDOVER ==================== */}
        {activeTab === 'handover' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-7 shadow-xs space-y-6 max-w-xl">
              <div className="pb-4 border-b border-slate-100">
                <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Wallet size={18} className="text-amber-600" />
                  <span>End-of-Shift Cash Drawer Handover</span>
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  Count physical currency collected at this terminal desk and submit reconciliation report to Finance Treasury.
                </p>
              </div>

              {handoverSuccess && (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-3 text-xs">
                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                  <div>
                    <strong className="block">Cash Handover Recorded</strong>
                    <span>Your shift cash has been verified and credited to Treasury records.</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmitHandover} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                    Physical Cash Handover Amount (NGN ₦) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="100"
                    value={handoverAmount}
                    onChange={e => setHandoverAmount(Number(e.target.value))}
                    placeholder="e.g. 75000"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 focus:bg-white focus:border-amber-600 outline-hidden transition"
                    required
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Enter the exact currency amount physically counted in the counter drawer.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                    Reconciliation Notes / Denominations
                  </label>
                  <textarea
                    value={handoverNote}
                    onChange={e => setHandoverNote(e.target.value)}
                    placeholder="e.g. 50x ₦1,000, 50x ₦500. Balanced shift drawer."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:bg-white focus:border-amber-600 outline-hidden transition resize-none h-24"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingHandover}
                    className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-2xs cursor-pointer disabled:opacity-50"
                  >
                    {submittingHandover ? <RefreshCw size={14} className="animate-spin" /> : <Wallet size={14} />}
                    <span>Submit Cash Handover</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ==================== WORKSPACE 5: STATION TIMETABLE ==================== */}
        {activeTab === 'departures' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
              <div>
                <h2 className="text-lg font-black text-slate-900">Live Station Timetable</h2>
                <p className="text-xs text-slate-500 font-medium">
                  Departure timings, vehicle types, seat inventory, and ticket pricing.
                </p>
              </div>

              <span className="text-xs font-mono font-bold text-slate-500 bg-white border border-slate-200/80 px-3 py-1 rounded-xl shadow-2xs">
                Scheduled Services: {data.trips.length}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {data.trips.map(trip => {
                const cap = trip.bus?.capacity || 14;
                const booked = trip.confirmed_count || 0;
                const available = Math.max(0, cap - booked);

                return (
                  <div
                    key={trip.id}
                    className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs space-y-4 hover:border-amber-300 transition"
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <span className="font-mono text-xs font-bold text-slate-400">
                        Trip #{trip.id}
                      </span>
                      <span className="font-mono font-black text-sm text-emerald-700">
                        {money(trip.fare)}
                      </span>
                    </div>

                    <h3 className="text-base font-black text-slate-900 flex items-center gap-1.5">
                      <span>{trip.route?.origin}</span>
                      <ArrowRight size={14} className="text-slate-400" />
                      <span>{trip.route?.destination}</span>
                    </h3>

                    <div className="space-y-1 text-xs text-slate-500 font-mono">
                      <p className="flex items-center gap-1">
                        <Clock size={12} />
                        Departure: {dateTime(trip.departure_time)}
                      </p>
                      <p>Coach: {trip.bus?.reg_number} ({trip.bus?.vehicle_type})</p>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/60 flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700">Available Seats:</span>
                      <span className="font-mono font-black text-amber-700">
                        {available} of {cap} open
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTripId(trip.id);
                        setActiveTab('counter');
                      }}
                      className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Receipt size={13} />
                      <span>Issue Ticket on this Service</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
