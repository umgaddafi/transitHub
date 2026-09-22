import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { SearchBooking } from '../components/SearchBooking';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, dateTime, errorMessage, money } from '../services/api';
import type { Ticket } from '../types/ticket';
import type { RouteItem } from '../types/route';
import type { Bus } from '../types/bus';
import type { User, UserRole } from '../types/user';

interface ScheduledTrip {
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

interface AuditLog {
  id: number;
  created_at: string;
  user_name: string;
  action: string;
  amount: number;
  details: string;
}

interface Operations {
  routes: RouteItem[];
  buses: Bus[];
  drivers: { id: number; name: string }[];
  trips: ScheduledTrip[];
}

interface Finance {
  collected: number;
  refund_pending: number;
  refunded: number;
  tickets: Ticket[];
}

const empty: Operations = { routes: [], buses: [], drivers: [], trips: [] };

export function StaffPortal() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const role = user!.role;

  const [data, setData] = useState<Operations>(empty);
  const [finance, setFinance] = useState<Finance | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [manifest, setManifest] = useState<{ trip: ScheduledTrip; tickets: Ticket[] } | null>(null);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState(
    role === 'pos' ? 'book' : role === 'marshal' ? 'marshal' : 'trips'
  );

  // Refund modal state
  const [refundTicket, setRefundTicket] = useState<Ticket | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [cashConfirmed, setCashConfirmed] = useState(false);

  // Trip reassignment state
  const [reassignTrip, setReassignTrip] = useState<ScheduledTrip | null>(null);
  const [reassignBusId, setReassignBusId] = useState<number | ''>('');
  const [reassignDriverId, setReassignDriverId] = useState<number | ''>('');

  // POS Baggage tags state
  const [luggagePnr, setLuggagePnr] = useState('');
  const [luggageCount, setLuggageCount] = useState(1);
  const [luggageTags, setLuggageTags] = useState<string[]>([]);

  // Gate Boarding quick response state
  const [boardResult, setBoardResult] = useState<{
    success: boolean;
    message: string;
    ticket?: Ticket;
  } | null>(null);

  const handoverKey = useRef(crypto.randomUUID());

  const canDispatch = ['admin', 'dispatch'].includes(role);
  const canFinance = ['admin', 'finance'].includes(role);
  const canBoard = ['admin', 'marshal'].includes(role);
  const canCash = ['admin', 'pos'].includes(role);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const ops = await api.get<Operations>('/operations');
      setData({ ...empty, ...ops.data });

      if (['admin', 'finance'].includes(role)) {
        const [summary, audits] = await Promise.all([
          api.get<Finance>('/finance/summary'),
          api.get<{ logs: AuditLog[] }>('/finance/audits'),
        ]);
        setFinance(summary.data);
        setLogs(audits.data.logs);
      }

      if (role === 'admin') {
        const usersRes = await api.get<{ users: User[] }>('/admin/users');
        setUsersList(usersRes.data.users);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [role]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const ops = await api.get<Operations>('/operations');
        if (active) setData({ ...empty, ...ops.data });

        if (['admin', 'finance'].includes(role)) {
          const [summary, audits] = await Promise.all([
            api.get<Finance>('/finance/summary'),
            api.get<{ logs: AuditLog[] }>('/finance/audits'),
          ]);
          if (active) {
            setFinance(summary.data);
            setLogs(audits.data.logs);
          }
        }

        if (role === 'admin') {
          const usersRes = await api.get<{ users: User[] }>('/admin/users');
          if (active) setUsersList(usersRes.data.users);
        }
      } catch (e) {
        if (active) setError(errorMessage(e));
      }
    })();
    return () => {
      active = false;
    };
  }, [role]);

  const action = async (path: string, payload: Record<string, unknown>, fallback: string) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await api.post(path, payload);
      const msg = response.data.message || fallback;
      setMessage(msg);
      showToast('Action Completed', msg, 'success');
      await refresh();
      return true;
    } catch (e) {
      const err = errorMessage(e);
      setError(err);
      showToast('Action Failed', err, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>, path: string, fallback: string) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    if (await action(path, payload, fallback)) form.reset();
  };

  const loadManifest = async (id: number) => {
    setError('');
    setBusy(true);
    try {
      const res = await api.get<{ trip: ScheduledTrip; tickets: Ticket[] }>(
        `/operations/trips/${id}/manifest`
      );
      setManifest(res.data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleProcessRefund = async (e: FormEvent) => {
    e.preventDefault();
    if (!refundTicket) return;
    setBusy(true);
    setError('');

    try {
      const res = await api.post<{ message: string; ticket: Ticket }>(
        `/finance/refund/${encodeURIComponent(refundTicket.pnr_code)}`,
        {
          reason: refundReason,
          cash_refund_confirmed: cashConfirmed,
        }
      );
      showToast('Refund Processed', res.data.message, 'success');
      setRefundTicket(null);
      setRefundReason('');
      setCashConfirmed(false);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
      showToast('Refund Error', errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleReassign = async (e: FormEvent) => {
    e.preventDefault();
    if (!reassignTrip || !reassignBusId || !reassignDriverId) return;

    setBusy(true);
    setError('');

    try {
      await api.post('/dispatch/assign', {
        trip_id: reassignTrip.id,
        bus_id: Number(reassignBusId),
        driver_id: Number(reassignDriverId),
      });
      showToast('Trip Reassigned', `Trip #${reassignTrip.id} assignment updated.`, 'success');
      setReassignTrip(null);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
      showToast('Reassignment Failed', errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleBusStatus = async (busId: number, newStatus: string) => {
    setBusy(true);
    try {
      await api.post(`/admin/buses/${busId}/status`, { status: newStatus });
      showToast('Bus Status Updated', `Bus status changed to ${newStatus}.`, 'success');
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
      showToast('Status Change Failed', errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleUserAccess = async (targetUser: User, enable: boolean) => {
    setBusy(true);
    try {
      await api.post(`/admin/users/${targetUser.id}/access`, { enabled: enable });
      showToast(
        'User Access Updated',
        `Account ${targetUser.email} is now ${enable ? 'Active' : 'Suspended'}.`,
        'success'
      );
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
      showToast('User Access Failed', errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateLuggageTags = async (e: FormEvent) => {
    e.preventDefault();
    if (!luggagePnr.trim()) return;
    setBusy(true);
    setError('');
    setLuggageTags([]);

    try {
      const res = await api.post<{ tag_codes: string[] }>('/pos/luggage-tags', {
        pnr_code: luggagePnr.trim(),
        count: Number(luggageCount),
      });
      setLuggageTags(res.data.tag_codes);
      showToast(
        'Tags Generated',
        `Generated ${res.data.tag_codes.length} luggage barcode tags for ${luggagePnr}.`,
        'success'
      );
    } catch (err) {
      setError(errorMessage(err));
      showToast('Tag Generation Error', errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleBoardPassenger = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    setBusy(true);
    setError('');
    setBoardResult(null);

    try {
      const res = await api.post<{ status: string; message: string; ticket: Ticket }>(
        '/operations/board',
        values
      );
      setBoardResult({
        success: true,
        message: res.data.message || 'Passenger successfully validated and boarded!',
        ticket: res.data.ticket,
      });
      showToast('Boarding Confirmed', `Passenger on seat #${res.data.ticket?.seat_number} boarded.`, 'success');
      form.reset();
      await refresh();
    } catch (err) {
      const errTxt = errorMessage(err);
      setBoardResult({
        success: false,
        message: errTxt,
      });
      setError(errTxt);
      showToast('Boarding Rejected', errTxt, 'error');
    } finally {
      setBusy(false);
    }
  };

  const filteredUsers = usersList.filter(u => {
    const q = userSearch.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.includes(q as UserRole);
  });

  return (
    <>
      <Navbar />
      <main className="page-width portal-main space-y-6">
        {/* Workspace Title Banner */}
        <div className="section-title">
          <div>
            <p className="eyebrow">{role} workspace</p>
            <h1 className="capitalize">{role} Transport Operations</h1>
            <p>Signed in as <strong>{user?.name}</strong>. Real-time operations with transactional locks.</p>
          </div>
          <button
            className="button secondary cursor-pointer"
            disabled={busy}
            onClick={() => { void refresh(); }}
          >
            {busy ? 'Loading…' : 'Refresh Data'}
          </button>
        </div>

        {/* Workspace Navigation Tabs */}
        <nav className="workspace-tabs" aria-label="Workspace sections">
          <button aria-pressed={tab === 'trips'} onClick={() => setTab('trips')}>
            Scheduled Trips
          </button>
          {canCash && (
            <button aria-pressed={tab === 'book'} onClick={() => setTab('book')}>
              Counter Booking
            </button>
          )}
          {canCash && (
            <button aria-pressed={tab === 'pos-luggage'} onClick={() => setTab('pos-luggage')}>
              Luggage Tags
            </button>
          )}
          {canBoard && (
            <button aria-pressed={tab === 'marshal'} onClick={() => setTab('marshal')}>
              Marshal Gate
            </button>
          )}
          {canDispatch && (
            <button aria-pressed={tab === 'schedule'} onClick={() => setTab('schedule')}>
              Schedule & Fleet
            </button>
          )}
          {(canFinance || role === 'pos') && (
            <button aria-pressed={tab === 'finance'} onClick={() => setTab('finance')}>
              Finance & Audits
            </button>
          )}
          {role === 'admin' && (
            <button aria-pressed={tab === 'users'} onClick={() => setTab('users')}>
              Staff Accounts
            </button>
          )}
        </nav>

        {error && <p role="alert" className="notice error">{error}</p>}
        {message && <p role="status" className="notice">{message}</p>}

        {/* TAB: COUNTER BOOKING (POS / ADMIN) */}
        {tab === 'book' && canCash && (
          <SearchBooking cash onBooked={() => { void refresh(); }} />
        )}

        {/* TAB: LUGGAGE CLAIM TAGS */}
        {tab === 'pos-luggage' && canCash && (
          <section className="panel space-y-6">
            <div>
              <h2>Baggage Claim Tags Generator</h2>
              <p className="text-xs text-slate-500">
                Generate and print serialized luggage tags for checked baggage in the bus cargo hold.
              </p>
            </div>

            <form onSubmit={handleGenerateLuggageTags} className="form-grid">
              <label>
                Ticket PNR Code
                <input
                  type="text"
                  required
                  value={luggagePnr}
                  onChange={e => setLuggagePnr(e.target.value.toUpperCase())}
                  placeholder="e.g. TH-849201"
                  autoCapitalize="characters"
                />
              </label>

              <label>
                Luggage Pieces Count
                <select
                  value={luggageCount}
                  onChange={e => setLuggageCount(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5, 6].map(num => (
                    <option key={num} value={num}>
                      {num} {num === 1 ? 'Piece' : 'Pieces'}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-end">
                <button className="button w-full" disabled={busy}>
                  {busy ? 'Generating…' : 'Generate Baggage Tags'}
                </button>
              </div>
            </form>

            {luggageTags.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-slate-200">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Generated Tags ({luggageTags.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="button secondary"
                  >
                    Print Luggage Labels
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {luggageTags.map(tag => (
                    <div
                      key={tag}
                      className="p-4 bg-slate-50 rounded-2xl border-2 border-dashed border-teal-500/50 space-y-2 text-center printable-pass"
                    >
                      <span className="text-[10px] uppercase font-mono font-bold text-slate-500 block">
                        TRANSITHUB CARGO HOLD
                      </span>
                      <strong className="text-base font-mono font-black text-teal-800 block">
                        {tag}
                      </strong>
                      <span className="text-[10px] text-slate-400 block font-mono">
                        PNR: {luggagePnr} • Verified
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* TAB: SCHEDULED TRIPS */}
        {tab === 'trips' && (
          <>
            <section className="panel">
              <h2>{role === 'driver' ? 'My Assigned Departures' : 'All Scheduled Departures'}</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Route</th>
                      <th>Departure (WAT)</th>
                      <th>Bus</th>
                      <th>Status</th>
                      <th>Boarded</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.trips.map(trip => (
                      <tr key={trip.id}>
                        <td>
                          <strong>
                            {trip.route?.origin} → {trip.route?.destination}
                          </strong>
                          <small className="block text-slate-400">Trip #{trip.id}</small>
                        </td>
                        <td>{dateTime(trip.departure_time)}</td>
                        <td>
                          {trip.bus?.reg_number}
                          <small className="block text-slate-400">{trip.bus?.model}</small>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              trip.status === 'Departed' || trip.status === 'Completed'
                                ? 'success'
                                : ''
                            }`}
                          >
                            {trip.status}
                          </span>
                        </td>
                        <td>
                          <strong>{trip.boarded_count ?? 0}</strong> / {trip.bus?.capacity || 14}
                        </td>
                        <td>
                          <div className="actions">
                            <button
                              className="button secondary"
                              disabled={busy}
                              onClick={() => { void loadManifest(trip.id); }}
                            >
                              Manifest
                            </button>

                            {canDispatch && trip.status === 'Scheduled' && (
                              <button
                                className="button secondary"
                                disabled={busy}
                                onClick={() => {
                                  setReassignTrip(trip);
                                  setReassignBusId(trip.bus?.id || '');
                                  setReassignDriverId(trip.driver_id || '');
                                }}
                              >
                                Reassign
                              </button>
                            )}

                            {(canDispatch || role === 'driver') &&
                              ['Scheduled', 'Boarding', 'Departed'].includes(trip.status) && (
                                <button
                                  className="button"
                                  disabled={busy}
                                  onClick={() => {
                                    void action(
                                      `/operations/trips/${trip.id}/status`,
                                      { status: trip.status === 'Departed' ? 'Completed' : 'Departed' },
                                      'Trip status updated.'
                                    );
                                  }}
                                >
                                  {trip.status === 'Departed' ? 'Complete Trip' : 'Mark Departed'}
                                </button>
                              )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.trips.length && (
                <p className="empty-state">No scheduled departures found for your account.</p>
              )}
            </section>

            {manifest && (
              <section className="panel space-y-4">
                <div className="section-title">
                  <h2>
                    Passenger Manifest · Trip #{manifest.trip.id} ({manifest.trip.route?.origin} → {manifest.trip.route?.destination})
                  </h2>
                  <button className="button secondary" onClick={() => setManifest(null)}>
                    Close Manifest
                  </button>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Seat</th>
                        <th>Passenger</th>
                        <th>Phone</th>
                        <th>PNR</th>
                        <th>Status</th>
                        <th>Emergency Contact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manifest.tickets.map(ticket => (
                        <tr key={ticket.id}>
                          <td>
                            <strong>Seat #{ticket.seat_number}</strong>
                          </td>
                          <td>{ticket.passenger_name}</td>
                          <td>{ticket.passenger_phone}</td>
                          <td className="font-mono">{ticket.pnr_code}</td>
                          <td>
                            <span
                              className={`badge ${
                                ticket.status === 'Boarded' || ticket.status === 'Confirmed'
                                  ? 'success'
                                  : ''
                              }`}
                            >
                              {ticket.status}
                            </span>
                          </td>
                          <td>
                            {ticket.nok_name} <small>{ticket.nok_phone}</small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!manifest.tickets.length && <p>No passengers booked on this trip yet.</p>}
              </section>
            )}
          </>
        )}

        {/* TAB: MARSHAL GATE BOARDING */}
        {tab === 'marshal' && canBoard && (
          <section className="panel space-y-6">
            <div>
              <h2>Marshal Gate Ticket Validator</h2>
              <p className="text-xs text-slate-500">
                Scan or enter passenger PNR to confirm boarding. Only confirmed, paid tickets for the scheduled trip can be boarded.
              </p>
            </div>

            <form className="form-grid" onSubmit={handleBoardPassenger}>
              <label>
                Scheduled Trip
                <select name="trip_id" required>
                  <option value="">Select a trip</option>
                  {data.trips
                    .filter(trip => ['Scheduled', 'Boarding'].includes(trip.status))
                    .map(trip => (
                      <option key={trip.id} value={trip.id}>
                        Trip #{trip.id} · {trip.route?.origin} → {trip.route?.destination} · {dateTime(trip.departure_time)}
                      </option>
                    ))}
                </select>
              </label>

              <label>
                Booking Reference (PNR)
                <input
                  name="pnr_code"
                  required
                  autoCapitalize="characters"
                  maxLength={40}
                  placeholder="e.g. TH-849201"
                />
              </label>

              <div className="flex items-end">
                <button className="button w-full" disabled={busy}>
                  {busy ? 'Validating…' : 'Validate & Board Passenger'}
                </button>
              </div>
            </form>

            {boardResult && (
              <div
                className={`p-4 rounded-2xl border text-sm font-bold flex items-center justify-between ${
                  boardResult.success
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-rose-50 border-rose-300 text-rose-900'
                }`}
              >
                <div>
                  <p>{boardResult.message}</p>
                  {boardResult.ticket && (
                    <small className="block font-normal mt-1">
                      Passenger: {boardResult.ticket.passenger_name} • Seat #{boardResult.ticket.seat_number} • PNR: {boardResult.ticket.pnr_code}
                    </small>
                  )}
                </div>
                <span className="text-xs uppercase px-2.5 py-1 rounded-full font-mono bg-white/60">
                  {boardResult.success ? 'PASSED' : 'REJECTED'}
                </span>
              </div>
            )}
          </section>
        )}

        {/* TAB: SCHEDULE & FLEET (DISPATCH / ADMIN) */}
        {tab === 'schedule' && canDispatch && (
          <div className="space-y-6">
            <section className="panel">
              <h2>Schedule a New Trip</h2>
              <form
                className="form-grid"
                onSubmit={event => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const values = Object.fromEntries(new FormData(form).entries());
                  const departure = String(values.departure_time);
                  const arrival = String(values.arrival_time);
                  void action(
                    '/dispatch/trips',
                    {
                      ...values,
                      departure_time: `${departure}:00+01:00`,
                      arrival_time: `${arrival}:00+01:00`,
                    },
                    'Trip scheduled.'
                  ).then(ok => {
                    if (ok) form.reset();
                  });
                }}
              >
                <label>
                  Route
                  <select name="route_id" required>
                    <option value="">Select Route</option>
                    {data.routes.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.origin} → {r.destination} ({r.distance_km} km)
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Bus
                  <select name="bus_id" required>
                    <option value="">Select Operational Bus</option>
                    {data.buses
                      .filter(b => b.status === 'Active / Operational')
                      .map(b => (
                        <option key={b.id} value={b.id}>
                          {b.reg_number} · {b.model} ({b.capacity} seats)
                        </option>
                      ))}
                  </select>
                </label>

                <label>
                  Driver
                  <select name="driver_id" required>
                    <option value="">Select Driver</option>
                    {data.drivers.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Departure (WAT)
                  <input type="datetime-local" name="departure_time" required />
                </label>

                <label>
                  Arrival (WAT)
                  <input type="datetime-local" name="arrival_time" required />
                </label>

                <label>
                  Fare (NGN)
                  <input type="number" name="fare" required min="1" step="0.01" />
                </label>

                <button className="button" disabled={busy}>
                  Schedule Trip
                </button>
              </form>
            </section>

            {/* Fleet Status Management */}
            <section className="panel space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h2>Fleet Telematics & Maintenance</h2>
                  <p className="text-xs text-slate-500">
                    Monitor operational status and toggle maintenance states.
                  </p>
                </div>
              </div>

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Registration</th>
                      <th>Model</th>
                      <th>Capacity</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.buses.map(bus => (
                      <tr key={bus.id}>
                        <td className="font-mono font-bold">{bus.reg_number}</td>
                        <td>{bus.model}</td>
                        <td>{bus.capacity} seats ({bus.vehicle_type})</td>
                        <td>
                          <span
                            className={`badge ${
                              bus.status === 'Active / Operational'
                                ? 'success'
                                : bus.status === 'Maintenance / Inspection'
                                ? 'warning'
                                : 'danger'
                            }`}
                          >
                            {bus.status}
                          </span>
                        </td>
                        <td>
                          <div className="actions">
                            {bus.status !== 'Active / Operational' && (
                              <button
                                className="button secondary"
                                disabled={busy}
                                onClick={() => bus.id && void handleBusStatus(bus.id, 'Active / Operational')}
                              >
                                Set Active
                              </button>
                            )}
                            {bus.status !== 'Maintenance / Inspection' && (
                              <button
                                className="button secondary"
                                disabled={busy}
                                onClick={() => bus.id && void handleBusStatus(bus.id, 'Maintenance / Inspection')}
                              >
                                Set Maintenance
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="staff-form-grid">
              <section className="panel">
                <h2>Add New Route</h2>
                <form onSubmit={event => { void submit(event, '/admin/routes', 'Route added.'); }}>
                  <label>
                    Origin Terminal
                    <input name="origin" required maxLength={100} placeholder="e.g. Lagos" />
                  </label>
                  <label>
                    Destination Hub
                    <input name="destination" required maxLength={100} placeholder="e.g. Abuja" />
                  </label>
                  <label>
                    Distance (km)
                    <input name="distance_km" type="number" min="1" required />
                  </label>
                  <label>
                    Duration (hours)
                    <input name="duration_hours" type="number" min="0.1" step="0.1" required />
                  </label>
                  <label>
                    Base Fare (NGN)
                    <input name="base_fare" type="number" min="1" step="0.01" required />
                  </label>
                  <button className="button" disabled={busy}>
                    Add Route
                  </button>
                </form>
              </section>

              <section className="panel">
                <h2>Add Vehicle to Fleet</h2>
                <form
                  onSubmit={event => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const values = Object.fromEntries(new FormData(form).entries());
                    void action(
                      '/admin/buses',
                      { ...values, capacity: values.vehicle_type === '7-Seater' ? 7 : 14 },
                      'Bus added.'
                    ).then(ok => {
                      if (ok) form.reset();
                    });
                  }}
                >
                  <label>
                    Registration Number
                    <input name="reg_number" required maxLength={30} placeholder="e.g. TH-901-LAG" />
                  </label>
                  <label>
                    Model & Make
                    <input name="model" required maxLength={100} placeholder="e.g. Toyota HiAce 2024" />
                  </label>
                  <label>
                    Vehicle Size
                    <select name="vehicle_type">
                      <option value="14-Seater">14-Seater</option>
                      <option value="7-Seater">7-Seater</option>
                    </select>
                  </label>
                  <button className="button" disabled={busy}>
                    Add Bus
                  </button>
                </form>
              </section>
            </div>
          </div>
        )}

        {/* TAB: FINANCE & AUDITS */}
        {tab === 'finance' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-teal-950 text-white border border-teal-800/40 gap-4 shadow-xl">
              <div>
                <strong className="text-sm font-black block text-teal-300">
                  Treasury Vault & Executive Finance Command Center
                </strong>
                <span className="text-xs text-slate-300">
                  Access deep analytics, payment channel distribution bars, printable till slips, and audit CSV exports.
                </span>
              </div>
              <Link
                to="/finance"
                className="button shrink-0 text-xs font-black shadow-lg"
                style={{ background: '#0f766e', color: '#fff', border: 'none' }}
              >
                Launch Executive Dashboard →
              </Link>
            </div>

            {finance && (
              <>
                <div className="metric-grid">
                  <section className="panel">
                    <p className="eyebrow">Total Revenue Collected</p>
                    <strong>{money(finance.collected)}</strong>
                  </section>
                  <section className="panel">
                    <p className="eyebrow">Refunds Awaiting Review</p>
                    <strong className="text-amber-600">{money(finance.refund_pending)}</strong>
                  </section>
                  <section className="panel">
                    <p className="eyebrow">Total Refunded</p>
                    <strong className="text-slate-700">{money(finance.refunded)}</strong>
                  </section>
                </div>

                {/* Refund Review Queue with Action Modal */}
                <section className="panel space-y-4">
                  <h2>Refund Review Queue</h2>
                  <div className="space-y-3">
                    {finance.tickets
                      ?.filter(t => ['Cancellation Requested', 'Payment Review', 'Refund Pending'].includes(t.status))
                      .map(ticket => (
                        <div
                          className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-slate-50 rounded-2xl border border-slate-200 gap-3"
                          key={ticket.id}
                        >
                          <div>
                            <strong className="font-mono text-base text-teal-800">
                              {ticket.pnr_code}
                            </strong>
                            <p className="text-xs text-slate-600">
                              {ticket.passenger_name} • Status: <strong>{ticket.status}</strong> • Method:{' '}
                              {ticket.payment_method || 'Online'}
                            </p>
                            <span className="text-xs font-black text-slate-900">
                              Amount: {money(ticket.fare_paid)}
                            </span>
                          </div>
                          <button
                            className="button"
                            disabled={busy}
                            onClick={() => {
                              setRefundTicket(ticket);
                              setRefundReason(`Approved refund for passenger ${ticket.passenger_name}`);
                              setCashConfirmed(ticket.payment_method === 'Cash');
                            }}
                          >
                            Process Refund
                          </button>
                        </div>
                      ))}
                    {!finance.tickets?.some(t =>
                      ['Cancellation Requested', 'Payment Review', 'Refund Pending'].includes(t.status)
                    ) && <p className="text-xs text-slate-500">No refunds awaiting review.</p>}
                  </div>
                </section>
              </>
            )}

            {/* Record Cash Handover */}
            <section className="panel">
              <h2>Record POS Cash Handover</h2>
              <p className="text-xs text-slate-500 mb-4">
                Submissions are recorded with idempotency checks for finance reconciliation.
              </p>
              <form
                className="form-grid"
                onSubmit={event => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const values = Object.fromEntries(new FormData(form).entries());
                  void action(
                    '/finance/handover',
                    { ...values, idempotency_key: handoverKey.current },
                    'Cash handover submitted.'
                  ).then(ok => {
                    if (ok) {
                      handoverKey.current = crypto.randomUUID();
                      form.reset();
                    }
                  });
                }}
              >
                <label>
                  Amount (NGN)
                  <input name="amount" type="number" required min="0.01" step="0.01" />
                </label>
                <label>
                  Notes
                  <input name="notes" maxLength={1000} required placeholder="Cash register drawer shift 1 handover" />
                </label>
                <button className="button" disabled={busy}>
                  Submit Handover
                </button>
              </form>
            </section>

            {/* Audit Log */}
            {canFinance && (
              <section className="panel space-y-4">
                <h2>Operational Audit Log</h2>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Time (WAT)</th>
                        <th>Staff</th>
                        <th>Action</th>
                        <th>Amount</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map(log => (
                        <tr key={log.id}>
                          <td>{dateTime(log.created_at)}</td>
                          <td>{log.user_name}</td>
                          <td><strong>{log.action}</strong></td>
                          <td>{log.amount ? money(log.amount) : '—'}</td>
                          <td>{log.details}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!logs.length && <p className="text-xs text-slate-500">No audit records found.</p>}
              </section>
            )}
          </div>
        )}

        {/* TAB: STAFF ACCOUNTS (ADMIN) */}
        {tab === 'users' && role === 'admin' && (
          <div className="space-y-6">
            <section className="panel space-y-4">
              <h2>Create New Staff Account</h2>
              <form
                className="form-grid"
                onSubmit={event => {
                  void submit(event, '/admin/users', 'Staff account created.');
                }}
              >
                <label>
                  Full Name
                  <input name="name" required maxLength={100} autoComplete="off" />
                </label>
                <label>
                  Email
                  <input name="email" type="email" required autoComplete="off" />
                </label>
                <label>
                  Phone
                  <input name="phone" type="tel" required maxLength={30} />
                </label>
                <label>
                  Role
                  <select name="role">
                    <option value="driver">Driver</option>
                    <option value="pos">POS Cashier</option>
                    <option value="marshal">Boarding Marshal</option>
                    <option value="dispatch">Dispatcher</option>
                    <option value="finance">Finance Officer</option>
                    <option value="admin">Administrator</option>
                  </select>
                </label>
                <label>
                  Password (min 12 chars)
                  <input type="password" name="password" required minLength={12} autoComplete="new-password" />
                </label>
                <label>
                  Confirm Password
                  <input type="password" name="password_confirmation" required minLength={12} autoComplete="new-password" />
                </label>
                <button className="button" disabled={busy}>
                  Create Staff Account
                </button>
              </form>
            </section>

            {/* Staff Directory Table */}
            <section className="panel space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h2>Staff Directory & Access Control</h2>
                  <p className="text-xs text-slate-500">
                    Manage active staff credentials and suspend compromised accounts.
                  </p>
                </div>
                <input
                  type="text"
                  placeholder="Filter by name or email…"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  className="text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-50 w-full sm:w-64"
                />
              </div>

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Phone</th>
                      <th>Status</th>
                      <th>Access</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(u => (
                      <tr key={u.id}>
                        <td><strong>{u.name}</strong></td>
                        <td>{u.email}</td>
                        <td><span className="badge uppercase">{u.role}</span></td>
                        <td>{u.phone || '—'}</td>
                        <td>
                          <span className={`badge ${u.disabled_at ? 'danger' : 'success'}`}>
                            {u.disabled_at ? 'Suspended' : 'Active'}
                          </span>
                        </td>
                        <td>
                          {u.id !== user?.id && (
                            <button
                              className={`button ${u.disabled_at ? 'secondary' : 'danger'}`}
                              disabled={busy}
                              onClick={() => void handleUserAccess(u, Boolean(u.disabled_at))}
                            >
                              {u.disabled_at ? 'Reactivate' : 'Suspend'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* MODAL: PROCESS REFUND */}
        {refundTicket && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in duration-200">
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <h3 className="text-lg font-extrabold text-slate-900">
                  Process Refund: {refundTicket.pnr_code}
                </h3>
                <button
                  onClick={() => setRefundTicket(null)}
                  className="text-slate-400 hover:text-slate-600 text-lg"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleProcessRefund} className="space-y-4 text-xs">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Passenger:</span>
                    <strong className="text-slate-900">{refundTicket.passenger_name}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Route:</span>
                    <strong className="text-slate-900">{refundTicket.route_name}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Fare Paid:</span>
                    <strong className="text-teal-700 text-sm font-black">
                      {money(refundTicket.fare_paid)}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Payment Method:</span>
                    <strong className="text-slate-900">{refundTicket.payment_method || 'Online'}</strong>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Refund Justification / Reason (min 5 characters)
                  </label>
                  <textarea
                    required
                    minLength={5}
                    maxLength={500}
                    rows={3}
                    value={refundReason}
                    onChange={e => setRefundReason(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-900 focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                {refundTicket.payment_method === 'Cash' && (
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="cash-conf"
                      checked={cashConfirmed}
                      onChange={e => setCashConfirmed(e.target.checked)}
                      required
                    />
                    <label htmlFor="cash-conf" className="text-amber-900 font-bold">
                      Confirm physical cash fare has been handed back to passenger
                    </label>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-extrabold py-3 rounded-xl uppercase tracking-wider transition"
                  >
                    {busy ? 'Processing Refund…' : 'Approve & Execute Refund'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefundTicket(null)}
                    className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-3 rounded-xl uppercase tracking-wider transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: TRIP REASSIGNMENT */}
        {reassignTrip && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in duration-200">
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <h3 className="text-lg font-extrabold text-slate-900">
                  Reassign Trip #{reassignTrip.id}
                </h3>
                <button
                  onClick={() => setReassignTrip(null)}
                  className="text-slate-400 hover:text-slate-600 text-lg"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleReassign} className="space-y-4 text-xs">
                <p className="text-slate-500">
                  Select an operational bus and driver for{' '}
                  <strong>
                    {reassignTrip.route?.origin} → {reassignTrip.route?.destination}
                  </strong>{' '}
                  departing {dateTime(reassignTrip.departure_time)}.
                </p>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Operational Bus</label>
                  <select
                    required
                    value={reassignBusId}
                    onChange={e => setReassignBusId(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold"
                  >
                    <option value="">Choose Bus</option>
                    {data.buses
                      .filter(b => b.status === 'Active / Operational')
                      .map(b => (
                        <option key={b.id} value={b.id}>
                          {b.reg_number} · {b.model} ({b.capacity} seats)
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Assigned Driver</label>
                  <select
                    required
                    value={reassignDriverId}
                    onChange={e => setReassignDriverId(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold"
                  >
                    <option value="">Choose Driver</option>
                    {data.drivers.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-extrabold py-3 rounded-xl uppercase tracking-wider transition"
                  >
                    {busy ? 'Saving…' : 'Confirm Reassignment'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReassignTrip(null)}
                    className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-3 rounded-xl uppercase tracking-wider transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
