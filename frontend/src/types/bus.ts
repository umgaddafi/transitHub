import type { VehicleType } from './ticket';

export interface Bus {
  id?: number;
  reg_number: string;
  model: string;
  vehicle_type: VehicleType;
  capacity: number;
  driver_name: string;
  status: string;
}
