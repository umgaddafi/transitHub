import { CalendarX2, ArrowRight, MapPin, CalendarDays, RefreshCw, X, Sparkles } from 'lucide-react';

interface NoScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  origin: string;
  destination: string;
  date: string;
  onSelectAlternative?: (origin: string, destination: string, date?: string) => void;
}

export function NoScheduleModal({
  isOpen,
  onClose,
  origin,
  destination,
  date,
  onSelectAlternative,
}: NoScheduleModalProps) {
  if (!isOpen) return null;

  // Format date nicely if valid
  const formattedDate = (() => {
    try {
      if (!date) return 'Selected Date';
      const parsed = new Date(date + 'T00:00:00');
      return parsed.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return date;
    }
  })();

  const nextDay = (() => {
    try {
      const d = new Date((date || new Date().toISOString().split('T')[0]) + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    } catch {
      return '';
    }
  })();

  const popularRoutes = [
    { from: 'Lagos (Jibowu Terminus)', to: 'Abuja (Utako Park)', label: 'Lagos → Abuja' },
    { from: 'Lagos (Jibowu Terminus)', to: 'Benin City (Ramat Park)', label: 'Lagos → Benin City' },
    { from: 'Abuja (Utako Park)', to: 'Port Harcourt (Waterlines)', label: 'Abuja → Port Harcourt' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 text-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-800 relative animate-in zoom-in-95 duration-200 space-y-5"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="no-schedule-title"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center transition cursor-pointer"
          aria-label="Close modal"
        >
          <X size={16} />
        </button>

        {/* Header with Icon */}
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0">
            <CalendarX2 size={24} />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20 inline-block mb-1">
              AI Transit Notice
            </span>
            <h3 id="no-schedule-title" className="text-lg font-black text-white leading-tight">
              No Schedule Found
            </h3>
            <p className="text-xs text-rose-300 font-semibold mt-0.5">
              There is no schedule for this route and date.
            </p>
          </div>
        </div>

        {/* Searched Details Box */}
        <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800/80 space-y-2.5">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Requested Journey:</span>
            <span className="flex items-center gap-1 text-teal-400 font-semibold">
              <CalendarDays size={13} />
              {formattedDate}
            </span>
          </div>

          <div className="flex items-center gap-2 text-sm font-bold text-slate-200 bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
            <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
              <MapPin size={14} className="text-emerald-400 shrink-0" />
              <span className="truncate">{origin || 'Origin'}</span>
            </div>
            <ArrowRight size={14} className="text-slate-500 shrink-0" />
            <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
              <MapPin size={14} className="text-amber-400 shrink-0" />
              <span className="truncate">{destination || 'Destination'}</span>
            </div>
          </div>
        </div>

        {/* Suggestion & Next Day Action */}
        {nextDay && onSelectAlternative && (
          <div>
            <button
              type="button"
              onClick={() => {
                onSelectAlternative(origin, destination, nextDay);
                onClose();
              }}
              className="w-full bg-teal-600/15 hover:bg-teal-600/25 border border-teal-500/30 text-teal-300 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <RefreshCw size={14} />
              Check Next Day Schedule (+1 Day)
            </button>
          </div>
        )}

        {/* Popular Active Routes */}
        <div className="space-y-2 pt-1 border-t border-slate-800/80">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block">
            Guaranteed Daily Express Routes:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {popularRoutes.map(r => (
              <button
                key={r.label}
                type="button"
                onClick={() => {
                  onSelectAlternative?.(r.from, r.to, date);
                  onClose();
                }}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-700 transition flex items-center gap-1 cursor-pointer"
              >
                <Sparkles size={11} className="text-amber-400" />
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="pt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-extrabold py-3 px-4 rounded-xl text-xs transition cursor-pointer"
          >
            Modify Search
          </button>
        </div>
      </div>
    </div>
  );
}
