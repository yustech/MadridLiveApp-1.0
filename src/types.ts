export interface StaffMember {
  id: string; // e.g. 'usr_842'
  idCode: string; // e.g. 'SEC-042', 'MAD-L-842'
  name: string;
  role: 'Auxiliar' | 'Auxiliar Plus' | 'Coordinación';
  roleLabel: string; // e.g. "AUXILIAR", "AUXILIAR PLUS", "COORDINACIÓN"
  status: 'IN' | 'OUT';
  checkedInTime?: string; // e.g. '14:30'
  lastSeen?: string; // e.g. 'Yesterday', '3 days ago'
  avatar: string;
  totalHours: number;
  currentShiftHours: number;
  currentShiftMins: number;
  location: string; // e.g. 'Stage Left', 'Main Stage', 'Loading Dock'
}

export interface Shift {
  id: string;
  workerId: string;
  dateString: string; // e.g. 'Today, Oct 28'
  timespan: string; // e.g. '14:00 - Present'
  durationLabel: string; // e.g. 'Active', '12.5h'
  location: string; // e.g. 'Stage Left'
  status: 'Active' | 'Completed';
  updatedAt?: string;
}

export interface LiveEvent {
  id: string;
  title: string;
  location: string;
  dateDay: string; // e.g. '12'
  dateMonth: string; // e.g. 'OCT'
  doorsOpen: string; // e.g. '19:00'
  requiredStaff: number;
  activeStaff: number;
  totalStaffNeeded: number;
  scanRate: number; // scans/min
  loadInPercent: number; // e.g. 100
}

export interface EquipmentAlert {
  id: string;
  message: string;
  zone: string;
  timestamp: string;
  severity: 'warning' | 'error' | 'info';
}
