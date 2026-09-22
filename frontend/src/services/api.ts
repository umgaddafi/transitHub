import axios from 'axios';
import type { User, UserRole } from '../types/user';
import type { Ticket, Trip, BookingPayload } from '../types/ticket';

const TOKEN_KEY = 'transithub_session';
export const sessionToken = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (token: string) => sessionStorage.setItem(TOKEN_KEY, token),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

export const getApiBaseUrl = (): string => {
  const envUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (envUrl) {
    if (envUrl === '/api' || envUrl === '/') return '/api';
    return `${envUrl.replace(/\/$/, '')}/api`;
  }
  if (typeof window !== 'undefined' && window.location) {
    const { pathname, port } = window.location;
    if (port === '5173' || port === '5174' || port === '5175' || (import.meta as any).env?.DEV) {
      return '/api';
    }
    if (pathname.startsWith('/transit')) {
      return '/transit/api';
    }
  }
  return '/api';
};

export const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 30000,
  headers: { Accept: 'application/json' },
});
api.interceptors.request.use(config => {
  const token = sessionToken.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use(response => response, error => {
  if (error.response?.status === 401 && sessionToken.get()) {
    sessionToken.clear();
    window.dispatchEvent(new Event('session-expired'));
  }
  return Promise.reject(error);
});
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const errors = error.response?.data?.errors;
    if (errors) return Object.values(errors).flat().join(' ');
    if (error.response?.data?.message) return error.response.data.message;
    if (!error.response) return 'Unable to reach the server. Check your connection and try again.';
    return `Request failed (${error.response.status}). Please try again.`;
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
interface AuthResponse { user: User; token: string; expires_at: string }
export const authService = {
  login: async (email: string, password: string) => (await api.post<AuthResponse>('/auth/login', { email, password })).data,
  register: async (payload: { name: string; email: string; phone: string; password: string; password_confirmation: string }) => (await api.post<AuthResponse>('/auth/register', payload)).data,
  me: async () => (await api.get<{ user: User }>('/auth/me')).data.user,
  logout: async () => { await api.post('/auth/logout'); },
};
export const rolePath: Record<UserRole, string> = { passenger: '/client', admin: '/admin', driver: '/driver', pos: '/pos', marshal: '/marshal', dispatch: '/dispatch', finance: '/finance' };
export const bookingService = {
  search: async (origin: string, destination: string, date: string, vehicle_type = '') => (await api.get<{ results: Trip[] }>('/search', { params: { origin, destination, date, ...(vehicle_type ? { vehicle_type } : {}) } })).data.results,
  bookTicket: async (payload: BookingPayload, cash = false) => (await api.post<{ ticket: Ticket }>(cash ? '/pos/issue' : '/tickets/book', cash ? { ...payload, payment_method: 'Cash', cash_received: true } : payload)).data.ticket,
  tickets: async () => (await api.get<{ tickets: Ticket[] }>('/tickets')).data.tickets,
  lookupTicket: async (pnr: string) => (await api.get<{ ticket: Ticket }>(`/tickets/lookup/${encodeURIComponent(pnr.trim().toUpperCase())}`)).data.ticket,
  cancelTicket: async (pnr: string) => (await api.post<{ ticket: Ticket; message: string }>(`/tickets/cancel/${encodeURIComponent(pnr)}`)).data,
  startPayment: async (pnr: string) => (await api.post<{ authorization_url: string }>('/payments/initialize', { pnr_code: pnr })).data,
  verifyPayment: async (reference: string) => (await api.post<{ ticket: Ticket; message?: string }>('/payments/verify', { reference })).data,
};
export const money = (amount: number | string) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(Number(amount));
export const dateTime = (value?: string) => value ? new Date(value).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' }) + ' WAT' : 'Not available';
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
