/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState } from 'react';

export interface ToastMessage {
  id: string;
  title: string;
  body: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface ToastContextType {
  toasts: ToastMessage[];
  showToast: (title: string, body: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (title: string, body: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    const id = crypto.randomUUID();
    const newToast: ToastMessage = { id, title, body, type };
    setToasts((prev) => [...prev, newToast]);

    setTimeout(() => {
      removeToast(id);
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[999] space-y-3 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => {
          let badgeColor = 'bg-teal-500';
          let border = 'border-teal-500/30';
          let text = 'text-teal-900';

          if (toast.type === 'success') {
            badgeColor = 'bg-emerald-500';
            border = 'border-emerald-500/40';
            text = 'text-emerald-950';
          } else if (toast.type === 'error') {
            badgeColor = 'bg-rose-500';
            border = 'border-rose-500/40';
            text = 'text-rose-950';
          } else if (toast.type === 'warning') {
            badgeColor = 'bg-amber-500';
            border = 'border-amber-500/40';
            text = 'text-amber-950';
          }

          return (
            <div
              key={toast.id}
              className={`toast-notification pointer-events-auto bg-white/95 backdrop-blur-md rounded-2xl p-4 shadow-xl border ${border} flex items-start gap-3 text-xs`}
            >
              <span className={`w-3 h-3 rounded-full mt-1 ${badgeColor} animate-pulse shrink-0`}></span>
              <div className="flex-1">
                <h4 className={`font-black text-xs ${text}`}>{toast.title}</h4>
                <p className="text-slate-600 mt-0.5 leading-relaxed">{toast.body}</p>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      toasts: [],
      showToast: () => {},
      removeToast: () => {},
    };
  }
  return context;
};
