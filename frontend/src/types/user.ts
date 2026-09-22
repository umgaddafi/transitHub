export type UserRole = 'passenger' | 'driver' | 'admin' | 'pos' | 'marshal' | 'dispatch' | 'finance';

export interface User {
  id?: number;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  avatar?: string;
  disabled_at?: string | null;
}
