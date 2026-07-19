export type StaffRole = 'Auxiliar' | 'Auxiliar Plus' | 'Coordinación' | (string & {});
export type StaffRating = 1 | 2 | 3 | 4 | 5;

export interface StaffMember {
  id: string; // e.g. 'usr_842'
  idCode: string; // e.g. 'SEC-042', 'MAD-L-842'
  name: string;
  role: StaffRole;
  roleLabel: string; // e.g. "AUXILIAR", "AUXILIAR PLUS", "COORDINACIÓN"
  status: 'IN' | 'OUT';
  checkedInTime?: string; // canonical UTC ISO instant; legacy clock labels may still exist
  lastSeen?: string; // e.g. 'Yesterday', '3 days ago'
  avatar: string;
  email?: string;
  phone?: string;
  rating?: StaffRating | null;
  totalHours: number;
  currentShiftHours: number;
  currentShiftMins: number;
  location?: string; // optional primary zone; check-in flow sets active shift location
}

export type EventStaffRole = 'Auxiliar' | 'Auxiliar Plus' | 'Coordinación';

export interface EventStaffMember {
  id: string;
  idCode: string;
  name: string;
  email?: string;
  phone?: string;
  assignedRole: EventStaffRole;
  createdAt: string;
}

export interface StaffTemplateMember {
  id: string;
  idCode: string;
  name: string;
  email?: string;
  phone?: string;
  assignedRole: EventStaffRole;
}

export interface StaffTemplate {
  id: string;
  name: string;
  createdAt: string;
  members: StaffTemplateMember[];
}

export interface WorkerToggleOutcome {
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface Shift {
  id: string;
  workerId: string;
  dateString: string; // e.g. 'Today, Oct 28'
  timespan: string; // e.g. '14:00 - Present'
  durationLabel: string; // e.g. 'Active', '12.5h'
  eventId?: string;
  eventTitle: string;
  status: 'Active' | 'Completed';
  startedAt?: string; // canonical UTC ISO instant
  endedAt?: string; // canonical UTC ISO instant
  updatedAt?: string; // canonical UTC ISO instant
}

export interface LiveEvent {
  id: string;
  title: string;
  location: string;
  dateDay: string; // e.g. '12'
  dateMonth: string; // e.g. 'OCT'
  dateYear: string; // e.g. '2026'
  doorsOpen: string; // e.g. '19:00'
  requiredStaff: number;
  assignedStaffCount?: number;
  activeStaff: number;
  totalStaffNeeded: number;
  scanRate: number; // legacy persisted field; real-time rates derive from canonical shifts.startedAt
  loadInPercent: number; // e.g. 100
}

export interface EquipmentAlert {
  id: string;
  message: string;
  zone: string;
  timestamp: string;
  severity: 'warning' | 'error' | 'info';
}
