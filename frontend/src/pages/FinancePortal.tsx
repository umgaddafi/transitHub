import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  Banknote,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Search,
  Download,
  ShieldCheck,
  Receipt,
  ChevronRight,
  Copy,
  Check,
  Lock,
  Building2,
  Sparkles,
  Layers,
  LogOut,
  X,
  AlertTriangle,
  Printer,
  Menu,
  Calendar,
  CalendarDays,
  BarChart3,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, errorMessage, money, dateTime } from '../services/api';
import type { Ticket } from '../types/ticket';

export interface AuditLog {
  id: number;
  created_at: string;
  user_name: string;
  role: string;
  action: string;
  amount: number | string;
  details: string;
  event_key?: string;
}

export interface PaymentMethodBreakdown {
  payment_method: string;
  total_amount: number | string;
  count: number;
}

export interface RouteBreakdown {
  route_name: string;
  total_amount: number | string;
  count: number;
}

export interface DailyStats {
  today_gross: number;
  today_tickets: number;
  today_avg_fare: number;
  yesterday_gross: number;
  today_cash: number;
  today_online: number;
  dod_change_pct: number;
}

export interface MonthlyStats {
  month_label: string;
  this_month_gross: number;
  this_month_net: number;
  this_month_tickets: number;
  this_month_refunds: number;
  last_month_gross: number;
  mom_change_pct: number;
  days_in_month: number;
  days_passed: number;
  avg_daily_revenue: number;
  projected_month_gross: number;
}

export interface DailyTrendPoint {
  date: string;
  label: string;
  day_name: string;
  amount: number;
  tickets: number;
  cash: number;
  online: number;
}

export interface MonthlyTrendPoint {
  month: string;
  label: string;
  short_label: string;
  gross: number;
  net: number;
  refunds: number;
  tickets: number;
}

export interface FinanceSummaryData {
  status: string;
  collected: string | number;
  refund_pending: string | number;
  refunded: string | number;
  tickets: Ticket[];
  recent_transactions?: Ticket[];
  by_payment_method?: PaymentMethodBreakdown[];
  by_route?: RouteBreakdown[];
  total_tickets_count?: number;
  total_handover_amount?: string | number;
  daily_stats?: DailyStats;
  monthly_stats?: MonthlyStats;
  daily_trend?: DailyTrendPoint[];
  monthly_trend?: MonthlyTrendPoint[];
}

type FinanceTab = 'overview' | 'refunds' | 'handover' | 'audits' | 'transactions';

const TAB_CONFIG: Record<FinanceTab, { label: string; icon: typeof Layers; description: string }> = {
  overview: {
    label: 'Overview & Analytics',
    icon: Layers,
    description: 'Executive revenue distribution, route leaderboard, and real-time transaction feed.',
  },
  refunds: {
    label: 'Refund Review Queue',
    icon: AlertCircle,
    description: 'Review and authorize pending travel cancellations and gateway discrepancies.',
  },
  handover: {
    label: 'POS Cash Vault',
    icon: Banknote,
    description: 'Station terminal till reconciliations and printable cash handover vouchers.',
  },
  audits: {
    label: 'Compliance & Audits',
    icon: ShieldCheck,
    description: 'Immutable financial audit trail and accounting CSV ledger export.',
  },
  transactions: {
    label: 'All Transactions',
    icon: Receipt,
    description: 'Comprehensive registry of tickets, booking fares, and boarding statuses.',
  },
};

export function FinancePortal() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Core State
  const [finance, setFinance] = useState<FinanceSummaryData | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<FinanceTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Auto-refresh control (30s)
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [syncCountdown, setSyncCountdown] = useState(30);

  // Refund modal state
  const [refundTicket, setRefundTicket] = useState<Ticket | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const [processingRefund, setProcessingRefund] = useState(false);

  // Copy PNR feedback state
  const [copiedPnr, setCopiedPnr] = useState<string | null>(null);

  // Handover state
  const handoverKey = useRef(crypto.randomUUID());
  const [handoverAmount, setHandoverAmount] = useState<string>('');
  const [handoverNotes, setHandoverNotes] = useState<string>('');
  const [submittingHandover, setSubmittingHandover] = useState(false);
  const [selectedHandoverLog, setSelectedHandoverLog] = useState<AuditLog | null>(null);

  // Filter & Search states
  const [refundFilterChannel, setRefundFilterChannel] = useState<'all' | 'Online' | 'Cash'>('all');
  const [refundSearch, setRefundSearch] = useState('');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditCategory, setAuditCategory] = useState<'all' | 'handover' | 'refund' | 'system'>('all');
  const [transactionSearch, setTransactionSearch] = useState('');
  const [transactionStatusFilter, setTransactionStatusFilter] = useState<string>('all');

  // Chart Interactive & Range States
  const [activeDailyHoverIndex, setActiveDailyHoverIndex] = useState<number | null>(null);
  const [activeMonthlyHoverIndex, setActiveMonthlyHoverIndex] = useState<number | null>(null);
  const [dailyChartRange, setDailyChartRange] = useState<'14d' | '7d'>('14d');

  // Current system clock in WAT
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch all finance data
  const fetchData = useCallback(async (isBackground = false) => {
    if (!isBackground) setRefreshing(true);
    setError('');
    try {
      const [summaryRes, auditsRes] = await Promise.all([
        api.get<FinanceSummaryData>('/finance/summary'),
        api.get<{ logs: AuditLog[] }>('/finance/audits'),
      ]);
      setFinance(summaryRes.data);
      setLogs(auditsRes.data.logs || []);
      setSyncCountdown(30);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      setRefreshing(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Auto-sync ticker
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      setSyncCountdown(prev => {
        if (prev <= 1) {
          void fetchData(true);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  // Copy PNR helper
  const handleCopyPnr = (pnr: string) => {
    navigator.clipboard.writeText(pnr);
    setCopiedPnr(pnr);
    showToast('PNR Copied', `${pnr} copied to clipboard`, 'info');
    setTimeout(() => setCopiedPnr(null), 2000);
  };

  const switchTab = (t: FinanceTab) => {
    setActiveTab(t);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Submit Refund Execution
  const handleProcessRefund = async (e: FormEvent) => {
    e.preventDefault();
    if (!refundTicket) return;
    if (!refundReason.trim() || refundReason.length < 5) {
      showToast('Validation Error', 'Please provide a refund reason of at least 5 characters.', 'error');
      return;
    }
    if (refundTicket.payment_method === 'Cash' && !cashConfirmed) {
      showToast('Confirmation Required', 'Please confirm that cash was physically disbursed to the passenger.', 'error');
      return;
    }

    setProcessingRefund(true);
    try {
      const payload: { reason: string; cash_refund_confirmed?: boolean } = {
        reason: refundReason.trim(),
      };
      if (refundTicket.payment_method === 'Cash') {
        payload.cash_refund_confirmed = cashConfirmed;
      }

      const res = await api.post<{ status: string; message: string; ticket: Ticket }>(
        `/finance/refund/${encodeURIComponent(refundTicket.pnr_code)}`,
        payload
      );

      showToast('Refund Processed', res.data.message || 'Refund successfully processed.', 'success');
      setRefundTicket(null);
      setRefundReason('');
      setCashConfirmed(false);
      void fetchData(false);
    } catch (err) {
      showToast('Refund Failed', errorMessage(err), 'error');
    } finally {
      setProcessingRefund(false);
    }
  };

  // Submit Cash Handover
  const handleSubmitHandover = async (e: FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(handoverAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      showToast('Invalid Amount', 'Enter a valid positive amount for the cash handover.', 'error');
      return;
    }

    setSubmittingHandover(true);
    try {
      await api.post('/finance/handover', {
        amount: parsedAmount.toFixed(2),
        notes: handoverNotes.trim() || 'General shift counter reconciliation handover',
        idempotency_key: handoverKey.current,
      });

      showToast('Handover Logged', `₦${parsedAmount.toLocaleString('en-NG')} handover recorded in audit ledger.`, 'success');
      handoverKey.current = crypto.randomUUID();
      setHandoverAmount('');
      setHandoverNotes('');
      void fetchData(false);
    } catch (err) {
      showToast('Submission Failed', errorMessage(err), 'error');
    } finally {
      setSubmittingHandover(false);
    }
  };

  // Export Audit Logs as CSV
  const handleExportCsv = () => {
    if (!logs.length) {
      showToast('No Data', 'There are no audit logs available to export.', 'info');
      return;
    }

    const headers = ['ID', 'Timestamp (WAT)', 'Officer Name', 'Role', 'Action', 'Amount (NGN)', 'Event Key', 'Details'];
    const rows = logs.map(l => [
      l.id,
      `"${dateTime(l.created_at)}"`,
      `"${l.user_name || ''}"`,
      `"${l.role || ''}"`,
      `"${l.action || ''}"`,
      Number(l.amount || 0).toFixed(2),
      `"${l.event_key || ''}"`,
      `"${(l.details || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `TransitHub-Finance-Ledger-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Export Ready', 'Audit ledger downloaded as CSV.', 'success');
  };

  // Computed Metrics
  const grossCollected = useMemo(() => Number(finance?.collected || 0), [finance]);
  const refundPending = useMemo(() => Number(finance?.refund_pending || 0), [finance]);
  const totalRefunded = useMemo(() => Number(finance?.refunded || 0), [finance]);
  const netLiquidVault = useMemo(() => grossCollected - totalRefunded, [grossCollected, totalRefunded]);
  const handoverTotal = useMemo(() => Number(finance?.total_handover_amount || 0), [finance]);

  // Filtered Refund Tickets Queue
  const pendingTickets = useMemo(() => {
    if (!finance?.tickets) return [];
    return finance.tickets.filter(t => {
      const matchesStatus = ['Cancellation Requested', 'Payment Review', 'Refund Pending'].includes(t.status);
      if (!matchesStatus) return false;

      // Channel filter
      if (refundFilterChannel === 'Cash' && t.payment_method !== 'Cash') return false;
      if (refundFilterChannel === 'Online' && t.payment_method === 'Cash') return false;

      // Search
      if (refundSearch.trim()) {
        const query = refundSearch.toLowerCase().trim();
        const pnrMatch = t.pnr_code.toLowerCase().includes(query);
        const nameMatch = t.passenger_name.toLowerCase().includes(query);
        const phoneMatch = (t.passenger_phone || '').toLowerCase().includes(query);
        const routeMatch = (t.route_name || '').toLowerCase().includes(query);
        return pnrMatch || nameMatch || phoneMatch || routeMatch;
      }
      return true;
    });
  }, [finance?.tickets, refundFilterChannel, refundSearch]);

  // Filtered Audit Logs
  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      // Category filter
      if (auditCategory === 'handover' && !l.action.toLowerCase().includes('handover')) return false;
      if (auditCategory === 'refund' && !l.action.toLowerCase().includes('refund')) return false;
      if (auditCategory === 'system' && (l.action.toLowerCase().includes('handover') || l.action.toLowerCase().includes('refund'))) return false;

      // Search filter
      if (auditSearch.trim()) {
        const query = auditSearch.toLowerCase().trim();
        const userMatch = (l.user_name || '').toLowerCase().includes(query);
        const actionMatch = (l.action || '').toLowerCase().includes(query);
        const detailsMatch = (l.details || '').toLowerCase().includes(query);
        const keyMatch = (l.event_key || '').toLowerCase().includes(query);
        return userMatch || actionMatch || detailsMatch || keyMatch;
      }
      return true;
    });
  }, [logs, auditCategory, auditSearch]);

  // All Transactions Filtered
  const filteredTransactions = useMemo(() => {
    const list = finance?.recent_transactions || [];
    return list.filter(t => {
      if (transactionStatusFilter !== 'all' && t.status !== transactionStatusFilter) return false;
      if (transactionSearch.trim()) {
        const q = transactionSearch.toLowerCase().trim();
        return (
          t.pnr_code.toLowerCase().includes(q) ||
          t.passenger_name.toLowerCase().includes(q) ||
          (t.route_name || '').toLowerCase().includes(q) ||
          (t.payment_method || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [finance?.recent_transactions, transactionStatusFilter, transactionSearch]);

  // Payment method calculations for chart bars
  const paymentStats = useMemo(() => {
    const methods = finance?.by_payment_method || [];
    const total = methods.reduce((acc, curr) => acc + Number(curr.total_amount), 0);
    return methods.map(m => ({
      name: m.payment_method,
      amount: Number(m.total_amount),
      count: m.count,
      pct: total > 0 ? Math.round((Number(m.total_amount) / total) * 100) : 0,
    }));
  }, [finance?.by_payment_method]);

  // Daily and monthly chart series
  const dailySeries = useMemo(() => {
    const list = finance?.daily_trend || [];
    return dailyChartRange === '7d' ? list.slice(-7) : list;
  }, [finance?.daily_trend, dailyChartRange]);

  const monthlySeries = useMemo(() => {
    return finance?.monthly_trend || [];
  }, [finance?.monthly_trend]);

  const maxDailyAmount = useMemo(() => {
    const amounts = dailySeries.map(d => d.amount);
    return Math.max(...amounts, 10000);
  }, [dailySeries]);

  const maxMonthlyGross = useMemo(() => {
    const grosses = monthlySeries.map(m => m.gross);
    return Math.max(...grosses, 10000);
  }, [monthlySeries]);

  // SVG Area path generator for daily revenue
  const dailyAreaPoints = useMemo(() => {
    const padL = 60;
    const padR = 25;
    const padT = 20;
    const padB = 35;
    const width = 680;
    const height = 220;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;
    const len = dailySeries.length;

    if (len === 0) return { points: [], linePath: '', areaPath: '', width, height, padL, padR, padT, padB, innerW, innerH };

    const pts = dailySeries.map((d, i) => {
      const x = padL + (i / Math.max(1, len - 1)) * innerW;
      const y = padT + innerH - (d.amount / maxDailyAmount) * innerH;
      return { x, y, data: d, index: i };
    });

    let line = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? 0 : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      line += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }

    const baselineY = padT + innerH;
    const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)},${baselineY.toFixed(1)} L ${pts[0].x.toFixed(1)},${baselineY.toFixed(1)} Z`;

    return { points: pts, linePath: line, areaPath: area, width, height, padL, padR, padT, padB, innerW, innerH };
  }, [dailySeries, maxDailyAmount]);

  // Donut chart segments calculation
  const donutSegments = useMemo(() => {
    const total = paymentStats.reduce((sum, item) => sum + item.amount, 0);
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    let accumulatedAngle = 0;
    const colors = ['#0d9488', '#0284c7', '#d97706', '#6366f1'];

    return paymentStats.map((item, idx) => {
      const pct = total > 0 ? item.amount / total : 0;
      const strokeDash = `${(pct * circumference).toFixed(2)} ${circumference.toFixed(2)}`;
      const offset = (-accumulatedAngle * circumference).toFixed(2);
      accumulatedAngle += pct;
      return {
        ...item,
        strokeDash,
        offset,
        color: colors[idx % colors.length],
      };
    });
  }, [paymentStats]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased selection:bg-teal-500 selection:text-white flex flex-col lg:flex-row">
      {/* ==================== DESKTOP FIXED SIDEBAR ==================== */}
      <aside className="hidden lg:flex fixed top-0 left-0 bottom-0 w-64 bg-white border-r border-slate-200 p-5 flex-col justify-between z-30 shadow-xs overflow-y-auto">
        <div className="space-y-6">
          {/* Brand Header */}
          <Link to="/" className="flex items-center gap-3 pb-4 border-b border-slate-100 group">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-600 flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform duration-200">
              <Building2 size={20} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-black tracking-tight text-slate-900 block leading-none">
                  Transit<span className="text-teal-600">Hub</span>
                </span>
                <span className="text-[9px] uppercase font-mono font-bold tracking-widest px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200">
                  Vault
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono font-medium block mt-1">
                Treasury & Settlement
              </span>
            </div>
          </Link>

          {/* Mini Realtime Vault Status Indicator */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[11px] font-mono text-emerald-700 font-bold">Ledger Online</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">WAT</span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-600 border-t border-slate-200/60 pt-1.5">
              <span>Gross Intake</span>
              <strong className="text-slate-900 font-bold">{money(grossCollected)}</strong>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5 text-xs font-bold">
            {(Object.keys(TAB_CONFIG) as FinanceTab[]).map(tabKey => {
              const item = TAB_CONFIG[tabKey];
              const Icon = item.icon;
              const isActive = activeTab === tabKey;
              return (
                <button
                  key={tabKey}
                  type="button"
                  onClick={() => switchTab(tabKey)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition text-left cursor-pointer ${
                    isActive
                      ? 'bg-teal-50 text-teal-700 border border-teal-200 font-black shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon size={16} className={isActive ? 'text-teal-600' : 'text-slate-400'} />
                    <span>{item.label}</span>
                  </span>
                  {tabKey === 'refunds' && pendingTickets.length > 0 && (
                    <span className="text-[10px] font-mono font-black bg-amber-500 text-white px-1.5 py-0.5 rounded-full">
                      {pendingTickets.length}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Quick Actions in Sidebar */}
          <div className="pt-3 border-t border-slate-200/80 space-y-2">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-bold block px-1">
              Actions
            </span>
            <button
              type="button"
              onClick={handleExportCsv}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 transition text-xs font-semibold cursor-pointer"
            >
              <Download size={14} className="text-teal-600" />
              <span>Export Audit CSV</span>
            </button>
            <button
              type="button"
              onClick={() => void fetchData(false)}
              disabled={refreshing}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 transition text-xs font-semibold disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin text-teal-600' : 'text-slate-500'} />
              <span>{refreshing ? 'Syncing…' : 'Sync Vault'}</span>
            </button>
          </div>
        </div>

        {/* User Profile Footer in Sidebar */}
        <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'F'}
            </div>
            <div className="leading-tight truncate">
              <strong className="text-xs font-bold text-slate-900 block truncate">
                {user?.name || 'Treasurer'}
              </strong>
              <span className="text-[10px] text-amber-700 font-mono font-semibold uppercase block">
                {user?.role === 'admin' ? 'Super Admin' : 'Finance Officer'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            title="Sign Out of Finance Vault"
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
              Vault
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {pendingTickets.length > 0 && (
            <button
              type="button"
              onClick={() => switchTab('refunds')}
              className="flex items-center gap-1 text-[11px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 rounded-lg"
            >
              <AlertCircle size={12} className="text-amber-600" />
              <span>{pendingTickets.length} pending</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void fetchData(false)}
            disabled={refreshing}
            className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
            title="Sync Vault"
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
                    <span className="text-[9px] uppercase font-mono text-slate-500">
                      Treasury Vault
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
                {(Object.keys(TAB_CONFIG) as FinanceTab[]).map(tabKey => {
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
                      {tabKey === 'refunds' && pendingTickets.length > 0 && (
                        <span className="text-[10px] font-mono font-black bg-amber-500 text-white px-1.5 py-0.5 rounded-full">
                          {pendingTickets.length}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>

              <div className="pt-3 border-t border-slate-100 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    handleExportCsv();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer border border-slate-200"
                >
                  <Download size={14} className="text-teal-600" />
                  <span>Export CSV Ledger</span>
                </button>
              </div>
            </div>

            {/* Mobile User Profile Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-amber-500 text-white font-black flex items-center justify-center text-xs shrink-0 shadow-xs">
                  {user?.name ? user.name.charAt(0).toUpperCase() : 'F'}
                </div>
                <div className="leading-tight truncate">
                  <strong className="text-xs font-bold text-slate-900 block truncate">
                    {user?.name || 'Treasurer'}
                  </strong>
                  <span className="text-[10px] text-amber-700 font-semibold block">
                    {user?.role === 'admin' ? 'Admin' : 'Finance'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  navigate('/login');
                }}
                className="text-slate-400 hover:text-rose-600 text-xs p-1.5 rounded-lg cursor-pointer"
              >
                <LogOut size={15} />
              </button>
            </div>
          </aside>
        </>
      )}

      {/* ==================== MAIN CONTENT AREA ==================== */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen relative z-10">
        {/* Desktop Sticky Header inside Main Area */}
        <header className="hidden lg:flex sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200 px-8 py-4 items-center justify-between shadow-xs">
          <div>
            <h1 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Sparkles size={16} className="text-teal-600" />
              {TAB_CONFIG[activeTab].label}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {TAB_CONFIG[activeTab].description}
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            {/* System Clock */}
            <div className="flex items-center gap-1.5 text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <Clock size={13} className="text-teal-600" />
              <span>{currentTime.toLocaleTimeString('en-GB', { timeZone: 'Africa/Lagos' })} WAT</span>
            </div>

            {/* Auto Refresh */}
            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1.5 rounded-xl border text-[11px] font-mono transition cursor-pointer ${
                autoRefresh
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold'
                  : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}
            >
              Auto-sync: {autoRefresh ? `30s (${syncCountdown}s)` : 'PAUSED'}
            </button>
          </div>
        </header>

        {/* Inner Content Area */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
          {/* Error Notice */}
          {error && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between text-sm shadow-xs">
              <div className="flex items-center gap-3">
                <AlertTriangle className="text-rose-600 shrink-0" size={20} />
                <span>{error}</span>
              </div>
              <button
                onClick={() => setError('')}
                className="text-rose-500 hover:text-rose-800 p-1 rounded-lg cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {busy && !finance ? (
            <div className="flex flex-col items-center justify-center py-32 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 border border-teal-200 flex items-center justify-center animate-pulse">
                <RefreshCw size={24} className="animate-spin text-teal-600" />
              </div>
              <p className="text-sm font-mono text-slate-500">Synchronizing Treasury Vault & Ledgers…</p>
            </div>
          ) : (
            <>
              {/* ==================== 5-COLUMN EXECUTIVE METRIC CARDS ==================== */}
              <section aria-label="Executive Financial KPIs" className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  {/* 1. Gross Revenue */}
                  <div className="p-5 rounded-2xl bg-white border border-slate-200/80 hover:border-teal-400/60 transition-all duration-200 shadow-xs group hover:-translate-y-0.5">
                    <div className="flex items-center justify-between text-slate-400 mb-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Gross Intake</span>
                      <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100 group-hover:scale-105 transition">
                        <TrendingUp size={16} />
                      </div>
                    </div>
                    <div className="text-2xl lg:text-xl xl:text-2xl font-black tracking-tight text-slate-900 font-mono">
                      {money(grossCollected)}
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-2.5">
                      <span>Total Bookings</span>
                      <span className="font-mono font-bold text-slate-700">
                        {finance?.total_tickets_count || finance?.recent_transactions?.length || 0} Tickets
                      </span>
                    </div>
                  </div>

                  {/* 2. Net Liquid Vault */}
                  <div className="p-5 rounded-2xl bg-white border border-slate-200/80 hover:border-emerald-400/60 transition-all duration-200 shadow-xs group hover:-translate-y-0.5">
                    <div className="flex items-center justify-between text-slate-400 mb-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Net Retained</span>
                      <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 group-hover:scale-105 transition">
                        <ShieldCheck size={16} />
                      </div>
                    </div>
                    <div className="text-2xl lg:text-xl xl:text-2xl font-black tracking-tight text-emerald-600 font-mono">
                      {money(netLiquidVault)}
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-2.5">
                      <span>Realization Rate</span>
                      <span className="font-mono font-bold text-emerald-600">
                        {grossCollected > 0 ? `${Math.round((netLiquidVault / grossCollected) * 100)}%` : '100%'}
                      </span>
                    </div>
                  </div>

                  {/* 3. Refund Review Queue */}
                  <div
                    onClick={() => switchTab('refunds')}
                    className={`p-5 rounded-2xl border transition-all duration-200 shadow-xs cursor-pointer group hover:-translate-y-0.5 ${
                      pendingTickets.length > 0
                        ? 'bg-amber-50/40 border-amber-300/80 hover:border-amber-400'
                        : 'bg-white border-slate-200/80 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-slate-400 mb-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                        Review Queue
                        {pendingTickets.length > 0 && (
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                        )}
                      </span>
                      <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200 group-hover:scale-105 transition">
                        <AlertCircle size={16} />
                      </div>
                    </div>
                    <div className="text-2xl lg:text-xl xl:text-2xl font-black tracking-tight text-amber-700 font-mono">
                      {money(refundPending)}
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-2.5">
                      <span>Awaiting Officer</span>
                      <span className="font-mono font-bold text-amber-800 px-1.5 py-0.5 rounded bg-amber-100/70 border border-amber-200">
                        {pendingTickets.length} {pendingTickets.length === 1 ? 'ticket' : 'tickets'}
                      </span>
                    </div>
                  </div>

                  {/* 4. Settled Refunds */}
                  <div className="p-5 rounded-2xl bg-white border border-slate-200/80 hover:border-rose-300 transition-all duration-200 shadow-xs group hover:-translate-y-0.5">
                    <div className="flex items-center justify-between text-slate-400 mb-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Settled Refunds</span>
                      <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 group-hover:scale-105 transition">
                        <TrendingDown size={16} />
                      </div>
                    </div>
                    <div className="text-2xl lg:text-xl xl:text-2xl font-black tracking-tight text-slate-700 font-mono">
                      {money(totalRefunded)}
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-2.5">
                      <span>Dispute Status</span>
                      <span className="font-mono font-bold text-slate-600">Reconciled</span>
                    </div>
                  </div>

                  {/* 5. POS Cash Handovers */}
                  <div
                    onClick={() => switchTab('handover')}
                    className="p-5 rounded-2xl bg-white border border-slate-200/80 hover:border-sky-400/60 transition-all duration-200 shadow-xs cursor-pointer group hover:-translate-y-0.5"
                  >
                    <div className="flex items-center justify-between text-slate-400 mb-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Till Handover</span>
                      <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center border border-sky-100 group-hover:scale-105 transition">
                        <Banknote size={16} />
                      </div>
                    </div>
                    <div className="text-2xl lg:text-xl xl:text-2xl font-black tracking-tight text-sky-700 font-mono">
                      {money(handoverTotal)}
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-2.5">
                      <span>Station Tills</span>
                      <span className="font-mono font-bold text-sky-700">Audited</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* ==================== TAB 1: OVERVIEW & ANALYTICS ==================== */}
              {activeTab === 'overview' && (
                <div className="space-y-8">
                  {/* ================= SECTION 1: DAILY & MONTHLY MONEY VELOCITY ================= */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* 1. Daily Statistics Card */}
                    <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100">
                            <Calendar size={20} />
                          </div>
                          <div>
                            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                              Today's Money Velocity
                            </h2>
                            <p className="text-xs text-slate-500">
                              Live daily passenger collections & till intake for today.
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                          {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </div>

                      {/* Big Today's Gross Figure */}
                      <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                            Today's Gross Intake
                          </span>
                          <div className="text-3xl font-black font-mono tracking-tight text-teal-700 mt-0.5">
                            {money(finance?.daily_stats?.today_gross || 0)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {(finance?.daily_stats?.dod_change_pct || 0) >= 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs font-mono font-bold px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <ArrowUpRight size={14} />
                              +{finance?.daily_stats?.dod_change_pct || 0}% vs Yesterday
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-mono font-bold px-2.5 py-1 rounded-xl bg-rose-50 text-rose-700 border border-rose-200">
                              <ArrowDownRight size={14} />
                              {finance?.daily_stats?.dod_change_pct}% vs Yesterday
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 4 Daily Sub-Metrics */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-3 rounded-xl bg-white border border-slate-200/80 space-y-1">
                          <span className="text-[10px] uppercase font-mono font-semibold text-slate-500 block">Bookings</span>
                          <strong className="text-sm font-bold font-mono text-slate-900 block">
                            {finance?.daily_stats?.today_tickets || 0}
                          </strong>
                          <span className="text-[10px] text-slate-400">tickets issued</span>
                        </div>
                        <div className="p-3 rounded-xl bg-white border border-slate-200/80 space-y-1">
                          <span className="text-[10px] uppercase font-mono font-semibold text-slate-500 block">Avg Fare</span>
                          <strong className="text-sm font-bold font-mono text-slate-900 block truncate">
                            {money(finance?.daily_stats?.today_avg_fare || 0)}
                          </strong>
                          <span className="text-[10px] text-slate-400">per passenger</span>
                        </div>
                        <div className="p-3 rounded-xl bg-white border border-slate-200/80 space-y-1">
                          <span className="text-[10px] uppercase font-mono font-semibold text-slate-500 block">Cash Intake</span>
                          <strong className="text-sm font-bold font-mono text-sky-700 block truncate">
                            {money(finance?.daily_stats?.today_cash || 0)}
                          </strong>
                          <span className="text-[10px] text-slate-400">station counter</span>
                        </div>
                        <div className="p-3 rounded-xl bg-white border border-slate-200/80 space-y-1">
                          <span className="text-[10px] uppercase font-mono font-semibold text-slate-500 block">Online Gateway</span>
                          <strong className="text-sm font-bold font-mono text-teal-700 block truncate">
                            {money(finance?.daily_stats?.today_online || 0)}
                          </strong>
                          <span className="text-[10px] text-slate-400">Paystack / Card</span>
                        </div>
                      </div>
                    </div>

                    {/* 2. Monthly Statistics Card */}
                    <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                            <CalendarDays size={20} />
                          </div>
                          <div>
                            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                              Monthly Treasury Health
                            </h2>
                            <p className="text-xs text-slate-500">
                              Month-to-date gross run-rate, net realized yield, and targets.
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {finance?.monthly_stats?.month_label || 'Current Month'}
                        </span>
                      </div>

                      {/* Big Month Gross & Net */}
                      <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                            Month-to-Date (MTD) Gross
                          </span>
                          <div className="text-3xl font-black font-mono tracking-tight text-indigo-800 mt-0.5">
                            {money(finance?.monthly_stats?.this_month_gross || 0)}
                          </div>
                        </div>
                        <div className="text-left sm:text-right">
                          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                            Net Realized (After Refunds)
                          </span>
                          <strong className="text-xl font-black font-mono text-emerald-600 block mt-0.5">
                            {money(finance?.monthly_stats?.this_month_net || 0)}
                          </strong>
                        </div>
                      </div>

                      {/* 4 Monthly Sub-Metrics */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-3 rounded-xl bg-white border border-slate-200/80 space-y-1">
                          <span className="text-[10px] uppercase font-mono font-semibold text-slate-500 block">Daily Average</span>
                          <strong className="text-sm font-bold font-mono text-slate-900 block truncate">
                            {money(finance?.monthly_stats?.avg_daily_revenue || 0)}
                          </strong>
                          <span className="text-[10px] text-slate-400">Day {finance?.monthly_stats?.days_passed || 1} of {finance?.monthly_stats?.days_in_month || 30}</span>
                        </div>
                        <div className="p-3 rounded-xl bg-white border border-slate-200/80 space-y-1">
                          <span className="text-[10px] uppercase font-mono font-semibold text-slate-500 block">Month Projected</span>
                          <strong className="text-sm font-bold font-mono text-indigo-700 block truncate">
                            {money(finance?.monthly_stats?.projected_month_gross || 0)}
                          </strong>
                          <span className="text-[10px] text-slate-400">at current pace</span>
                        </div>
                        <div className="p-3 rounded-xl bg-white border border-slate-200/80 space-y-1">
                          <span className="text-[10px] uppercase font-mono font-semibold text-slate-500 block">Settled Debits</span>
                          <strong className="text-sm font-bold font-mono text-slate-600 block truncate">
                            {money(finance?.monthly_stats?.this_month_refunds || 0)}
                          </strong>
                          <span className="text-[10px] text-slate-400">refund payouts</span>
                        </div>
                        <div className="p-3 rounded-xl bg-white border border-slate-200/80 space-y-1">
                          <span className="text-[10px] uppercase font-mono font-semibold text-slate-500 block">Total Volume</span>
                          <strong className="text-sm font-bold font-mono text-slate-900 block">
                            {finance?.monthly_stats?.this_month_tickets || 0}
                          </strong>
                          <span className="text-[10px] text-slate-400">month tickets</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ================= SECTION 2: INTERACTIVE VISUAL CHARTS ================= */}
                  <div className="space-y-6">
                    {/* Chart 1: Daily Revenue Trend Area/Line Chart */}
                    <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <BarChart3 className="text-teal-600" size={20} />
                            <h2 className="text-base font-bold text-slate-900">
                              Daily Revenue & Intake Trend Chart
                            </h2>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Day-by-day gross monetary velocity with cash counter and online split. Hover points to inspect details.
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          {/* Range Toggle */}
                          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-mono">
                            <button
                              type="button"
                              onClick={() => setDailyChartRange('14d')}
                              className={`px-3 py-1 rounded-lg transition font-bold cursor-pointer ${
                                dailyChartRange === '14d'
                                  ? 'bg-white text-teal-700 shadow-2xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              14 Days
                            </button>
                            <button
                              type="button"
                              onClick={() => setDailyChartRange('7d')}
                              className={`px-3 py-1 rounded-lg transition font-bold cursor-pointer ${
                                dailyChartRange === '7d'
                                  ? 'bg-white text-teal-700 shadow-2xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              7 Days
                            </button>
                          </div>

                          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-mono font-bold px-3 py-1.5 rounded-xl bg-teal-50 text-teal-800 border border-teal-200">
                            <Activity size={13} className="text-teal-600" />
                            Peak: {money(Math.max(...dailySeries.map(d => d.amount), 0))}
                          </span>
                        </div>
                      </div>

                      {/* SVG Interactive Chart Container */}
                      <div className="relative w-full overflow-hidden pt-2">
                        {/* Active Hover Detail Bar */}
                        {activeDailyHoverIndex !== null && dailySeries[activeDailyHoverIndex] && (
                          <div className="p-3 mb-3 rounded-2xl bg-teal-50/90 border border-teal-200 flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">
                                {dailySeries[activeDailyHoverIndex].label} ({dailySeries[activeDailyHoverIndex].day_name})
                              </span>
                              <span className="text-slate-400">|</span>
                              <span className="text-slate-600">
                                {dailySeries[activeDailyHoverIndex].tickets} {dailySeries[activeDailyHoverIndex].tickets === 1 ? 'ticket' : 'tickets'}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 font-mono">
                              <span className="text-slate-700">
                                Cash: <strong className="text-sky-700">{money(dailySeries[activeDailyHoverIndex].cash)}</strong>
                              </span>
                              <span className="text-slate-700">
                                Online: <strong className="text-teal-700">{money(dailySeries[activeDailyHoverIndex].online)}</strong>
                              </span>
                              <span className="font-bold text-teal-900 bg-white px-2 py-0.5 rounded-lg border border-teal-200">
                                Intake: {money(dailySeries[activeDailyHoverIndex].amount)}
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="w-full h-56 sm:h-64">
                          <svg
                            viewBox={`0 0 ${dailyAreaPoints.width} ${dailyAreaPoints.height}`}
                            className="w-full h-full overflow-visible select-none"
                          >
                            <defs>
                              <linearGradient id="dailyTealGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#0d9488" stopOpacity="0.25" />
                                <stop offset="95%" stopColor="#0d9488" stopOpacity="0.0" />
                              </linearGradient>
                            </defs>

                            {/* Horizontal Gridlines and Y Labels */}
                            {[0, 0.33, 0.66, 1].map((ratio, idx) => {
                              const y = dailyAreaPoints.padT + dailyAreaPoints.innerH * (1 - ratio);
                              const value = Math.round(maxDailyAmount * ratio);
                              return (
                                <g key={idx}>
                                  <line
                                    x1={dailyAreaPoints.padL}
                                    y1={y}
                                    x2={dailyAreaPoints.width - dailyAreaPoints.padR}
                                    y2={y}
                                    stroke="#e2e8f0"
                                    strokeDasharray="4 4"
                                    strokeWidth="1"
                                  />
                                  <text
                                    x={dailyAreaPoints.padL - 10}
                                    y={y + 3.5}
                                    textAnchor="end"
                                    className="text-[10px] font-mono fill-slate-400"
                                  >
                                    {value >= 1000 ? `₦${Math.round(value / 1000)}k` : `₦${value}`}
                                  </text>
                                </g>
                              );
                            })}

                            {/* Area Gradient Fill */}
                            {dailyAreaPoints.areaPath && (
                              <path d={dailyAreaPoints.areaPath} fill="url(#dailyTealGradient)" />
                            )}

                            {/* Line Curve */}
                            {dailyAreaPoints.linePath && (
                              <path
                                d={dailyAreaPoints.linePath}
                                fill="none"
                                stroke="#0d9488"
                                strokeWidth="2.75"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            )}

                            {/* Hover Guide Line */}
                            {activeDailyHoverIndex !== null && dailyAreaPoints.points[activeDailyHoverIndex] && (
                              <line
                                x1={dailyAreaPoints.points[activeDailyHoverIndex].x}
                                y1={dailyAreaPoints.padT}
                                x2={dailyAreaPoints.points[activeDailyHoverIndex].x}
                                y2={dailyAreaPoints.padT + dailyAreaPoints.innerH}
                                stroke="#0d9488"
                                strokeWidth="1.5"
                                strokeDasharray="3 3"
                              />
                            )}

                            {/* Data Points */}
                            {dailyAreaPoints.points.map((pt, i) => {
                              const isHovered = activeDailyHoverIndex === i;
                              const hasData = pt.data.amount > 0;
                              return (
                                <g
                                  key={pt.data.date}
                                  className="cursor-pointer"
                                  onMouseEnter={() => setActiveDailyHoverIndex(i)}
                                  onMouseLeave={() => setActiveDailyHoverIndex(null)}
                                >
                                  {/* Invisible expanded hit target */}
                                  <circle cx={pt.x} cy={pt.y} r={18} fill="transparent" />

                                  {/* Outer halo when hovered or active */}
                                  {isHovered && (
                                    <circle cx={pt.x} cy={pt.y} r={9} fill="#0d9488" opacity={0.25} />
                                  )}

                                  {/* Point circle */}
                                  <circle
                                    cx={pt.x}
                                    cy={pt.y}
                                    r={isHovered ? 5.5 : hasData ? 4 : 2.5}
                                    fill={hasData ? '#0d9488' : '#cbd5e1'}
                                    stroke="#ffffff"
                                    strokeWidth={hasData ? 2 : 1}
                                    className="transition-all duration-150"
                                  />

                                  {/* X-axis Label */}
                                  <text
                                    x={pt.x}
                                    y={dailyAreaPoints.height - 10}
                                    textAnchor="middle"
                                    className={`text-[10px] font-mono transition-colors ${
                                      isHovered
                                        ? 'fill-teal-700 font-bold'
                                        : hasData
                                        ? 'fill-slate-700 font-semibold'
                                        : 'fill-slate-400'
                                    }`}
                                  >
                                    {pt.data.label}
                                  </text>
                                </g>
                              );
                            })}
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Visual Analytics Row: Monthly Bar Chart & Channels Donut Chart */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      {/* Left 7 Cols: Monthly 6-Month Comparison Bar Chart */}
                      <div className="lg:col-span-7 p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <CalendarDays className="text-indigo-600" size={18} />
                              <h2 className="text-base font-bold text-slate-900">
                                Monthly Revenue Comparison (Last 6 Months)
                              </h2>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Gross ticket collections compared against refunds across financial cycles.
                            </p>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] font-mono">
                            <span className="flex items-center gap-1.5 text-slate-600">
                              <span className="w-2.5 h-2.5 rounded-sm bg-teal-600 inline-block" /> Gross
                            </span>
                            <span className="flex items-center gap-1.5 text-slate-600">
                              <span className="w-2.5 h-2.5 rounded-sm bg-rose-400 inline-block" /> Refunds
                            </span>
                          </div>
                        </div>

                        {/* Active Monthly Hover Detail */}
                        {activeMonthlyHoverIndex !== null && monthlySeries[activeMonthlyHoverIndex] && (
                          <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-between text-xs font-mono">
                            <strong className="text-indigo-900">
                              {monthlySeries[activeMonthlyHoverIndex].label}
                            </strong>
                            <div className="flex items-center gap-3">
                              <span className="text-slate-600">
                                Gross: <strong className="text-teal-700">{money(monthlySeries[activeMonthlyHoverIndex].gross)}</strong>
                              </span>
                              <span className="text-slate-600">
                                Net: <strong className="text-emerald-700">{money(monthlySeries[activeMonthlyHoverIndex].net)}</strong>
                              </span>
                              <span className="text-slate-500">
                                ({monthlySeries[activeMonthlyHoverIndex].tickets} tickets)
                              </span>
                            </div>
                          </div>
                        )}

                        {/* SVG Bar Chart */}
                        <div className="w-full h-52">
                          <svg viewBox="0 0 540 180" className="w-full h-full overflow-visible select-none">
                            {/* Horizontal Gridlines */}
                            {[0, 0.5, 1].map((ratio, idx) => {
                              const y = 20 + 120 * (1 - ratio);
                              const val = Math.round(maxMonthlyGross * ratio);
                              return (
                                <g key={idx}>
                                  <line x1="45" y1={y} x2="520" y2={y} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                                  <text x="38" y={y + 3.5} textAnchor="end" className="text-[10px] font-mono fill-slate-400">
                                    {val >= 1000 ? `₦${Math.round(val / 1000)}k` : `₦${val}`}
                                  </text>
                                </g>
                              );
                            })}

                            {/* Monthly Columns */}
                            {monthlySeries.map((m, i) => {
                              const totalBars = monthlySeries.length;
                              const innerW = 475;
                              const slotW = innerW / totalBars;
                              const barW = Math.min(36, slotW * 0.55);
                              const centerX = 45 + (i + 0.5) * slotW;
                              const barX = centerX - barW / 2;

                              const maxH = 120;
                              const grossH = maxMonthlyGross > 0 ? (m.gross / maxMonthlyGross) * maxH : 0;
                              const refundH = maxMonthlyGross > 0 ? (m.refunds / maxMonthlyGross) * maxH : 0;
                              const grossY = 20 + maxH - grossH;
                              const isCurrentMonth = i === totalBars - 1;
                              const isHovered = activeMonthlyHoverIndex === i;

                              return (
                                <g
                                  key={m.month}
                                  className="cursor-pointer"
                                  onMouseEnter={() => setActiveMonthlyHoverIndex(i)}
                                  onMouseLeave={() => setActiveMonthlyHoverIndex(null)}
                                >
                                  {/* Background Pillar Track */}
                                  <rect
                                    x={barX}
                                    y={20}
                                    width={barW}
                                    height={maxH}
                                    rx={5}
                                    fill="#f8fafc"
                                    className="hover:fill-slate-100 transition-colors"
                                  />

                                  {/* Gross Revenue Column */}
                                  {grossH > 0 && (
                                    <rect
                                      x={barX}
                                      y={grossY}
                                      width={barW}
                                      height={grossH}
                                      rx={4}
                                      fill={isCurrentMonth ? '#0d9488' : isHovered ? '#14b8a6' : '#94a3b8'}
                                      className="transition-all duration-200"
                                    />
                                  )}

                                  {/* Refund Bar (if any) */}
                                  {refundH > 0 && (
                                    <rect
                                      x={barX}
                                      y={20 + maxH - refundH}
                                      width={barW}
                                      height={refundH}
                                      rx={3}
                                      fill="#fb7185"
                                      opacity={0.9}
                                    />
                                  )}

                                  {/* Value text label on top of bar if > 0 */}
                                  {m.gross > 0 && (
                                    <text
                                      x={centerX}
                                      y={grossY - 5}
                                      textAnchor="middle"
                                      className="text-[9px] font-mono font-bold fill-teal-800"
                                    >
                                      {m.gross >= 1000 ? `₦${Math.round(m.gross / 1000)}k` : `₦${m.gross}`}
                                    </text>
                                  )}

                                  {/* X-axis Month Label */}
                                  <text
                                    x={centerX}
                                    y={160}
                                    textAnchor="middle"
                                    className={`text-[11px] font-mono transition-colors ${
                                      isCurrentMonth
                                        ? 'fill-teal-700 font-black'
                                        : isHovered
                                        ? 'fill-slate-900 font-bold'
                                        : 'fill-slate-500'
                                    }`}
                                  >
                                    {m.short_label}
                                  </text>
                                </g>
                              );
                            })}
                          </svg>
                        </div>
                      </div>

                      {/* Right 5 Cols: Payment Channels Donut & Legend */}
                      <div className="lg:col-span-5 p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <PieChart className="text-teal-600" size={18} />
                            <h2 className="text-base font-bold text-slate-900">
                              Channel Distribution
                            </h2>
                          </div>
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                            {paymentStats.length} Channels
                          </span>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center justify-around gap-4 pt-1">
                          {/* Donut Visual */}
                          <div className="relative w-36 h-36 shrink-0">
                            <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
                              {/* Background Ring */}
                              <circle cx="70" cy="70" r="48" fill="none" stroke="#f1f5f9" strokeWidth="16" />
                              {/* Segments */}
                              {donutSegments.map(seg => (
                                <circle
                                  key={seg.name}
                                  cx="70"
                                  cy="70"
                                  r="48"
                                  fill="none"
                                  stroke={seg.color}
                                  strokeWidth="16"
                                  strokeDasharray={seg.strokeDash}
                                  strokeDashoffset={seg.offset}
                                  className="transition-all duration-500"
                                />
                              ))}
                            </svg>
                            {/* Donut Center Label */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                              <span className="text-[9px] uppercase font-mono text-slate-400 tracking-wider">Total</span>
                              <span className="text-xs font-black font-mono text-slate-900 leading-tight max-w-[90px] truncate px-1">
                                {money(grossCollected)}
                              </span>
                            </div>
                          </div>

                          {/* Donut Legend Items */}
                          <div className="space-y-2 w-full max-w-[200px]">
                            {donutSegments.map(seg => (
                              <div key={seg.name} className="flex items-center justify-between text-xs font-mono">
                                <div className="flex items-center gap-2 truncate">
                                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                                  <span className="text-slate-700 truncate">{seg.name}</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="font-bold text-slate-900">{seg.pct}%</span>
                                  <span className="text-slate-400 text-[10px]">({money(seg.amount)})</span>
                                </div>
                              </div>
                            ))}
                            {donutSegments.length === 0 && (
                              <p className="text-xs text-slate-500 text-center py-4">No channel data available.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ================= SECTION 3: ROUTE LEADERBOARD & RECENT TRANSACTIONS ================= */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Route Performance Leaderboard */}
                    <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <TrendingUp className="text-amber-600" size={18} />
                            Top Revenue Routes
                          </h2>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Inter-state passenger routes generating highest ticket revenue.
                          </p>
                        </div>
                        <span className="text-xs font-mono text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 font-bold">
                          Leaderboard
                        </span>
                      </div>

                      <div className="space-y-3">
                        {(finance?.by_route || []).slice(0, 4).map((route, index) => {
                          const topAmount = Number(finance?.by_route?.[0]?.total_amount || 1);
                          const pct = Math.round((Number(route.total_amount) / topAmount) * 100);
                          return (
                            <div
                              key={route.route_name}
                              className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 hover:border-slate-300 transition"
                            >
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-mono text-[10px] font-bold flex items-center justify-center">
                                    #{index + 1}
                                  </span>
                                  <strong className="text-slate-800 truncate max-w-[220px]">
                                    {route.route_name}
                                  </strong>
                                </div>
                                <strong className="font-mono text-slate-900 text-sm">
                                  {money(route.total_amount)}
                                </strong>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                                  <div
                                    style={{ width: `${pct}%` }}
                                    className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full"
                                  />
                                </div>
                                <span className="text-[11px] font-mono text-slate-500 shrink-0">
                                  {route.count} seats
                                </span>
                              </div>
                            </div>
                          );
                        })}
                        {(!finance?.by_route || finance.by_route.length === 0) && (
                          <p className="text-xs text-slate-500 py-6 text-center">
                            No route revenue transactions logged yet.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Live Transaction Ledger Stream */}
                    <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <Receipt className="text-teal-600" size={18} />
                            Recent Live Transactions
                          </h2>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Live chronological stream of passenger ticket sales and settlements.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => switchTab('transactions')}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-600 hover:text-teal-700 transition cursor-pointer"
                        >
                          <span>View All</span>
                          <ChevronRight size={14} />
                        </button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-mono text-[11px] uppercase">
                              <th className="py-2.5 px-3">PNR</th>
                              <th className="py-2.5 px-3">Passenger</th>
                              <th className="py-2.5 px-3 text-right">Fare Paid</th>
                              <th className="py-2.5 px-3">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-sans">
                            {(finance?.recent_transactions || []).slice(0, 5).map(t => (
                              <tr key={t.id} className="hover:bg-slate-50/80 transition">
                                <td className="py-3 px-3 font-mono font-bold text-teal-700">
                                  <button
                                    type="button"
                                    onClick={() => handleCopyPnr(t.pnr_code)}
                                    className="hover:underline flex items-center gap-1 cursor-pointer"
                                    title="Click to copy PNR"
                                  >
                                    <span>{t.pnr_code}</span>
                                    {copiedPnr === t.pnr_code ? (
                                      <Check size={11} className="text-emerald-600" />
                                    ) : (
                                      <Copy size={11} className="text-slate-400 hover:text-teal-600" />
                                    )}
                                  </button>
                                </td>
                                <td className="py-3 px-3 font-medium text-slate-800 truncate max-w-[140px]">
                                  {t.passenger_name}
                                </td>
                                <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                                  {money(t.fare_paid)}
                                </td>
                                <td className="py-3 px-3">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      t.status === 'Confirmed' || t.status === 'Issued & Paid'
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : t.status === 'Boarded'
                                        ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                        : ['Cancellation Requested', 'Payment Review', 'Refund Pending'].includes(t.status)
                                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                        : t.status === 'Refunded'
                                        ? 'bg-slate-100 text-slate-600 border border-slate-200'
                                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                                    }`}
                                  >
                                    {t.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                            {(!finance?.recent_transactions || finance.recent_transactions.length === 0) && (
                              <tr>
                                <td colSpan={4} className="py-6 text-center text-slate-500">
                                  No transactions found.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ==================== TAB 2: REFUND REVIEW QUEUE ==================== */}
              {activeTab === 'refunds' && (
                <div className="space-y-6">
                  {/* Header and Filter Controls */}
                  <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                          <AlertCircle className="text-amber-600" size={20} />
                          Refund Review & Authorization Desk
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">
                          Process customer cancellation requests and gateway payment review items with idempotency protection.
                        </p>
                      </div>

                      {/* Filter and Search */}
                      <div className="flex flex-wrap items-center gap-3">
                        {/* Channel Filter Pills */}
                        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs">
                          {(['all', 'Online', 'Cash'] as const).map(ch => (
                            <button
                              key={ch}
                              type="button"
                              onClick={() => setRefundFilterChannel(ch)}
                              className={`px-3 py-1.5 rounded-lg font-bold transition capitalize cursor-pointer ${
                                refundFilterChannel === ch
                                  ? 'bg-amber-500 text-white shadow-2xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              {ch === 'all' ? 'All Channels' : ch}
                            </button>
                          ))}
                        </div>

                        {/* Search Bar */}
                        <div className="relative min-w-[220px]">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Search PNR, Name, Phone..."
                            value={refundSearch}
                            onChange={e => setRefundSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Refund Queue List */}
                  <div className="space-y-4">
                    {pendingTickets.map(ticket => (
                      <div
                        key={ticket.id}
                        className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/90 hover:border-amber-400/80 transition-all shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5 group"
                      >
                        {/* Left: Ticket Details */}
                        <div className="space-y-2 flex-1">
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <span className="font-mono text-base font-black text-amber-700 tracking-wider">
                              {ticket.pnr_code}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyPnr(ticket.pnr_code)}
                              title="Copy PNR Code"
                              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition cursor-pointer"
                            >
                              {copiedPnr === ticket.pnr_code ? (
                                <Check size={13} className="text-emerald-600" />
                              ) : (
                                <Copy size={13} />
                              )}
                            </button>
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono bg-amber-50 text-amber-800 border border-amber-200">
                              {ticket.status}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 text-slate-700 border border-slate-200">
                              {ticket.payment_method || 'Online'}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-600">
                            <div>
                              <span className="text-slate-400 block text-[10px] uppercase font-mono">Passenger</span>
                              <strong className="text-slate-900">{ticket.passenger_name}</strong>
                              {ticket.passenger_phone && (
                                <span className="text-slate-500 block text-[11px] font-mono">
                                  {ticket.passenger_phone}
                                </span>
                              )}
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px] uppercase font-mono">Route & Vehicle</span>
                              <span className="text-slate-800 block truncate">{ticket.route_name || 'Express Trip'}</span>
                              <span className="text-slate-500 block text-[11px]">
                                Seat {ticket.seat_number} ({ticket.vehicle_type || 'Standard Coach'})
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px] uppercase font-mono">Requested At</span>
                              <span className="text-slate-600 block font-mono text-[11px]">
                                {dateTime(ticket.updated_at || ticket.created_at)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Right: Fare Amount & Action Trigger */}
                        <div className="flex sm:flex-col items-center sm:items-end justify-between gap-3 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                          <div className="text-left sm:text-right">
                            <span className="text-[10px] uppercase font-mono text-slate-400 block">Refund Value</span>
                            <span className="text-xl font-black font-mono text-slate-900">
                              {money(ticket.fare_paid)}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setRefundTicket(ticket);
                              setRefundReason(`Approved refund for passenger ${ticket.passenger_name} (${ticket.pnr_code})`);
                              setCashConfirmed(ticket.payment_method === 'Cash');
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs shadow-xs transition-transform active:scale-95 cursor-pointer"
                          >
                            <span>Review & Authorize</span>
                            <ChevronRight size={15} />
                          </button>
                        </div>
                      </div>
                    ))}

                    {pendingTickets.length === 0 && (
                      <div className="p-12 rounded-3xl bg-white border border-slate-200/80 text-center space-y-3">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
                          <CheckCircle2 size={24} />
                        </div>
                        <h3 className="text-base font-bold text-slate-900">Refund Queue Clear</h3>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto">
                          All passenger travel refund requests and payment discrepancies have been resolved.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ==================== TAB 3: POS CASH HANDOVER VAULT ==================== */}
              {activeTab === 'handover' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left 1-Col: Handover Submission Desk */}
                  <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-6">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Banknote className="text-sky-600" size={20} />
                        Record Till Cash Handover
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">
                        Physically accept and reconcile counter drawer collections with cryptographic idempotency.
                      </p>
                    </div>

                    <form onSubmit={handleSubmitHandover} className="space-y-4">
                      {/* Amount Field */}
                      <div className="space-y-1.5">
                        <label htmlFor="handover-amount-input" className="text-xs font-semibold text-slate-700 block">
                          Cash Amount (NGN) <span className="text-sky-600">*</span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-400">
                            ₦
                          </span>
                          <input
                            id="handover-amount-input"
                            type="number"
                            step="0.01"
                            min="1"
                            required
                            placeholder="0.00"
                            value={handoverAmount}
                            onChange={e => setHandoverAmount(e.target.value)}
                            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-mono font-bold text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          />
                        </div>
                      </div>

                      {/* Quick Increment Chips */}
                      <div className="flex flex-wrap gap-2">
                        {[10000, 25000, 50000, 100000, 200000].map(val => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setHandoverAmount(val.toString())}
                            className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-[11px] font-mono text-slate-700 border border-slate-200 transition cursor-pointer"
                          >
                            +₦{(val / 1000).toLocaleString()}k
                          </button>
                        ))}
                      </div>

                      {/* Notes & Station Terminal */}
                      <div className="space-y-1.5">
                        <label htmlFor="handover-notes-input" className="text-xs font-semibold text-slate-700 block">
                          Handover Notes & Terminal Shift <span className="text-sky-600">*</span>
                        </label>
                        <textarea
                          id="handover-notes-input"
                          rows={3}
                          required
                          placeholder="e.g. Lagos Jibowu Terminal 1 morning shift cash drawer balance reconciled."
                          value={handoverNotes}
                          onChange={e => setHandoverNotes(e.target.value)}
                          className="w-full p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 resize-none"
                        />
                      </div>

                      {/* Security Idempotency Display */}
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[10px] font-mono text-slate-500 space-y-1">
                        <div className="flex items-center justify-between text-slate-400">
                          <span>Idempotency Protection</span>
                          <Lock size={11} className="text-teal-600" />
                        </div>
                        <span className="truncate block text-slate-600">{handoverKey.current}</span>
                      </div>

                      {/* Submit Action */}
                      <button
                        type="submit"
                        disabled={submittingHandover}
                        className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-black text-xs shadow-xs transition disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Banknote size={16} />
                        <span>{submittingHandover ? 'Recording Handover…' : 'Record Official Handover'}</span>
                      </button>
                    </form>
                  </div>

                  {/* Right 2-Cols: Verified Handover Feed */}
                  <div className="lg:col-span-2 p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                          <Receipt className="text-sky-600" size={18} />
                          Verified Cash Handover Records
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Terminal shifts reconciled with Treasury Vault custody.
                        </p>
                      </div>
                      <span className="text-xs font-mono font-bold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-full border border-sky-200">
                        Total Vault: {money(handoverTotal)}
                      </span>
                    </div>

                    {/* Handover List */}
                    <div className="space-y-3">
                      {logs
                        .filter(l => l.action.toLowerCase().includes('handover'))
                        .map(log => (
                          <div
                            key={log.id}
                            className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 hover:border-slate-300 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-900">{log.user_name}</span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-200 text-slate-700">
                                  {log.role}
                                </span>
                                <span className="text-[11px] font-mono text-slate-500">
                                  {dateTime(log.created_at)}
                                </span>
                              </div>
                              <p className="text-xs text-slate-700 font-sans">{log.details}</p>
                              {log.event_key && (
                                <span className="text-[10px] font-mono text-slate-400 block truncate max-w-sm">
                                  Key: {log.event_key}
                                </span>
                              )}
                            </div>

                            <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2">
                              <span className="text-base font-black font-mono text-sky-700">
                                {money(log.amount)}
                              </span>
                              <button
                                type="button"
                                onClick={() => setSelectedHandoverLog(log)}
                                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 hover:text-slate-900 border border-slate-200 transition flex items-center gap-1.5 cursor-pointer"
                              >
                                <Printer size={12} />
                                <span>Slip</span>
                              </button>
                            </div>
                          </div>
                        ))}

                      {logs.filter(l => l.action.toLowerCase().includes('handover')).length === 0 && (
                        <p className="text-xs text-slate-500 py-8 text-center">
                          No cash handovers recorded in current cycle.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ==================== TAB 4: COMPLIANCE & AUDIT TRAIL ==================== */}
              {activeTab === 'audits' && (
                <div className="space-y-6">
                  {/* Search and Filters Bar */}
                  <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                          <ShieldCheck className="text-emerald-600" size={20} />
                          Operational & Financial Audit Ledger
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">
                          Immutable event log of monetary movements, ticket status changes, and operator actions.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        {/* Category Filter Chips */}
                        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs">
                          {(['all', 'handover', 'refund', 'system'] as const).map(cat => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setAuditCategory(cat)}
                              className={`px-3 py-1.5 rounded-lg font-bold transition capitalize cursor-pointer ${
                                auditCategory === cat
                                  ? 'bg-emerald-600 text-white shadow-2xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              {cat === 'all' ? 'All Events' : cat}
                            </button>
                          ))}
                        </div>

                        {/* Search Bar */}
                        <div className="relative min-w-[220px]">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Search officer, action, key..."
                            value={auditSearch}
                            onChange={e => setAuditSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>

                        {/* Export CSV */}
                        <button
                          type="button"
                          onClick={handleExportCsv}
                          className="px-3.5 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <Download size={13} />
                          <span>CSV</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Audit Table */}
                  <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-mono text-[11px] uppercase">
                            <th className="py-3 px-4">Timestamp (WAT)</th>
                            <th className="py-3 px-4">Officer / Staff</th>
                            <th className="py-3 px-4">Role</th>
                            <th className="py-3 px-4">Action</th>
                            <th className="py-3 px-4 text-right">Amount</th>
                            <th className="py-3 px-4">Details & Event Key</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-sans">
                          {filteredLogs.map(log => (
                            <tr key={log.id} className="hover:bg-slate-50/80 transition">
                              <td className="py-3.5 px-4 font-mono text-slate-500 whitespace-nowrap">
                                {dateTime(log.created_at)}
                              </td>
                              <td className="py-3.5 px-4 font-bold text-slate-900">
                                {log.user_name || 'System Operator'}
                              </td>
                              <td className="py-3.5 px-4">
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono uppercase bg-slate-100 text-slate-700 border border-slate-200 font-semibold">
                                  {log.role}
                                </span>
                              </td>
                              <td className="py-3.5 px-4">
                                <span
                                  className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                    log.action.toLowerCase().includes('handover')
                                      ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                      : log.action.toLowerCase().includes('refund')
                                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  }`}
                                >
                                  {log.action}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                                {Number(log.amount) > 0 ? money(log.amount) : '—'}
                              </td>
                              <td className="py-3.5 px-4 text-slate-700 max-w-xs truncate">
                                <span>{log.details || 'Operational record'}</span>
                                {log.event_key && (
                                  <span className="text-[10px] font-mono text-slate-400 block truncate mt-0.5">
                                    {log.event_key}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                          {filteredLogs.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-slate-500">
                                No audit logs match current search filters.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ==================== TAB 5: ALL TRANSACTIONS ==================== */}
              {activeTab === 'transactions' && (
                <div className="space-y-6">
                  {/* Filter Bar */}
                  <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                          <Receipt className="text-purple-600" size={20} />
                          All System Tickets & Fare Registry
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">
                          Direct access to ticket issuance, payment reconciliation, and boarding lifecycle.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        {/* Status Dropdown */}
                        <select
                          value={transactionStatusFilter}
                          onChange={e => setTransactionStatusFilter(e.target.value)}
                          className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        >
                          <option value="all">All Statuses</option>
                          <option value="Confirmed">Confirmed</option>
                          <option value="Boarded">Boarded</option>
                          <option value="Cancellation Requested">Cancellation Requested</option>
                          <option value="Payment Review">Payment Review</option>
                          <option value="Refunded">Refunded</option>
                          <option value="Expired">Expired</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>

                        {/* Search */}
                        <div className="relative min-w-[220px]">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Search PNR, Passenger, Route..."
                            value={transactionSearch}
                            onChange={e => setTransactionSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Transactions Table */}
                  <div className="p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-mono text-[11px] uppercase">
                            <th className="py-3 px-4">PNR</th>
                            <th className="py-3 px-4">Passenger</th>
                            <th className="py-3 px-4">Route</th>
                            <th className="py-3 px-4">Seat</th>
                            <th className="py-3 px-4">Payment Method</th>
                            <th className="py-3 px-4 text-right">Fare Paid</th>
                            <th className="py-3 px-4">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-sans">
                          {filteredTransactions.map(t => (
                            <tr key={t.id} className="hover:bg-slate-50/80 transition">
                              <td className="py-3.5 px-4 font-mono font-bold text-teal-700">
                                <button
                                  type="button"
                                  onClick={() => handleCopyPnr(t.pnr_code)}
                                  className="hover:underline flex items-center gap-1.5 cursor-pointer"
                                  title="Click to copy PNR"
                                >
                                  <span>{t.pnr_code}</span>
                                  {copiedPnr === t.pnr_code ? (
                                    <Check size={12} className="text-emerald-600" />
                                  ) : (
                                    <Copy size={12} className="text-slate-400 hover:text-teal-600" />
                                  )}
                                </button>
                              </td>
                              <td className="py-3.5 px-4 font-semibold text-slate-900">
                                {t.passenger_name}
                              </td>
                              <td className="py-3.5 px-4 text-slate-600 max-w-[200px] truncate">
                                {t.route_name || 'Express Route'}
                              </td>
                              <td className="py-3.5 px-4 font-mono text-slate-500">
                                Seat #{t.seat_number}
                              </td>
                              <td className="py-3.5 px-4">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 text-slate-700 border border-slate-200">
                                  {t.payment_method || 'Online'}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                                {money(t.fare_paid)}
                              </td>
                              <td className="py-3.5 px-4">
                                <span
                                  className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                    t.status === 'Confirmed' || t.status === 'Issued & Paid'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : t.status === 'Boarded'
                                      ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                      : ['Cancellation Requested', 'Payment Review', 'Refund Pending'].includes(t.status)
                                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                      : t.status === 'Refunded'
                                      ? 'bg-slate-100 text-slate-600 border border-slate-200'
                                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                                  }`}
                                >
                                  {t.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {filteredTransactions.length === 0 && (
                            <tr>
                              <td colSpan={7} className="py-8 text-center text-slate-500">
                                No tickets match current search filters.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* ==================== MODAL 1: PROCESS REFUND DIALOG ==================== */}
      {refundTicket && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="refund-modal-title"
        >
          <div className="w-full max-w-lg rounded-3xl bg-white border border-slate-200 shadow-2xl p-6 sm:p-8 space-y-6 font-sans text-slate-900">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200">
                  <AlertCircle size={20} />
                </div>
                <div>
                  <h3 id="refund-modal-title" className="text-base font-bold text-slate-900">
                    Authorize Ticket Refund
                  </h3>
                  <p className="text-xs text-slate-500">
                    Execute settlement for PNR{' '}
                    <span className="font-mono text-amber-700 font-bold">{refundTicket.pnr_code}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRefundTicket(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Ticket Summary Card */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs text-slate-600">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Passenger Name:</span>
                <strong className="text-slate-900">{refundTicket.passenger_name}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Route & Seat:</span>
                <span className="text-slate-700">
                  {refundTicket.route_name} (Seat #{refundTicket.seat_number})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Payment Channel:</span>
                <span className="font-mono font-bold text-slate-800">
                  {refundTicket.payment_method || 'Online'}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-sm">
                <span className="text-slate-700 font-semibold">Refund Amount Due:</span>
                <strong className="font-mono text-base text-amber-700 font-black">
                  {money(refundTicket.fare_paid)}
                </strong>
              </div>
            </div>

            {/* Refund Execution Form */}
            <form onSubmit={handleProcessRefund} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="refund-reason-input" className="text-xs font-semibold text-slate-700 block">
                  Official Refund Reason & Audit Note <span className="text-amber-600">*</span>
                </label>
                <textarea
                  id="refund-reason-input"
                  required
                  minLength={5}
                  rows={3}
                  value={refundReason}
                  onChange={e => setRefundReason(e.target.value)}
                  placeholder="Provide audit reason for authorizing this refund..."
                  className="w-full p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                />
              </div>

              {/* Cash Confirmation Checkbox if payment method was cash */}
              {refundTicket.payment_method === 'Cash' && (
                <label className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cashConfirmed}
                    onChange={e => setCashConfirmed(e.target.checked)}
                    className="mt-0.5 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                  />
                  <span>
                    <strong>Cash Disbursed Confirmation:</strong> I verify that cash of{' '}
                    <strong>{money(refundTicket.fare_paid)}</strong> was physically handed back to passenger{' '}
                    <strong>{refundTicket.passenger_name}</strong> or their authorized kin.
                  </span>
                </label>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRefundTicket(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processingRefund}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs shadow-xs transition disabled:opacity-60 flex items-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 size={16} />
                  <span>{processingRefund ? 'Authorizing Refund…' : 'Confirm & Settle Refund'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL 2: PRINTABLE HANDOVER SLIP ==================== */}
      {selectedHandoverLog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-3xl bg-white text-slate-950 border border-slate-200 shadow-2xl p-6 sm:p-8 space-y-6 font-sans">
            {/* Slip Header */}
            <div className="text-center border-b-2 border-dashed border-slate-300 pb-4">
              <span className="text-xl font-black tracking-tight text-slate-900 block">
                Transit<span className="text-teal-600">Hub</span> Express
              </span>
              <span className="text-[10px] uppercase font-mono tracking-widest text-slate-500 font-bold block mt-0.5">
                Official Till Cash Handover Voucher
              </span>
              <p className="text-xs text-slate-600 font-mono mt-2">
                Slip Ref: #{selectedHandoverLog.id} • {dateTime(selectedHandoverLog.created_at)}
              </p>
            </div>

            {/* Voucher Body */}
            <div className="space-y-3 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">Handover Staff:</span>
                <strong className="text-slate-900">{selectedHandoverLog.user_name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Staff Role:</span>
                <span className="uppercase text-slate-700">{selectedHandoverLog.role}</span>
              </div>
              <div className="flex justify-between text-base border-t border-b border-slate-200 py-2 my-2 font-black">
                <span>Verified Cash Value:</span>
                <span className="text-teal-700">{money(selectedHandoverLog.amount)}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Shift Notes:</span>
                <p className="text-slate-800 font-sans text-xs mt-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  {selectedHandoverLog.details}
                </p>
              </div>
              {selectedHandoverLog.event_key && (
                <div>
                  <span className="text-slate-400 block text-[9px] uppercase">Security Event Key:</span>
                  <span className="text-[10px] text-slate-500 truncate block">
                    {selectedHandoverLog.event_key}
                  </span>
                </div>
              )}
            </div>

            {/* Signature Blocks */}
            <div className="grid grid-cols-2 gap-6 pt-4 border-t-2 border-dashed border-slate-300 text-center text-[10px] font-mono text-slate-500">
              <div className="border-t border-slate-400 pt-1">
                <span>Counter Attendant</span>
              </div>
              <div className="border-t border-slate-400 pt-1">
                <span>Treasury Vault Custodian</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setSelectedHandoverLog(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-md shadow-teal-600/20 cursor-pointer"
              >
                <Printer size={14} />
                <span>Print Voucher</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FinancePortal;
