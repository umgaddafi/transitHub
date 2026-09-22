import { useState, type FormEvent, type ChangeEvent } from 'react';
import { useToast } from '../context/ToastContext';
import { money } from '../services/api';

interface CorporateCharterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CorporateCharterModal({ isOpen, onClose }: CorporateCharterModalProps) {
  const { showToast } = useToast();
  const [org, setOrg] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [headcount, setHeadcount] = useState('32');
  const [route, setRoute] = useState('Lagos to Abuja');
  const [paymentMethod, setPaymentMethod] = useState('Centralized Corporate PO (Net 30 Invoicing)');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [passengerCount, setPassengerCount] = useState<number | null>(null);
  const [submittedQuote, setSubmittedQuote] = useState<{
    org: string;
    route: string;
    headcount: number;
    estimatedTotal: number;
    discountPercent: number;
    refCode: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleManifestUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    // Simulate parsing the file
    const simulatedCount = Math.max(12, Math.floor(Math.random() * 35) + 10);
    setPassengerCount(simulatedCount);
    setHeadcount(String(simulatedCount));
    showToast('Manifest Processed', `Parsed ${file.name} successfully. ${simulatedCount} passengers identified.`, 'success');
  };

  const handleDownloadTemplate = (e: React.MouseEvent) => {
    e.preventDefault();
    const csvContent = 'data:text/csv;charset=utf-8,Full Name,Phone Number,Email,Seat Preference,Next of Kin Name,Next of Kin Phone\nJohn Doe,+2348012345678,john@example.com,Window,Jane Doe,+2348098765432\nMary Smith,+2348023456789,mary@example.com,Aisle,Bob Smith,+2348087654321';
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'transithub_corporate_manifest_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Template Downloaded', 'Corporate passenger manifest template (.CSV) downloaded.', 'info');
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const count = parseInt(headcount, 10) || 20;
    const baseRatePerHead = route.includes('Benin') ? 16500 : 25000;
    const discount = count >= 30 ? 0.20 : (count >= 15 ? 0.15 : 0.10);
    const subtotal = count * baseRatePerHead;
    const total = Math.round(subtotal * (1 - discount));
    const randomRef = 'GRP-' + Math.floor(100000 + Math.random() * 900000);

    setSubmittedQuote({
      org,
      route,
      headcount: count,
      estimatedTotal: total,
      discountPercent: Math.round(discount * 100),
      refCode: randomRef,
    });

    showToast('Quote Generated', `Charter reservation #${randomRef} calculated with ${Math.round(discount * 100)}% corporate discount.`, 'success');
  };

  const handleReset = () => {
    setSubmittedQuote(null);
    setOrg('');
    setUploadedFileName(null);
    setPassengerCount(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 text-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-800 relative animate-in fade-in zoom-in duration-200 space-y-5 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 w-9 h-9 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition"
          aria-label="Close modal"
        >
          <i className="fa-solid fa-xmark"></i>
        </button>

        <div className="space-y-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-400/10 px-3 py-1 rounded-full border border-amber-400/20">
            Group & Corporate Booking Engine
          </span>
          <h3 className="text-xl font-black text-white">Bulk Charter & Manifest Upload</h3>
          <p className="text-xs text-slate-400">
            Request bulk group seat allocations, up to 20% enterprise volume discounts, or private full coach charters.
          </p>
        </div>

        {submittedQuote ? (
          <div className="space-y-4 bg-slate-950 p-5 rounded-2xl border border-teal-500/40">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-teal-400">Corporate Quotation</span>
                <h4 className="text-lg font-black text-white">{submittedQuote.org}</h4>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                {submittedQuote.refCode}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs text-slate-300 py-3 border-y border-slate-800">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Route</span>
                <span className="font-bold text-white">{submittedQuote.route}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Headcount</span>
                <span className="font-bold text-white">{submittedQuote.headcount} Passengers</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Discount Applied</span>
                <span className="font-bold text-emerald-400">{submittedQuote.discountPercent}% Enterprise Discount</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Payment Terms</span>
                <span className="font-bold text-white">{paymentMethod}</span>
              </div>
            </div>

            <div className="flex justify-between items-center bg-teal-950/40 p-3.5 rounded-xl border border-teal-800">
              <span className="text-xs font-bold text-teal-200">Total Estimated Rate:</span>
              <strong className="text-xl font-black text-amber-400">{money(submittedQuote.estimatedTotal)}</strong>
            </div>

            <p className="text-[11px] text-slate-400">
              An enterprise booking advisor has been assigned to your quotation. An official Net 30 Pro-Forma Invoice will be transmitted to your email within 15 minutes.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition"
              >
                Create Another Request
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 font-bold mb-1">Organization / Company Name</label>
                <input
                  type="text"
                  required
                  value={org}
                  onChange={e => setOrg(e.target.value)}
                  placeholder="e.g. Horizon Tech Inc."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 font-bold mb-1">Contact Officer Name</label>
                <input
                  type="text"
                  required
                  value={contactName}
                  onChange={e => setContactName(e.target.value)}
                  placeholder="e.g. Samuel Adekunle"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 font-bold mb-1">Corporate Email</label>
                <input
                  type="email"
                  required
                  value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                  placeholder="logistics@company.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 font-bold mb-1">Official Mobile Phone</label>
                <input
                  type="tel"
                  required
                  value={contactPhone}
                  onChange={e => setContactPhone(e.target.value)}
                  placeholder="+234 800 000 0000"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 font-bold mb-1">Travel Route</label>
                <select
                  value={route}
                  onChange={e => setRoute(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-teal-500"
                >
                  <option value="Lagos to Abuja">Lagos → Abuja</option>
                  <option value="Abuja to Port Harcourt">Abuja → Port Harcourt</option>
                  <option value="Lagos to Benin City">Lagos → Benin City</option>
                  <option value="Abuja to Kano">Abuja → Kano</option>
                  <option value="Port Harcourt to Lagos">Port Harcourt → Lagos</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 font-bold mb-1">Expected Headcount</label>
                <select
                  value={headcount}
                  onChange={e => setHeadcount(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-teal-500"
                >
                  <option value="15">10 - 20 Passengers (Mini Shuttle)</option>
                  <option value="32">25 - 35 Passengers (Executive Coach)</option>
                  <option value="50">40 - 50+ Passengers (Full Jetliner Charter)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1">Payment Method & Terms</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-teal-500"
              >
                <option value="Centralized Corporate PO (Net 30 Invoicing)">Centralized Corporate PO (Net 30 Invoicing)</option>
                <option value="Direct Bank Wire Transfer">Direct Bank Wire Transfer</option>
                <option value="Corporate Debit/Credit Card">Corporate Debit/Credit Card</option>
              </select>
            </div>

            {/* Manifest Upload Simulator */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-extrabold text-white text-xs">Bulk Roster CSV Manifest Upload</span>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="text-teal-400 hover:underline text-[11px] font-bold flex items-center gap-1"
                >
                  <i className="fa-solid fa-download"></i> CSV Template
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Upload employee or student roster containing passenger names, phones, and seat preferences.
              </p>
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={handleManifestUpload}
                className="w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-extrabold file:bg-teal-500/20 file:text-teal-400 hover:file:bg-teal-500/30 cursor-pointer"
              />
              {uploadedFileName && (
                <div className="text-emerald-400 text-xs font-semibold flex items-center gap-1.5 mt-1">
                  <i className="fa-solid fa-circle-check"></i>
                  <span>{uploadedFileName} ({passengerCount} passengers ready for batch boarding pass generation)</span>
                </div>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black py-3.5 rounded-xl uppercase tracking-wider shadow-lg transition"
            >
              Calculate Enterprise Charter Rate & Submit
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
