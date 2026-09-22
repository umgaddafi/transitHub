import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bus as BusIcon,
  CalendarDays,
  CheckCircle2,
  Clock,
  Compass,
  LogOut,
  MapPin,
  Menu,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
  AlertCircle,
  Phone,
  PhoneCall,
  ArrowRight,
  Gauge,
  CheckSquare,
  Wrench,
  AlertTriangle,
  Radio,
  FileText,
  Navigation,
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

export interface DriverOperationsData {
  trips: ScheduledTrip[];
}

type DriverTab = 'cockpit' | 'trips' | 'manifest' | 'checklist' | 'support';

const TAB_CONFIG: Record<
  DriverTab,
  { label: string; icon: typeof Gauge; description: string }
> = {
  cockpit: {
    label: 'Mission Cockpit',
    icon: Gauge,
    description: 'Active departure flight deck, live route corridor telemetry, and journey controls.',
  },
  trips: {
    label: 'My Schedule',
    icon: CalendarDays,
    description: 'All assigned inter-city trips, departure times, and destination terminal bays.',
  },
  manifest: {
    label: 'Passenger Roster',
    icon: Users,
    description: 'Passenger manifest, seat assignments, contact telephone numbers, and next-of-kin.',
  },
  checklist: {
    label: 'Pre-Trip Inspection',
    icon: CheckSquare,
    description: 'Vehicle roadworthiness checklist, safety equipment verification, and tire pressures.',
  },
  support: {
    label: 'Dispatch Support',
    icon: Radio,
    description: 'Direct communication channels to station terminal operations and roadside assistance.',
  },
};

interface SafetyCheckItem {
  id: string;
  label: string;
  category: 'mechanical' | 'safety' | 'comfort';
}

const SAFETY_CHECKLIST: SafetyCheckItem[] = [
  { id: 'tires', label: 'Tire Pressure & Tread Depth (including Spare Tire)', category: 'mechanical' },
  { id: 'fluids', label: 'Engine Oil, Brake Fluid, and Radiator Coolant Levels', category: 'mechanical' },
  { id: 'brakes', label: 'Service Brakes & Emergency Handbrake Responsiveness', category: 'mechanical' },
  { id: 'lights', label: 'Headlights, High Beams, Hazard Lights & Turn Signals', category: 'mechanical' },
  { id: 'fire_ext', label: 'Certified 2kg Fire Extinguisher (Pressure in Green)', category: 'safety' },
  { id: 'first_aid', label: 'Fully Stocked Commercial First Aid Emergency Kit', category: 'safety' },
  { id: 'triangles', label: 'Two Reflective Warning Triangles & Heavy-Duty Jack', category: 'safety' },
  { id: 'ac_system', label: 'Cabin Air Conditioning & Overhead Passenger Vents', category: 'comfort' },
  { id: 'seats_belts', label: 'All Passenger Safety Lap/Shoulder Belts Functional', category: 'comfort' },
];

export function DriverPortal() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Core State
  const [trips, setTrips] = useState<ScheduledTrip[]>([]);
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<DriverTab>('cockpit');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Selected Trip for Manifest View
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [manifestData, setManifestData] = useState<{ trip: ScheduledTrip; tickets: Ticket[] } | null>(null);
  const [manifestLoading, setManifestLoading] = useState(false);
  const [manifestSearch, setManifestSearch] = useState('');

  // Trip List Filters
  const [tripFilterStatus, setTripFilterStatus] = useState<string>('all');
  const [tripSearch, setTripSearch] = useState('');

  // Pre-Trip Checklist Interactive State
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({
    tires: true,
    fluids: true,
    brakes: true,
    lights: true,
    fire_ext: true,
  });

  // Live Timer (30s auto-refresh)
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(30);

  // System clock in WAT
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Driver Trips
  const fetchData = useCallback(async (isBackground = false) => {
    if (!isBackground) setRefreshing(true);
    setError('');
    try {
      const res = await api.get<DriverOperationsData>('/operations');
      const loadedTrips = res.data.trips || [];
      setTrips(loadedTrips);

      // Auto-select the first active/upcoming trip for manifest if none selected
      if (!selectedTripId && loadedTrips.length > 0) {
        const activeOrScheduled =
          loadedTrips.find(t => ['Scheduled', 'Boarding', 'Departed'].includes(t.status)) ||
          loadedTrips[0];
        setSelectedTripId(activeOrScheduled.id);
      }
      setCountdown(30);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      setRefreshing(false);
    }
  }, [selectedTripId]);

  // Initial Fetch
  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Auto-sync ticker
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

  // Fetch Manifest when selectedTripId changes
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
    if (selectedTripId) {
      void loadManifest(selectedTripId);
    }
  }, [selectedTripId, loadManifest]);

  // Status transition handler
  const handleTransition = async (trip: ScheduledTrip, newStatus: 'Departed' | 'Completed') => {
    try {
      await api.post(`/operations/trips/${trip.id}/status`, { status: newStatus });
      showToast(
        'Status Updated',
        `Trip #${trip.id} successfully marked as ${newStatus}.`,
        'success'
      );
      await fetchData(true);
      if (selectedTripId === trip.id) {
        await loadManifest(trip.id);
      }
    } catch (err) {
      showToast('Action Failed', errorMessage(err), 'error');
    }
  };

  // Toggle checklist item
  const toggleChecklistItem = (id: string) => {
    setCheckedItems(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Active mission (the trip currently in progress or next scheduled)
  const activeMission = useMemo(() => {
    const enRoute = trips.find(t => t.status === 'Departed');
    if (enRoute) return enRoute;
    const scheduled = trips.find(t => ['Scheduled', 'Boarding'].includes(t.status));
    if (scheduled) return scheduled;
    return trips[0] || null;
  }, [trips]);

  // Filtered trips list
  const filteredTrips = useMemo(() => {
    return trips.filter(t => {
      if (tripFilterStatus !== 'all' && t.status !== tripFilterStatus) return false;
      if (tripSearch.trim()) {
        const q = tripSearch.toLowerCase().trim();
        const routeMatch =
          t.route?.origin?.toLowerCase().includes(q) ||
          t.route?.destination?.toLowerCase().includes(q);
        const busMatch =
          t.bus?.reg_number?.toLowerCase().includes(q) ||
          t.bus?.model?.toLowerCase().includes(q);
        const idMatch = String(t.id).includes(q);
        return routeMatch || busMatch || idMatch;
      }
      return true;
    });
  }, [trips, tripFilterStatus, tripSearch]);

  // Filtered manifest passengers
  const filteredPassengers = useMemo(() => {
    if (!manifestData?.tickets) return [];
    if (!manifestSearch.trim()) return manifestData.tickets;
    const q = manifestSearch.toLowerCase().trim();
    return manifestData.tickets.filter(ticket => {
      return (
        ticket.passenger_name.toLowerCase().includes(q) ||
        ticket.pnr_code.toLowerCase().includes(q) ||
        (ticket.passenger_phone || '').toLowerCase().includes(q) ||
        String(ticket.seat_number).includes(q)
      );
    });
  }, [manifestData?.tickets, manifestSearch]);

  // Pre-trip checklist completion percentage
  const checklistScore = useMemo(() => {
    const total = SAFETY_CHECKLIST.length;
    const checked = SAFETY_CHECKLIST.filter(item => checkedItems[item.id]).length;
    return Math.round((checked / total) * 100);
  }, [checkedItems]);

  const switchTab = (t: DriverTab) => {
    setActiveTab(t);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (busy) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white flex items-center justify-center mx-auto shadow-lg animate-pulse">
            <Gauge size={24} />
          </div>
          <p className="text-sm font-bold text-slate-800">Initializing Driver HUD & Cockpit…</p>
          <p className="text-xs text-slate-500 font-mono">Syncing route assignments & passenger manifest</p>
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
                <Gauge size={20} />
              </div>
              <div>
                <span className="text-base font-black tracking-tight text-slate-900 block leading-tight">
                  Transit<span className="text-teal-600">Hub</span>
                </span>
                <span className="text-[10px] uppercase font-mono tracking-wider text-teal-700 font-extrabold flex items-center gap-1">
                  <ShieldCheck size={11} /> Driver HUD
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

          {/* Telematics Bar */}
          <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Cockpit Telemetry
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
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {autoRefresh ? 'Live' : 'Paused'}
              </button>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="space-y-1">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold block px-2 mb-2">
              Cockpit Modules
            </span>
            {(Object.keys(TAB_CONFIG) as DriverTab[]).map(tabKey => {
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
                  {tabKey === 'trips' && trips.length > 0 && (
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                        isActive
                          ? 'bg-teal-600 text-white'
                          : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
                      }`}
                    >
                      {trips.length}
                    </span>
                  )}
                  {tabKey === 'checklist' && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full font-bold ${
                        checklistScore === 100
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {checklistScore}%
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Quick Actions Card */}
          <div className="pt-3 border-t border-slate-200/80 space-y-2">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold block px-1">
              Station Comms
            </span>
            <button
              type="button"
              onClick={() => switchTab('support')}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 transition text-xs font-bold cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Radio size={14} className="text-teal-600" />
                <span>Dispatch Control HQ</span>
              </span>
              <PhoneCall size={12} className="text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => void fetchData(false)}
              disabled={refreshing}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 transition text-xs font-semibold disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw
                size={14}
                className={refreshing ? 'animate-spin text-teal-600' : 'text-slate-500'}
              />
              <span>{refreshing ? 'Syncing Telemetry…' : 'Sync Console'}</span>
            </button>
          </div>
        </div>

        {/* Driver Profile in Sidebar */}
        <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-teal-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'D'}
            </div>
            <div className="leading-tight truncate">
              <strong className="text-xs font-bold text-slate-900 block truncate">
                {user?.name || 'Driver'}
              </strong>
              <span className="text-[10px] text-teal-700 font-mono font-semibold uppercase block">
                Driver #{user?.id} • Active
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            title="Sign Out of Driver HUD"
            className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition cursor-pointer"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* ==================== MOBILE HEADER & DRAWER ==================== */}
      <header className="lg:hidden sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 p-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open Navigation Menu"
            className="w-9 h-9 rounded-xl bg-slate-50 text-slate-700 flex items-center justify-center border border-slate-200 hover:bg-slate-100 transition cursor-pointer"
          >
            <Menu size={18} />
          </button>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-black text-slate-900">
              Transit<span className="text-teal-600">Hub</span>
            </span>
            <span className="text-[9px] uppercase font-mono font-bold px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200">
              Driver HUD
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeMission && (
            <span
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                activeMission.status === 'Departed'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {activeMission.status}
            </span>
          )}
          <button
            type="button"
            onClick={() => void fetchData(false)}
            disabled={refreshing}
            className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
            title="Sync Data"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin text-teal-600' : ''} />
          </button>
        </div>
      </header>

      {/* Mobile Slide-Over Drawer */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="fixed top-0 left-0 bottom-0 w-64 bg-white border-r border-slate-200 z-50 shadow-2xl flex flex-col justify-between overflow-y-auto p-4 space-y-4 font-sans">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-teal-600 rounded-xl flex items-center justify-center text-white font-black text-xs">
                    <Gauge size={16} />
                  </div>
                  <div>
                    <span className="text-sm font-black text-slate-900 block leading-none">
                      Transit<span className="text-teal-600">Hub</span>
                    </span>
                    <span className="text-[9px] uppercase font-mono text-slate-500 font-bold">
                      Driver HUD
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-900 flex items-center justify-center cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Mobile Navigation List */}
              <nav className="space-y-1 text-xs font-bold">
                {(Object.keys(TAB_CONFIG) as DriverTab[]).map(tabKey => {
                  const item = TAB_CONFIG[tabKey];
                  const Icon = item.icon;
                  const isActive = activeTab === tabKey;
                  return (
                    <button
                      key={tabKey}
                      type="button"
                      onClick={() => switchTab(tabKey)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl transition text-left cursor-pointer ${
                        isActive
                          ? 'bg-teal-50 text-teal-700 border border-teal-200 font-black shadow-2xs'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon size={16} className={isActive ? 'text-teal-600' : 'text-slate-400'} />
                        <span>{item.label}</span>
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
              <div className="leading-tight truncate">
                <strong className="text-xs font-bold text-slate-900 block truncate">
                  {user?.name}
                </strong>
                <span className="text-[10px] text-teal-700 font-mono font-bold uppercase">
                  Driver #{user?.id}
                </span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  navigate('/login');
                }}
                className="text-slate-400 hover:text-rose-600 p-1.5"
              >
                <LogOut size={16} />
              </button>
            </div>
          </aside>
        </>
      )}

      {/* ==================== MAIN CONTENT AREA ==================== */}
      <main className="flex-1 flex flex-col min-w-0 pb-16">
        {/* Top Header Bar */}
        <div className="bg-white border-b border-slate-200/80 px-4 sm:px-8 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 lg:static z-20 shadow-2xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-mono font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                Driver Route Console
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs font-semibold text-slate-500">
                WAT {currentTime.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 mt-1">
              {TAB_CONFIG[activeTab].label}
            </h1>
            <p className="text-xs text-slate-500 hidden sm:block">
              {TAB_CONFIG[activeTab].description}
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => switchTab('checklist')}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs shadow-2xs transition cursor-pointer"
            >
              <CheckSquare size={14} className="text-teal-600" />
              <span>Safety Checklist ({checklistScore}%)</span>
            </button>

            {activeMission && (
              <button
                type="button"
                onClick={() => {
                  setSelectedTripId(activeMission.id);
                  switchTab('manifest');
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
              >
                <FileText size={14} />
                <span>View Passenger Manifest</span>
              </button>
            )}
          </div>
        </div>

        {/* Global Error Notice */}
        {error && (
          <div className="mx-4 sm:mx-8 mt-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => void fetchData(false)}
              className="underline font-bold hover:text-rose-900"
            >
              Retry
            </button>
          </div>
        )}

        <div className="px-4 sm:px-8 pt-6 space-y-6">
          {/* ==================== TOP 5 DRIVER KPI METRIC CARDS ==================== */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3.5 sm:gap-4">
            {/* KPI 1: Assigned Coach */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400">
                  Assigned Coach
                </span>
                <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                  <BusIcon size={14} />
                </div>
              </div>
              <div>
                <strong className="text-base sm:text-lg font-mono font-black text-slate-900 block truncate">
                  {activeMission?.bus?.reg_number || 'Standby Coach'}
                </strong>
                <span className="text-[10px] text-slate-500 font-medium block mt-1 truncate">
                  {activeMission?.bus?.model || 'Commercial Carrier'} ({activeMission?.bus?.capacity || 14} seats)
                </span>
              </div>
            </div>

            {/* KPI 2: Active Route */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400">
                  Corridor Run
                </span>
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <MapPin size={14} />
                </div>
              </div>
              <div>
                <strong className="text-sm sm:text-base font-extrabold text-slate-900 block truncate">
                  {activeMission?.route?.origin || 'Hub'} → {activeMission?.route?.destination || 'Destination'}
                </strong>
                <span className="text-[10px] text-slate-500 font-mono block mt-1">
                  {activeMission?.route?.distance_km || 0} km • ~{activeMission?.route?.duration_hours || 0} hrs
                </span>
              </div>
            </div>

            {/* KPI 3: Passenger Load */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400">
                  Passengers
                </span>
                <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Users size={14} />
                </div>
              </div>
              <div>
                <strong className="text-xl font-black text-slate-900 block">
                  {activeMission?.boarded_count || 0}{' '}
                  <span className="text-xs text-slate-400 font-normal">
                    / {activeMission?.confirmed_count || 0} Boarded
                  </span>
                </strong>
                <span className="text-[10px] text-emerald-700 font-bold block mt-1 flex items-center gap-1">
                  <CheckCircle2 size={11} /> Manifest Synced
                </span>
              </div>
            </div>

            {/* KPI 4: Mission Status */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400">
                  Mission State
                </span>
                <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Gauge size={14} />
                </div>
              </div>
              <div>
                <strong className="text-base sm:text-lg font-mono font-black text-teal-800 block uppercase">
                  {activeMission?.status || 'Off Duty'}
                </strong>
                <span className="text-[10px] text-slate-500 font-medium block mt-1">
                  {activeMission?.status === 'Departed'
                    ? 'Active En Route'
                    : activeMission?.status === 'Scheduled'
                    ? 'Boarding Bay Readiness'
                    : 'Terminal Standby'}
                </span>
              </div>
            </div>

            {/* KPI 5: Safety Protocol */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs flex flex-col justify-between col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400">
                  Safety Protocol
                </span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <ShieldCheck size={14} />
                </div>
              </div>
              <div>
                <strong className="text-lg font-black text-slate-900 block">
                  {checklistScore}% Complete
                </strong>
                <span className="text-[10px] text-emerald-700 font-bold block mt-1">
                  Class-A Commercial Driver
                </span>
              </div>
            </div>
          </div>

          {/* ==================== WORKSPACE TAB 1: COCKPIT (ACTIVE MISSION) ==================== */}
          {activeTab === 'cockpit' && (
            <div className="space-y-6">
              {activeMission ? (
                <>
                  {/* Hero Cockpit Card */}
                  <div className="p-6 sm:p-7 rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-teal-950 text-white border border-teal-800/40 shadow-xl relative overflow-hidden">
                    <div className="relative z-10 space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-mono text-[10px] font-black border border-teal-400/30 uppercase">
                              Active Corridor Assignment
                            </span>
                            <span className="text-xs text-slate-400 font-mono">
                              Trip #{activeMission.id}
                            </span>
                          </div>
                          <h2 className="text-2xl sm:text-3xl font-black tracking-tight mt-1 flex items-center gap-3">
                            <span>{activeMission.route?.origin}</span>
                            <ArrowRight size={22} className="text-teal-400" />
                            <span>{activeMission.route?.destination}</span>
                          </h2>
                        </div>

                        <div className="flex items-center gap-2">
                          {activeMission.status === 'Scheduled' && (
                            <button
                              type="button"
                              onClick={() => void handleTransition(activeMission, 'Departed')}
                              className="px-5 py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg transition cursor-pointer flex items-center gap-2"
                            >
                              <Navigation size={16} />
                              <span>Depart Station Bay</span>
                            </button>
                          )}

                          {activeMission.status === 'Departed' && (
                            <button
                              type="button"
                              onClick={() => void handleTransition(activeMission, 'Completed')}
                              className="px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg transition cursor-pointer flex items-center gap-2"
                            >
                              <CheckCircle2 size={16} />
                              <span>Complete Journey</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Flight Deck Metrics */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                        <div className="bg-white/5 p-3.5 rounded-2xl border border-white/10">
                          <span className="text-[10px] font-mono uppercase text-slate-400 block">
                            Assigned Vehicle
                          </span>
                          <strong className="text-sm font-mono font-black text-teal-300 block mt-1">
                            {activeMission.bus?.reg_number}
                          </strong>
                          <span className="text-[10px] text-slate-400">{activeMission.bus?.model}</span>
                        </div>

                        <div className="bg-white/5 p-3.5 rounded-2xl border border-white/10">
                          <span className="text-[10px] font-mono uppercase text-slate-400 block">
                            Scheduled Departure
                          </span>
                          <strong className="text-sm font-black text-white block mt-1">
                            {dateTime(activeMission.departure_time)}
                          </strong>
                          <span className="text-[10px] text-slate-400">West Africa Time (WAT)</span>
                        </div>

                        <div className="bg-white/5 p-3.5 rounded-2xl border border-white/10">
                          <span className="text-[10px] font-mono uppercase text-slate-400 block">
                            Corridor Distance
                          </span>
                          <strong className="text-sm font-black text-white block mt-1">
                            {activeMission.route?.distance_km} km
                          </strong>
                          <span className="text-[10px] text-slate-400">
                            Est. ~{activeMission.route?.duration_hours} hrs
                          </span>
                        </div>

                        <div className="bg-white/5 p-3.5 rounded-2xl border border-white/10">
                          <span className="text-[10px] font-mono uppercase text-slate-400 block">
                            Occupancy Load
                          </span>
                          <strong className="text-sm font-black text-emerald-400 block mt-1">
                            {activeMission.boarded_count} Boarded / {activeMission.confirmed_count} Booked
                          </strong>
                          <span className="text-[10px] text-slate-400">
                            Capacity: {activeMission.bus?.capacity || 14} seats
                          </span>
                        </div>
                      </div>

                      {/* Passenger Capacity Load Progress Bar */}
                      <div className="space-y-1.5 pt-2">
                        <div className="flex justify-between text-xs font-mono font-bold">
                          <span className="text-slate-300">Passenger Seat Loading</span>
                          <span className="text-teal-300">
                            {Math.min(
                              100,
                              Math.round(
                                ((activeMission.boarded_count || 0) /
                                  (activeMission.bus?.capacity || 14)) *
                                  100
                              )
                            )}
                            % Capacity Loaded
                          </span>
                        </div>
                        <div className="w-full bg-white/10 h-2.5 rounded-full overflow-hidden">
                          <div
                            className="bg-teal-400 h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round(
                                  ((activeMission.boarded_count || 0) /
                                    (activeMission.bus?.capacity || 14)) *
                                    100
                                )
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Two-column Layout: Passenger Manifest Snapshot & Checklist Card */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Passenger Manifest Snapshot */}
                    <div className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-black text-slate-900">
                            Passenger Manifest Quick Roster
                          </h3>
                          <p className="text-xs text-slate-500">
                            Verified boarding passengers for Trip #{activeMission.id}.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTripId(activeMission.id);
                            switchTab('manifest');
                          }}
                          className="text-xs text-teal-700 hover:text-teal-900 font-bold cursor-pointer"
                        >
                          Full Manifest →
                        </button>
                      </div>

                      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                        {manifestData?.tickets.slice(0, 6).map(ticket => (
                          <div
                            key={ticket.pnr_code}
                            className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between"
                          >
                            <div className="flex items-center gap-3">
                              <span className="w-8 h-8 rounded-xl bg-teal-100 text-teal-800 font-mono font-black text-xs flex items-center justify-center shrink-0">
                                #{ticket.seat_number}
                              </span>
                              <div>
                                <strong className="text-xs font-bold text-slate-900 block leading-tight">
                                  {ticket.passenger_name}
                                </strong>
                                <span className="text-[10px] font-mono text-slate-500">
                                  {ticket.passenger_phone || 'No phone'}
                                </span>
                              </div>
                            </div>
                            <span
                              className={`text-[9px] font-mono uppercase font-bold px-2 py-0.5 rounded-full ${
                                ticket.status === 'Boarded'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-teal-100 text-teal-800'
                              }`}
                            >
                              {ticket.status}
                            </span>
                          </div>
                        ))}
                        {(!manifestData?.tickets || manifestData.tickets.length === 0) && (
                          <div className="py-8 text-center text-xs text-slate-400">
                            No passengers registered on this trip yet.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Pre-Trip Safety Status */}
                    <div className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-black text-slate-900">
                            Pre-Departure Safety HUD
                          </h3>
                          <p className="text-xs text-slate-500">
                            Vehicle readiness check prior to terminal gate departure.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => switchTab('checklist')}
                          className="text-xs text-teal-700 hover:text-teal-900 font-bold cursor-pointer"
                        >
                          Inspection Details →
                        </button>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700">
                            Safety Readiness Index
                          </span>
                          <strong className="text-sm font-mono font-black text-teal-700">
                            {checklistScore}%
                          </strong>
                        </div>
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              checklistScore === 100
                                ? 'bg-emerald-500'
                                : checklistScore >= 70
                                ? 'bg-teal-500'
                                : 'bg-amber-500'
                            }`}
                            style={{ width: `${checklistScore}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {checklistScore === 100
                            ? 'All safety checks completed. Vehicle cleared for interstate corridor.'
                            : 'Complete outstanding pre-trip checks before passenger boarding.'}
                        </p>
                      </div>

                      <div className="space-y-2 pt-1 text-xs">
                        <span className="text-[10px] uppercase font-mono font-bold text-slate-400 block">
                          Critical Checklist Summary
                        </span>
                        {SAFETY_CHECKLIST.slice(0, 3).map(item => (
                          <div
                            key={item.id}
                            onClick={() => toggleChecklistItem(item.id)}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 cursor-pointer transition"
                          >
                            <span className="text-slate-700 font-semibold">{item.label}</span>
                            <span
                              className={`w-5 h-5 rounded-lg flex items-center justify-center text-xs font-bold ${
                                checkedItems[item.id]
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-200 text-slate-400'
                              }`}
                            >
                              {checkedItems[item.id] ? '✓' : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-3xl border border-slate-200/90 p-12 text-center space-y-3 shadow-xs">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                    <BusIcon size={24} />
                  </div>
                  <h2 className="text-base font-black text-slate-900">
                    No Departures Assigned Currently
                  </h2>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    You currently have no scheduled trips in the queue. Contact terminal dispatch to receive your vehicle and corridor assignment.
                  </p>
                  <button
                    type="button"
                    onClick={() => switchTab('support')}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Contact Terminal Dispatch
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ==================== WORKSPACE TAB 2: ASSIGNED TRIPS & SCHEDULE ==================== */}
          {activeTab === 'trips' && (
            <div className="space-y-5">
              <div className="bg-white rounded-3xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black text-slate-900">
                      My Assigned Trips & Departures ({filteredTrips.length})
                    </h2>
                    <p className="text-xs text-slate-500">
                      View all scheduled, departed, and completed journeys assigned to your driver profile.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                  <div className="relative flex-1 w-full">
                    <Search
                      size={15}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      placeholder="Search trip by city, bus reg number, or ID…"
                      value={tripSearch}
                      onChange={e => setTripSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:bg-white"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                    {['all', 'Scheduled', 'Departed', 'Completed'].map(st => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setTripFilterStatus(st)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                          tripFilterStatus === st
                            ? 'bg-teal-700 text-white shadow-xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                        }`}
                      >
                        {st === 'all' ? 'All Journeys' : st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Trips Table */}
              <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold">
                        <th className="py-3 px-4">Route Corridor</th>
                        <th className="py-3 px-4">Departure (WAT)</th>
                        <th className="py-3 px-4">Vehicle Assigned</th>
                        <th className="py-3 px-4">Passenger Load</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {filteredTrips.map(trip => {
                        const totalSeats = trip.bus?.capacity || 14;
                        const boarded = trip.boarded_count || 0;
                        const confirmed = trip.confirmed_count || 0;

                        return (
                          <tr key={trip.id} className="hover:bg-slate-50/70 transition">
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                <span>{trip.route?.origin}</span>
                                <ArrowRight size={12} className="text-slate-400" />
                                <span>{trip.route?.destination}</span>
                              </div>
                              <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                                Trip #{trip.id} • {trip.route?.distance_km} km
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-mono font-medium text-slate-700">
                              {dateTime(trip.departure_time)}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="font-mono font-bold text-slate-900 block">
                                {trip.bus?.reg_number}
                              </span>
                              <span className="text-[10px] text-slate-400 block">
                                {trip.bus?.model} ({totalSeats} seats)
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-mono">
                              <strong className="text-slate-900 font-bold">
                                {boarded} Boarded
                              </strong>{' '}
                              / {confirmed} Confirmed
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded-full inline-block ${
                                  trip.status === 'Completed'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : trip.status === 'Departed'
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                    : 'bg-teal-50 text-teal-700 border border-teal-200'
                                }`}
                              >
                                {trip.status}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedTripId(trip.id);
                                    switchTab('manifest');
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition cursor-pointer"
                                >
                                  Manifest
                                </button>

                                {trip.status === 'Scheduled' && (
                                  <button
                                    type="button"
                                    onClick={() => void handleTransition(trip, 'Departed')}
                                    className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-[11px] transition cursor-pointer"
                                  >
                                    Depart
                                  </button>
                                )}

                                {trip.status === 'Departed' && (
                                  <button
                                    type="button"
                                    onClick={() => void handleTransition(trip, 'Completed')}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition cursor-pointer"
                                  >
                                    Complete
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredTrips.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400">
                            No journeys found matching your search.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================== WORKSPACE TAB 3: PASSENGER MANIFEST ROSTER ==================== */}
          {activeTab === 'manifest' && (
            <div className="space-y-5">
              <div className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black text-slate-900">
                      Passenger Departure Manifest
                    </h2>
                    <p className="text-xs text-slate-500">
                      Roster of confirmed and boarded passengers for current journey with emergency contact information.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                    >
                      <Printer size={14} />
                      <span>Print Manifest</span>
                    </button>
                  </div>
                </div>

                {/* Trip Selector & Search */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Select Assigned Trip
                    </label>
                    <select
                      value={selectedTripId || ''}
                      onChange={e => setSelectedTripId(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-teal-500"
                    >
                      {trips.map(t => (
                        <option key={t.id} value={t.id}>
                          Trip #{t.id} • {t.route?.origin} → {t.route?.destination} ({dateTime(t.departure_time)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Filter Passengers
                    </label>
                    <div className="relative">
                      <Search
                        size={15}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        type="text"
                        placeholder="Search by passenger name, seat, or phone…"
                        value={manifestSearch}
                        onChange={e => setManifestSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Manifest Table */}
              <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">
                    Total Passenger Roster: <strong>{filteredPassengers.length}</strong> Travelers
                  </span>
                  {manifestLoading && (
                    <span className="text-xs font-mono text-teal-700 animate-pulse">
                      Updating manifest…
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold">
                        <th className="py-3 px-4">Seat</th>
                        <th className="py-3 px-4">Passenger Name</th>
                        <th className="py-3 px-4">Telephone</th>
                        <th className="py-3 px-4">PNR Reference</th>
                        <th className="py-3 px-4">Boarding State</th>
                        <th className="py-3 px-4">Next of Kin (Emergency)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {filteredPassengers.map(ticket => (
                        <tr key={ticket.pnr_code} className="hover:bg-slate-50/70 transition">
                          <td className="py-3.5 px-4 font-mono font-black text-teal-800 text-sm">
                            #{ticket.seat_number}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-900">
                            {ticket.passenger_name}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-700">
                            {ticket.passenger_phone ? (
                              <a
                                href={`tel:${ticket.passenger_phone}`}
                                className="inline-flex items-center gap-1 text-teal-700 hover:underline"
                              >
                                <Phone size={11} />
                                <span>{ticket.passenger_phone}</span>
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                            {ticket.pnr_code}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded-full inline-block ${
                                ticket.status === 'Boarded'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-teal-100 text-teal-800'
                              }`}
                            >
                              {ticket.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600">
                            {ticket.nok_name ? (
                              <div>
                                <span className="font-semibold block text-slate-800">
                                  {ticket.nok_name}
                                </span>
                                {ticket.nok_phone && (
                                  <a
                                    href={`tel:${ticket.nok_phone}`}
                                    className="text-[10px] text-teal-700 font-mono flex items-center gap-0.5 hover:underline"
                                  >
                                    <Phone size={10} /> {ticket.nok_phone}
                                  </a>
                                )}
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))}
                      {filteredPassengers.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400">
                            No passengers found for this trip.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================== WORKSPACE TAB 4: PRE-TRIP INSPECTION CHECKLIST ==================== */}
          {activeTab === 'checklist' && (
            <div className="max-w-3xl mx-auto space-y-5">
              <div className="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-black text-slate-900">
                      Pre-Trip Vehicle Roadworthiness Inspection
                    </h2>
                    <p className="text-xs text-slate-500">
                      Standard transit checklist required by federal highway safety regulations prior to departure.
                    </p>
                  </div>
                  <span
                    className={`text-xs font-mono font-black px-3 py-1 rounded-full ${
                      checklistScore === 100
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {checklistScore}% Verified
                  </span>
                </div>

                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      checklistScore === 100
                        ? 'bg-emerald-500'
                        : checklistScore >= 70
                        ? 'bg-teal-500'
                        : 'bg-amber-500'
                    }`}
                    style={{ width: `${checklistScore}%` }}
                  />
                </div>
              </div>

              {/* Checklist Items */}
              <div className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-3">
                <div className="space-y-2">
                  {SAFETY_CHECKLIST.map(item => {
                    const isChecked = Boolean(checkedItems[item.id]);

                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleChecklistItem(item.id)}
                        className={`p-4 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                          isChecked
                            ? 'bg-emerald-50/40 border-emerald-200 text-slate-900'
                            : 'bg-slate-50/60 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 transition ${
                              isChecked
                                ? 'bg-emerald-600 text-white'
                                : 'border-2 border-slate-300 bg-white'
                            }`}
                          >
                            {isChecked ? '✓' : ''}
                          </div>
                          <div>
                            <span className="text-xs font-bold block">{item.label}</span>
                            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
                              {item.category} system
                            </span>
                          </div>
                        </div>

                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                            isChecked
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-500'
                          }`}
                        >
                          {isChecked ? 'Pass' : 'Pending'}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    Inspected by Driver: <strong>{user?.name}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const allChecked: Record<string, boolean> = {};
                      SAFETY_CHECKLIST.forEach(i => (allChecked[i.id] = true));
                      setCheckedItems(allChecked);
                      showToast('Inspection Complete', 'All vehicle systems verified.', 'success');
                    }}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl transition cursor-pointer"
                  >
                    Mark All Systems Verified
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ==================== WORKSPACE TAB 5: DISPATCH SUPPORT & HOTLINES ==================== */}
          {activeTab === 'support' && (
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-xs space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center">
                    <Radio size={22} />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-900">
                      Terminal Dispatch Operations & Emergency Hotlines
                    </h2>
                    <p className="text-xs text-slate-500">
                      24/7 dedicated communications channel for commercial drivers en-route across transit corridors.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                    <span className="text-[10px] uppercase font-mono font-bold text-teal-700 block">
                      Terminal Operations HQ
                    </span>
                    <strong className="text-base font-bold text-slate-900 block">
                      Dispatch Central Desk
                    </strong>
                    <p className="text-slate-500 text-[11px]">
                      Trip delays, weather rerouting, passenger re-manifesting, bay allocation.
                    </p>
                    <a
                      href="tel:08008726748"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 text-white font-bold text-xs hover:bg-teal-700 transition"
                    >
                      <PhoneCall size={12} />
                      <span>Call Dispatch Desk</span>
                    </a>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                    <span className="text-[10px] uppercase font-mono font-bold text-amber-700 block">
                      Mechanical Support
                    </span>
                    <strong className="text-base font-bold text-slate-900 block">
                      Roadside Fleet Mechanics
                    </strong>
                    <p className="text-slate-500 text-[11px]">
                      Tire blowouts, overheating, brake maintenance, towing and recovery.
                    </p>
                    <a
                      href="tel:08003533863"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 text-white font-bold text-xs hover:bg-amber-700 transition"
                    >
                      <Wrench size={12} />
                      <span>Call Roadside Assistance</span>
                    </a>
                  </div>

                  <div className="p-4 rounded-2xl bg-rose-50/50 border border-rose-200 space-y-2 sm:col-span-2">
                    <span className="text-[10px] uppercase font-mono font-bold text-rose-700 block flex items-center gap-1">
                      <AlertTriangle size={12} /> Emergency Corridor Response
                    </span>
                    <strong className="text-base font-bold text-rose-950 block">
                      Federal Road Safety & Medical Emergency Line
                    </strong>
                    <p className="text-rose-900/80 text-[11px]">
                      Direct line to federal safety patrols (FRSC) and transit medical emergency response units.
                    </p>
                    <div className="flex gap-2">
                      <a
                        href="tel:122"
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 text-white font-black text-xs hover:bg-rose-700 transition"
                      >
                        <PhoneCall size={13} />
                        <span>Dial 122 (FRSC Emergency)</span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
