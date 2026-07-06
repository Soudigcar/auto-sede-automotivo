export type UserRole = string;
export type LeadOrigin = string;
export type LeadStatus = string;
export type VehicleCategory = string;

export interface Store {
  id: string;
  store_name: string;
  responsible_name: string;
  responsible_phone: string;
  responsible_email: string;
  status: string;
}

export interface Lead {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_bank: string | null;
  interested_vehicle: string | null;
  vehicle_category_interest: string | null;
  origin: string;
  status: string;
  assigned_store_id: string | null;
  created_at: string;
}

export interface DashboardKpi {
  label: string;
  value: string | number;
  helper?: string;
}
