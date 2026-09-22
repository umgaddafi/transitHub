export type VehicleType = '14-Seater' | '7-Seater' | 'Executive AC Coach' | 'Sleeper Cabin' | 'Standard Shuttle';
export interface Trip {
  id?: number;
  trip_id: number;
  origin: string;
  destination: string;
  departure_time: string;
  arrival_time: string;
  fare: number | string;
  capacity: number;
  occupied_seats: number[];
  available_seats?: number[];
  seats_left: number;
  vehicle_type: VehicleType;
  bus?: { id?: number; reg_number?: string; registration_number?: string; model?: string; vehicle_type?: string; capacity?: number };
}
export interface Ticket {
  id: number;
  trip_id: number;
  pnr_code: string;
  passenger_name: string;
  passenger_phone?: string;
  nok_name: string;
  nok_phone: string;
  vehicle_type: VehicleType;
  seat_number: string | number;
  route_name: string;
  fare_paid: number | string;
  amount_due: number | string;
  payment_method?: string;
  status: string;
  expires_at?: string;
  hold_expires_at?: string;
  created_at?: string;
  updated_at?: string;
  payment_reference?: string;
  departure_time?: string;
  trip?: {
    departure_time: string;
    arrival_time: string;
    status: string;
    bus?: { id?: number; reg_number?: string; registration_number?: string; model?: string; vehicle_type?: string; capacity?: number };
  };
}
export interface BookingPayload {
  trip_id: number;
  seat_number: number;
  passenger_name: string;
  passenger_phone: string;
  nok_name: string;
  nok_phone: string;
  idempotency_key: string;
}
