import { useState, useRef, useEffect } from 'react';
import { api, errorMessage } from '../services/api';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
}

export function AiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: '👋 Hello! I am your TransitHub AI Copilot. Need assistance with seat options, bus amenities, luggage policies, or route schedules?',
    },
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  useEffect(() => {
    const handleToggle = () => setIsOpen(prev => !prev);
    window.addEventListener('toggle-ai-assistant', handleToggle);
    return () => window.removeEventListener('toggle-ai-assistant', handleToggle);
  }, []);

  const sendMessage = async (customText?: string) => {
    const query = (customText || input).trim();
    if (!query || loading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: 'user',
      text: query,
    };

    setMessages(prev => [...prev, userMsg]);
    if (!customText) setInput('');
    setLoading(true);

    try {
      const response = await api.post<{ status: string; reply: string }>('/ai/chat', { prompt: query });
      const aiReply = response.data.reply || 'I am here to assist with your TransitHub travels!';
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender: 'ai',
          text: aiReply,
        },
      ]);
    } catch (e) {
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender: 'ai',
          text: `⚠️ ${errorMessage(e)}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="ai-chat" className="fixed bottom-5 right-5 z-50 flex items-center no-print">
      {/* Floating Robot Trigger Button */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        aria-label="Toggle AI Assistant"
        className="relative w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-tr from-teal-700 via-teal-900 to-slate-950 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-transform duration-300 border-2 border-teal-400/50 group"
      >
        <i className="fa-solid fa-robot text-teal-300 text-xl sm:text-2xl group-hover:rotate-12 transition-transform duration-300"></i>
        <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-slate-950 flex items-center justify-center shadow-md">
          <i className="fa-solid fa-bolt text-[9px] text-white"></i>
        </span>
      </button>

      {/* Floating Drawer */}
      {isOpen && (
        <div className="absolute bottom-18 right-0 w-80 sm:w-96 bg-white rounded-3xl shadow-2xl border border-slate-200 p-4 sm:p-5 animate-in fade-in slide-in-from-bottom-5">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-extrabold text-slate-900">TransitHub AI Assistant</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-slate-600 text-sm p-1"
              aria-label="Close Assistant"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>

          {/* Quick Action Pills */}
          <div className="flex gap-2 overflow-x-auto py-3 no-scrollbar">
            <button
              onClick={() => void sendMessage('What is the luggage policy?')}
              className="bg-slate-100 hover:bg-teal-50 hover:text-teal-700 text-slate-600 text-[10px] font-bold px-3 py-1.5 rounded-full whitespace-nowrap border border-slate-200 transition shrink-0"
            >
              🧳 Luggage Policy
            </button>
            <button
              onClick={() => void sendMessage('What is the refund policy?')}
              className="bg-slate-100 hover:bg-teal-50 hover:text-teal-700 text-slate-600 text-[10px] font-bold px-3 py-1.5 rounded-full whitespace-nowrap border border-slate-200 transition shrink-0"
            >
              ⚡ Cancellations
            </button>
            <button
              onClick={() => void sendMessage('What are the vehicle options (HiAce vs Sienna)?')}
              className="bg-slate-100 hover:bg-teal-50 hover:text-teal-700 text-slate-600 text-[10px] font-bold px-3 py-1.5 rounded-full whitespace-nowrap border border-slate-200 transition shrink-0"
            >
              🚌 Fleet Comparison
            </button>
          </div>

          {/* Messages Area */}
          <div className="py-2 text-xs space-y-3 max-h-60 overflow-y-auto pr-1">
            {messages.map(m => (
              <div
                key={m.id}
                className={`p-3 rounded-2xl leading-relaxed whitespace-pre-line ${
                  m.sender === 'user'
                    ? 'bg-teal-700 text-white ml-6'
                    : 'bg-teal-50 border border-teal-200 text-slate-800 mr-4'
                }`}
              >
                {m.text}
              </div>
            ))}
            {loading && (
              <div className="bg-teal-50 border border-teal-200 p-3 rounded-2xl text-slate-500 mr-4 italic">
                Thinking…
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input */}
          <form
            onSubmit={e => {
              e.preventDefault();
              void sendMessage();
            }}
            className="flex gap-2 pt-2 border-t border-slate-100"
          >
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask AI: e.g. Do buses have AC?"
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-teal-600 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-xs hover:bg-teal-700 font-bold transition flex items-center justify-center shrink-0"
            >
              <i className="fa-solid fa-paper-plane"></i>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
