import { useState, type FormEvent } from 'react';
import { bookingService, errorMessage, dateTime, money } from '../services/api';
import type { Ticket } from '../types/ticket';
import { QrCode } from './QrCode';

interface PnrLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PnrLookupModal({ isOpen, onClose }: PnrLookupModalProps) {
  const [pnr, setPnr] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ticket, setTicket] = useState<Ticket | null>(null);

  if (!isOpen) return null;

  const handleLookup = async (e: FormEvent) => {
    e.preventDefault();
    if (!pnr.trim()) return;

    setLoading(true);
    setError('');
    setTicket(null);

    try {
      const data = await bookingService.lookupTicket(pnr);
      setTicket(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 text-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-800 relative animate-in fade-in zoom-in duration-200 space-y-5">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-9 h-9 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition"
          aria-label="Close modal"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>

        <div className="space-y-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-teal-400 bg-teal-500/10 px-3 py-1 rounded-full border border-teal-500/20">
            Ticket Tracker & Pass Download
          </span>
          <h3 className="text-xl font-black text-white">PNR Status & Pass Lookup</h3>
          <p className="text-xs text-slate-400">
            Enter your booking reference e.g. TH-849201 to inspect digital pass or check payment status.
          </p>
        </div>

        <form onSubmit={handleLookup} className="flex gap-2">
          <input
            type="text"
            value={pnr}
            onChange={e => setPnr(e.target.value.toUpperCase())}
            placeholder="Enter PNR e.g. TH-849201"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs font-mono text-white focus:outline-none focus:border-teal-500 uppercase"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold px-5 py-3 rounded-xl text-xs uppercase tracking-wider transition whitespace-nowrap"
          >
            {loading ? 'Checking…' : 'Verify PNR'}
          </button>
        </form>

        {error && (
          <div className="bg-rose-950/50 border border-rose-800 text-rose-300 p-3 rounded-xl text-xs">
            {error}
          </div>
        )}

        {ticket && (
          <div className="bg-slate-950 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">PNR Reference</span>
                <strong className="text-teal-400 font-mono text-base">{ticket.pnr_code}</strong>
                <p className="text-white font-bold text-sm mt-1">{ticket.route_name}</p>
                <p className="text-slate-400 text-xs">{dateTime(ticket.trip?.departure_time)}</p>
              </div>
              <div className="text-right flex flex-col items-end gap-2">
                <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  {ticket.status}
                </span>
                <QrCode value={ticket.pnr_code} size={84} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-800 pt-3">
              <div>
                <span className="text-slate-500 block text-[10px]">Passenger</span>
                <span className="text-slate-200 font-bold">{ticket.passenger_name}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Seat Number</span>
                <span className="text-slate-200 font-bold">Seat {ticket.seat_number}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Fare Paid</span>
                <span className="text-emerald-400 font-bold">{money(ticket.fare_paid)}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Next of Kin</span>
                <span className="text-slate-200 font-bold">{ticket.nok_name}</span>
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition"
              >
                <i className="fa-solid fa-print mr-1.5"></i> Print Boarding Pass
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

