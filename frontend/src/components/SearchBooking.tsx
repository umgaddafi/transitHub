import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CalendarDays,
  MapPin,
  Bus,
  Sparkles,
  Zap,
  Snowflake,
  Armchair,
  Radio,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, bookingService, dateTime, errorMessage, money, today } from '../services/api';
import type { BookingPayload, Ticket, Trip } from '../types/ticket';
import type { RouteItem } from '../types/route';
import { TicketCard } from './TicketCard';
import { GpsTrackingModal } from './GpsTrackingModal';
import {
  fetchNigeriaStates,
  type NigeriaState,
  FALLBACK_NIGERIA_STATES,
} from '../services/nigeriaStatesService';

interface SearchBookingProps {
  cash?: boolean;
  onBooked?: () => void;
  defaultOrigin?: string;
  defaultDestination?: string;
  defaultDate?: string;
  initialResults?: Trip[];
  searchTimestamp?: number;
  onNoSchedule?: (origin: string, destination: string, date: string) => void;
  hideSearchCard?: boolean;
}

function matchRouteCity(term: string, available: string[]): string {
  if (!term || !available.length) return term;
  if (available.includes(term)) return term;
  const lower = term.toLowerCase().trim();
  const matched = available.find(
    c => c.toLowerCase() === lower || c.toLowerCase().startsWith(lower) || c.toLowerCase().includes(lower)
  );
  return matched || term;
}

function findStateInList(identifier: string, states: NigeriaState[]): NigeriaState | undefined {
  if (!identifier) return undefined;
  const lower = identifier.toLowerCase().trim();
  const clean = lower.replace(/\s*state\b/gi, '').split('(')[0].trim();
  return states.find(s => {
    const sName = s.name.toLowerCase();
    const sFull = s.fullName.toLowerCase();
    const sTerm = s.terminal.toLowerCase();
    return (
      sName === lower ||
      sFull === lower ||
      sTerm === lower ||
      sName === clean ||
      sTerm.includes(clean) ||
      clean.includes(sName) ||
      (s.name === 'Federal Capital Territory' && (clean.includes('abuja') || clean.includes('fct'))) ||
      (s.name === 'Rivers' && clean.includes('port harcourt')) ||
      (s.name === 'Edo' && clean.includes('benin'))
    );
  });
}

function isSameLocation(a: string, b: string, stateList?: NigeriaState[]): boolean {
  if (!a || !b) return false;
  if (a.toLowerCase().trim() === b.toLowerCase().trim()) return true;

  const list = stateList && stateList.length > 0 ? stateList : FALLBACK_NIGERIA_STATES.map(s => ({
    ...s,
    hasActiveRoutes: ['Lagos', 'Federal Capital Territory', 'Rivers', 'Edo', 'Kano'].includes(s.name)
  }));

  const stateA = findStateInList(a, list);
  const stateB = findStateInList(b, list);
  if (stateA && stateB) {
    return stateA.name.toLowerCase() === stateB.name.toLowerCase();
  }

  const cleanA = a.toLowerCase().replace(/\s*state\b/gi, '').split('(')[0].trim();
  const cleanB = b.toLowerCase().replace(/\s*state\b/gi, '').split('(')[0].trim();
  return cleanA === cleanB && cleanA.length > 0;
}

export function SearchBooking({
  cash = false,
  onBooked,
  defaultOrigin,
  defaultDestination,
  defaultDate,
  initialResults,
  searchTimestamp,
  onNoSchedule,
  hideSearchCard = false,
}: SearchBookingProps) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [nigeriaStates, setNigeriaStates] = useState<NigeriaState[]>([]);
  const [statesSource, setStatesSource] = useState<string>('');
  const [origin, setOrigin] = useState(defaultOrigin || params.get('origin') || 'Lagos (Jibowu Terminus)');
  const [destination, setDestination] = useState(defaultDestination || params.get('destination') || 'Abuja (Utako Park)');
  const [date, setDate] = useState(defaultDate || params.get('date') || today());
  const [vehicle, setVehicle] = useState('');
  const [results, setResults] = useState<Trip[]>(initialResults || []);
  const [selected, setSelected] = useState<Trip | null>(null);
  const [seat, setSeat] = useState<number | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [searched, setSearched] = useState(Boolean(initialResults && initialResults.length > 0));
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState('');
  const [gpsTrip, setGpsTrip] = useState<Trip | null>(null);

  // Form states for passenger
  const [passengerName, setPassengerName] = useState(cash ? '' : (user?.name || ''));
  const [passengerPhone, setPassengerPhone] = useState(cash ? '' : (user?.phone || ''));
  const [nokName, setNokName] = useState(cash ? '' : 'Babajide Adebayo');
  const [nokPhone, setNokPhone] = useState(cash ? '' : '+234 802 112 3901');

  const request = useRef<{ signature: string; key: string } | null>(null);
  const selectionHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;

    // Fetch Nigeria States from online Country API
    fetchNigeriaStates()
      .then(({ states, source }) => {
        if (active) {
          setNigeriaStates(states);
          setStatesSource(source);
        }
      })
      .catch(() => {
        // Fallback already bundled
      });

    api
      .get<{ routes: RouteItem[] }>('/routes')
      .then(res => {
        if (active) setRoutes(res.data.routes);
      })
      .catch(e => {
        if (active) setError(errorMessage(e));
      });

    const o = defaultOrigin || params.get('origin') || 'Lagos (Jibowu Terminus)';
    const d = defaultDestination || params.get('destination') || 'Abuja (Utako Park)';
    const day = defaultDate || params.get('date') || today();

    if (o && d && day) {
      setBusy(true);
      bookingService
        .search(o, d, day)
        .then(data => {
          if (active) {
            setResults(data);
            setSearched(true);
          }
        })
        .catch(e => {
          if (active) setError(errorMessage(e));
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    }

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!routes.length) return;
    const origins = [...new Set(routes.map(r => r.origin))];
    const matchedOrigin = matchRouteCity(defaultOrigin || origin, origins);
    const availableDests = routes
      .filter(r => !matchedOrigin || r.origin === matchedOrigin)
      .map(r => r.destination);
    const matchedDest = matchRouteCity(defaultDestination || destination, availableDests);

    if (matchedOrigin && matchedOrigin !== origin) {
      setOrigin(matchedOrigin);
    }
    if (matchedDest && matchedDest !== destination) {
      setDestination(matchedDest);
    }

    if (defaultOrigin && defaultDestination) {
      const qOrigin = matchedOrigin || defaultOrigin;
      const qDest = matchedDest || defaultDestination;
      if (qOrigin && qDest) {
        setBusy(true);
        setError('');
        bookingService
          .search(qOrigin, qDest, date, vehicle)
          .then(data => {
            setResults(data);
            setSearched(true);
          })
          .catch(err => {
            setError(errorMessage(err));
          })
          .finally(() => {
            setBusy(false);
          });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultOrigin, defaultDestination, routes]);

  useEffect(() => {
    if (defaultDate && defaultDate !== date) {
      setDate(defaultDate);
    }
  }, [defaultDate]);

  useEffect(() => {
    if (initialResults !== undefined && searchTimestamp) {
      setResults(initialResults);
      setSearched(true);
      if (defaultOrigin) setOrigin(defaultOrigin);
      if (defaultDestination) setDestination(defaultDestination);
      if (defaultDate) setDate(defaultDate);
    }
  }, [searchTimestamp, initialResults, defaultOrigin, defaultDestination, defaultDate]);

  useEffect(() => {
    if (user && !cash) {
      setPassengerName(user.name);
      setPassengerPhone(user.phone || '');
    }
  }, [user, cash]);

  useEffect(() => {
    if (selected) {
      selectionHeading.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selected]);

  const handleSearch = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (origin === destination) {
      setError('Origin and Destination cannot be the same city.');
      return;
    }

    setBusy(true);
    setError('');
    setSelected(null);
    setTicket(null);
    setResults([]);
    setParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('origin', origin);
      next.set('destination', destination);
      next.set('date', date);
      return next;
    }, { replace: true });

    try {
      const data = await bookingService.search(origin, destination, date, vehicle);
      setResults(data);
      setSearched(true);
      if (data.length === 0 && onNoSchedule) {
        onNoSchedule(origin, destination, date);
      }
    } catch (err) {
      setError(errorMessage(err));
      if (onNoSchedule) {
        onNoSchedule(origin, destination, date);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleBook = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !seat) return;
    if (!user && !cash) {
      setError('Please sign in to complete your seat reservation.');
      return;
    }

    const values = {
      trip_id: selected.trip_id,
      seat_number: seat,
      passenger_name: passengerName,
      passenger_phone: passengerPhone,
      nok_name: nokName,
      nok_phone: nokPhone,
    };

    const signature = JSON.stringify(values);
    if (request.current?.signature !== signature) {
      request.current = { signature, key: crypto.randomUUID() };
    }

    const payload: BookingPayload = { ...values, idempotency_key: request.current.key };

    setBooking(true);
    setError('');

    try {
      const bookedTicket = await bookingService.bookTicket(payload, cash);
      setTicket(bookedTicket);
      setSelected(null);
      setSeat(null);

      if (!cash) {
        // Automatically initialize Paystack transaction and redirect passenger to gateway
        const result = await bookingService.startPayment(bookedTicket.pnr_code);
        const url = new URL(result.authorization_url);
        if (
          url.protocol !== 'https:' ||
          !(url.hostname === 'checkout.paystack.com' || url.hostname.endsWith('.paystack.com'))
        ) {
          throw new Error('The payment provider returned an invalid checkout link.');
        }
        window.location.assign(url.href);
        return;
      }

      onBooked?.();
    } catch (err) {
      setError(errorMessage(err));
      setBooking(false);
    } finally {
      if (cash) {
        setBooking(false);
      }
    }
  };

  // Nigeria States list from online country API with verified fallback
  const stateList: NigeriaState[] = nigeriaStates.length > 0 ? nigeriaStates : FALLBACK_NIGERIA_STATES.map(s => ({
    ...s,
    hasActiveRoutes: ['Lagos', 'Federal Capital Territory', 'Rivers', 'Edo', 'Kano'].includes(s.name)
  }));

  const activeHubs = stateList.filter(s => s.hasActiveRoutes);
  const allStates = stateList;

  return (
    <section id="search" aria-label="Search and book a trip" className="space-y-8">
      {/* Search Input Box Card */}
      {!hideSearchCard && (
        <div className="bg-white rounded-3xl shadow-xl p-5 sm:p-8 border border-slate-200/80">
          <form onSubmit={handleSearch} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Origin */}
            <div>
              <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2">
                <MapPin size={14} className="inline text-teal-600 mr-1" /> Origin Terminal
              </label>
              <select
                value={origin}
                onChange={e => {
                  const newOrigin = e.target.value;
                  setOrigin(newOrigin);
                  if (isSameLocation(newOrigin, destination)) {
                    const alt = activeHubs.find(h => !isSameLocation(h.terminal, newOrigin) && !isSameLocation(h.name, newOrigin));
                    if (alt) setDestination(alt.terminal);
                  }
                }}
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-teal-500 focus:outline-none transition"
              >
                <option value="">Departure Terminal</option>
                <optgroup label="🌟 Active Hubs (Daily Scheduled Departures)">
                  {activeHubs.map(s => {
                    const disabled = isSameLocation(s.terminal, destination) || isSameLocation(s.name, destination);
                    return (
                      <option
                        key={`orig-active-${s.name}`}
                        value={s.terminal}
                        disabled={disabled}
                        className={disabled ? 'text-slate-400 bg-slate-100 italic' : ''}
                      >
                        {s.fullName} — {s.terminal} {disabled ? '(Selected as Destination)' : ''}
                      </option>
                    );
                  })}
                </optgroup>
                <optgroup label="🇳🇬 All 37 Nigerian States (Online Country API)">
                  {allStates.map(s => {
                    const disabled = isSameLocation(s.terminal, destination) || isSameLocation(s.name, destination);
                    return (
                      <option
                        key={`orig-all-${s.name}`}
                        value={s.terminal}
                        disabled={disabled}
                        className={disabled ? 'text-slate-400 bg-slate-100 italic' : ''}
                      >
                        {s.fullName} ({s.terminal}) {disabled ? '(Selected as Destination)' : ''}
                      </option>
                    );
                  })}
                </optgroup>
              </select>
            </div>

            {/* Destination */}
            <div>
              <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2">
                <MapPin size={14} className="inline text-amber-500 mr-1" /> Destination
              </label>
              <select
                value={destination}
                onChange={e => {
                  const newDest = e.target.value;
                  setDestination(newDest);
                  if (isSameLocation(newDest, origin)) {
                    const alt = activeHubs.find(h => !isSameLocation(h.terminal, newDest) && !isSameLocation(h.name, newDest));
                    if (alt) setOrigin(alt.terminal);
                  }
                }}
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-teal-500 focus:outline-none transition"
              >
                <option value="">Arrival Terminal</option>
                <optgroup label="🌟 Active Hubs (Daily Scheduled Departures)">
                  {activeHubs.map(s => {
                    const disabled = isSameLocation(s.terminal, origin) || isSameLocation(s.name, origin);
                    return (
                      <option
                        key={`dest-active-${s.name}`}
                        value={s.terminal}
                        disabled={disabled}
                        className={disabled ? 'text-slate-400 bg-slate-100 italic' : ''}
                      >
                        {s.fullName} — {s.terminal} {disabled ? '(Selected as Origin — Unavailable)' : ''}
                      </option>
                    );
                  })}
                </optgroup>
                <optgroup label="🇳🇬 All 37 Nigerian States (Online Country API)">
                  {allStates.map(s => {
                    const disabled = isSameLocation(s.terminal, origin) || isSameLocation(s.name, origin);
                    return (
                      <option
                        key={`dest-all-${s.name}`}
                        value={s.terminal}
                        disabled={disabled}
                        className={disabled ? 'text-slate-400 bg-slate-100 italic' : ''}
                      >
                        {s.fullName} ({s.terminal}) {disabled ? '(Selected as Origin — Unavailable)' : ''}
                      </option>
                    );
                  })}
                </optgroup>
              </select>
            </div>

            {/* Vehicle Type */}
            <div>
              <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2">
                <Bus size={14} className="inline text-teal-600 mr-1" /> Coach Class
              </label>
              <select
                value={vehicle}
                onChange={e => setVehicle(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-teal-500 focus:outline-none transition"
              >
                <option value="">All Luxury Classes</option>
                <option value="14-Seater">14-Seater HiAce Coach</option>
                <option value="7-Seater">7-Seater Executive SUV</option>
              </select>
            </div>

            {/* Date Picker */}
            <div>
              <label className="block text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2">
                <CalendarDays size={14} className="inline text-teal-600 mr-1" /> Travel Date
              </label>
              <input
                type="date"
                min={today()}
                value={date}
                onChange={e => setDate(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-teal-500 focus:outline-none transition"
              />
            </div>

            {/* Submit */}
            <div className="flex items-end">
              <button
                type="submit"
                disabled={busy || booking}
                className="w-full bg-gradient-to-r from-teal-600 via-teal-700 to-teal-800 hover:from-teal-700 hover:to-teal-900 disabled:opacity-50 text-white font-extrabold py-3.5 px-4 rounded-xl shadow-lg shadow-teal-700/30 flex items-center justify-center gap-2 text-sm transition transform active:scale-95 shimmer-btn cursor-pointer"
              >
                <Sparkles size={16} />
                {busy ? 'Searching…' : 'Find AI Departures'}
              </button>
            </div>
          </form>

          {/* Online Country API Sync Indicator */}
          <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-bold text-slate-700">
                {allStates.length} Nigerian States & FCT Synced
              </span>
              <span className="text-[10px] bg-teal-50 text-teal-700 font-bold px-2 py-0.5 rounded-full border border-teal-200">
                Online Country API Active
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Source: <strong className="text-slate-600 font-medium">{statesSource || 'Online Country API (countriesnow.space)'}</strong>
            </div>
          </div>
        </div>
      )}

      {busy && (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm flex flex-col items-center justify-center gap-3">
          <Loader2 size={32} className="text-teal-600 animate-spin" />
          <p className="text-sm font-bold text-slate-700">Searching active departures…</p>
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl text-xs font-semibold" role="alert">
          {error}
        </div>
      )}

      {/* Booking confirmation notice if ticket just issued */}
      {ticket && (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-4 rounded-2xl text-sm font-bold flex items-center justify-between">
            <span>
              🎉 {cash ? 'Cash Ticket Successfully Issued & Confirmed!' : 'Seat Reserved! Proceed with payment to secure your ticket.'}
            </span>
            <Link
              to={cash ? '/pos' : '/client'}
              className="text-xs uppercase tracking-wider bg-emerald-700 text-white px-3.5 py-1.5 rounded-xl hover:bg-emerald-800 transition"
            >
              View in My Tickets
            </Link>
          </div>
          <TicketCard ticket={ticket} onChanged={setTicket} />
        </div>
      )}

      {/* Available departures grid */}
      {searched && !busy && (
        <div className="space-y-6" id="departures-container">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-4 border-b border-slate-200">
            <div>
              <span className="text-xs font-black uppercase tracking-widest text-teal-600 bg-teal-50 px-3 py-1 rounded-full border border-teal-200">
                Live Departures
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 mt-2">
                Available Departures ({results.length})
              </h3>
              <p className="text-xs text-slate-500">
                Showing schedules for <strong className="text-teal-700">{origin} → {destination}</strong> on {date}
              </p>
            </div>
            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl">
              Zero Booking Fees Guarantee
            </span>
          </div>

          {results.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 sm:p-10 text-center border border-slate-200 space-y-4 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Bus size={26} />
              </div>
              <div>
                <h4 className="text-base sm:text-lg font-extrabold text-slate-800">No Scheduled Departures Found</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                  No active departures currently scheduled for <strong>{origin} → {destination}</strong> on {date}.
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 max-w-lg mx-auto">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                  Daily Express Routes with Guaranteed Departures:
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const o = 'Lagos (Jibowu Terminus)';
                      const d = 'Abuja (Utako Park)';
                      setOrigin(o);
                      setDestination(d);
                      setBusy(true);
                      bookingService.search(o, d, date).then(setResults).finally(() => setBusy(false));
                    }}
                    className="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-bold transition cursor-pointer"
                  >
                    Lagos ⇄ Abuja
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const o = 'Abuja (Utako Park)';
                      const d = 'Port Harcourt (Waterlines)';
                      setOrigin(o);
                      setDestination(d);
                      setBusy(true);
                      bookingService.search(o, d, date).then(setResults).finally(() => setBusy(false));
                    }}
                    className="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-bold transition cursor-pointer"
                  >
                    Abuja ⇄ Port Harcourt
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const o = 'Lagos (Jibowu Terminus)';
                      const d = 'Benin City (Ramat Park)';
                      setOrigin(o);
                      setDestination(d);
                      setBusy(true);
                      bookingService.search(o, d, date).then(setResults).finally(() => setBusy(false));
                    }}
                    className="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-bold transition cursor-pointer"
                  >
                    Lagos ⇄ Benin City
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const o = 'Lagos (Jibowu Terminus)';
                      const d = 'Kano (Naibawa Terminal)';
                      setOrigin(o);
                      setDestination(d);
                      setBusy(true);
                      bookingService.search(o, d, date).then(setResults).finally(() => setBusy(false));
                    }}
                    className="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-bold transition cursor-pointer"
                  >
                    Lagos ⇄ Kano
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {results.map(trip => (
                <div
                  key={trip.trip_id}
                  className="bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 p-5 sm:p-6 flex flex-col justify-between group hover:-translate-y-1 relative"
                >
                  {trip.seats_left <= 4 && trip.seats_left > 0 && (
                    <div className="absolute -top-3 left-6 bg-rose-500 text-white text-[10px] uppercase font-black px-3 py-0.5 rounded-full shadow-md">
                      Only {trip.seats_left} seats left
                    </div>
                  )}

                  <div>
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-extrabold text-slate-900 text-base">
                          {trip.bus?.model || 'Transit Express Cruiser'}
                        </h4>
                        <span className="text-[11px] font-bold text-slate-400">
                          {trip.vehicle_type} • Reg: {trip.bus?.registration_number || 'TH-AUTO'}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                          trip.seats_left > 0
                            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                            : 'text-rose-700 bg-rose-50 border-rose-200'
                        }`}
                      >
                        {trip.seats_left > 0 ? `${trip.seats_left} Seats Free` : 'Sold Out'}
                      </span>
                    </div>

                    {/* Timeline card */}
                    <div className="flex items-center justify-between my-5 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <div>
                        <p className="text-base sm:text-lg font-black text-slate-900">
                          {new Date(trip.departure_time).toLocaleTimeString('en-NG', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </p>
                        <p className="text-[10px] font-bold text-slate-500">{trip.origin}</p>
                      </div>

                      <div className="flex flex-col items-center px-2">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">Express</span>
                        <div className="w-14 sm:w-16 h-[2px] bg-slate-300 my-1 relative">
                          <Bus size={12} className="text-teal-600 absolute left-1/2 -top-1.5 -translate-x-1/2" />
                        </div>
                        <span className="text-[9px] text-emerald-600 font-bold">Direct</span>
                      </div>

                      <div className="text-right">
                        <p className="text-base sm:text-lg font-black text-slate-900">
                          {new Date(trip.arrival_time).toLocaleTimeString('en-NG', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </p>
                        <p className="text-[10px] font-bold text-slate-500">{trip.destination}</p>
                      </div>
                    </div>

                    {/* Amenities & Live GPS Trigger */}
                    <div className="flex items-center gap-3 text-slate-400 text-xs py-1 border-t border-slate-100">
                      <span title="Ergonomic Seats" className="flex items-center gap-1 text-[11px]">
                        <Armchair size={12} className="text-teal-600" /> Recliner
                      </span>
                      <span title="Climate AC" className="flex items-center gap-1 text-[11px]">
                        <Snowflake size={12} className="text-teal-600" /> AC
                      </span>
                      <span title="Power Outlets" className="flex items-center gap-1 text-[11px]">
                        <Zap size={12} className="text-teal-600" /> Power
                      </span>
                      <button
                        type="button"
                        onClick={() => setGpsTrip(trip)}
                        className="text-teal-600 font-bold hover:underline ml-auto text-[11px] flex items-center gap-1"
                      >
                        <Radio size={12} className="animate-pulse text-emerald-500" /> Live GPS
                      </button>
                    </div>
                  </div>

                  {/* Pricing and Action */}
                  <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase block font-bold">Standard Fare</span>
                      <span className="text-xl font-black text-slate-900">{money(trip.fare)}</span>
                    </div>
                    <button
                      type="button"
                      disabled={trip.seats_left === 0 || booking}
                      onClick={() => {
                        setSelected(trip);
                        setSeat(null);
                        setTicket(null);
                        setError('');
                      }}
                      className="bg-slate-900 hover:bg-teal-600 disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider transition shadow-md flex items-center gap-1"
                    >
                      {trip.seats_left === 0 ? 'Sold Out' : 'Choose Seat'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Interactive Seating & Passenger Modal / Panel */}
      {selected && (
        <section className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 border border-slate-200/80 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-200">
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-teal-600 bg-teal-50 px-3 py-1 rounded-full border border-teal-200">
                Interactive Seating Chassis
              </span>
              <h3 ref={selectionHeading} className="text-xl sm:text-2xl font-black text-slate-900 mt-2">
                Seat Selection: {selected.origin} → {selected.destination}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Departure: {dateTime(selected.departure_time)} • Fare: {money(selected.fare)} per seat
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-xs text-slate-500 hover:text-slate-800 font-bold underline"
            >
              Back to departures
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {/* Bus Chassis Layout */}
            <div className="bg-slate-100 p-6 rounded-3xl border border-slate-200 flex flex-col items-center">
              {/* Front windshield & Driver */}
              <div className="w-full flex justify-between items-center text-[10px] font-black text-slate-500 border-b border-slate-200 pb-3 mb-6 uppercase tracking-widest">
                <span>FRONT WINDSHIELD</span>
                <span className="flex items-center gap-1 text-slate-600">
                  <Armchair size={13} className="text-slate-400" /> DRIVER CABIN
                </span>
              </div>

              {/* Seating Grid */}
              <div
                className={`grid gap-3 w-full max-w-[280px] ${
                  selected.capacity > 10 ? 'grid-cols-4' : 'grid-cols-3'
                }`}
              >
                {Array.from({ length: selected.capacity }, (_, i) => i + 1).map(num => {
                  const occupied = selected.occupied_seats.includes(num);
                  const isChosen = seat === num;

                  return (
                    <button
                      key={num}
                      type="button"
                      disabled={occupied || booking}
                      onClick={() => setSeat(num)}
                      className={`w-12 h-12 rounded-2xl font-black text-sm flex items-center justify-center transition-all duration-200 shadow-sm ${
                        occupied
                          ? 'bg-slate-300 text-slate-400 cursor-not-allowed border-0 shadow-inner'
                          : isChosen
                          ? 'bg-teal-600 text-white ring-4 ring-teal-500/30 scale-105 shadow-md'
                          : 'bg-white hover:bg-teal-50 border-2 border-teal-500 text-teal-700'
                      }`}
                      aria-label={`Seat ${num}${occupied ? ' (Occupied)' : isChosen ? ' (Selected)' : ' (Available)'}`}
                    >
                      {num}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center justify-center gap-6 mt-8 text-xs font-bold text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-teal-500 bg-white"></span>
                  <span>Available</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-teal-600"></span>
                  <span>Selected</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-slate-300"></span>
                  <span>Booked</span>
                </div>
              </div>
            </div>

            {/* Passenger Details & Booking Form */}
            <form onSubmit={handleBook} className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <span className="text-[10px] font-extrabold uppercase text-slate-500 block">
                  Passenger Contact Information
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      maxLength={100}
                      value={passengerName}
                      onChange={e => setPassengerName(e.target.value)}
                      placeholder="e.g. Adebayo Johnson"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Mobile Phone Number</label>
                    <input
                      type="tel"
                      required
                      maxLength={30}
                      value={passengerPhone}
                      onChange={e => setPassengerPhone(e.target.value)}
                      placeholder="0801 234 5678"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200/60">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Next of Kin Full Name
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={100}
                      value={nokName}
                      onChange={e => setNokName(e.target.value)}
                      placeholder="Emergency contact name"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Next of Kin Phone
                    </label>
                    <input
                      type="tel"
                      required
                      maxLength={30}
                      value={nokPhone}
                      onChange={e => setNokPhone(e.target.value)}
                      placeholder="Emergency phone number"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
              </div>

              {/* Order Summary */}
              <div className="bg-teal-50/60 border border-teal-200 p-4 rounded-2xl space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Selected Seat:</span>
                  <span className="font-extrabold text-teal-900">
                    {seat ? `Seat #${seat}` : 'None chosen yet'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Standard Fare:</span>
                  <span className="font-bold text-slate-900">{money(selected.fare)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Platform Fee:</span>
                  <span className="font-bold text-emerald-600">₦0.00 (Zero Fee)</span>
                </div>
                <div className="border-t border-teal-200 pt-2 flex justify-between text-sm font-black text-slate-900">
                  <span>Total Payable:</span>
                  <span className="text-teal-700 text-lg">{money(selected.fare)}</span>
                </div>
              </div>

              {!user && !cash ? (
                <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl text-xs text-amber-900 flex items-center justify-between">
                  <span>Sign in is required to complete online seat reservations.</span>
                  <Link
                    to={`/login?next=${encodeURIComponent(
                      '/?' + new URLSearchParams({ origin, destination, date }).toString()
                    )}`}
                    className="bg-amber-600 text-white font-bold px-3 py-1.5 rounded-xl hover:bg-amber-700 transition"
                  >
                    Sign in to Continue
                  </Link>
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={!seat || booking}
                  className="w-full bg-gradient-to-r from-teal-600 via-teal-700 to-teal-800 hover:from-teal-700 hover:to-teal-900 disabled:opacity-50 text-white font-extrabold py-4 rounded-2xl text-xs uppercase tracking-wider transition shadow-lg shadow-teal-700/20 shimmer-btn flex items-center justify-center gap-2"
                >
                  {booking ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>{cash ? 'Issuing Cash Ticket…' : 'Connecting to Paystack Gateway…'}</span>
                    </>
                  ) : cash ? (
                    `Issue Cash Ticket · ${money(selected.fare)}`
                  ) : (
                    `Lock Seat #${seat || ''} & Proceed to Paystack`
                  )}
                  {!booking && <ArrowRight size={14} />}
                </button>
              )}
            </form>
          </div>
        </section>
      )}

      {/* GPS Tracking Modal */}
      {gpsTrip && (
        <GpsTrackingModal
          isOpen={Boolean(gpsTrip)}
          onClose={() => setGpsTrip(null)}
          busReg={gpsTrip.bus?.registration_number || 'TH-104'}
          coachName={gpsTrip.bus?.model || 'Transit Cruiser Express'}
          origin={gpsTrip.origin}
          destination={gpsTrip.destination}
        />
      )}
    </section>
  );
}
