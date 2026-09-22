import { useState, useEffect } from 'react';
import { Clock, Printer, CreditCard, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { bookingService, dateTime, errorMessage, money } from '../services/api';
import type { Ticket } from '../types/ticket';
import { QrCode } from './QrCode';

export function TicketCard({ ticket, onChanged }: { ticket: Ticket; onChanged: (ticket: Ticket) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string | null>(null);

  const pending = ticket.status === 'Pending Payment';
  const confirmed = ['Confirmed', 'Issued & Paid', 'Boarded', 'Completed'].includes(ticket.status);
  const cancellable = pending || ['Confirmed', 'Issued & Paid'].includes(ticket.status);

  // Expiration countdown for pending payment holds
  useEffect(() => {
    if (!pending) return;

    const expiryStr = ticket.expires_at || ticket.hold_expires_at;
    if (!expiryStr) return;

    const expiryTime = new Date(expiryStr).getTime();

    const updateTimer = () => {
      const now = Date.now();
      const diff = expiryTime - now;

      if (diff <= 0) {
        setTimeLeft('Hold Expired');
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${mins}m ${secs < 10 ? '0' : ''}${secs}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [pending, ticket.expires_at, ticket.hold_expires_at]);

  const pay = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await bookingService.startPayment(ticket.pnr_code);
      const url = new URL(result.authorization_url);
      if (url.protocol !== 'https:' || !(url.hostname === 'checkout.paystack.com' || url.hostname.endsWith('.paystack.com'))) {
        throw new Error('The payment provider returned an invalid checkout link.');
      }
      window.location.assign(url.href);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <article className="bg-white rounded-3xl border border-slate-200 shadow-lg overflow-hidden transition hover:shadow-xl printable-pass">
      {/* Top Header Strip */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-900 text-white p-5 flex flex-wrap justify-between items-center gap-3">
        <div>
          <span className="text-[10px] uppercase font-mono tracking-widest text-teal-300 block">
            Booking Reference / PNR
          </span>
          <h3 className="text-2xl font-black font-mono tracking-tight text-white flex items-center gap-2">
            {ticket.pnr_code}
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {confirmed && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <CheckCircle2 size={13} /> {ticket.status}
            </span>
          )}
          {pending && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <Clock size={13} className="animate-spin" /> {ticket.status}
            </span>
          )}
          {['Cancelled', 'Refunded'].includes(ticket.status) && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30">
              <ShieldAlert size={13} /> {ticket.status}
            </span>
          )}
          {['Cancellation Requested', 'Payment Review'].includes(ticket.status) && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <AlertCircle size={13} /> {ticket.status}
            </span>
          )}
        </div>
      </div>

      {/* Main Body */}
      <div className="p-6 space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-100">
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400">Scheduled Route</span>
            <h4 className="text-xl font-extrabold text-slate-900">{ticket.route_name}</h4>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Departs: {dateTime(ticket.trip?.departure_time || ticket.departure_time)}
            </p>
          </div>

          {/* QR Code section */}
          {confirmed && (
            <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-2xl border border-slate-200 shrink-0">
              <QrCode value={ticket.pnr_code} size={80} />
              <div className="text-left">
                <span className="text-[9px] uppercase font-bold text-slate-400 block">Boarding Pass</span>
                <span className="text-xs font-extrabold text-teal-700">Scan at Gate</span>
                <span className="text-[10px] text-slate-500 block font-mono">PNR: {ticket.pnr_code}</span>
              </div>
            </div>
          )}
        </div>

        {/* Key Ticket Details Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
            <span className="text-slate-400 block text-[10px] font-bold uppercase">Passenger</span>
            <strong className="text-slate-900 font-extrabold text-sm truncate block">{ticket.passenger_name}</strong>
            <span className="text-slate-500 text-[10px]">{ticket.passenger_phone}</span>
          </div>

          <div className="bg-teal-50/60 p-3 rounded-2xl border border-teal-100">
            <span className="text-teal-700 block text-[10px] font-bold uppercase">Seat Allocation</span>
            <strong className="text-teal-900 font-black text-lg block">Seat #{ticket.seat_number}</strong>
            <span className="text-teal-600 text-[10px]">{ticket.trip?.bus?.vehicle_type || 'Reserved Coach'}</span>
          </div>

          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
            <span className="text-slate-400 block text-[10px] font-bold uppercase">Fare Amount</span>
            <strong className="text-slate-900 font-extrabold text-sm block">{money(ticket.amount_due)}</strong>
            <span className="text-slate-500 text-[10px]">Zero booking fees</span>
          </div>

          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
            <span className="text-slate-400 block text-[10px] font-bold uppercase">Amount Paid</span>
            <strong className="text-emerald-700 font-extrabold text-sm block">{money(ticket.fare_paid)}</strong>
            <span className="text-slate-500 text-[10px]">{ticket.payment_method || 'Online'}</span>
          </div>
        </div>

        {/* Emergency / Next of Kin */}
        {ticket.nok_name && (
          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-4 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
            <span className="font-bold text-slate-700">Next of Kin:</span>
            <span>{ticket.nok_name}</span>
            {ticket.nok_phone && <span className="font-mono text-slate-600">({ticket.nok_phone})</span>}
          </div>
        )}

        {/* Pending payment banner & timer */}
        {pending && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <Clock size={14} className="text-amber-600" /> Temporary Seat Hold
              </span>
              <p className="text-xs text-amber-800">
                Seat #{ticket.seat_number} is reserved temporarily. Complete Paystack payment before timeout to guarantee your seat.
              </p>
            </div>
            {timeLeft && (
              <div className="bg-amber-100 px-3.5 py-1.5 rounded-xl border border-amber-300 font-mono font-black text-amber-900 text-xs shrink-0">
                Expires in: {timeLeft}
              </div>
            )}
          </div>
        )}

        {ticket.status === 'Cancellation Requested' && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3.5 rounded-2xl text-xs flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-600 shrink-0" />
            <span>Cancellation and refund review is pending. The ticket cannot be used for boarding.</span>
          </div>
        )}

        {ticket.status === 'Payment Review' && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3.5 rounded-2xl text-xs flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-600 shrink-0" />
            <span>Payment needs review because seat reservation could not be automatically confirmed. Finance will review for refund.</span>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-2xl text-xs" role="alert">
            {error}
          </div>
        )}

        {message && (
          <div className="bg-teal-50 border border-teal-200 text-teal-800 p-3.5 rounded-2xl text-xs" role="status">
            {message}
          </div>
        )}

        {/* Actions bar (hidden on print) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100 no-print">
          <div className="flex flex-wrap items-center gap-2">
            {pending && (
              <button
                type="button"
                disabled={busy}
                onClick={() => { void pay(); }}
                className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-extrabold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider transition shadow-md flex items-center gap-2"
              >
                <CreditCard size={14} />
                {busy ? 'Opening payment…' : `Pay Now · ${money(ticket.amount_due)}`}
              </button>
            )}

            {confirmed && (
              <button
                type="button"
                onClick={() => window.print()}
                className="bg-slate-900 hover:bg-teal-600 text-white font-bold px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider transition shadow-sm flex items-center gap-2"
              >
                <Printer size={14} /> Print Digital Pass
              </button>
            )}
          </div>

          <div>
            {cancellable && !confirmCancel && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmCancel(true)}
                className="text-rose-600 hover:text-rose-700 font-bold text-xs hover:underline transition"
              >
                {pending ? 'Cancel reservation' : 'Request cancellation & refund'}
              </button>
            )}
          </div>
        </div>

        {confirmCancel && (
          <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl space-y-3 no-print">
            <p className="text-xs font-semibold text-rose-900">
              {pending
                ? 'Are you sure you want to cancel this unpaid reservation and release the seat?'
                : 'Request cancellation of this ticket? It will become unavailable for boarding while the finance desk reviews the refund.'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    const result = await bookingService.cancelTicket(ticket.pnr_code);
                    onChanged(result.ticket);
                    setMessage(result.message);
                    setConfirmCancel(false);
                  } catch (e) {
                    setError(errorMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition"
              >
                {busy ? 'Submitting…' : 'Confirm Cancellation'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmCancel(false)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-4 py-2 rounded-xl text-xs transition"
              >
                Keep Ticket
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
