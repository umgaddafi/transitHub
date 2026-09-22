import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bus as BusIcon,
  CheckCircle2,
  Clock,
  Compass,
  FileText,
  LogOut,
  Megaphone,
  Menu,
  Phone,
  Printer,
  QrCode,
  Radio,
  RefreshCw,
  Scan,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, dateTime, errorMessage } from '../services/api';
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

export interface MarshalOperationsData {
  routes: RouteItem[];
  buses: Bus[];
  drivers: { id: number; name: string }[];
  trips: ScheduledTrip[];
}

type MarshalTab = 'gate' | 'departures' | 'manifest' | 'security';

const TAB_CONFIG: Record<
  MarshalTab,
  { label: string; icon: typeof Scan; description: string }
> = {
  gate: {
    label: 'Gate Scanner',
    icon: Scan,
    description: 'Real-time passenger boarding validator and PNR barcode verification.',
  },
  departures: {
    label: 'Departure Bays',
    icon: BusIcon,
    description: 'Terminal bay status, live vehicle staging, and seat occupancy gauges.',
  },
  manifest: {
    label: 'Passenger Manifest',
    icon: Users,
    description: 'Complete passenger roster, contact details, next-of-kin, and printable manifest.',
  },
  security: {
    label: 'Station Security',
    icon: ShieldCheck,
    description: 'Terminal security screening, baggage contraband check, and passenger calls.',
  },
};

interface BoardingLog {
  id: string;
  pnr: string;
  passenger: string;
  seat: string | number;
  tripId: number;
  time: string;
  status: 'boarded' | 'rejected';
  reason?: string;
}

export function MarshalPortal() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Core Data State
  const [data, setData] = useState<MarshalOperationsData>({
    routes: [],
    buses: [],
    drivers: [],
    trips: [],
  });
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<MarshalTab>('gate');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Gate Scanner State
  const [selectedTripId, setSelectedTripId] = useState<number | ''>('');
  const [pnrInput, setPnrInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    message: string;
    ticket?: Ticket;
    scannedAt?: string;
  } | null>(null);
  const [boardingLogs, setBoardingLogs] = useState<BoardingLog[]>([]);

  // Manifest State
  const [manifestTripId, setManifestTripId] = useState<number | null>(null);
  const [manifestData, setManifestData] = useState<{ trip: ScheduledTrip; tickets: Ticket[] } | null>(null);
  const [manifestLoading, setManifestLoading] = useState(false);
  const [manifestSearch, setManifestSearch] = useState('');

  // Security / Announcements
  const [announcementText, setAnnouncementText] = useState('');
  const [activeAnnouncement, setActiveAnnouncement] = useState<string | null>(
    'Final boarding call for Lagos to Abuja Flight Deck (Bay 1). All ticketed passengers report to Gate B.'
  );

  // Auto-sync ticker (30s)
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(30);
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
      const res = await api.get<MarshalOperationsData>('/operations');
      setData(res.data);

      // Default select the first active/upcoming trip for scanner
      if (res.data.trips.length > 0) {
        setSelectedTripId(prev => {
          if (prev && res.data.trips.some(t => t.id === prev)) return prev;
          const active = res.data.trips.find(t => ['Scheduled', 'Boarding'].includes(t.status));
          return active ? active.id : res.data.trips[0].id;
        });

        setManifestTripId(prev => {
          if (prev && res.data.trips.some(t => t.id === prev)) return prev;
          const active = res.data.trips.find(t => ['Scheduled', 'Boarding'].includes(t.status));
          return active ? active.id : res.data.trips[0].id;
        });
      }
      setCountdown(30);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Auto-refresh timer
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          void fetchData(true);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  // Load Manifest when manifestTripId changes
  const loadManifest = useCallback(async (tripId: number) => {
    setManifestLoading(true);
    try {
      const res = await api.get<{ trip: ScheduledTrip; tickets: Ticket[] }>(
        `/operations/trips/${tripId}/manifest`
      );
      setManifestData(res.data);
    } catch (err) {
      showToast('Manifest Error', errorMessage(err), 'error');
    } finally {
      setManifestLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (manifestTripId) {
      void loadManifest(manifestTripId);
    }
  }, [manifestTripId, loadManifest]);

  // Handle Gate Boarding Validation
  const handleBoardingScan = async (e: FormEvent) => {
    e.preventDefault();
    if (!pnrInput.trim()) {
      showToast('Validation Error', 'Enter or scan a passenger PNR code', 'error');
      return;
    }
    if (!selectedTripId) {
      showToast('Validation Error', 'Please select the departure trip bay first', 'error');
      return;
    }

    const cleanPnr = pnrInput.trim().toUpperCase();
    setScanning(true);
    setScanResult(null);

    try {
      const res = await api.post<{
        success: boolean;
        message: string;
        ticket: Ticket;
      }>('/operations/board', {
        trip_id: selectedTripId,
        pnr_code: cleanPnr,
      });

      const scanTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      setScanResult({
        success: true,
        message: res.data.message || 'Passenger verified & boarding pass cleared.',
        ticket: res.data.ticket,
        scannedAt: scanTime,
      });

      // Add to recent boarding log
      setBoardingLogs(prev => [
        {
          id: crypto.randomUUID(),
          pnr: cleanPnr,
          passenger: res.data.ticket?.passenger_name || 'Verified Passenger',
          seat: res.data.ticket?.seat_number || 0,
          tripId: Number(selectedTripId),
          time: scanTime,
          status: 'boarded',
        },
        ...prev.slice(0, 19),
      ]);

      showToast('Boarding Approved', `Seat ${res.data.ticket?.seat_number}: ${res.data.ticket?.passenger_name} checked in!`, 'success');
      setPnrInput('');

      // Refresh operations counts and active manifest
      void fetchData(true);
      if (manifestTripId === selectedTripId) {
        void loadManifest(Number(selectedTripId));
      }
    } catch (err) {
      const errorMsg = errorMessage(err);
      const scanTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      setScanResult({
        success: false,
        message: errorMsg,
        scannedAt: scanTime,
      });

      setBoardingLogs(prev => [
        {
          id: crypto.randomUUID(),
          pnr: cleanPnr,
          passenger: 'Unknown / Invalid',
          seat: 0,
          tripId: Number(selectedTripId),
          time: scanTime,
          status: 'rejected',
          reason: errorMsg,
        },
        ...prev.slice(0, 19),
      ]);

      showToast('Boarding Denied', errorMsg, 'error');
    } finally {
      setScanning(false);
    }
  };

  // Broadcast announcement
  const handleBroadcast = (e: FormEvent) => {
    e.preventDefault();
    if (!announcementText.trim()) return;
    setActiveAnnouncement(announcementText.trim());
    showToast('Terminal Broadcast', 'Public announcement pushed to terminal PA system displays.', 'success');
    setAnnouncementText('');
  };

  // Filtered manifest
  const filteredManifestTickets = useMemo(() => {
    if (!manifestData?.tickets) return [];
    if (!manifestSearch.trim()) return manifestData.tickets;
    const q = manifestSearch.toLowerCase().trim();
    return manifestData.tickets.filter(t =>
      t.passenger_name.toLowerCase().includes(q) ||
      t.pnr_code.toLowerCase().includes(q) ||
      (t.passenger_phone || '').toLowerCase().includes(q) ||
      String(t.seat_number).includes(q)
    );
  }, [manifestData?.tickets, manifestSearch]);

  // Selected Trip details for scanner
  const activeScannerTrip = useMemo(() => {
    return data.trips.find(t => t.id === selectedTripId) || null;
  }, [data.trips, selectedTripId]);

  // Top Metrics
  const metrics = useMemo(() => {
    const totalTrips = data.trips.length;
    const activeTrips = data.trips.filter(t => ['Scheduled', 'Boarding'].includes(t.status)).length;
    const totalExpected = data.trips.reduce((acc, t) => acc + (t.confirmed_count || 0), 0);
    const totalBoarded = data.trips.reduce((acc, t) => acc + (t.boarded_count || 0), 0);
    const clearanceRate = totalExpected > 0 ? Math.round((totalBoarded / totalExpected) * 100) : 0;

    return {
      activeTrips,
      totalTrips,
      totalExpected,
      totalBoarded,
      clearanceRate,
    };
  }, [data.trips]);

  const switchTab = (tab: MarshalTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (busy) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white flex items-center justify-center mx-auto shadow-lg animate-pulse">
            <Scan size={24} />
          </div>
          <p className="text-sm font-bold text-slate-800">Initializing Station Marshal Terminal…</p>
          <p className="text-xs text-slate-500 font-mono">Syncing gate sensors, departure bays, and manifest rosters</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 text-slate-900 min-h-screen font-sans flex flex-col lg:flex-row antialiased selection:bg-teal-500 selection:text-white">
      {/* ==================== DESKTOP SIDEBAR ==================== */}
      <aside className="hidden lg:flex w-64 xl:w-72 bg-white border-r border-slate-200/80 p-5 flex-col justify-between shrink-0 sticky top-0 h-screen overflow-y-auto z-30 shadow-2xs">
        <div className="space-y-6">
          {/* Brand Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-600 via-teal-700 to-slate-900 flex items-center justify-center text-white shadow-md shadow-teal-700/20">
                <ShieldCheck size={20} />
              </div>
              <div>
                <span className="text-base font-black tracking-tight text-slate-900 block leading-tight">
                  Transit<span className="text-teal-600">Hub</span>
                </span>
                <span className="text-[10px] uppercase font-mono tracking-wider text-teal-700 font-extrabold flex items-center gap-1">
                  <Scan size={11} /> Station Marshal
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

          {/* Gate Telematics Status */}
          <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
                </span>
                Gate Telemetry
              </span>
              <span className="text-[10px] font-mono font-bold text-slate-500">
                {countdown}s sync
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono text-slate-700 pt-1 border-t border-slate-200/50">
              <span className="flex items-center gap-1">
                <Clock size={12} className="text-slate-400" />
                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} WAT
              </span>
              <button
                type="button"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded cursor-pointer transition ${
                  autoRefresh
                    ? 'bg-teal-100 text-teal-800'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {autoRefresh ? 'Live' : 'Paused'}
              </button>
            </div>
          </div>

          {/* Module Navigation */}
          <nav className="space-y-1">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold block px-2 mb-2">
              Station Modules
            </span>
            {(Object.keys(TAB_CONFIG) as MarshalTab[]).map(tabKey => {
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
                      ? 'bg-teal-50 text-teal-800 border border-teal-200/80 shadow-2xs font-extrabold'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon
                      size={17}
                      className={
                        isActive
                          ? 'text-teal-600'
                          : 'text-slate-400 group-hover:text-slate-600 transition'
                      }
                    />
                    <span>{item.label}</span>
                  </span>
                  {tabKey === 'departures' && data.trips.length > 0 && (
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                        isActive
                          ? 'bg-teal-600 text-white'
                          : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
                      }`}
                    >
                      {metrics.activeTrips}
                    </span>
                  )}
                  {tabKey === 'gate' && metrics.clearanceRate > 0 && (
                    <span className="text-[10px] font-mono font-bold text-teal-700 bg-teal-100/80 px-1.5 py-0.5 rounded">
                      {metrics.clearanceRate}%
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Quick Refresh Shortcut */}
          <div className="pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => void fetchData(false)}
              disabled={refreshing}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl transition cursor-pointer"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin text-teal-600' : ''} />
              <span>{refreshing ? 'Syncing Station…' : 'Force Sync Station'}</span>
            </button>
          </div>
        </div>

        {/* Marshal User Profile Card */}
        <div className="pt-4 border-t border-slate-200/80">
          <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'M'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate leading-tight">
                  {user?.name || 'Chief Inspector'}
                </p>
                <span className="text-[10px] text-teal-700 font-mono font-semibold uppercase tracking-wider block truncate">
                  Station Marshal
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
            <div className="w-7 h-7 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs">
              <ShieldCheck size={14} />
            </div>
            <span className="font-extrabold text-sm text-slate-900 tracking-tight">
              Transit<span className="text-teal-600">Hub</span>
              <span className="text-[10px] text-teal-700 font-mono uppercase ml-1.5 px-1.5 py-0.5 bg-teal-50 border border-teal-200 rounded">
                Marshal
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
            <RefreshCw size={15} className={refreshing ? 'animate-spin text-teal-600' : ''} />
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

      {/* Mobile Slide-over Drawer */}
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
                  <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold">
                    <ShieldCheck size={16} />
                  </div>
                  <div>
                    <p className="font-black text-slate-900 text-sm">Station Marshal</p>
                    <p className="text-[10px] font-mono text-teal-700">Gate & Boarding HQ</p>
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
                {(Object.keys(TAB_CONFIG) as MarshalTab[]).map(tabKey => {
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
                          ? 'bg-teal-50 text-teal-800 border border-teal-200'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon size={16} className={isActive ? 'text-teal-600' : 'text-slate-400'} />
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
                <span>Sign Out of Station</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MAIN WORKSPACE ==================== */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Top Operational Alert / Public Address Banner */}
        {activeAnnouncement && (
          <div className="bg-gradient-to-r from-teal-700 via-teal-800 to-slate-900 text-white p-3.5 rounded-2xl shadow-sm flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="p-1.5 rounded-lg bg-white/20 text-white shrink-0">
                <Megaphone size={14} className="animate-bounce" />
              </span>
              <p className="truncate font-medium">
                <strong className="uppercase font-mono tracking-wider font-extrabold text-teal-200 mr-2">
                  Public Broadcast:
                </strong>
                {activeAnnouncement}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveAnnouncement(null)}
              className="text-teal-200 hover:text-white text-[11px] font-bold underline shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

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
              <span className="text-xs font-mono font-bold text-teal-700 bg-teal-50 border border-teal-200/80 px-2.5 py-1 rounded-full uppercase tracking-wider">
                Gate Terminal
              </span>
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1">
              {TAB_CONFIG[activeTab].description}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 bg-white border border-slate-200/80 rounded-xl text-xs font-mono font-bold text-slate-700 shadow-2xs flex items-center gap-2">
              <Clock size={13} className="text-teal-600" />
              <span>{currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            </div>
          </div>
        </div>

        {/* ==================== 5 TOP MARSHAL KPI CARDS ==================== */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {/* Card 1: Active Boarding Trips */}
          <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                Bay Departures
              </span>
              <div className="w-7 h-7 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                <BusIcon size={14} />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-black text-slate-900">
              {metrics.activeTrips} <span className="text-xs font-normal text-slate-400">/ {metrics.totalTrips}</span>
            </p>
            <p className="text-[10px] text-teal-700 font-bold flex items-center gap-1">
              <CheckCircle2 size={11} /> Staged at Terminal Bays
            </p>
          </div>

          {/* Card 2: Expected Passengers */}
          <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                Booked Roster
              </span>
              <div className="w-7 h-7 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                <Users size={14} />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-black text-slate-900">
              {metrics.totalExpected}
            </p>
            <p className="text-[10px] text-slate-500 font-medium">
              Confirmed ticket holders
            </p>
          </div>

          {/* Card 3: Boarded at Gate */}
          <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                Gate Boarded
              </span>
              <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 size={14} />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-black text-slate-900">
              {metrics.totalBoarded}
            </p>
            <p className="text-[10px] text-emerald-700 font-bold">
              Verified through turnstiles
            </p>
          </div>

          {/* Card 4: Clearance Rate */}
          <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                Clearance Rate
              </span>
              <div className="w-7 h-7 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                <Scan size={14} />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-black text-slate-900">
              {metrics.clearanceRate}%
            </p>
            {/* Progress bar */}
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, metrics.clearanceRate)}%` }}
              />
            </div>
          </div>

          {/* Card 5: Security Level */}
          <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-1.5 col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                Gate Status
              </span>
              <div className="w-7 h-7 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                <ShieldCheck size={14} />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-black text-teal-800">
              SECURE
            </p>
            <p className="text-[10px] text-teal-700 font-bold flex items-center gap-1">
              <Radio size={11} /> All Bays Monitored
            </p>
          </div>
        </div>

        {/* ==================== WORKSPACE 1: GATE SCANNER ==================== */}
        {activeTab === 'gate' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Scanner Terminal */}
              <div className="lg:col-span-7 space-y-6">
                <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-7 shadow-xs space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                    <div>
                      <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                        <Scan size={18} className="text-teal-600" />
                        <span>Passenger Gate Scanner</span>
                      </h2>
                      <p className="text-xs text-slate-500 font-medium">
                        Scan or enter passenger PNR code to verify ticket and permit coach boarding.
                      </p>
                    </div>

                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-teal-50 text-teal-700 border border-teal-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-ping"></span>
                      Scanner Ready
                    </span>
                  </div>

                  <form onSubmit={handleBoardingScan} className="space-y-4">
                    {/* Bay Departure Selector */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                        1. Select Staged Departure Bay
                      </label>
                      <select
                        value={selectedTripId}
                        onChange={e => setSelectedTripId(Number(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:bg-white focus:border-teal-600 focus:ring-1 focus:ring-teal-600 outline-hidden transition cursor-pointer"
                        required
                      >
                        <option value="" disabled>-- Choose Staged Trip Bay --</option>
                        {data.trips.map(trip => (
                          <option key={trip.id} value={trip.id}>
                            Bay #{trip.id}: {trip.route?.origin} ➔ {trip.route?.destination} ({trip.bus?.reg_number} - {trip.bus?.vehicle_type}) [{trip.boarded_count || 0}/{trip.confirmed_count || 0} Boarded]
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Scanner Input Deck */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                        2. Scan Ticket Barcode / PNR Code
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                          <QrCode size={18} />
                        </div>
                        <input
                          type="text"
                          value={pnrInput}
                          onChange={e => setPnrInput(e.target.value.toUpperCase())}
                          placeholder="e.g. TH-ABC1234 or paste Barcode string"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-24 py-3 text-sm font-mono font-bold uppercase tracking-wider text-slate-900 placeholder:normal-case placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 focus:bg-white focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 outline-hidden transition"
                          autoComplete="off"
                          autoFocus
                          required
                        />
                        <button
                          type="submit"
                          disabled={scanning}
                          className="absolute right-2 top-2 bottom-2 px-4 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                        >
                          {scanning ? (
                            <RefreshCw size={14} className="animate-spin" />
                          ) : (
                            <>
                              <span>Verify</span>
                              <ArrowRight size={13} />
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1.5">
                        Accepts physical thermal ticket barcode numbers or digital mobile PNR codes.
                      </p>
                    </div>
                  </form>

                  {/* Active Selected Trip Snapshot Card */}
                  {activeScannerTrip && (
                    <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700 flex items-center gap-1.5">
                          <BusIcon size={14} className="text-teal-600" />
                          {activeScannerTrip.route?.origin} ➔ {activeScannerTrip.route?.destination}
                        </span>
                        <span className="font-mono text-slate-500 font-bold">
                          Trip #{activeScannerTrip.id}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="p-2 bg-white rounded-xl border border-slate-200/60">
                          <span className="text-[10px] text-slate-400 block font-mono">Bus Plate</span>
                          <strong className="text-slate-800 font-bold">{activeScannerTrip.bus?.reg_number}</strong>
                        </div>
                        <div className="p-2 bg-white rounded-xl border border-slate-200/60">
                          <span className="text-[10px] text-slate-400 block font-mono">Coach Type</span>
                          <strong className="text-slate-800 font-bold">{activeScannerTrip.bus?.vehicle_type}</strong>
                        </div>
                        <div className="p-2 bg-white rounded-xl border border-slate-200/60">
                          <span className="text-[10px] text-slate-400 block font-mono">Boarded</span>
                          <strong className="text-teal-700 font-bold">
                            {activeScannerTrip.boarded_count || 0} / {activeScannerTrip.confirmed_count || 0}
                          </strong>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Real-time Scan Result Card */}
                  {scanResult && (
                    <div
                      className={`p-5 rounded-2xl border transition-all ${
                        scanResult.success
                          ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                          : 'bg-rose-50 border-rose-300 text-rose-950'
                      }`}
                    >
                      <div className="flex items-start gap-3.5">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm ${
                            scanResult.success ? 'bg-emerald-600' : 'bg-rose-600'
                          }`}
                        >
                          {scanResult.success ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}
                        </div>
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-xs uppercase font-mono font-extrabold tracking-wider ${
                                scanResult.success ? 'text-emerald-800' : 'text-rose-800'
                              }`}
                            >
                              {scanResult.success ? 'Boarding Approved' : 'Boarding Rejected'}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 font-bold">
                              {scanResult.scannedAt}
                            </span>
                          </div>
                          <p className="text-sm font-bold leading-snug">{scanResult.message}</p>

                          {scanResult.ticket && (
                            <div className="mt-3 pt-3 border-t border-emerald-200/80 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                              <div className="p-2 bg-white/80 rounded-xl">
                                <span className="text-[10px] text-slate-500 block font-mono">Passenger</span>
                                <strong className="text-slate-900 block truncate">
                                  {scanResult.ticket.passenger_name}
                                </strong>
                              </div>
                              <div className="p-2 bg-white/80 rounded-xl">
                                <span className="text-[10px] text-slate-500 block font-mono">Seat Assigned</span>
                                <strong className="text-emerald-700 text-base font-black">
                                  #{scanResult.ticket.seat_number}
                                </strong>
                              </div>
                              <div className="p-2 bg-white/80 rounded-xl">
                                <span className="text-[10px] text-slate-500 block font-mono">PNR Code</span>
                                <strong className="font-mono text-slate-800">
                                  {scanResult.ticket.pnr_code}
                                </strong>
                              </div>
                              <div className="p-2 bg-white/80 rounded-xl">
                                <span className="text-[10px] text-slate-500 block font-mono">Gate Status</span>
                                <span className="inline-block text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                                  Checked In
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Live Boarding Log & Turnstile Feed */}
              <div className="lg:col-span-5 space-y-6">
                <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                      <Clock size={16} className="text-teal-600" />
                      <span>Gate Activity Feed</span>
                    </h3>
                    <span className="text-[10px] font-mono font-bold text-slate-400">
                      {boardingLogs.length} scans logged
                    </span>
                  </div>

                  {boardingLogs.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 space-y-2">
                      <Scan size={32} className="mx-auto text-slate-300 stroke-1" />
                      <p className="text-xs font-medium">No boarding scans recorded this session.</p>
                      <p className="text-[11px] text-slate-400">
                        Select a trip and scan passenger barcodes above.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
                      {boardingLogs.map(log => (
                        <div
                          key={log.id}
                          className={`p-3 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
                            log.status === 'boarded'
                              ? 'bg-slate-50 border-slate-200/80'
                              : 'bg-rose-50/50 border-rose-200 text-rose-900'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`w-6 h-6 rounded-lg flex items-center justify-center text-white text-[10px] font-bold shrink-0 ${
                                log.status === 'boarded' ? 'bg-emerald-600' : 'bg-rose-600'
                              }`}
                            >
                              {log.status === 'boarded' ? '✓' : '✕'}
                            </span>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 truncate">
                                {log.passenger}
                              </p>
                              <p className="text-[10px] font-mono text-slate-500">
                                PNR: {log.pnr} {Number(log.seat) > 0 ? `• Seat #${log.seat}` : ''}
                              </p>
                            </div>
                          </div>
                          <span className="text-[10px] font-mono font-bold text-slate-400 shrink-0">
                            {log.time}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quick Announcement Trigger Box */}
                <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs space-y-3">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider font-mono flex items-center gap-2">
                    <Megaphone size={14} className="text-teal-600" />
                    <span>Quick Bay Announcement</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        const bayName = activeScannerTrip ? `Bay #${activeScannerTrip.id}` : 'All Bays';
                        const text = `Final boarding call for ${bayName}. Gate doors are closing in 5 minutes.`;
                        setActiveAnnouncement(text);
                        showToast('Broadcasted', text, 'info');
                      }}
                      className="p-2.5 text-left bg-slate-50 hover:bg-teal-50 border border-slate-200/80 hover:border-teal-200 rounded-xl transition font-bold text-slate-700 hover:text-teal-900 cursor-pointer"
                    >
                      📢 Final Call (5m)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const text = 'Notice to all passengers: Please have your valid photo ID and printed boarding pass ready for ticket inspection.';
                        setActiveAnnouncement(text);
                        showToast('Broadcasted', text, 'info');
                      }}
                      className="p-2.5 text-left bg-slate-50 hover:bg-teal-50 border border-slate-200/80 hover:border-teal-200 rounded-xl transition font-bold text-slate-700 hover:text-teal-900 cursor-pointer"
                    >
                      🪪 ID Inspection Call
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== WORKSPACE 2: DEPARTURE BAYS ==================== */}
        {activeTab === 'departures' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
              <div>
                <h2 className="text-lg font-black text-slate-900">Active Terminal Bays</h2>
                <p className="text-xs text-slate-500 font-medium">
                  Real-time coach staging, driver sign-in, and passenger gate clearance progress.
                </p>
              </div>

              <span className="text-xs font-mono font-bold text-slate-500 bg-white border border-slate-200/80 px-3 py-1 rounded-xl shadow-2xs">
                Total Bays Staged: {data.trips.length}
              </span>
            </div>

            {data.trips.length === 0 ? (
              <div className="bg-white border border-slate-200/80 rounded-3xl p-12 text-center text-slate-400 space-y-3">
                <BusIcon size={36} className="mx-auto text-slate-300 stroke-1" />
                <p className="text-sm font-bold text-slate-700">No trips currently scheduled at terminal bays.</p>
                <p className="text-xs text-slate-400">Trips will appear here once scheduled by Dispatch Operations.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {data.trips.map(trip => {
                  const capacity = trip.bus?.capacity || 14;
                  const confirmed = trip.confirmed_count || 0;
                  const boarded = trip.boarded_count || 0;
                  const percentBoarded = confirmed > 0 ? Math.round((boarded / confirmed) * 100) : 0;

                  return (
                    <div
                      key={trip.id}
                      className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs space-y-4 hover:border-teal-300 transition"
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-slate-100 text-slate-700">
                          Bay #{trip.id}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-extrabold uppercase px-2 py-0.5 rounded-full ${
                            trip.status === 'Departed'
                              ? 'bg-blue-100 text-blue-800'
                              : trip.status === 'Completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-teal-100 text-teal-800'
                          }`}
                        >
                          {trip.status}
                        </span>
                      </div>

                      {/* Route Info */}
                      <div className="space-y-1">
                        <h3 className="text-base font-black text-slate-900 flex items-center gap-1.5">
                          <span>{trip.route?.origin}</span>
                          <ArrowRight size={14} className="text-slate-400" />
                          <span>{trip.route?.destination}</span>
                        </h3>
                        <p className="text-xs font-mono text-slate-500 flex items-center gap-1">
                          <Clock size={12} className="text-slate-400" />
                          Departure: {dateTime(trip.departure_time)}
                        </p>
                      </div>

                      {/* Coach & Driver Badge */}
                      <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-2xl grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[10px] font-mono text-slate-400 block">Assigned Coach</span>
                          <span className="font-bold text-slate-800 block truncate">
                            {trip.bus?.reg_number} ({trip.bus?.vehicle_type})
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-mono text-slate-400 block">Coach Driver</span>
                          <span className="font-bold text-slate-800 block truncate">
                            {trip.bus?.driver_name || 'Assigned Driver'}
                          </span>
                        </div>
                      </div>

                      {/* Boarding Progress Bar */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-600">Gate Boarding:</span>
                          <span className="font-mono font-bold text-teal-700">
                            {boarded} / {confirmed} ({percentBoarded}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-teal-600 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, percentBoarded)}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                          <span>Total Capacity: {capacity} seats</span>
                          <span>Unboarded: {Math.max(0, confirmed - boarded)}</span>
                        </div>
                      </div>

                      {/* Bay Actions */}
                      <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTripId(trip.id);
                            setActiveTab('gate');
                          }}
                          className="flex-1 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                          <Scan size={13} />
                          <span>Open Gate Scanner</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setManifestTripId(trip.id);
                            setActiveTab('manifest');
                          }}
                          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                          title="View Manifest Roster"
                        >
                          <Users size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==================== WORKSPACE 3: PASSENGER MANIFEST ==================== */}
        {activeTab === 'manifest' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-6">
              {/* Trip Selector & Controls */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="space-y-1">
                  <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <FileText size={18} className="text-teal-600" />
                    <span>Official Gate Manifest & Roster</span>
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Verified passenger list, seat allocations, emergency telephone contacts, and boarding statuses.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <select
                    value={manifestTripId || ''}
                    onChange={e => setManifestTripId(Number(e.target.value))}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 focus:bg-white focus:border-teal-600 outline-hidden transition cursor-pointer"
                  >
                    {data.trips.map(trip => (
                      <option key={trip.id} value={trip.id}>
                        Trip #{trip.id}: {trip.route?.origin} ➔ {trip.route?.destination} ({trip.bus?.reg_number})
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <Printer size={13} />
                    <span>Print Manifest</span>
                  </button>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Search size={16} />
                </div>
                <input
                  type="text"
                  value={manifestSearch}
                  onChange={e => setManifestSearch(e.target.value)}
                  placeholder="Filter passenger manifest by name, seat number, PNR, or telephone..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-teal-600 outline-hidden transition"
                />
              </div>

              {/* Manifest Table */}
              {manifestLoading ? (
                <div className="py-12 text-center text-slate-400">
                  <RefreshCw size={24} className="animate-spin mx-auto text-teal-600 mb-2" />
                  <p className="text-xs font-bold text-slate-700">Loading trip manifest data…</p>
                </div>
              ) : !manifestData?.tickets || manifestData.tickets.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <Users size={32} className="mx-auto text-slate-300 stroke-1" />
                  <p className="text-sm font-bold text-slate-700">No confirmed passengers on this trip.</p>
                  <p className="text-xs text-slate-400">Passenger bookings will appear here once ticketed.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono text-[10px] uppercase tracking-wider">
                        <th className="py-3 px-4">Seat #</th>
                        <th className="py-3 px-4">Passenger Name</th>
                        <th className="py-3 px-4">Phone Number</th>
                        <th className="py-3 px-4">PNR Code</th>
                        <th className="py-3 px-4">Boarding State</th>
                        <th className="py-3 px-4">Emergency Next-of-Kin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {filteredManifestTickets.map(ticket => (
                        <tr key={ticket.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            <span className="w-7 h-7 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 flex items-center justify-center font-extrabold">
                              {ticket.seat_number}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-900">
                            {ticket.passenger_name}
                          </td>
                          <td className="py-3 px-4 font-mono">
                            {ticket.passenger_phone ? (
                              <a
                                href={`tel:${ticket.passenger_phone}`}
                                className="text-teal-700 hover:underline flex items-center gap-1"
                              >
                                <Phone size={11} />
                                <span>{ticket.passenger_phone}</span>
                              </a>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-800">
                            {ticket.pnr_code}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase ${
                                ticket.status === 'Boarded'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {ticket.status === 'Boarded' ? '✓ Boarded' : 'Awaiting Gate'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {ticket.nok_name ? (
                              <div>
                                <span className="font-semibold block">{ticket.nok_name}</span>
                                {ticket.nok_phone && (
                                  <span className="text-[10px] font-mono text-slate-400">
                                    {ticket.nok_phone}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 font-mono text-[11px]">Not provided</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== WORKSPACE 4: STATION SECURITY & PROTOCOLS ==================== */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: Security Checklists */}
              <div className="lg:col-span-7 space-y-6">
                <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-7 shadow-xs space-y-5">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                      <ShieldAlert size={18} className="text-teal-600" />
                      <span>Terminal Security & Contraband Screening</span>
                    </h3>
                    <span className="text-[10px] font-mono font-bold bg-teal-100 text-teal-800 px-2 py-0.5 rounded">
                      Standard Protocol
                    </span>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-start gap-3">
                      <span className="text-teal-600 font-bold text-sm">1.</span>
                      <div>
                        <strong className="text-slate-800 block">Luggage Physical Screening</strong>
                        <p className="text-slate-500 mt-0.5">
                          Ensure all cargo hold bags have serialized Transithub Baggage Claim Tags attached by the POS Counter. Check for explosive or corrosive materials.
                        </p>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-start gap-3">
                      <span className="text-teal-600 font-bold text-sm">2.</span>
                      <div>
                        <strong className="text-slate-800 block">Passenger Identity & Ticket Correlation</strong>
                        <p className="text-slate-500 mt-0.5">
                          The passenger name on government-issued ID must correspond to the ticket PNR code prior to boarding gate authorization.
                        </p>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-start gap-3">
                      <span className="text-teal-600 font-bold text-sm">3.</span>
                      <div>
                        <strong className="text-slate-800 block">No Overloading Enforcement</strong>
                        <p className="text-slate-500 mt-0.5">
                          Strict zero-tolerance on unmanifested extra passengers or standing riders. 14 seats for standard coaches and 7 seats for VIP luxury vans.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Broadcast System Form */}
                <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-4">
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <Megaphone size={16} className="text-teal-600" />
                    <span>Post Terminal Public Broadcast</span>
                  </h3>
                  <form onSubmit={handleBroadcast} className="space-y-3">
                    <textarea
                      value={announcementText}
                      onChange={e => setAnnouncementText(e.target.value)}
                      placeholder="Type official gate notice or terminal broadcast message to display across station screens..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:bg-white focus:border-teal-600 outline-hidden transition resize-none h-20"
                      required
                    />
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <Megaphone size={13} />
                        <span>Transmit PA Announcement</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              {/* Right: Emergency Security Hotlines */}
              <div className="lg:col-span-5 space-y-6">
                <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-4">
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <Radio size={16} className="text-teal-600" />
                    <span>Station Security Hotlines</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Direct terminal dispatch telephone channels and external law enforcement links:
                  </p>

                  <div className="space-y-2.5">
                    <a
                      href="tel:+2348000001111"
                      className="p-3 rounded-2xl bg-slate-50 hover:bg-teal-50 border border-slate-200/80 hover:border-teal-200 transition flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold">
                          <Phone size={14} />
                        </div>
                        <div>
                          <strong className="text-xs text-slate-900 block group-hover:text-teal-900">
                            Station Master Central
                          </strong>
                          <span className="text-[10px] text-slate-500 font-mono">Terminal Command Office</span>
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold text-teal-700">+234 800 000 1111</span>
                    </a>

                    <a
                      href="tel:122"
                      className="p-3 rounded-2xl bg-slate-50 hover:bg-rose-50 border border-slate-200/80 hover:border-rose-200 transition flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold">
                          <ShieldAlert size={14} />
                        </div>
                        <div>
                          <strong className="text-xs text-slate-900 block group-hover:text-rose-900">
                            FRSC Highway Rescue
                          </strong>
                          <span className="text-[10px] text-slate-500 font-mono">Federal Road Safety</span>
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold text-rose-700">122 (Toll Free)</span>
                    </a>

                    <a
                      href="tel:112"
                      className="p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 transition flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold">
                          <Radio size={14} />
                        </div>
                        <div>
                          <strong className="text-xs text-slate-900 block">
                            Emergency Services (Police)
                          </strong>
                          <span className="text-[10px] text-slate-500 font-mono">National Emergency Desk</span>
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold text-slate-700">112</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
