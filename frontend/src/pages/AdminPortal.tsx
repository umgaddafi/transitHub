import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Building2,
  Bus as BusIcon,
  CalendarDays,
  CheckCircle2,
  Clock,
  Compass,
  Layers,
  LogOut,
  MapPin,
  Menu,
  Printer,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  UserPlus,
  X,
  AlertCircle,
  Banknote,
  ChevronRight,
  ArrowRight,
  ArrowUpRight,
  Luggage,
  SlidersHorizontal,
  KeyRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, dateTime, errorMessage, money } from '../services/api';
import type { Ticket } from '../types/ticket';
import type { RouteItem } from '../types/route';
import type { Bus } from '../types/bus';
import type { User } from '../types/user';
import { SearchBooking } from '../components/SearchBooking';

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

export interface OperationsData {
  routes: RouteItem[];
  buses: Bus[];
  drivers: { id: number; name: string }[];
  trips: ScheduledTrip[];
}

export interface FinanceSummaryData {
  status?: string;
  collected: number | string;
  refund_pending: number | string;
  refunded: number | string;
  tickets?: Ticket[];
}

type AdminTab = 'overview' | 'trips' | 'fleet' | 'routes' | 'marshal' | 'users' | 'pos';

const TAB_CONFIG: Record<
  AdminTab,
  { label: string; icon: typeof Layers; description: string; badge?: string }
> = {
  overview: {
    label: 'Command Center',
    icon: Layers,
    description: 'Executive fleet telematics, departure readiness, and live transit heartbeat.',
  },
  trips: {
    label: 'Departures & Trips',
    icon: CalendarDays,
    description: 'Dispatch schedule, seat load occupancy, passenger manifests, and assignments.',
  },
  fleet: {
    label: 'Fleet & Buses',
    icon: BusIcon,
    description: 'Vehicle status monitoring, maintenance toggles, and new bus registration.',
  },
  routes: {
    label: 'Routes & Network',
    icon: MapPin,
    description: 'Interstate network pricing, distance metrics, travel times, and route creation.',
  },
  marshal: {
    label: 'Gate & Boarding',
    icon: KeyRound,
    description: 'Ticket scanning, passenger verification, and terminal gate boarding validator.',
  },
  users: {
    label: 'Staff & Security',
    icon: Users,
    description: 'Staff directory, role-based access control, and account suspension governance.',
  },
  pos: {
    label: 'Counter & Cargo',
    icon: Luggage,
    description: 'Walk-in cash counter ticketing and serialized luggage barcode generator.',
  },
};

const emptyOps: OperationsData = {
  routes: [],
  buses: [],
  drivers: [],
  trips: [],
};

export function AdminPortal() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Core Operations & Finance State
  const [opsData, setOpsData] = useState<OperationsData>(emptyOps);
  const [financeSummary, setFinanceSummary] = useState<FinanceSummaryData | null>(null);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Live Timer (30s auto-refresh)
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(30);

  // Current system clock in WAT
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Filter & Search states
  const [tripFilter, setTripFilter] = useState<string>('all');
  const [tripSearch, setTripSearch] = useState('');
  const [busSearch, setBusSearch] = useState('');
  const [busFilterStatus, setBusFilterStatus] = useState<string>('all');
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');
  const [routeSearch, setRouteSearch] = useState('');

  // Modals
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showAddBusModal, setShowAddBusModal] = useState(false);
  const [showAddRouteModal, setShowAddRouteModal] = useState(false);
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [reassignTrip, setReassignTrip] = useState<ScheduledTrip | null>(null);
  const [reassignBusId, setReassignBusId] = useState<number | ''>('');
  const [reassignDriverId, setReassignDriverId] = useState<number | ''>('');
  const [manifest, setManifest] = useState<{ trip: ScheduledTrip; tickets: Ticket[] } | null>(null);
  const [loadingManifest, setLoadingManifest] = useState(false);

  // Boarding scanner state
  const [boardTripId, setBoardTripId] = useState<number | ''>('');
  const [boardPnr, setBoardPnr] = useState('');
  const [boardResult, setBoardResult] = useState<{
    success: boolean;
    message: string;
    ticket?: Ticket;
  } | null>(null);
  const [boardingBusy, setBoardingBusy] = useState(false);

  // Luggage tags state
  const [luggagePnr, setLuggagePnr] = useState('');
  const [luggageCount, setLuggageCount] = useState(1);
  const [luggageTags, setLuggageTags] = useState<string[]>([]);
  const [generatingTags, setGeneratingTags] = useState(false);

  // Form Submitting states
  const [submittingSchedule, setSubmittingSchedule] = useState(false);
  const [submittingBus, setSubmittingBus] = useState(false);
  const [submittingRoute, setSubmittingRoute] = useState(false);
  const [submittingStaff, setSubmittingStaff] = useState(false);

  // Primary Data Fetch
  const fetchData = useCallback(async (isBackground = false) => {
    if (!isBackground) setRefreshing(true);
    setError('');
    try {
      const [opsRes, financeRes, usersRes] = await Promise.all([
        api.get<OperationsData>('/operations'),
        api.get<FinanceSummaryData>('/finance/summary').catch(() => ({ data: null })),
        api.get<{ users: User[] }>('/admin/users').catch(() => ({ data: { users: [] } })),
      ]);

      setOpsData({ ...emptyOps, ...opsRes.data });
      if (financeRes?.data) setFinanceSummary(financeRes.data);
      if (usersRes?.data?.users) setUsersList(usersRes.data.users);
      setCountdown(30);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      setRefreshing(false);
    }
  }, []);

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

  // Tab Switcher
  const switchTab = (t: AdminTab) => {
    setActiveTab(t);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // -------------------------------------------------------------
  // ACTION HANDLERS
  // -------------------------------------------------------------

  // Load Passenger Manifest
  const handleLoadManifest = async (tripId: number) => {
    setLoadingManifest(true);
    try {
      const res = await api.get<{ trip: ScheduledTrip; tickets: Ticket[] }>(
        `/operations/trips/${tripId}/manifest`
      );
      setManifest(res.data);
    } catch (err) {
      showToast('Manifest Error', errorMessage(err), 'error');
    } finally {
      setLoadingManifest(false);
    }
  };

  // Reassign Trip
  const handleReassignSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reassignTrip || !reassignBusId || !reassignDriverId) return;

    try {
      await api.post('/dispatch/assign', {
        trip_id: reassignTrip.id,
        bus_id: Number(reassignBusId),
        driver_id: Number(reassignDriverId),
      });
      showToast(
        'Trip Reassigned',
        `Trip #${reassignTrip.id} reassigned successfully.`,
        'success'
      );
      setReassignTrip(null);
      await fetchData(true);
    } catch (err) {
      showToast('Reassignment Failed', errorMessage(err), 'error');
    }
  };

  // Transition Trip Status
  const handleTripStatusTransition = async (
    trip: ScheduledTrip,
    newStatus: 'Departed' | 'Completed'
  ) => {
    try {
      await api.post(`/operations/trips/${trip.id}/status`, { status: newStatus });
      showToast(
        'Status Updated',
        `Trip #${trip.id} marked as ${newStatus}.`,
        'success'
      );
      await fetchData(true);
    } catch (err) {
      showToast('Status Update Failed', errorMessage(err), 'error');
    }
  };

  // Toggle Bus Status
  const handleBusStatusToggle = async (busId: number, currentStatus: string) => {
    const nextStatus =
      currentStatus === 'Active / Operational'
        ? 'Maintenance / Inspection'
        : 'Active / Operational';

    try {
      await api.post(`/admin/buses/${busId}/status`, { status: nextStatus });
      showToast(
        'Bus Status Updated',
        `Vehicle status updated to ${nextStatus}.`,
        'success'
      );
      await fetchData(true);
    } catch (err) {
      showToast('Bus Update Failed', errorMessage(err), 'error');
    }
  };

  // Toggle Staff Access (Suspend / Reactivate)
  const handleUserAccessToggle = async (targetUser: User) => {
    const enable = Boolean(targetUser.disabled_at);
    try {
      await api.post(`/admin/users/${targetUser.id}/access`, { enabled: enable });
      showToast(
        'Account Updated',
        `Staff account ${targetUser.email} is now ${enable ? 'Active' : 'Suspended'}.`,
        'success'
      );
      await fetchData(true);
    } catch (err) {
      showToast('Access Update Failed', errorMessage(err), 'error');
    }
  };

  // Schedule New Trip Form Submit
  const handleScheduleTripSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmittingSchedule(true);
    const form = e.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());

    try {
      const departure = String(values.departure_time);
      const arrival = String(values.arrival_time);

      await api.post('/dispatch/trips', {
        route_id: Number(values.route_id),
        bus_id: Number(values.bus_id),
        driver_id: Number(values.driver_id),
        departure_time: `${departure}:00+01:00`,
        arrival_time: `${arrival}:00+01:00`,
        fare: Number(values.fare).toFixed(2),
      });

      showToast('Trip Scheduled', 'New departure scheduled successfully.', 'success');
      setShowScheduleModal(false);
      form.reset();
      await fetchData(true);
    } catch (err) {
      showToast('Scheduling Failed', errorMessage(err), 'error');
    } finally {
      setSubmittingSchedule(false);
    }
  };

  // Register New Bus Submit
  const handleAddBusSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmittingBus(true);
    const form = e.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const vehicleType = values.vehicle_type as '7-Seater' | '14-Seater';
    const capacity = vehicleType === '7-Seater' ? 7 : 14;

    try {
      await api.post('/admin/buses', {
        reg_number: String(values.reg_number).toUpperCase().trim(),
        model: String(values.model).trim(),
        vehicle_type: vehicleType,
        capacity,
      });

      showToast('Vehicle Added', `Bus ${values.reg_number} added to fleet.`, 'success');
      setShowAddBusModal(false);
      form.reset();
      await fetchData(true);
    } catch (err) {
      showToast('Registration Failed', errorMessage(err), 'error');
    } finally {
      setSubmittingBus(false);
    }
  };

  // Add Route Submit
  const handleAddRouteSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmittingRoute(true);
    const form = e.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());

    try {
      await api.post('/admin/routes', {
        origin: String(values.origin).trim(),
        destination: String(values.destination).trim(),
        distance_km: Number(values.distance_km),
        duration_hours: String(values.duration_hours).trim(),
        base_fare: Number(values.base_fare).toFixed(2),
      });

      showToast('Route Created', 'New interstate route configured.', 'success');
      setShowAddRouteModal(false);
      form.reset();
      await fetchData(true);
    } catch (err) {
      showToast('Route Creation Failed', errorMessage(err), 'error');
    } finally {
      setSubmittingRoute(false);
    }
  };

  // Create Staff Account Submit
  const handleAddStaffSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmittingStaff(true);
    const form = e.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());

    try {
      await api.post('/admin/users', {
        name: String(values.name).trim(),
        email: String(values.email).trim().toLowerCase(),
        phone: String(values.phone || '').trim(),
        role: values.role,
        password: String(values.password),
        password_confirmation: String(values.password_confirmation),
      });

      showToast('Staff Onboarded', `Account created for ${values.name}.`, 'success');
      setShowAddStaffModal(false);
      form.reset();
      await fetchData(true);
    } catch (err) {
      showToast('Staff Creation Failed', errorMessage(err), 'error');
    } finally {
      setSubmittingStaff(false);
    }
  };

  // Marshal Gate Boarding Submit
  const handleBoardPassengerSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!boardTripId || !boardPnr.trim()) return;

    setBoardingBusy(true);
    setBoardResult(null);

    try {
      const res = await api.post<{ status: string; message: string; ticket: Ticket }>(
        '/operations/board',
        {
          trip_id: Number(boardTripId),
          pnr_code: boardPnr.trim().toUpperCase(),
        }
      );

      setBoardResult({
        success: true,
        message: res.data.message || 'Passenger successfully validated and boarded!',
        ticket: res.data.ticket,
      });
      showToast('Boarding Passed', `Seat #${res.data.ticket?.seat_number} boarded.`, 'success');
      setBoardPnr('');
      await fetchData(true);
    } catch (err) {
      const msg = errorMessage(err);
      setBoardResult({
        success: false,
        message: msg,
      });
      showToast('Boarding Denied', msg, 'error');
    } finally {
      setBoardingBusy(false);
    }
  };

  // Luggage Tags Generation
  const handleGenerateLuggageTags = async (e: FormEvent) => {
    e.preventDefault();
    if (!luggagePnr.trim()) return;

    setGeneratingTags(true);
    setLuggageTags([]);

    try {
      const res = await api.post<{ tag_codes: string[] }>('/pos/luggage-tags', {
        pnr_code: luggagePnr.trim().toUpperCase(),
        count: Number(luggageCount),
      });

      setLuggageTags(res.data.tag_codes);
      showToast(
        'Tags Generated',
        `Generated ${res.data.tag_codes.length} baggage tags for ${luggagePnr}.`,
        'success'
      );
    } catch (err) {
      showToast('Generation Failed', errorMessage(err), 'error');
    } finally {
      setGeneratingTags(false);
    }
  };

  // -------------------------------------------------------------
  // COMPUTED STATS & FILTERED LISTS
  // -------------------------------------------------------------

  // Top KPI Metrics
  const activeBusesCount = useMemo(() => {
    return opsData.buses.filter(b => b.status === 'Active / Operational').length;
  }, [opsData.buses]);

  const activeStaffCount = useMemo(() => {
    return usersList.filter(u => !u.disabled_at).length;
  }, [usersList]);

  const totalBoardedPassengers = useMemo(() => {
    return opsData.trips.reduce((acc, t) => acc + (t.boarded_count || 0), 0);
  }, [opsData.trips]);

  const totalBookedPassengers = useMemo(() => {
    return opsData.trips.reduce((acc, t) => acc + (t.confirmed_count || 0) + (t.boarded_count || 0), 0);
  }, [opsData.trips]);

  const totalGrossIntake = useMemo(() => {
    if (financeSummary?.collected) {
      return Number(financeSummary.collected);
    }
    return opsData.trips.reduce((acc, t) => acc + (t.confirmed_count + t.boarded_count) * Number(t.fare), 0);
  }, [financeSummary, opsData.trips]);

  // Filtered Trips
  const filteredTrips = useMemo(() => {
    return opsData.trips.filter(trip => {
      if (tripFilter !== 'all' && trip.status !== tripFilter) return false;
      if (tripSearch.trim()) {
        const q = tripSearch.toLowerCase().trim();
        const routeMatch =
          trip.route?.origin?.toLowerCase().includes(q) ||
          trip.route?.destination?.toLowerCase().includes(q);
        const busMatch =
          trip.bus?.reg_number?.toLowerCase().includes(q) ||
          trip.bus?.model?.toLowerCase().includes(q);
        const idMatch = String(trip.id).includes(q);
        return routeMatch || busMatch || idMatch;
      }
      return true;
    });
  }, [opsData.trips, tripFilter, tripSearch]);

  // Filtered Buses
  const filteredBuses = useMemo(() => {
    return opsData.buses.filter(bus => {
      if (busFilterStatus === 'active' && bus.status !== 'Active / Operational') return false;
      if (busFilterStatus === 'maintenance' && bus.status !== 'Maintenance / Inspection') return false;
      if (busSearch.trim()) {
        const q = busSearch.toLowerCase().trim();
        return (
          bus.reg_number.toLowerCase().includes(q) ||
          bus.model.toLowerCase().includes(q) ||
          bus.vehicle_type.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [opsData.buses, busFilterStatus, busSearch]);

  // Filtered Routes
  const filteredRoutes = useMemo(() => {
    return opsData.routes.filter(r => {
      if (!routeSearch.trim()) return true;
      const q = routeSearch.toLowerCase().trim();
      return r.origin.toLowerCase().includes(q) || r.destination.toLowerCase().includes(q);
    });
  }, [opsData.routes, routeSearch]);

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return usersList.filter(u => {
      if (userRoleFilter !== 'all' && u.role !== userRoleFilter) return false;
      if (!userSearch.trim()) return true;
      const q = userSearch.toLowerCase().trim();
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.phone || '').toLowerCase().includes(q)
      );
    });
  }, [usersList, userRoleFilter, userSearch]);

  if (busy) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white flex items-center justify-center mx-auto shadow-lg animate-pulse">
            <Building2 size={24} />
          </div>
          <p className="text-sm font-bold text-slate-800">Initializing TransitHub Command Center…</p>
          <p className="text-xs text-slate-500 font-mono">Synchronizing fleet telematics & departures</p>
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
                <Building2 size={20} />
              </div>
              <div>
                <span className="text-base font-black tracking-tight text-slate-900 block leading-tight">
                  Transit<span className="text-teal-600">Hub</span>
                </span>
                <span className="text-[10px] uppercase font-mono tracking-wider text-teal-700 font-extrabold flex items-center gap-1">
                  <ShieldCheck size={11} /> Executive Admin
                </span>
              </div>
            </div>
            <Link
              to="/"
              title="Return to Public Booking Site"
              className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition"
            >
              <Compass size={16} />
            </Link>
          </div>

          {/* System Telemetry & Pulse */}
          <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Ops Telemetry
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
              Management Modules
            </span>
            {(Object.keys(TAB_CONFIG) as AdminTab[]).map(tabKey => {
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
                  {tabKey === 'trips' && opsData.trips.length > 0 && (
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                        isActive
                          ? 'bg-teal-600 text-white'
                          : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
                      }`}
                    >
                      {opsData.trips.length}
                    </span>
                  )}
                  {tabKey === 'fleet' && opsData.buses.length > 0 && (
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                        isActive
                          ? 'bg-teal-600 text-white'
                          : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
                      }`}
                    >
                      {activeBusesCount}/{opsData.buses.length}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Quick Module Shortcut */}
          <div className="pt-3 border-t border-slate-200/80 space-y-2">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold block px-1">
              Cross-Platform Hubs
            </span>
            <Link
              to="/finance"
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-gradient-to-r from-amber-50 to-amber-100/50 hover:from-amber-100 hover:to-amber-200/50 text-amber-900 border border-amber-200/80 transition text-xs font-bold cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Banknote size={14} className="text-amber-700" />
                <span>Treasury Vault</span>
              </span>
              <ArrowUpRight size={13} className="text-amber-600" />
            </Link>

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
              <span>{refreshing ? 'Syncing Network…' : 'Sync Operations'}</span>
            </button>
          </div>
        </div>

        {/* User Profile Footer in Sidebar */}
        <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'A'}
            </div>
            <div className="leading-tight truncate">
              <strong className="text-xs font-bold text-slate-900 block truncate">
                {user?.name || 'Administrator'}
              </strong>
              <span className="text-[10px] text-teal-700 font-mono font-semibold uppercase block">
                Super Admin
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            title="Sign Out"
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
              Admin
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
                    <Building2 size={16} />
                  </div>
                  <div>
                    <span className="text-sm font-black text-slate-900 block leading-none">
                      Transit<span className="text-teal-600">Hub</span>
                    </span>
                    <span className="text-[9px] uppercase font-mono text-slate-500 font-bold">
                      Admin Command
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
                {(Object.keys(TAB_CONFIG) as AdminTab[]).map(tabKey => {
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

              <div className="pt-3 border-t border-slate-100">
                <Link
                  to="/finance"
                  className="w-full flex items-center justify-between p-2.5 rounded-xl bg-amber-50 text-amber-900 border border-amber-200 text-xs font-bold"
                >
                  <span className="flex items-center gap-2">
                    <Banknote size={14} className="text-amber-700" />
                    <span>Treasury Vault</span>
                  </span>
                  <ArrowUpRight size={13} />
                </Link>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
              <div className="leading-tight truncate">
                <strong className="text-xs font-bold text-slate-900 block truncate">
                  {user?.name}
                </strong>
                <span className="text-[10px] text-teal-700 font-mono font-bold uppercase">
                  Super Admin
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
                Operations Command
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
              onClick={() => setShowScheduleModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs hover:shadow transition cursor-pointer"
            >
              <Plus size={14} />
              <span>Schedule Trip</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAddBusModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs shadow-2xs transition cursor-pointer"
            >
              <BusIcon size={14} className="text-teal-600" />
              <span>Add Bus</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAddStaffModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs shadow-2xs transition cursor-pointer"
            >
              <UserPlus size={14} className="text-teal-600" />
              <span>New Staff</span>
            </button>
          </div>
        </div>

        {/* Global Error Banner */}
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
          {/* ==================== TOP 5 EXECUTIVE KPI METRIC CARDS ==================== */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3.5 sm:gap-4">
            {/* KPI 1: Fleet In Service */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs relative overflow-hidden flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400">
                  Fleet Readiness
                </span>
                <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                  <BusIcon size={14} />
                </div>
              </div>
              <div>
                <strong className="text-xl font-black text-slate-900 block">
                  {activeBusesCount}{' '}
                  <span className="text-xs text-slate-400 font-normal">
                    / {opsData.buses.length} Active
                  </span>
                </strong>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
                  <div
                    className="bg-teal-600 h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${
                        opsData.buses.length > 0
                          ? Math.round((activeBusesCount / opsData.buses.length) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <span className="text-[10px] text-teal-700 font-bold block mt-1">
                  {opsData.buses.length > 0
                    ? Math.round((activeBusesCount / opsData.buses.length) * 100)
                    : 0}
                  % fleet operational
                </span>
              </div>
            </div>

            {/* KPI 2: Scheduled Departures */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs relative overflow-hidden flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400">
                  Departures
                </span>
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <CalendarDays size={14} />
                </div>
              </div>
              <div>
                <strong className="text-xl font-black text-slate-900 block">
                  {opsData.trips.filter(t => t.status === 'Scheduled').length}{' '}
                  <span className="text-xs text-slate-400 font-normal">Scheduled</span>
                </strong>
                <span className="text-[10px] text-slate-500 font-medium block mt-2">
                  {opsData.trips.filter(t => t.status === 'Departed').length} En-route •{' '}
                  {opsData.trips.filter(t => t.status === 'Completed').length} Completed
                </span>
              </div>
            </div>

            {/* KPI 3: Booked Passengers */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs relative overflow-hidden flex flex-col justify-between">
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
                  {totalBookedPassengers}
                </strong>
                <span className="text-[10px] text-emerald-600 font-bold block mt-2 flex items-center gap-1">
                  <CheckCircle2 size={11} /> {totalBoardedPassengers} verified boarded
                </span>
              </div>
            </div>

            {/* KPI 4: System Gross Revenue */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs relative overflow-hidden flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400">
                  Gross Intake
                </span>
                <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Banknote size={14} />
                </div>
              </div>
              <div>
                <strong className="text-xl font-black text-slate-900 block truncate">
                  {money(totalGrossIntake)}
                </strong>
                <Link
                  to="/finance"
                  className="text-[10px] text-amber-700 font-bold hover:underline block mt-2 flex items-center gap-0.5"
                >
                  <span>Open Treasury Vault</span>
                  <ChevronRight size={10} />
                </Link>
              </div>
            </div>

            {/* KPI 5: Active Staff Accounts */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs relative overflow-hidden flex flex-col justify-between col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400">
                  Active Crew
                </span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <ShieldCheck size={14} />
                </div>
              </div>
              <div>
                <strong className="text-xl font-black text-slate-900 block">
                  {activeStaffCount}{' '}
                  <span className="text-xs text-slate-400 font-normal">
                    / {usersList.length} Active
                  </span>
                </strong>
                <span className="text-[10px] text-slate-500 font-medium block mt-2">
                  {opsData.drivers.length} Certified Drivers On-call
                </span>
              </div>
            </div>
          </div>

          {/* ==================== WORKSPACE TAB 1: OVERVIEW / COMMAND CENTER ==================== */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Quick Launchpad & Operational Readiness Banner */}
              <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-teal-950 text-white border border-teal-800/40 shadow-xl relative overflow-hidden">
                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  <div className="space-y-2 max-w-xl">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-mono text-[10px] font-black border border-teal-400/30 uppercase">
                        Real-time Dispatch Desk
                      </span>
                      <span className="text-xs text-slate-400">Auto-audited</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                      TransitHub Operations Command Center
                    </h2>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Instant state oversight for inter-city departures, fleet telematics, and station check-ins across Nigerian transport corridors. All transactions maintain serialized locking and accounting integrity.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowScheduleModal(true)}
                      className="px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-xs shadow-lg transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Plus size={15} />
                      <span>Schedule New Trip</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddBusModal(true)}
                      className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs border border-white/10 transition cursor-pointer flex items-center gap-1.5"
                    >
                      <BusIcon size={15} />
                      <span>Add Vehicle</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => switchTab('marshal')}
                      className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs border border-white/10 transition cursor-pointer flex items-center gap-1.5"
                    >
                      <KeyRound size={15} />
                      <span>Gate Scanner</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Today's Active Departures Live Table */}
              <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      Live Departures Dispatch Board
                    </h3>
                    <p className="text-xs text-slate-500">
                      Showing trips scheduled across active corridors with live passenger boarding counts.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => switchTab('trips')}
                    className="text-xs text-teal-700 hover:text-teal-900 font-bold flex items-center gap-1 self-start sm:self-auto cursor-pointer"
                  >
                    <span>View All {opsData.trips.length} Trips</span>
                    <ChevronRight size={13} />
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold">
                        <th className="py-3 px-4">Route & Trip</th>
                        <th className="py-3 px-4">Departure (WAT)</th>
                        <th className="py-3 px-4">Vehicle & Capacity</th>
                        <th className="py-3 px-4">Occupancy Load</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Quick Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {opsData.trips.slice(0, 8).map(trip => {
                        const totalSeats = trip.bus?.capacity || 14;
                        const boarded = trip.boarded_count || 0;
                        const confirmed = trip.confirmed_count || 0;
                        const totalOccupied = boarded + confirmed;
                        const fillPct = Math.min(100, Math.round((totalOccupied / totalSeats) * 100));

                        return (
                          <tr key={trip.id} className="hover:bg-slate-50/70 transition">
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                <span>{trip.route?.origin}</span>
                                <ArrowRight size={12} className="text-slate-400" />
                                <span>{trip.route?.destination}</span>
                              </div>
                              <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                                Trip #{trip.id} • Fare: {money(trip.fare)}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-mono font-medium text-slate-700">
                              {dateTime(trip.departure_time)}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="font-mono font-bold text-slate-900 block">
                                {trip.bus?.reg_number || 'Unassigned'}
                              </span>
                              <span className="text-[10px] text-slate-400 block">
                                {trip.bus?.model || 'Vehicle'} ({totalSeats} seats)
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="w-28 space-y-1">
                                <div className="flex justify-between text-[10px] font-mono">
                                  <span className="font-bold text-slate-800">
                                    {totalOccupied}/{totalSeats}
                                  </span>
                                  <span className="text-teal-700 font-bold">{fillPct}%</span>
                                </div>
                                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      fillPct >= 90
                                        ? 'bg-emerald-500'
                                        : fillPct >= 50
                                        ? 'bg-teal-500'
                                        : 'bg-amber-500'
                                    }`}
                                    style={{ width: `${fillPct}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded-full inline-block ${
                                  trip.status === 'Completed'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : trip.status === 'Departed'
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                    : trip.status === 'Delayed'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : trip.status === 'Cancelled'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : 'bg-teal-50 text-teal-700 border border-teal-200'
                                }`}
                              >
                                {trip.status}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  disabled={loadingManifest}
                                  onClick={() => void handleLoadManifest(trip.id)}
                                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition cursor-pointer disabled:opacity-60"
                                >
                                  {loadingManifest ? 'Loading…' : 'Manifest'}
                                </button>
                                {trip.status === 'Scheduled' && (
                                  <button
                                    type="button"
                                    onClick={() => void handleTripStatusTransition(trip, 'Departed')}
                                    className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-[11px] transition cursor-pointer"
                                  >
                                    Depart
                                  </button>
                                )}
                                {trip.status === 'Departed' && (
                                  <button
                                    type="button"
                                    onClick={() => void handleTripStatusTransition(trip, 'Completed')}
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
                      {opsData.trips.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-slate-400">
                            No scheduled departures found in system.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Two Column Grid: Fleet Telematics & Network Corridors */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Card: Fleet Snapshot */}
                <div className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black text-slate-900">
                        Fleet Telematics Status
                      </h3>
                      <p className="text-xs text-slate-500">
                        Overview of bus operational statuses and vehicle sizes.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => switchTab('fleet')}
                      className="text-xs text-teal-700 hover:text-teal-900 font-bold cursor-pointer"
                    >
                      Manage Fleet →
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                      <span className="text-[10px] uppercase font-mono font-bold text-slate-400 block">
                        14-Seater HiAce Buses
                      </span>
                      <strong className="text-lg font-black text-slate-900 mt-1 block">
                        {opsData.buses.filter(b => b.vehicle_type === '14-Seater').length} Vehicles
                      </strong>
                      <span className="text-[10px] text-teal-700 font-medium">Standard High Capacity</span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                      <span className="text-[10px] uppercase font-mono font-bold text-slate-400 block">
                        7-Seater Executive Vans
                      </span>
                      <strong className="text-lg font-black text-slate-900 mt-1 block">
                        {opsData.buses.filter(b => b.vehicle_type === '7-Seater').length} Vehicles
                      </strong>
                      <span className="text-[10px] text-teal-700 font-medium">VIP Express Service</span>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <span className="text-xs font-bold text-slate-700 block">
                      Quick Fleet Health
                    </span>
                    <div className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50">
                      <span className="flex items-center gap-2 text-slate-600">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        Active / Operational
                      </span>
                      <strong className="font-mono font-bold text-slate-900">
                        {opsData.buses.filter(b => b.status === 'Active / Operational').length}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between text-xs py-1.5">
                      <span className="flex items-center gap-2 text-slate-600">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                        Maintenance / Inspection
                      </span>
                      <strong className="font-mono font-bold text-slate-900">
                        {opsData.buses.filter(b => b.status !== 'Active / Operational').length}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Right Card: Interstate Network Routes */}
                <div className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black text-slate-900">
                        Interstate Corridors ({opsData.routes.length})
                      </h3>
                      <p className="text-xs text-slate-500">
                        Active route lines, base pricing, and duration estimates.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddRouteModal(true)}
                      className="text-xs text-teal-700 hover:text-teal-900 font-bold cursor-pointer"
                    >
                      + Add Route
                    </button>
                  </div>

                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                    {opsData.routes.map(r => (
                      <div
                        key={r.id}
                        className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between hover:bg-slate-100/70 transition"
                      >
                        <div>
                          <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                            <span>{r.origin}</span>
                            <ArrowRight size={11} className="text-slate-400" />
                            <span>{r.destination}</span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {r.distance_km} km • ~{r.duration_hours} hrs
                          </span>
                        </div>
                        <div className="text-right">
                          <strong className="text-xs font-black text-teal-800 block">
                            {money(r.base_fare)}
                          </strong>
                          <span className="text-[9px] uppercase font-mono text-slate-400">Base Fare</span>
                        </div>
                      </div>
                    ))}
                    {opsData.routes.length === 0 && (
                      <p className="text-xs text-slate-400 py-4 text-center">No routes configured.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================== WORKSPACE TAB 2: DEPARTURES & TRIPS ==================== */}
          {activeTab === 'trips' && (
            <div className="space-y-5">
              {/* Trip Filters & Search Bar */}
              <div className="bg-white rounded-3xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black text-slate-900">
                      All Scheduled Departures ({filteredTrips.length})
                    </h2>
                    <p className="text-xs text-slate-500">
                      Monitor bus allocations, track passenger manifests, and manage departure status transitions.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowScheduleModal(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition cursor-pointer self-start sm:self-auto"
                  >
                    <Plus size={14} />
                    <span>Schedule New Trip</span>
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                  <div className="relative flex-1 w-full">
                    <Search
                      size={15}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      placeholder="Search by city, bus reg number, or trip ID…"
                      value={tripSearch}
                      onChange={e => setTripSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:bg-white"
                    />
                  </div>

                  {/* Status Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                    {['all', 'Scheduled', 'Departed', 'Completed', 'Delayed', 'Cancelled'].map(st => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setTripFilter(st)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                          tripFilter === st
                            ? 'bg-teal-700 text-white shadow-xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                        }`}
                      >
                        {st === 'all' ? 'All Statuses' : st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Trip Records Table */}
              <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold">
                        <th className="py-3 px-4">Trip Details</th>
                        <th className="py-3 px-4">Departure (WAT)</th>
                        <th className="py-3 px-4">Vehicle Assigned</th>
                        <th className="py-3 px-4">Driver</th>
                        <th className="py-3 px-4">Occupancy</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {filteredTrips.map(trip => {
                        const totalSeats = trip.bus?.capacity || 14;
                        const boarded = trip.boarded_count || 0;
                        const confirmed = trip.confirmed_count || 0;
                        const totalOccupied = boarded + confirmed;
                        const fillPct = Math.min(100, Math.round((totalOccupied / totalSeats) * 100));

                        return (
                          <tr key={trip.id} className="hover:bg-slate-50/70 transition">
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                <span>{trip.route?.origin}</span>
                                <ArrowRight size={12} className="text-slate-400" />
                                <span>{trip.route?.destination}</span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] font-mono text-slate-400">
                                  Trip #{trip.id}
                                </span>
                                <span className="text-[10px] font-bold text-teal-800">
                                  {money(trip.fare)}
                                </span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-mono font-medium text-slate-700">
                              {dateTime(trip.departure_time)}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="font-mono font-bold text-slate-900 block">
                                {trip.bus?.reg_number || 'Unassigned'}
                              </span>
                              <span className="text-[10px] text-slate-400 block">
                                {trip.bus?.model || 'Vehicle'} ({totalSeats} seats)
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="font-bold text-slate-800 block">
                                {opsData.drivers.find(d => d.id === trip.driver_id)?.name || 'Assigned Driver'}
                              </span>
                              <span className="text-[10px] font-mono text-slate-400">
                                ID: #{trip.driver_id}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="w-28 space-y-1">
                                <div className="flex justify-between text-[10px] font-mono">
                                  <span className="font-bold text-slate-800">
                                    {totalOccupied}/{totalSeats}
                                  </span>
                                  <span className="text-teal-700 font-bold">{fillPct}%</span>
                                </div>
                                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      fillPct >= 90
                                        ? 'bg-emerald-500'
                                        : fillPct >= 50
                                        ? 'bg-teal-500'
                                        : 'bg-amber-500'
                                    }`}
                                    style={{ width: `${fillPct}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded-full inline-block ${
                                  trip.status === 'Completed'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : trip.status === 'Departed'
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                    : trip.status === 'Delayed'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : trip.status === 'Cancelled'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
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
                                  disabled={loadingManifest}
                                  onClick={() => void handleLoadManifest(trip.id)}
                                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition cursor-pointer disabled:opacity-60"
                                >
                                  {loadingManifest ? 'Loading…' : 'Manifest'}
                                </button>

                                {trip.status === 'Scheduled' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReassignTrip(trip);
                                      setReassignBusId(trip.bus?.id || '');
                                      setReassignDriverId(trip.driver_id || '');
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-[11px] transition cursor-pointer"
                                  >
                                    Reassign
                                  </button>
                                )}

                                {trip.status === 'Scheduled' && (
                                  <button
                                    type="button"
                                    onClick={() => void handleTripStatusTransition(trip, 'Departed')}
                                    className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-[11px] transition cursor-pointer"
                                  >
                                    Depart
                                  </button>
                                )}

                                {trip.status === 'Departed' && (
                                  <button
                                    type="button"
                                    onClick={() => void handleTripStatusTransition(trip, 'Completed')}
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
                          <td colSpan={7} className="py-12 text-center text-slate-400">
                            No departures matching your search criteria.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================== WORKSPACE TAB 3: FLEET & BUSES ==================== */}
          {activeTab === 'fleet' && (
            <div className="space-y-5">
              <div className="bg-white rounded-3xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black text-slate-900">
                      Fleet Telematics & Vehicle Registry ({filteredBuses.length})
                    </h2>
                    <p className="text-xs text-slate-500">
                      Inspect vehicle roadworthiness, toggle maintenance status, and register new interstate buses.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAddBusModal(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition cursor-pointer self-start sm:self-auto"
                  >
                    <Plus size={14} />
                    <span>Register New Bus</span>
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                  <div className="relative flex-1 w-full">
                    <Search
                      size={15}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      placeholder="Search bus by plate or make (e.g. TH-901-LAG)…"
                      value={busSearch}
                      onChange={e => setBusSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:bg-white"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setBusFilterStatus('all')}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                        busFilterStatus === 'all'
                          ? 'bg-teal-700 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                      }`}
                    >
                      All Vehicles
                    </button>
                    <button
                      type="button"
                      onClick={() => setBusFilterStatus('active')}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                        busFilterStatus === 'active'
                          ? 'bg-teal-700 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                      }`}
                    >
                      Operational
                    </button>
                    <button
                      type="button"
                      onClick={() => setBusFilterStatus('maintenance')}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                        busFilterStatus === 'maintenance'
                          ? 'bg-teal-700 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                      }`}
                    >
                      In Maintenance
                    </button>
                  </div>
                </div>
              </div>

              {/* Bus Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredBuses.map(bus => {
                  const isOperational = bus.status === 'Active / Operational';

                  return (
                    <div
                      key={bus.id}
                      className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4 hover:border-slate-300 transition"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm ${
                              isOperational
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            <BusIcon size={20} />
                          </div>
                          <div>
                            <strong className="text-base font-mono font-black text-slate-900 block leading-tight">
                              {bus.reg_number}
                            </strong>
                            <span className="text-xs text-slate-500 font-medium">
                              {bus.model}
                            </span>
                          </div>
                        </div>

                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                            isOperational
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {isOperational ? 'Active' : 'Maintenance'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                          <span className="text-[10px] font-mono text-slate-400 block uppercase">
                            Configuration
                          </span>
                          <strong className="font-bold text-slate-800 block mt-0.5">
                            {bus.vehicle_type}
                          </strong>
                        </div>
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                          <span className="text-[10px] font-mono text-slate-400 block uppercase">
                            Seat Capacity
                          </span>
                          <strong className="font-bold text-slate-800 block mt-0.5">
                            {bus.capacity} Passengers
                          </strong>
                        </div>
                      </div>

                      <div className="pt-2 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => bus.id && void handleBusStatusToggle(bus.id, bus.status)}
                          className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 ${
                            isOperational
                              ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          <SlidersHorizontal size={13} />
                          <span>{isOperational ? 'Send to Maintenance' : 'Mark as Operational'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredBuses.length === 0 && (
                <div className="bg-white rounded-3xl border border-slate-200/90 p-12 text-center text-slate-400">
                  No buses found matching your filter criteria.
                </div>
              )}
            </div>
          )}

          {/* ==================== WORKSPACE TAB 4: ROUTES & NETWORK ==================== */}
          {activeTab === 'routes' && (
            <div className="space-y-5">
              <div className="bg-white rounded-3xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black text-slate-900">
                      Interstate Route Corridors ({filteredRoutes.length})
                    </h2>
                    <p className="text-xs text-slate-500">
                      Manage route network pricing, mileage, travel duration parameters, and new terminal connections.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAddRouteModal(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition cursor-pointer self-start sm:self-auto"
                  >
                    <Plus size={14} />
                    <span>Create New Route</span>
                  </button>
                </div>

                <div className="relative w-full">
                  <Search
                    size={15}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    placeholder="Filter routes by city name (e.g. Lagos, Abuja, Port Harcourt)…"
                    value={routeSearch}
                    onChange={e => setRouteSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Routes Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredRoutes.map(r => (
                  <div
                    key={r.id}
                    className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4 hover:border-slate-300 transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-mono font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                        Corridor #{r.id}
                      </span>
                      <strong className="text-sm font-black text-slate-900">
                        {money(r.base_fare)}
                      </strong>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-700 font-black text-sm shrink-0">
                        <MapPin size={18} />
                      </div>
                      <div>
                        <div className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
                          <span>{r.origin}</span>
                          <ArrowRight size={13} className="text-slate-400" />
                          <span>{r.destination}</span>
                        </div>
                        <span className="text-xs text-slate-400 font-medium">Interstate Highway Route</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                        <span className="text-[10px] font-mono text-slate-400 block uppercase">
                          Distance
                        </span>
                        <strong className="font-bold text-slate-800 block mt-0.5">
                          {r.distance_km} Kilometers
                        </strong>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                        <span className="text-[10px] font-mono text-slate-400 block uppercase">
                          Est. Duration
                        </span>
                        <strong className="font-bold text-slate-800 block mt-0.5">
                          ~{r.duration_hours} Hours
                        </strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {filteredRoutes.length === 0 && (
                <div className="bg-white rounded-3xl border border-slate-200/90 p-12 text-center text-slate-400">
                  No routes match your search query.
                </div>
              )}
            </div>
          )}

          {/* ==================== WORKSPACE TAB 5: MARSHAL GATE BOARDING ==================== */}
          {activeTab === 'marshal' && (
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-xs space-y-5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center">
                    <KeyRound size={22} />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-900">
                      Terminal Gate Boarding & Validator
                    </h2>
                    <p className="text-xs text-slate-500">
                      Scan or enter passenger PNR reference to authorize physical boarding. Validates ticket confirmation and departure schedule locks.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleBoardPassengerSubmit} className="space-y-4 text-xs font-bold">
                  <div>
                    <label className="block text-slate-700 mb-1 font-extrabold">
                      Active Scheduled Trip
                    </label>
                    <select
                      value={boardTripId}
                      onChange={e => setBoardTripId(Number(e.target.value))}
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="">Select Scheduled Departure Corridor</option>
                      {opsData.trips
                        .filter(t => ['Scheduled', 'Boarding'].includes(t.status))
                        .map(t => (
                          <option key={t.id} value={t.id}>
                            Trip #{t.id} • {t.route?.origin} → {t.route?.destination} • {dateTime(t.departure_time)}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1 font-extrabold">
                      Passenger Booking Reference (PNR Code)
                    </label>
                    <input
                      type="text"
                      required
                      value={boardPnr}
                      onChange={e => setBoardPnr(e.target.value.toUpperCase())}
                      placeholder="e.g. TH-849201"
                      autoCapitalize="characters"
                      maxLength={40}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-base font-mono font-bold tracking-wider text-slate-900 focus:bg-white focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={boardingBusy}
                    className="w-full py-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs uppercase tracking-wider transition cursor-pointer disabled:opacity-50 shadow-md shadow-teal-700/20"
                  >
                    {boardingBusy ? 'Validating Passenger…' : 'Authorize & Board Passenger'}
                  </button>
                </form>

                {/* Validation Result Box */}
                {boardResult && (
                  <div
                    className={`p-4 rounded-2xl border text-xs font-semibold flex items-start justify-between gap-3 animate-in fade-in zoom-in duration-200 ${
                      boardResult.success
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                        : 'bg-rose-50 border-rose-300 text-rose-900'
                    }`}
                  >
                    <div className="space-y-1">
                      <strong className="text-sm font-black block">
                        {boardResult.message}
                      </strong>
                      {boardResult.ticket && (
                        <p className="text-xs text-slate-700 font-medium">
                          Passenger: <strong>{boardResult.ticket.passenger_name}</strong> • Seat #
                          <strong>{boardResult.ticket.seat_number}</strong> • PNR: {boardResult.ticket.pnr_code}
                        </p>
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-mono font-black uppercase px-2.5 py-1 rounded-full ${
                        boardResult.success
                          ? 'bg-emerald-200/80 text-emerald-900'
                          : 'bg-rose-200/80 text-rose-900'
                      }`}
                    >
                      {boardResult.success ? 'PASSED' : 'REJECTED'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================== WORKSPACE TAB 6: STAFF ACCOUNTS & SECURITY ==================== */}
          {activeTab === 'users' && (
            <div className="space-y-5">
              <div className="bg-white rounded-3xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black text-slate-900">
                      Staff Directory & Credential Governance ({filteredUsers.length})
                    </h2>
                    <p className="text-xs text-slate-500">
                      Provision enterprise staff accounts, manage operational roles, and enforce one-click credential suspensions.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAddStaffModal(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs transition cursor-pointer self-start sm:self-auto"
                  >
                    <UserPlus size={14} />
                    <span>Create Staff Account</span>
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                  <div className="relative flex-1 w-full">
                    <Search
                      size={15}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      placeholder="Search staff by name, email, or phone…"
                      value={userSearch}
                      onChange={e => setUserSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:bg-white"
                    />
                  </div>

                  {/* Role Selector Filter */}
                  <select
                    value={userRoleFilter}
                    onChange={e => setUserRoleFilter(e.target.value)}
                    className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="all">All Roles</option>
                    <option value="admin">Administrator</option>
                    <option value="finance">Finance Officer</option>
                    <option value="dispatch">Dispatcher</option>
                    <option value="driver">Driver</option>
                    <option value="pos">POS Cashier</option>
                    <option value="marshal">Gate Marshal</option>
                    <option value="passenger">Passenger</option>
                  </select>
                </div>
              </div>

              {/* Staff Directory Table */}
              <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold">
                        <th className="py-3 px-4">Staff Member</th>
                        <th className="py-3 px-4">Role Assignment</th>
                        <th className="py-3 px-4">Contact Phone</th>
                        <th className="py-3 px-4">Security Status</th>
                        <th className="py-3 px-4 text-right">Access Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {filteredUsers.map(u => {
                        const isSelf = u.id === user?.id;
                        const isSuspended = Boolean(u.disabled_at);

                        return (
                          <tr key={u.id} className="hover:bg-slate-50/70 transition">
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-900 flex items-center gap-2">
                                <span>{u.name}</span>
                                {isSelf && (
                                  <span className="text-[9px] uppercase font-mono font-bold bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded">
                                    You
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                                {u.email}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded-full inline-block ${
                                  u.role === 'admin'
                                    ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                    : u.role === 'finance'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : u.role === 'driver'
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                                }`}
                              >
                                {u.role}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-mono text-slate-600">
                              {u.phone || '—'}
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded-full inline-block ${
                                  isSuspended
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                }`}
                              >
                                {isSuspended ? 'Suspended' : 'Active'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              {!isSelf ? (
                                <button
                                  type="button"
                                  onClick={() => void handleUserAccessToggle(u)}
                                  className={`px-3 py-1 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                                    isSuspended
                                      ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                                      : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200'
                                  }`}
                                >
                                  {isSuspended ? 'Reactivate' : 'Suspend'}
                                </button>
                              ) : (
                                <span className="text-slate-300 text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredUsers.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-slate-400">
                            No staff accounts found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==================== WORKSPACE TAB 7: COUNTER BOOKING & CARGO (POS) ==================== */}
          {activeTab === 'pos' && (
            <div className="space-y-6">
              {/* Baggage Claim Tag Generator Panel */}
              <div className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-black text-slate-900">
                      Cargo Hold & Luggage Claim Tags
                    </h2>
                    <p className="text-xs text-slate-500">
                      Generate and print serialized barcode luggage tags for checked baggage in the bus cargo hold.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleGenerateLuggageTags} className="flex flex-col sm:flex-row items-end gap-3 text-xs font-bold">
                  <div className="flex-1 w-full">
                    <label className="block text-slate-700 mb-1">
                      Ticket Booking Reference (PNR)
                    </label>
                    <input
                      type="text"
                      required
                      value={luggagePnr}
                      onChange={e => setLuggagePnr(e.target.value.toUpperCase())}
                      placeholder="e.g. TH-849201"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono font-bold uppercase text-slate-900 focus:bg-white focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div className="w-full sm:w-48">
                    <label className="block text-slate-700 mb-1">Baggage Pieces Count</label>
                    <select
                      value={luggageCount}
                      onChange={e => setLuggageCount(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-teal-500"
                    >
                      {[1, 2, 3, 4, 5, 6].map(num => (
                        <option key={num} value={num}>
                          {num} {num === 1 ? 'Piece' : 'Pieces'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={generatingTags}
                    className="w-full sm:w-auto px-5 py-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs uppercase tracking-wider transition cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {generatingTags ? 'Generating…' : 'Generate Tags'}
                  </button>
                </form>

                {luggageTags.length > 0 && (
                  <div className="space-y-4 pt-4 border-t border-slate-100">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider font-mono">
                        Generated Tags ({luggageTags.length})
                      </h3>
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                      >
                        <Printer size={13} />
                        <span>Print Luggage Labels</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {luggageTags.map(tag => (
                        <div
                          key={tag}
                          className="p-4 bg-slate-50 rounded-2xl border-2 border-dashed border-teal-500/50 space-y-2 text-center"
                        >
                          <span className="text-[9px] uppercase font-mono font-bold text-slate-400 block">
                            TRANSITHUB CARGO HOLD
                          </span>
                          <strong className="text-base font-mono font-black text-teal-800 block tracking-widest">
                            {tag}
                          </strong>
                          <span className="text-[10px] text-slate-500 block font-mono">
                            PNR: {luggagePnr} • Verified
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Walk-in Counter Cash Booking Engine */}
              <div className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs space-y-4">
                <div>
                  <h2 className="text-base font-black text-slate-900">
                    Station Walk-in Ticket Cash Desk
                  </h2>
                  <p className="text-xs text-slate-500">
                    Issue instantaneous tickets for walk-in passengers paying cash at the terminal counter.
                  </p>
                </div>
                <SearchBooking cash onBooked={() => void fetchData(true)} />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ==================== MODALS ==================== */}

      {/* MODAL 1: SCHEDULE TRIP */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in duration-200 my-8">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CalendarDays size={18} className="text-teal-600" />
                <h3 className="text-base font-black text-slate-900">
                  Schedule New Interstate Trip
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleScheduleTripSubmit} className="space-y-4 text-xs font-bold">
              <div>
                <label className="block text-slate-700 mb-1">Route Corridor</label>
                <select
                  name="route_id"
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold text-slate-900"
                >
                  <option value="">Select Route</option>
                  {opsData.routes.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.origin} → {r.destination} ({r.distance_km} km • ~{r.duration_hours} hrs)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Assigned Operational Bus</label>
                <select
                  name="bus_id"
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold text-slate-900"
                >
                  <option value="">Select Active Bus</option>
                  {opsData.buses
                    .filter(b => b.status === 'Active / Operational')
                    .map(b => (
                      <option key={b.id} value={b.id}>
                        {b.reg_number} · {b.model} ({b.capacity} seats • {b.vehicle_type})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Certified Driver</label>
                <select
                  name="driver_id"
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold text-slate-900"
                >
                  <option value="">Select Driver</option>
                  {opsData.drivers.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} (Driver ID #{d.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1">Departure Time (WAT)</label>
                  <input
                    type="datetime-local"
                    name="departure_time"
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 mb-1">Arrival Time (WAT)</label>
                  <input
                    type="datetime-local"
                    name="arrival_time"
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Ticket Seat Fare (NGN)</label>
                <input
                  type="number"
                  name="fare"
                  required
                  min="1"
                  step="0.01"
                  placeholder="e.g. 15000"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono font-bold text-slate-900"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={submittingSchedule}
                  className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-black py-3 rounded-xl uppercase tracking-wider transition cursor-pointer"
                >
                  {submittingSchedule ? 'Scheduling…' : 'Schedule Trip'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD VEHICLE TO FLEET */}
      {showAddBusModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <BusIcon size={18} className="text-teal-600" />
                <h3 className="text-base font-black text-slate-900">
                  Register New Vehicle
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddBusModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddBusSubmit} className="space-y-4 text-xs font-bold">
              <div>
                <label className="block text-slate-700 mb-1">Registration Plate Number</label>
                <input
                  name="reg_number"
                  required
                  maxLength={30}
                  placeholder="e.g. TH-892-LAG"
                  autoCapitalize="characters"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono font-bold uppercase text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Vehicle Make & Model</label>
                <input
                  name="model"
                  required
                  maxLength={100}
                  placeholder="e.g. Toyota HiAce 2024 Executive"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Vehicle Size & Capacity</label>
                <select
                  name="vehicle_type"
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-slate-900"
                >
                  <option value="14-Seater">14-Seater Standard Bus (14 seats)</option>
                  <option value="7-Seater">7-Seater Executive Van (7 seats)</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={submittingBus}
                  className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-black py-3 rounded-xl uppercase tracking-wider transition cursor-pointer"
                >
                  {submittingBus ? 'Adding Vehicle…' : 'Register Vehicle'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddBusModal(false)}
                  className="px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ADD NEW ROUTE */}
      {showAddRouteModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <MapPin size={18} className="text-teal-600" />
                <h3 className="text-base font-black text-slate-900">
                  Create Interstate Route
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddRouteModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddRouteSubmit} className="space-y-4 text-xs font-bold">
              <div>
                <label className="block text-slate-700 mb-1">Origin City Terminal</label>
                <input
                  name="origin"
                  required
                  maxLength={100}
                  placeholder="e.g. Lagos"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Destination Hub</label>
                <input
                  name="destination"
                  required
                  maxLength={100}
                  placeholder="e.g. Abuja"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1">Distance (km)</label>
                  <input
                    name="distance_km"
                    type="number"
                    min="1"
                    required
                    placeholder="e.g. 750"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 mb-1">Est. Duration (hrs)</label>
                  <input
                    name="duration_hours"
                    type="text"
                    required
                    placeholder="e.g. 9.5"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono font-bold text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Base Seat Fare (NGN)</label>
                <input
                  name="base_fare"
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  placeholder="e.g. 15000"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono font-bold text-slate-900"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={submittingRoute}
                  className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-black py-3 rounded-xl uppercase tracking-wider transition cursor-pointer"
                >
                  {submittingRoute ? 'Creating…' : 'Configure Route'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddRouteModal(false)}
                  className="px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: CREATE STAFF ACCOUNT */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in duration-200 my-8">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <UserPlus size={18} className="text-teal-600" />
                <h3 className="text-base font-black text-slate-900">
                  Create Staff Account
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddStaffModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddStaffSubmit} className="space-y-4 text-xs font-bold">
              <div>
                <label className="block text-slate-700 mb-1">Full Legal Name</label>
                <input
                  name="name"
                  required
                  maxLength={100}
                  placeholder="e.g. Samuel Okafor"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Work Email Address</label>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="e.g. s.okafor@transithub.ng"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold text-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1">Phone Number</label>
                  <input
                    name="phone"
                    type="tel"
                    required
                    maxLength={30}
                    placeholder="08012345678"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono font-semibold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1">Assigned Operational Role</label>
                  <select
                    name="role"
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-slate-900"
                  >
                    <option value="driver">Driver</option>
                    <option value="dispatch">Dispatcher</option>
                    <option value="pos">POS Cashier</option>
                    <option value="marshal">Boarding Marshal</option>
                    <option value="finance">Finance Officer</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1">Password (min 12 chars)</label>
                  <input
                    type="password"
                    name="password"
                    required
                    minLength={12}
                    autoComplete="new-password"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1">Confirm Password</label>
                  <input
                    type="password"
                    name="password_confirmation"
                    required
                    minLength={12}
                    autoComplete="new-password"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold text-slate-900"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={submittingStaff}
                  className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-black py-3 rounded-xl uppercase tracking-wider transition cursor-pointer"
                >
                  {submittingStaff ? 'Provisioning…' : 'Create Staff Account'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddStaffModal(false)}
                  className="px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: TRIP REASSIGNMENT */}
      {reassignTrip && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Reassign Trip #{reassignTrip.id}
                </h3>
                <span className="text-xs text-slate-500 font-medium">
                  {reassignTrip.route?.origin} → {reassignTrip.route?.destination}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setReassignTrip(null)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleReassignSubmit} className="space-y-4 text-xs font-bold">
              <div>
                <label className="block text-slate-700 mb-1">Operational Bus</label>
                <select
                  required
                  value={reassignBusId}
                  onChange={e => setReassignBusId(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-slate-900"
                >
                  <option value="">Choose Operational Vehicle</option>
                  {opsData.buses
                    .filter(b => b.status === 'Active / Operational')
                    .map(b => (
                      <option key={b.id} value={b.id}>
                        {b.reg_number} · {b.model} ({b.capacity} seats)
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 mb-1">Assigned Driver</label>
                <select
                  required
                  value={reassignDriverId}
                  onChange={e => setReassignDriverId(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-slate-900"
                >
                  <option value="">Choose Driver</option>
                  {opsData.drivers.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-black py-3 rounded-xl uppercase tracking-wider transition cursor-pointer"
                >
                  Confirm Reassignment
                </button>
                <button
                  type="button"
                  onClick={() => setReassignTrip(null)}
                  className="px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: PASSENGER MANIFEST */}
      {manifest && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in duration-200 my-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
              <div>
                <span className="text-[10px] uppercase font-mono font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                  Station Departure Manifest
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-1">
                  Trip #{manifest.trip.id} ({manifest.trip.route?.origin} → {manifest.trip.route?.destination})
                </h3>
                <span className="text-xs text-slate-500 font-mono">
                  Vehicle: {manifest.trip.bus?.reg_number} • Departs: {dateTime(manifest.trip.departure_time)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  <Printer size={14} />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => setManifest(null)}
                  className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer px-2"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold">
                    <th className="py-2.5 px-3">Seat</th>
                    <th className="py-2.5 px-3">Passenger</th>
                    <th className="py-2.5 px-3">Contact</th>
                    <th className="py-2.5 px-3">PNR</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Emergency Contact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {manifest.tickets.map(t => (
                    <tr key={t.pnr_code} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 font-mono font-black text-teal-800">
                        Seat #{t.seat_number}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        {t.passenger_name}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {t.passenger_phone}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        {t.pnr_code}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`text-[9px] font-mono uppercase font-bold px-2 py-0.5 rounded-full ${
                            t.status === 'Boarded'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-teal-100 text-teal-800'
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                        {t.nok_name || '—'} {t.nok_phone && `(${t.nok_phone})`}
                      </td>
                    </tr>
                  ))}
                  {manifest.tickets.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No confirmed or boarded passengers on this trip manifest.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-100 text-xs text-slate-500">
              <span>
                Total Manifest Headcount: <strong>{manifest.tickets.length}</strong> passengers
              </span>
              <button
                type="button"
                onClick={() => setManifest(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl transition cursor-pointer"
              >
                Close Manifest
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
