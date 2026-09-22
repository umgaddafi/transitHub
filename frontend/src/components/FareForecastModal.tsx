interface FareForecastModalProps {
  isOpen: boolean;
  onClose: () => void;
  origin?: string;
  destination?: string;
}

export function FareForecastModal({ isOpen, onClose, origin = 'Lagos', destination = 'Abuja' }: FareForecastModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 text-white rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-slate-800 relative animate-in fade-in zoom-in duration-200">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-9 h-9 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition"
          aria-label="Close modal"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>

        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <i className="fa-solid fa-chart-column text-lg"></i>
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-400/10 px-2.5 py-0.5 rounded border border-amber-400/20">
                AI Price Prediction
              </span>
              <h3 className="text-base sm:text-lg font-black text-white">
                7-Day Fare Forecast ({origin} → {destination})
              </h3>
            </div>
          </div>

          <p className="text-xs text-slate-300">
            Our AI neural model analyzes historical traffic & seat demand. Wednesday offers the{' '}
            <strong className="text-emerald-400">Lowest Fare (₦18,500)</strong>.
          </p>

          {/* 7-Day Bar Chart Graph */}
          <div className="bg-slate-950 p-4 sm:p-6 rounded-2xl border border-slate-800 flex items-end justify-between gap-1.5 sm:gap-2 h-44 sm:h-48 pt-8">
            <div className="flex flex-col items-center gap-2 flex-1">
              <span className="text-[9px] sm:text-[10px] text-slate-400">₦22.5k</span>
              <div className="w-full bg-teal-600 h-24 sm:h-28 rounded-t-lg forecast-bar"></div>
              <span className="text-[10px] font-bold text-slate-300">Mon</span>
            </div>

            <div className="flex flex-col items-center gap-2 flex-1">
              <span className="text-[9px] sm:text-[10px] text-slate-400">₦20.0k</span>
              <div className="w-full bg-teal-600 h-16 sm:h-20 rounded-t-lg forecast-bar"></div>
              <span className="text-[10px] font-bold text-slate-300">Tue</span>
            </div>

            <div className="flex flex-col items-center gap-2 flex-1">
              <span className="text-[9px] sm:text-[10px] text-emerald-400 font-bold">₦18.5k</span>
              <div className="w-full bg-emerald-500 h-14 sm:h-16 rounded-t-lg forecast-bar ring-2 ring-emerald-400"></div>
              <span className="text-[10px] font-bold text-emerald-400">Wed</span>
            </div>

            <div className="flex flex-col items-center gap-2 flex-1">
              <span className="text-[9px] sm:text-[10px] text-slate-400">₦21.0k</span>
              <div className="w-full bg-teal-600 h-20 sm:h-24 rounded-t-lg forecast-bar"></div>
              <span className="text-[10px] font-bold text-slate-300">Thu</span>
            </div>

            <div className="flex flex-col items-center gap-2 flex-1">
              <span className="text-[9px] sm:text-[10px] text-slate-400">₦26.0k</span>
              <div className="w-full bg-amber-500 h-28 sm:h-32 rounded-t-lg forecast-bar"></div>
              <span className="text-[10px] font-bold text-amber-400">Fri</span>
            </div>

            <div className="flex flex-col items-center gap-2 flex-1">
              <span className="text-[9px] sm:text-[10px] text-slate-400">₦28.0k</span>
              <div className="w-full bg-rose-500 h-32 sm:h-36 rounded-t-lg forecast-bar"></div>
              <span className="text-[10px] font-bold text-rose-400">Sat</span>
            </div>

            <div className="flex flex-col items-center gap-2 flex-1">
              <span className="text-[9px] sm:text-[10px] text-slate-400">₦24.0k</span>
              <div className="w-full bg-teal-600 h-26 sm:h-30 rounded-t-lg forecast-bar"></div>
              <span className="text-[10px] font-bold text-slate-300">Sun</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white font-extrabold py-3 rounded-xl text-xs uppercase tracking-wider transition shimmer-btn"
          >
            Got It, Lock Current Best Price
          </button>
        </div>
      </div>
    </div>
  );
}

