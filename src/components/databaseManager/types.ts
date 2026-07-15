import { EquipmentAlert, LiveEvent, Shift, StaffMember } from '../../types';

export type CollectionTab = 'events' | 'staff' | 'shifts' | 'alerts' | 'security';
export type DataCollectionTab = Exclude<CollectionTab, 'security'>;
export type SecuritySubTab = 'credentials' | 'schema' | 'bridge';

export interface MariaDbConfig {
  host: string;
  port: string;
  user: string;
  name: string;
  password: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  logs?: string[];
  advice?: string;
}

export type DatabaseRecord = LiveEvent | StaffMember | Shift | EquipmentAlert;
