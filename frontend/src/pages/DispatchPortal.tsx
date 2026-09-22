import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Bus as BusIcon,
  CalendarDays,
  CheckCircle2,
  Clock,
  Compass,
  LogOut,
  MapPin,
  Menu,
  Navigation,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, dateTime, errorMessage, money } from '../services/api';
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

export interface DispatchOperationsData {
  routes: RouteItem[];
  buses: Bus[];
  drivers: { id: number; name: string }[];
  trips: ScheduledTrip[];
}

type DispatchTab = 'command' | 'schedule' | 'reassign' | 'fleet' | 'corridors';

const TAB_CONFIG: Record<
  DispatchTab,
  { label: string; icon: typeof Radio; description: string }
> = {
  command: {
    label: 'Flight Deck',
    icon: Radio,
    description: 'Active departure board, highway corridor telematics, and trip status progression.',
  },
  schedule: {
    label: 'Trip Scheduling',
    icon: CalendarDays,
    description: 'Create and dispatch scheduled inter-city passenger services.',
  },
  reassign: {
    label: 'Fleet Reassignment',
    icon: BusIcon,
    description: 'Reallocate vehicles and certified drivers to active trips.',
  },
  fleet: {
    label: 'Fleet Telematics',
    icon: Wrench,
    description: 'Monitor vehicle roadworthiness, coach staging, and maintenance status.',
  },
  corridors: {
    label: 'Highway Corridors',
    icon: MapPin,
    description: 'Intercity route network, terminal distances, and base fares.',
  },
};

export function DispatchPortal() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Core State
  const [data, setData] = useState<DispatchOperationsData>({
    routes: [],
    buses: [],
    drivers: [],
    trips: [],
  });
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<DispatchTab>('command');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Filters & Search
  const [tripSearch, setTripSearch] = useState('');
  const [tripFilterStatus, setTripFilterStatus] = useState('all');

  // Schedule Trip Form Modal
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [routeId, setRouteId] = useState<number | ''>('');
  const [busId, setBusId] = useState<number | ''>('');
  const [driverId, setDriverId] = useState<number | ''>('');
  const [departureTime, setDepartureTime] = useState('');
  const [arrivalTime, setArrivalTime] = useState('');
  const [fare, setFare] = useState<number | ''>('');
  const [submittingTrip, setSubmittingTrip] = useState(false);

  // Reassignment Modal State
  const [reassignTrip, setReassignTrip] = useState<ScheduledTrip | null>(null);
  const [reassignBusId, setReassignBusId] = useState<number | ''>('');
  const [reassignDriverId, setReassignDriverId] = useState<number | ''>('');
  const [reassigning, setReassigning] = useState(false);

  // Create Route Modal State
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [newOrigin, setNewOrigin] = useState('');
  const [newDestination, setNewDestination] = useState('');
  const [newDistance, setNewDistance] = useState<number | ''>('');
  const [newDuration, setNewDuration] = useState<number | ''>('');
  const [newBaseFare, setNewBaseFare] = useState<number | ''>('');
  const [creatingRoute, setCreatingRoute] = useState(false);

  // Telematics Ticker
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(30);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Data
  const fetchData = useCallback(async (isBackground = false) => {
    if (!isBackground) setRefreshing(true);
    setError('');
    try {
      const res = await api.get<DispatchOperationsData>('/operations');
      setData(res.data);
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

  // Auto-refresh countdown
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

  // Status Progression Handler
  const handleStatusTransition = async (tripId: number, nextStatus: string) => {
    try {
      await api.post(`/operations/trips/${tripId}/status`, { status: nextStatus });
      showToast('Status Updated', `Trip #${tripId} transitioned to ${nextStatus}.`, 'success');
      await fetchData(true);
    } catch (err) {
      showToast('Update Failed', errorMessage(err), 'error');
    }
  };

  // Toggle Bus Status (Operational vs Maintenance)
  const handleToggleBusStatus = async (bus: Bus) => {
    const nextStatus = bus.status === 'Active' ? 'Maintenance' : 'Active';
    try {
      await api.post(`/admin/buses/${bus.id}/status`, { status: nextStatus });
      showToast('Fleet Status', `${bus.reg_number} set to ${nextStatus}.`, 'success');
      await fetchData(true);
    } catch (err) {
      showToast('Status Failed', errorMessage(err), 'error');
    }
  };

  // Schedule New Trip Handler
  const handleScheduleTrip = async (e: FormEvent) => {
    e.preventDefault();
    if (!routeId || !busId || !driverId || !departureTime || !arrivalTime || !fare) {
      showToast('Validation Error', 'Please complete all scheduling fields.', 'error');
      return;
    }
    setSubmittingTrip(true);
    try {
      await api.post('/dispatch/trips', {
        route_id: Number(routeId),
        bus_id: Number(busId),
        driver_id: Number(driverId),
        departure_time: departureTime,
        arrival_time: arrivalTime,
        fare: Number(fare),
      });
      showToast('Trip Scheduled', 'New intercity departure published to ticket sales & gate systems.', 'success');
      setShowScheduleModal(false);
      setRouteId('');
      setBusId('');
      setDriverId('');
      setDepartureTime('');
      setArrivalTime('');
      setFare('');
      await fetchData(true);
    } catch (err) {
      showToast('Scheduling Failed', errorMessage(err), 'error');
    } finally {
      setSubmittingTrip(false);
    }
  };

  // Trip Reassignment Handler
  const handleReassignSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reassignTrip || !reassignBusId || !reassignDriverId) {
      showToast('Validation Error', 'Select both replacement coach and driver.', 'error');
      return;
    }
    setReassigning(true);
    try {
      await api.post('/dispatch/assign', {
        trip_id: reassignTrip.id,
        bus_id: Number(reassignBusId),
        driver_id: Number(reassignDriverId),
      });
      showToast('Reassigned', `Trip #${reassignTrip.id} vehicle & driver successfully updated.`, 'success');
      setReassignTrip(null);
      await fetchData(true);
    } catch (err) {
      showToast('Reassignment Failed', errorMessage(err), 'error');
    } finally {
      setReassigning(false);
    }
  };

  // Create Route Handler
  const handleCreateRoute = async (e: FormEvent) => {
    e.preventDefault();
    if (!newOrigin || !newDestination || !newDistance || !newDuration || !newBaseFare) {
      showToast('Validation Error', 'All corridor details are required.', 'error');
      return;
    }
    setCreatingRoute(true);
    try {
      await api.post('/admin/routes', {
        origin: newOrigin.trim(),
        destination: newDestination.trim(),
        distance_km: Number(newDistance),
        estimated_hours: Number(newDuration),
        base_fare: Number(newBaseFare),
      });
      showToast('Corridor Created', `${newOrigin} ➔ ${newDestination} added to network.`, 'success');
      setShowRouteModal(false);
      setNewOrigin('');
      setNewDestination('');
      setNewDistance('');
      setNewDuration('');
      setNewBaseFare('');
      await fetchData(true);
    } catch (err) {
      showToast('Route Creation Failed', errorMessage(err), 'error');
    } finally {
      setCreatingRoute(false);
    }
  };

  // Filtered trips
  const filteredTrips = useMemo(() => {
    return data.trips.filter(t => {
      if (tripFilterStatus !== 'all' && t.status !== tripFilterStatus) return false;
      if (tripSearch.trim()) {
        const q = tripSearch.toLowerCase().trim();
        const routeMatch =
          t.route?.origin?.toLowerCase().includes(q) ||
          t.route?.destination?.toLowerCase().includes(q);
        const busMatch = t.bus?.reg_number?.toLowerCase().includes(q);
        const idMatch = String(t.id).includes(q);
        return routeMatch || busMatch || idMatch;
      }
      return true;
    });
  }, [data.trips, tripFilterStatus, tripSearch]);

  // Top Metrics
  const metrics = useMemo(() => {
    const totalBuses = data.buses.length;
    const activeBuses = data.buses.filter(b => b.status === 'Active').length;
    const departedTrips = data.trips.filter(t => t.status === 'Departed').length;
    const scheduledTrips = data.trips.filter(t => t.status === 'Scheduled').length;
    const totalDrivers = data.drivers.length;
    const routesCount = data.routes.length;

    return {
      totalBuses,
      activeBuses,
      departedTrips,
      scheduledTrips,
      totalDrivers,
      routesCount,
    };
  }, [data.buses, data.trips, data.drivers, data.routes]);

  const switchTab = (tab: DispatchTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (busy) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-sky-600 text-white flex items-center justify-center mx-auto shadow-lg animate-pulse">
            <Radio size={24} />
          </div>
          <p className="text-sm font-bold text-slate-800">Initializing Dispatch Command Flight Deck…</p>
          <p className="text-xs text-slate-500 font-mono">Syncing interstate fleet telemetry & scheduling desks</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 text-slate-900 min-h-screen font-sans flex flex-col lg:flex-row antialiased selection:bg-sky-500 selection:text-white">
      {/* ==================== DESKTOP SIDEBAR ==================== */}
      <aside className="hidden lg:flex w-64 xl:w-72 bg-white border-r border-slate-200/80 p-5 flex-col justify-between shrink-0 sticky top-0 h-screen overflow-y-auto z-30 shadow-2xs">
        <div className="space-y-6">
          {/* Brand Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-600 via-sky-700 to-slate-900 flex items-center justify-center text-white shadow-md shadow-sky-700/20">
                <Radio size={20} />
              </div>
              <div>
                <span className="text-base font-black tracking-tight text-slate-900 block leading-tight">
                  Transit<span className="text-sky-600">Hub</span>
                </span>
                <span className="text-[10px] uppercase font-mono tracking-wider text-sky-700 font-extrabold flex items-center gap-1">
                  <Navigation size={11} /> Dispatch HQ
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
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                </span>
                Flight Telemetry
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
                    ? 'bg-sky-100 text-sky-800'
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
              Dispatch Desks
            </span>
            {(Object.keys(TAB_CONFIG) as DispatchTab[]).map(tabKey => {
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
                      ? 'bg-sky-50 text-sky-800 border border-sky-200/80 shadow-2xs font-extrabold'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon
                      size={17}
                      className={
                        isActive
                          ? 'text-sky-600'
                          : 'text-slate-400 group-hover:text-slate-600 transition'
                      }
                    />
                    <span>{item.label}</span>
                  </span>
                  {tabKey === 'command' && metrics.departedTrips > 0 && (
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                        isActive
                          ? 'bg-sky-600 text-white'
                          : 'bg-sky-100 text-sky-800'
                      }`}
                    >
                      {metrics.departedTrips} en route
                    </span>
                  )}
                  {tabKey === 'schedule' && metrics.scheduledTrips > 0 && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-600">
                      {metrics.scheduledTrips}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Quick Schedule Button in Sidebar */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <button
              type="button"
              onClick={() => setShowScheduleModal(true)}
              className="w-full py-2.5 px-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
            >
              <Plus size={14} />
              <span>+ Schedule Departure</span>
            </button>
          </div>
        </div>

        {/* Profile Card */}
        <div className="pt-4 border-t border-slate-200/80">
          <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-sky-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                {user?.name ? user.name.charAt(0).toUpperCase() : 'D'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate leading-tight">
                  {user?.name || 'Operations Controller'}
                </p>
                <span className="text-[10px] text-sky-700 font-mono font-semibold uppercase tracking-wider block truncate">
                  Dispatch HQ
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
            <div className="w-7 h-7 rounded-xl bg-sky-600 text-white flex items-center justify-center shadow-xs">
              <Radio size={14} />
            </div>
            <span className="font-extrabold text-sm text-slate-900 tracking-tight">
              Transit<span className="text-sky-600">Hub</span>
              <span className="text-[10px] text-sky-700 font-mono uppercase ml-1.5 px-1.5 py-0.5 bg-sky-50 border border-sky-200 rounded">
                Dispatch
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
            <RefreshCw size={15} className={refreshing ? 'animate-spin text-sky-600' : ''} />
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
                  <div className="w-8 h-8 rounded-xl bg-sky-600 text-white flex items-center justify-center font-bold">
                    <Radio size={16} />
                  </div>
                  <div>
                    <p className="font-black text-slate-900 text-sm">Dispatch Operations</p>
                    <p className="text-[10px] font-mono text-sky-700">Flight & Fleet Control</p>
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
                {(Object.keys(TAB_CONFIG) as DispatchTab[]).map(tabKey => {
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
                          ? 'bg-sky-50 text-sky-800 border border-sky-200'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon size={16} className={isActive ? 'text-sky-600' : 'text-slate-400'} />
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
                <span>Sign Out of Dispatch</span>
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
              <span className="text-xs font-mono font-bold text-sky-700 bg-sky-50 border border-sky-200/80 px-2.5 py-1 rounded-full uppercase tracking-wider">
                HQ Deck
              </span>
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1">
              {TAB_CONFIG[activeTab].description}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowScheduleModal(true)}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-2xs cursor-pointer"
            >
              <Plus size={14} />
              <span>+ Schedule Trip</span>
            </button>
          </div>
        </div>

        {/* ==================== 5 TOP DISPATCH KPI CARDS ==================== */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {/* Card 1: Active Fleet Coaches */}
          <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                Fleet Status
              </span>
              <div className="w-7 h-7 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center">
                <BusIcon size={14} />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-black text-slate-900">
              {metrics.activeBuses} <span className="text-xs font-normal text-slate-400">/ {metrics.totalBuses}</span>
            </p>
            <p className="text-[10px] text-sky-700 font-bold flex items-center gap-1">
              <CheckCircle2 size={11} /> Roadworthy Coaches
            </p>
          </div>

          {/* Card 2: Trips En Route */}
          <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                En Route
              </span>
              <div className="w-7 h-7 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                <Navigation size={14} />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-black text-slate-900">
              {metrics.departedTrips}
            </p>
            <p className="text-[10px] text-blue-700 font-bold">
              Highway Missions Active
            </p>
          </div>

          {/* Card 3: Scheduled Today */}
          <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                Awaiting Bay
              </span>
              <div className="w-7 h-7 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                <CalendarDays size={14} />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-black text-slate-900">
              {metrics.scheduledTrips}
            </p>
            <p className="text-[10px] text-amber-700 font-bold">
              Scheduled Departures
            </p>
          </div>

          {/* Card 4: Certified Drivers */}
          <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                Active Drivers
              </span>
              <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <Users size={14} />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-black text-slate-900">
              {metrics.totalDrivers}
            </p>
            <p className="text-[10px] text-emerald-700 font-bold">
              Certified on-call captains
            </p>
          </div>

          {/* Card 5: Interstate Routes */}
          <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-1.5 col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                Network Grid
              </span>
              <div className="w-7 h-7 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                <MapPin size={14} />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-black text-slate-900">
              {metrics.routesCount}
            </p>
            <p className="text-[10px] text-teal-700 font-bold">
              Interstate Corridors
            </p>
          </div>
        </div>

        {/* ==================== WORKSPACE 1: FLIGHT DECK (COMMAND) ==================== */}
        {activeTab === 'command' && (
          <div className="space-y-6">
            {/* Filters Bar */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Search size={16} />
                </div>
                <input
                  type="text"
                  value={tripSearch}
                  onChange={e => setTripSearch(e.target.value)}
                  placeholder="Filter by city corridor, coach registration, or trip ID..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-sky-600 outline-hidden transition"
                />
              </div>

              {/* Status Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {['all', 'Scheduled', 'Departed', 'Completed'].map(st => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setTripFilterStatus(st)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer capitalize ${
                      tripFilterStatus === st
                        ? 'bg-sky-600 text-white shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    {st === 'all' ? 'All Missions' : st}
                  </button>
                ))}
              </div>
            </div>

            {/* Departures Grid */}
            {filteredTrips.length === 0 ? (
              <div className="bg-white border border-slate-200/80 rounded-3xl p-12 text-center text-slate-400 space-y-3">
                <Radio size={36} className="mx-auto text-slate-300 stroke-1" />
                <p className="text-sm font-bold text-slate-700">No scheduled trips match your filter criteria.</p>
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(true)}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition"
                >
                  + Create New Trip
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {filteredTrips.map(trip => {
                  const capacity = trip.bus?.capacity || 14;
                  const confirmed = trip.confirmed_count || 0;
                  const boarded = trip.boarded_count || 0;
                  const loadPercent = capacity > 0 ? Math.round((confirmed / capacity) * 100) : 0;

                  return (
                    <div
                      key={trip.id}
                      className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs space-y-4 hover:border-sky-300 transition"
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <span className="font-mono text-[11px] font-bold text-slate-500">
                          Trip #{trip.id}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-extrabold uppercase px-2 py-0.5 rounded-full ${
                            trip.status === 'Departed'
                              ? 'bg-blue-100 text-blue-800'
                              : trip.status === 'Completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {trip.status}
                        </span>
                      </div>

                      {/* Corridor Title */}
                      <div>
                        <h3 className="text-base font-black text-slate-900 flex items-center gap-1.5">
                          <span>{trip.route?.origin}</span>
                          <ArrowRight size={14} className="text-slate-400" />
                          <span>{trip.route?.destination}</span>
                        </h3>
                        <p className="text-xs font-mono text-slate-500 mt-1 flex items-center gap-1">
                          <Clock size={12} className="text-slate-400" />
                          Departure: {dateTime(trip.departure_time)}
                        </p>
                      </div>

                      {/* Telematics Info Pill */}
                      <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-2xl grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[10px] font-mono text-slate-400 block">Coach & Plate</span>
                          <strong className="text-slate-800 font-bold block truncate">
                            {trip.bus?.reg_number} ({trip.bus?.vehicle_type})
                          </strong>
                        </div>
                        <div>
                          <span className="text-[10px] font-mono text-slate-400 block">Assigned Captain</span>
                          <strong className="text-slate-800 font-bold block truncate">
                            {trip.bus?.driver_name || 'Assigned Driver'}
                          </strong>
                        </div>
                      </div>

                      {/* Passenger Load Bar */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-600">Passenger Load:</span>
                          <span className="font-mono font-bold text-sky-700">
                            {confirmed} / {capacity} seats ({loadPercent}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-sky-600 h-2 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, loadPercent)}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                          <span>Boarded at Gate: {boarded}</span>
                          <span>Fare: {money(trip.fare)}</span>
                        </div>
                      </div>

                      {/* Progression Controls */}
                      <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                        {trip.status === 'Scheduled' && (
                          <button
                            type="button"
                            onClick={() => void handleStatusTransition(trip.id, 'Departed')}
                            className="flex-1 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                          >
                            <Navigation size={13} />
                            <span>Depart Bay</span>
                          </button>
                        )}
                        {trip.status === 'Departed' && (
                          <button
                            type="button"
                            onClick={() => void handleStatusTransition(trip.id, 'Completed')}
                            className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                          >
                            <CheckCircle2 size={13} />
                            <span>Log Arrival (Complete)</span>
                          </button>
                        )}
                        {trip.status === 'Completed' && (
                          <span className="flex-1 py-2 bg-slate-100 text-slate-500 rounded-xl text-xs font-bold text-center">
                            Mission Logged
                          </span>
                        )}

                        {/* Reassign Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setReassignTrip(trip);
                            setReassignBusId(trip.bus?.id || '');
                            setReassignDriverId(trip.driver_id || '');
                          }}
                          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                          title="Reassign Bus or Driver"
                        >
                          <BusIcon size={14} />
                          <span>Reassign</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==================== WORKSPACE 2: SCHEDULE NEW TRIP ==================== */}
        {activeTab === 'schedule' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-7 shadow-xs space-y-6">
              <div className="pb-4 border-b border-slate-100">
                <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <CalendarDays size={18} className="text-sky-600" />
                  <span>Schedule & Dispatch New Intercity Service</span>
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  Publish departure slots across the commercial passenger network and stage terminal bays.
                </p>
              </div>

              <form onSubmit={handleScheduleTrip} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Route */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                      Corridor Route *
                    </label>
                    <select
                      value={routeId}
                      onChange={e => {
                        const selId = Number(e.target.value);
                        setRouteId(selId);
                        const sel = data.routes.find(r => r.id === selId);
                        if (sel && !fare) setFare(sel.base_fare);
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:bg-white focus:border-sky-600 outline-hidden transition cursor-pointer"
                      required
                    >
                      <option value="" disabled>-- Select Interstate Route --</option>
                      {data.routes.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.origin} ➔ {r.destination} ({r.distance_km} km • ~{r.duration_hours}h)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Bus */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                      Operational Coach *
                    </label>
                    <select
                      value={busId}
                      onChange={e => setBusId(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:bg-white focus:border-sky-600 outline-hidden transition cursor-pointer"
                      required
                    >
                      <option value="" disabled>-- Select Available Coach --</option>
                      {data.buses
                        .filter(b => b.status === 'Active')
                        .map(b => (
                          <option key={b.id} value={b.id}>
                            {b.reg_number} • {b.model} ({b.vehicle_type} - {b.capacity} seats)
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Driver */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                      Certified Driver *
                    </label>
                    <select
                      value={driverId}
                      onChange={e => setDriverId(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:bg-white focus:border-sky-600 outline-hidden transition cursor-pointer"
                      required
                    >
                      <option value="" disabled>-- Select Certified Driver --</option>
                      {data.drivers.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.name} (Captain #{d.id})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Departure Datetime */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                      Departure Time (WAT) *
                    </label>
                    <input
                      type="datetime-local"
                      value={departureTime}
                      onChange={e => setDepartureTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:bg-white focus:border-sky-600 outline-hidden transition"
                      required
                    />
                  </div>

                  {/* Arrival Datetime */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                      Estimated Arrival (WAT) *
                    </label>
                    <input
                      type="datetime-local"
                      value={arrivalTime}
                      onChange={e => setArrivalTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:bg-white focus:border-sky-600 outline-hidden transition"
                      required
                    />
                  </div>

                  {/* Fare */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                      Ticket Fare (NGN ₦) *
                    </label>
                    <input
                      type="number"
                      min="1000"
                      step="500"
                      value={fare}
                      onChange={e => setFare(Number(e.target.value))}
                      placeholder="e.g. 15000"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-slate-800 focus:bg-white focus:border-sky-600 outline-hidden transition"
                      required
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingTrip}
                    className="px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-2xs cursor-pointer disabled:opacity-50"
                  >
                    {submittingTrip ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                    <span>Publish Departure Schedule</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ==================== WORKSPACE 3: FLEET REASSIGNMENT ==================== */}
        {activeTab === 'reassign' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-7 shadow-xs space-y-6">
              <div className="pb-4 border-b border-slate-100">
                <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <BusIcon size={18} className="text-sky-600" />
                  <span>Coach & Driver Reassignment Desk</span>
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  Quickly replace vehicles or reassign certified drivers in case of technical checks or shift changes.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.trips
                  .filter(t => ['Scheduled', 'Boarding'].includes(t.status))
                  .map(trip => (
                    <div
                      key={trip.id}
                      className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-slate-800">
                          Trip #{trip.id}: {trip.route?.origin} ➔ {trip.route?.destination}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-100 text-sky-800 font-bold">
                          {trip.status}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600 space-y-1">
                        <p>
                          <strong>Current Coach:</strong> {trip.bus?.reg_number} ({trip.bus?.model})
                        </p>
                        <p>
                          <strong>Assigned Driver:</strong> {trip.bus?.driver_name || 'Captain #' + trip.driver_id}
                        </p>
                        <p className="font-mono text-[11px] text-slate-500">
                          Departure: {dateTime(trip.departure_time)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setReassignTrip(trip);
                          setReassignBusId(trip.bus?.id || '');
                          setReassignDriverId(trip.driver_id || '');
                        }}
                        className="w-full py-2 bg-white hover:bg-sky-50 border border-slate-200 text-sky-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <BusIcon size={13} />
                        <span>Configure Reassignment</span>
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* ==================== WORKSPACE 4: FLEET TELEMATICS ==================== */}
        {activeTab === 'fleet' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
              <div>
                <h2 className="text-lg font-black text-slate-900">Commercial Fleet Roster</h2>
                <p className="text-xs text-slate-500 font-medium">
                  Real-time status, vehicle capacity, and maintenance inspections.
                </p>
              </div>

              <span className="text-xs font-mono font-bold text-slate-500 bg-white border border-slate-200/80 px-3 py-1 rounded-xl shadow-2xs">
                Total Fleet: {data.buses.length} Vehicles
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {data.buses.map(bus => (
                <div
                  key={bus.id}
                  className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs space-y-4 hover:border-sky-300 transition"
                >
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <span className="font-mono text-sm font-black text-slate-900">
                      {bus.reg_number}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-extrabold uppercase px-2 py-0.5 rounded-full ${
                        bus.status === 'Active'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {bus.status}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-600">
                    <p>
                      <strong className="text-slate-900">Vehicle Model:</strong> {bus.model}
                    </p>
                    <p>
                      <strong className="text-slate-900">Classification:</strong> {bus.vehicle_type}
                    </p>
                    <p>
                      <strong className="text-slate-900">Seat Capacity:</strong> {bus.capacity} passenger seats
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => void handleToggleBusStatus(bus)}
                      className={`w-full py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        bus.status === 'Active'
                          ? 'bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                      }`}
                    >
                      <Wrench size={13} />
                      <span>{bus.status === 'Active' ? 'Send for Maintenance' : 'Clear for Operations'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================== WORKSPACE 5: HIGHWAY CORRIDORS ==================== */}
        {activeTab === 'corridors' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
              <div>
                <h2 className="text-lg font-black text-slate-900">Interstate Highway Network</h2>
                <p className="text-xs text-slate-500 font-medium">
                  Corridor routes, inter-terminal highway distances, and published base fares.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowRouteModal(true)}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <Plus size={14} />
                <span>+ Create Route</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {data.routes.map(route => (
                <div
                  key={route.id}
                  className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs space-y-4 hover:border-sky-300 transition"
                >
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <span className="font-mono text-xs font-bold text-slate-400">
                      Corridor #{route.id}
                    </span>
                    <span className="font-mono font-black text-sm text-sky-700">
                      {money(route.base_fare)}
                    </span>
                  </div>

                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <span>{route.origin}</span>
                    <ArrowRight size={14} className="text-slate-400" />
                    <span>{route.destination}</span>
                  </h3>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/60">
                      <span className="text-[10px] text-slate-400 block font-mono">Distance</span>
                      <strong className="text-slate-800 font-bold">{route.distance_km} km</strong>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/60">
                      <span className="text-[10px] text-slate-400 block font-mono">Travel Time</span>
                      <strong className="text-slate-800 font-bold">~{route.duration_hours} Hours</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================== REASSIGNMENT MODAL ==================== */}
        {reassignTrip && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
              onClick={() => setReassignTrip(null)}
            />
            <div className="relative bg-white rounded-3xl p-6 sm:p-7 max-w-lg w-full shadow-2xl z-10 space-y-5 border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-sky-600 text-white flex items-center justify-center">
                    <BusIcon size={16} />
                  </div>
                  <h3 className="font-black text-slate-900 text-base">
                    Reassign Trip #{reassignTrip.id}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setReassignTrip(null)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
                <p className="font-bold text-slate-800">
                  {reassignTrip.route?.origin} ➔ {reassignTrip.route?.destination}
                </p>
                <p className="text-slate-500 font-mono mt-0.5">
                  Departure: {dateTime(reassignTrip.departure_time)}
                </p>
              </div>

              <form onSubmit={handleReassignSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                    Replacement Coach *
                  </label>
                  <select
                    value={reassignBusId}
                    onChange={e => setReassignBusId(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:bg-white focus:border-sky-600 outline-hidden transition cursor-pointer"
                    required
                  >
                    <option value="" disabled>-- Select Bus --</option>
                    {data.buses
                      .filter(b => b.status === 'Active')
                      .map(b => (
                        <option key={b.id} value={b.id}>
                          {b.reg_number} • {b.model} ({b.vehicle_type})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                    Replacement Certified Driver *
                  </label>
                  <select
                    value={reassignDriverId}
                    onChange={e => setReassignDriverId(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:bg-white focus:border-sky-600 outline-hidden transition cursor-pointer"
                    required
                  >
                    <option value="" disabled>-- Select Driver --</option>
                    {data.drivers.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} (Captain #{d.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setReassignTrip(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={reassigning}
                    className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                  >
                    {reassigning ? <RefreshCw size={14} className="animate-spin" /> : null}
                    <span>Save Reassignment</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ==================== SCHEDULE TRIP MODAL ==================== */}
        {showScheduleModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
              onClick={() => setShowScheduleModal(false)}
            />
            <div className="relative bg-white rounded-3xl p-6 sm:p-7 max-w-xl w-full shadow-2xl z-10 space-y-5 border border-slate-200 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-sky-600 text-white flex items-center justify-center">
                    <CalendarDays size={16} />
                  </div>
                  <h3 className="font-black text-slate-900 text-base">
                    Schedule New Trip Departure
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleScheduleTrip} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                    Corridor Route *
                  </label>
                  <select
                    value={routeId}
                    onChange={e => {
                      const selId = Number(e.target.value);
                      setRouteId(selId);
                      const sel = data.routes.find(r => r.id === selId);
                      if (sel && !fare) setFare(sel.base_fare);
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:bg-white focus:border-sky-600 outline-hidden transition cursor-pointer"
                    required
                  >
                    <option value="" disabled>-- Select Route --</option>
                    {data.routes.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.origin} ➔ {r.destination} ({r.distance_km} km • ~{r.duration_hours}h)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                      Operational Coach *
                    </label>
                    <select
                      value={busId}
                      onChange={e => setBusId(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:bg-white focus:border-sky-600 outline-hidden transition cursor-pointer"
                      required
                    >
                      <option value="" disabled>-- Select Coach --</option>
                      {data.buses
                        .filter(b => b.status === 'Active')
                        .map(b => (
                          <option key={b.id} value={b.id}>
                            {b.reg_number} ({b.vehicle_type})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                      Assigned Driver *
                    </label>
                    <select
                      value={driverId}
                      onChange={e => setDriverId(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:bg-white focus:border-sky-600 outline-hidden transition cursor-pointer"
                      required
                    >
                      <option value="" disabled>-- Select Driver --</option>
                      {data.drivers.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                      Departure Time (WAT) *
                    </label>
                    <input
                      type="datetime-local"
                      value={departureTime}
                      onChange={e => setDepartureTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:bg-white focus:border-sky-600 outline-hidden transition"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                      Arrival Time (WAT) *
                    </label>
                    <input
                      type="datetime-local"
                      value={arrivalTime}
                      onChange={e => setArrivalTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:bg-white focus:border-sky-600 outline-hidden transition"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                    Ticket Fare (NGN ₦) *
                  </label>
                  <input
                    type="number"
                    min="1000"
                    step="500"
                    value={fare}
                    onChange={e => setFare(Number(e.target.value))}
                    placeholder="e.g. 15000"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-slate-800 focus:bg-white focus:border-sky-600 outline-hidden transition"
                    required
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowScheduleModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingTrip}
                    className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                  >
                    {submittingTrip ? <RefreshCw size={14} className="animate-spin" /> : null}
                    <span>Publish Departure</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ==================== CREATE ROUTE MODAL ==================== */}
        {showRouteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
              onClick={() => setShowRouteModal(false)}
            />
            <div className="relative bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl z-10 space-y-5 border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-sky-600 text-white flex items-center justify-center">
                    <MapPin size={16} />
                  </div>
                  <h3 className="font-black text-slate-900 text-base">
                    Create New Interstate Route
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRouteModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateRoute} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                      Origin City *
                    </label>
                    <input
                      type="text"
                      value={newOrigin}
                      onChange={e => setNewOrigin(e.target.value)}
                      placeholder="e.g. Lagos"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:bg-white focus:border-sky-600 outline-hidden transition"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                      Destination City *
                    </label>
                    <input
                      type="text"
                      value={newDestination}
                      onChange={e => setNewDestination(e.target.value)}
                      placeholder="e.g. Abuja"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 focus:bg-white focus:border-sky-600 outline-hidden transition"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                      Distance (km) *
                    </label>
                    <input
                      type="number"
                      min="10"
                      value={newDistance}
                      onChange={e => setNewDistance(Number(e.target.value))}
                      placeholder="e.g. 750"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-800 focus:bg-white focus:border-sky-600 outline-hidden transition"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                      Est. Hours *
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="0.5"
                      value={newDuration}
                      onChange={e => setNewDuration(Number(e.target.value))}
                      placeholder="e.g. 9.5"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-800 focus:bg-white focus:border-sky-600 outline-hidden transition"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 font-mono mb-1.5">
                    Base Fare (NGN ₦) *
                  </label>
                  <input
                    type="number"
                    min="1000"
                    step="500"
                    value={newBaseFare}
                    onChange={e => setNewBaseFare(Number(e.target.value))}
                    placeholder="e.g. 15000"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-slate-800 focus:bg-white focus:border-sky-600 outline-hidden transition"
                    required
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRouteModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingRoute}
                    className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                  >
                    {creatingRoute ? <RefreshCw size={14} className="animate-spin" /> : null}
                    <span>Save Route</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
