<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FinanceController extends Controller
{
    public function getAuditLogs(Request $request)
    {
        $data = $request->validate(['page' => 'sometimes|integer|min:1']);
        $logs = AuditLog::latest('id')->paginate(100);
        return response()->json(['status' => 'success', 'logs' => $logs->items(), 'current_page' => $logs->currentPage(), 'last_page' => $logs->lastPage()]);
    }

    public function summary()
    {
        $now = now();
        $todayStart = $now->copy()->startOfDay();
        $todayEnd = $now->copy()->endOfDay();
        $yesterdayStart = $now->copy()->subDay()->startOfDay();
        $yesterdayEnd = $now->copy()->subDay()->endOfDay();
        $monthStart = $now->copy()->startOfMonth();
        $monthEnd = $now->copy()->endOfMonth();
        $lastMonthStart = $now->copy()->subMonth()->startOfMonth();
        $lastMonthEnd = $now->copy()->subMonth()->endOfMonth();

        // 1. Today/Daily calculations
        $todayGross = (float) Ticket::whereBetween('created_at', [$todayStart, $todayEnd])->sum('fare_paid');
        $todayTickets = Ticket::whereBetween('created_at', [$todayStart, $todayEnd])->count();
        $yesterdayGross = (float) Ticket::whereBetween('created_at', [$yesterdayStart, $yesterdayEnd])->sum('fare_paid');
        $todayCash = (float) Ticket::whereBetween('created_at', [$todayStart, $todayEnd])->where('payment_method', 'Cash')->sum('fare_paid');
        $todayOnline = (float) Ticket::whereBetween('created_at', [$todayStart, $todayEnd])->where('payment_method', '!=', 'Cash')->sum('fare_paid');
        $dodChangePct = $yesterdayGross > 0 ? round((($todayGross - $yesterdayGross) / $yesterdayGross) * 100, 1) : ($todayGross > 0 ? 100.0 : 0.0);
        $todayAvgFare = $todayTickets > 0 ? round($todayGross / $todayTickets, 2) : 0;

        // 2. Month-to-Date (MTD) calculations
        $monthGross = (float) Ticket::whereBetween('created_at', [$monthStart, $monthEnd])->sum('fare_paid');
        $monthTickets = Ticket::whereBetween('created_at', [$monthStart, $monthEnd])->count();
        $monthRefunds = (float) Ticket::whereBetween('refunded_at', [$monthStart, $monthEnd])->sum('amount_due');
        $monthNet = max(0, $monthGross - $monthRefunds);
        $lastMonthGross = (float) Ticket::whereBetween('created_at', [$lastMonthStart, $lastMonthEnd])->sum('fare_paid');
        $momChangePct = $lastMonthGross > 0 ? round((($monthGross - $lastMonthGross) / $lastMonthGross) * 100, 1) : ($monthGross > 0 ? 100.0 : 0.0);
        $daysInMonth = (int) $now->daysInMonth;
        $daysPassed = (int) $now->day;
        $avgDaily = $daysPassed > 0 ? round($monthGross / $daysPassed, 2) : 0;
        $projectedGross = round($avgDaily * $daysInMonth, 2);

        // 3. Daily trend for the past 14 days (chronological)
        $dailyTrend = [];
        for ($i = 13; $i >= 0; $i--) {
            $d = $now->copy()->subDays($i);
            $start = $d->copy()->startOfDay();
            $end = $d->copy()->endOfDay();
            $dayTickets = Ticket::whereBetween('created_at', [$start, $end])->get();
            $dailyTrend[] = [
                'date' => $d->toDateString(),
                'label' => $d->format('d M'),
                'day_name' => $d->format('D'),
                'amount' => (float) $dayTickets->sum('fare_paid'),
                'tickets' => $dayTickets->count(),
                'cash' => (float) $dayTickets->where('payment_method', 'Cash')->sum('fare_paid'),
                'online' => (float) $dayTickets->where('payment_method', '!=', 'Cash')->sum('fare_paid'),
            ];
        }

        // 4. Monthly trend for the past 6 months (chronological)
        $monthlyTrend = [];
        for ($m = 5; $m >= 0; $m--) {
            $d = $now->copy()->subMonths($m);
            $start = $d->copy()->startOfMonth();
            $end = $d->copy()->endOfMonth();
            $mTickets = Ticket::whereBetween('created_at', [$start, $end])->get();
            $mRefunded = (float) Ticket::whereBetween('refunded_at', [$start, $end])->sum('amount_due');
            $mGross = (float) $mTickets->sum('fare_paid');
            $monthlyTrend[] = [
                'month' => $d->format('Y-m'),
                'label' => $d->format('M Y'),
                'short_label' => $d->format('M'),
                'gross' => $mGross,
                'net' => max(0, $mGross - $mRefunded),
                'refunds' => $mRefunded,
                'tickets' => $mTickets->count(),
            ];
        }

        return response()->json([
            'status' => 'success',
            'collected' => number_format((float) Ticket::sum('fare_paid'), 2, '.', ''),
            'refund_pending' => number_format((float) Ticket::whereIn('status', ['Cancellation Requested', 'Payment Review', 'Refund Pending'])->sum('fare_paid'), 2, '.', ''),
            'refunded' => number_format((float) Ticket::whereNotNull('refunded_at')->sum('amount_due'), 2, '.', ''),
            'tickets' => Ticket::whereIn('status', ['Cancellation Requested', 'Payment Review', 'Refund Pending'])->latest('id')->limit(100)->get(),
            'recent_transactions' => Ticket::latest('id')->limit(50)->get(),
            'by_payment_method' => Ticket::select('payment_method', DB::raw('SUM(fare_paid) as total_amount'), DB::raw('COUNT(*) as count'))
                ->whereNotNull('payment_method')
                ->groupBy('payment_method')
                ->get(),
            'by_route' => Ticket::select('route_name', DB::raw('SUM(fare_paid) as total_amount'), DB::raw('COUNT(*) as count'))
                ->whereNotNull('route_name')
                ->groupBy('route_name')
                ->orderByDesc('total_amount')
                ->limit(10)
                ->get(),
            'total_tickets_count' => Ticket::count(),
            'total_handover_amount' => number_format((float) AuditLog::where('action', 'Cash handover submitted')->sum('amount'), 2, '.', ''),
            'daily_stats' => [
                'today_gross' => $todayGross,
                'today_tickets' => $todayTickets,
                'today_avg_fare' => $todayAvgFare,
                'yesterday_gross' => $yesterdayGross,
                'today_cash' => $todayCash,
                'today_online' => $todayOnline,
                'dod_change_pct' => $dodChangePct,
            ],
            'monthly_stats' => [
                'month_label' => $now->format('F Y'),
                'this_month_gross' => $monthGross,
                'this_month_net' => $monthNet,
                'this_month_tickets' => $monthTickets,
                'this_month_refunds' => $monthRefunds,
                'last_month_gross' => $lastMonthGross,
                'mom_change_pct' => $momChangePct,
                'days_in_month' => $daysInMonth,
                'days_passed' => $daysPassed,
                'avg_daily_revenue' => $avgDaily,
                'projected_month_gross' => $projectedGross,
            ],
            'daily_trend' => $dailyTrend,
            'monthly_trend' => $monthlyTrend,
        ]);
    }

    public function submitHandover(Request $request)
    {
        $data = $request->validate(['amount' => 'required|numeric|min:0|max:100000000|decimal:0,2', 'notes' => 'nullable|string|max:2000', 'idempotency_key' => 'required|uuid']);
        [$log, $created] = DB::transaction(function () use ($request, $data) {
            User::whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            $key = 'handover:'.$request->user()->id.':'.$data['idempotency_key'];
            $existing = AuditLog::where('event_key', $key)->first();
            if ($existing) {
                abort_unless((float) $existing->amount === (float) $data['amount'] && $existing->details === ($data['notes'] ?? null), 409, 'This request key was already used with different handover details.');
                return [$existing, false];
            }
            $log = new AuditLog;
            $log->forceFill(['user_name' => $request->user()->name, 'role' => $request->user()->role,
                'action' => 'Cash handover submitted', 'amount' => $data['amount'], 'details' => $data['notes'] ?? null, 'event_key' => $key])->save();
            return [$log, true];
        }, 3);
        return response()->json(['status' => 'success', 'message' => 'Cash handover submitted for finance review.', 'log' => $log], $created ? 201 : 200);
    }
}
