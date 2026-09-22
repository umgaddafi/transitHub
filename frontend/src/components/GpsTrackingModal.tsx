interface GpsTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  busReg?: string;
  coachName?: string;
  origin?: string;
  destination?: string;
}

export function GpsTrackingModal({
  isOpen,
  onClose,
  busReg = 'TH-104',
  coachName = 'Transit Cruiser Express',
  origin = 'Lagos',
  destination = 'Abuja',
}: GpsTrackingModalProps) {
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
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center border border-teal-500/30">
              <i className="fa-solid fa-location-crosshairs text-lg"></i>
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-teal-400 bg-teal-500/10 px-2.5 py-0.5 rounded border border-teal-500/20">
                Real-Time Telematics
              </span>
              <h3 className="text-base sm:text-lg font-black text-white">
                {coachName} ({busReg})
              </h3>
            </div>
          </div>

          {/* Simulated Visual Map Canvas */}
          <div className="map-canvas h-48 sm:h-52 rounded-2xl border border-slate-800 relative overflow-hidden flex flex-col justify-between p-4 shadow-inner">
            <div className="flex justify-between items-center text-[10px] text-slate-400 uppercase font-bold">
              <span>
                <i className="fa-solid fa-circle text-emerald-400 mr-1 animate-pulse"></i> Live GPS Feed
              </span>
              <span className="text-teal-400 font-mono">LAT 6.5244° N, LON 3.3792° E</span>
            </div>

            {/* Highway Progress Route Line */}
            <div className="my-auto relative">
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-teal-500 to-amber-400 h-full w-[68%]"></div>
              </div>
              <div className="absolute left-[68%] -top-4 -translate-x-1/2 flex flex-col items-center">
                <span className="bg-teal-500 text-slate-950 font-black text-[9px] px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap">
                  Coach {busReg}
                </span>
                <i className="fa-solid fa-bus text-amber-400 text-sm mt-0.5 animate-bounce"></i>
              </div>
            </div>

            <div className="flex justify-between text-[11px] sm:text-xs font-bold text-slate-300">
              <span>{origin} Terminal</span>
              <span className="text-amber-400 font-extrabold">Active Transit Corridor</span>
              <span>{destination} Hub</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5 sm:gap-3 text-xs text-center">
            <div className="bg-slate-950 p-2.5 sm:p-3 rounded-2xl border border-slate-800">
              <span className="text-slate-400 text-[9px] sm:text-[10px] uppercase font-bold block">Current Speed</span>
              <strong className="text-white text-xs sm:text-sm font-black">85 km/h</strong>
            </div>
            <div className="bg-slate-950 p-2.5 sm:p-3 rounded-2xl border border-slate-800">
              <span className="text-slate-400 text-[9px] sm:text-[10px] uppercase font-bold block">Est. Delay</span>
              <strong className="text-emerald-400 text-xs sm:text-sm font-black">0 Mins (On Time)</strong>
            </div>
            <div className="bg-slate-950 p-2.5 sm:p-3 rounded-2xl border border-slate-800">
              <span className="text-slate-400 text-[9px] sm:text-[10px] uppercase font-bold block">Safety Status</span>
              <strong className="text-teal-400 text-xs sm:text-sm font-black">All Systems Normal</strong>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition"
          >
            Close Telematics View
          </button>
        </div>
      </div>
    </div>
  );
}

