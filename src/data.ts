import { StaffMember, LiveEvent, Shift, EquipmentAlert } from './types';

export const INITIAL_STAFF: StaffMember[] = [
  {
    id: 'usr_842',
    idCode: 'MAD-L-842',
    name: 'Javier Rodriguez',
    role: 'Auxiliar',
    roleLabel: 'AUXILIAR',
    status: 'IN',
    checkedInTime: '14:00',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDC_NElRUlTxk860ETAyeeMiDTpE8tBnFJ74xyp5-NRSBtYQsm_svmfkP7nLHyou6LwqDDzexrIJOSrwP7u_TJAsGXcL7Y7g9_wRVSysXuccSJczUOeU1Bp6zRYPh5YwIZdeopltCYPGmjijbfp53H5q9azOxk2jsIoMeiBHgkbClhgty1nM1cLQjldyegOMlpM9A-qZ7MXP5bNiJBBYY8N3lOwZSmVbaUMtpcoeH5313BXoiLxOrNHhn_4x9ffMlsS6O5nGHBVhA4',
    totalHours: 42.5,
    currentShiftHours: 6,
    currentShiftMins: 15,
    location: 'Stage Left'
  },
  {
    id: 'usr_042',
    idCode: 'SEC-042',
    name: 'Marcus Vance',
    role: 'Auxiliar Plus',
    roleLabel: 'AUXILIAR PLUS',
    status: 'IN',
    checkedInTime: '14:30',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAHDzrt_XM9ctZio44hkLHq3_3iuGGNIjxU2HDApsm2aq_96SRse-JWNYlvfykYS5_7hIhDU44EkHNJheD-eVC4a5EaqthCNofDcC0EYivWOijBmbZwVCIMnsomZVtAiwc1SPkt1LI1IViqPB5HOu0xZ_4_51LzAubwsxrXTpGh7sXf1xrJqHyb8T8vjz-ot_4Fe0L8bMvQ69tvGfLemqXvxJxjBeEuMH2NvPdvrtptDPzkD3xGJswfGaPYvBlg9K_Yia8Kedv3GiM',
    totalHours: 18.5,
    currentShiftHours: 3,
    currentShiftMins: 45,
    location: 'Gate A Entrance'
  },
  {
    id: 'usr_118',
    idCode: 'STG-118',
    name: 'Elena Rostova',
    role: 'Auxiliar',
    roleLabel: 'AUXILIAR',
    status: 'OUT',
    lastSeen: 'Yesterday',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAcIWKuzO01-bXT70JusjCDtrN5fZqoSpJmwF1SvrmPOcTxQfvKDhdZMhnkTtDjWcE8SnO0cVC4LcHHsvXUmvZ8b2T5WuTNGPXNMerWI_PqiKryQSlqRKnwxRDTIikL2Yt0cGdSlh8WzWa4aT8xgPPZGN5ZeW0THnwc96g9nPjD5Kffbv7U1arswyefHTrHJaUKMK6mx-O90mVZh2KwRBnbVKju0Yfr5Uuh3LaZ6vqemVP2rpK0hrl5_c5eJNnQV4xdJux3SGvCOM',
    totalHours: 25.0,
    currentShiftHours: 0,
    currentShiftMins: 0,
    location: 'Loading Dock'
  },
  {
    id: 'usr_009',
    idCode: 'AV-009',
    name: 'David Chen',
    role: 'Coordinación',
    roleLabel: 'COORDINACIÓN',
    status: 'IN',
    checkedInTime: '09:00',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBPM4_RVN7Cgl_yi70JOQ_O_ZO16AUk6f1NIeBNArrL8xzZVOQBXJeB-5_awKmaqr2sBgSwmccUdUi1iKW4lUpzNhV6oolmBG-YbqgNceXAkqIAYHaTjAK-7CFVn3vIC5GwckeZARMoyQTPzhsCSVdgS0UAuLe3bsxAeCjwC092oYDh2CvjjNY37DPwbvuOlm4qhtwXpUHtxwVYJHYIe4r4qVH39NcNWSs4MVpZTuULhZt9KZeWRsJx3NljhXOFeHQGW1qTy__tGA4',
    totalHours: 34.0,
    currentShiftHours: 8,
    currentShiftMins: 10,
    location: 'Front of House'
  },
  {
    id: 'usr_777',
    idCode: 'RIG-202',
    name: 'Sofia Almodovar',
    role: 'Coordinación',
    roleLabel: 'COORDINACIÓN',
    status: 'OUT',
    lastSeen: '2 days ago',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCrC8gu6dX_VDy6NugK6j3F6R3isAYz2aLfvCPw0QuhhBCzpnuDSTaeKc2f8WayrSWxEMuSXZP4YYrk_U4f2Q48m6OIfoezpPC1xf89WWoSGV0hJR67eanbNa0Nf1FGC2x72MqoQDvEf6KeXzKKch57qw7idZWD25-SbtgiOCL7-n86kp8z9aeu8xQ8bUXcTXn7EhzJGwjXc_BzTIViC1l6i_0N3lzLJmqjOkzeotT3Nl6MO-9I_ZH_8a3olLxRuiuImYaTE6TK2DU',
    totalHours: 28.0,
    currentShiftHours: 0,
    currentShiftMins: 0,
    location: 'Overhead Truss'
  },
  {
    id: 'usr_105',
    idCode: 'CAT-301',
    name: 'Mateo Perez',
    role: 'Auxiliar Plus',
    roleLabel: 'AUXILIAR PLUS',
    status: 'IN',
    checkedInTime: '11:30',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200',
    totalHours: 19.5,
    currentShiftHours: 4,
    currentShiftMins: 50,
    location: 'Artist Lounge'
  }
];

export const INITIAL_SHIFTS: Shift[] = [
  // Javier Rodriguez shifts
  {
    id: 'sh_01',
    workerId: 'usr_842',
    dateString: 'Today, Oct 28',
    timespan: '14:00 - Present',
    durationLabel: 'Active',
    eventTitle: 'Electronic Music Festival',
    status: 'Active'
  },
  {
    id: 'sh_02',
    workerId: 'usr_842',
    dateString: 'Sun, Oct 27',
    timespan: '10:00 - 22:30',
    durationLabel: '12.5h',
    eventTitle: 'Electronic Music Festival',
    status: 'Completed'
  },
  {
    id: 'sh_03',
    workerId: 'usr_842',
    dateString: 'Sat, Oct 26',
    timespan: '12:00 - 02:00',
    durationLabel: '14.0h',
    eventTitle: 'Electronic Music Festival',
    status: 'Completed'
  },
  {
    id: 'sh_04',
    workerId: 'usr_842',
    dateString: 'Fri, Oct 25',
    timespan: '08:00 - 18:00',
    durationLabel: '10.0h',
    eventTitle: 'Electronic Music Festival',
    status: 'Completed'
  },
  
  // Marcus Vance shifts
  {
    id: 'sh_05',
    workerId: 'usr_042',
    dateString: 'Today, Oct 28',
    timespan: '14:30 - Present',
    durationLabel: 'Active',
    eventTitle: 'Electronic Music Festival',
    status: 'Active'
  },
  {
    id: 'sh_06',
    workerId: 'usr_042',
    dateString: 'Sun, Oct 27',
    timespan: '12:00 - 20:00',
    durationLabel: '8.0h',
    eventTitle: 'Electronic Music Festival',
    status: 'Completed'
  },

  // David Chen shifts
  {
    id: 'sh_07',
    workerId: 'usr_009',
    dateString: 'Today, Oct 28',
    timespan: '09:00 - Present',
    durationLabel: 'Active',
    eventTitle: 'Electronic Music Festival',
    status: 'Active'
  },

  // Elena Rostova shifts
  {
    id: 'sh_08',
    workerId: 'usr_118',
    dateString: 'Yesterday, Oct 27',
    timespan: '08:00 - 20:00',
    durationLabel: '12.0h',
    eventTitle: 'Electronic Music Festival',
    status: 'Completed'
  }
];

export const INITIAL_EVENTS: LiveEvent[] = [
  {
    id: 'ev_01',
    title: 'Electronic Music Festival',
    location: 'WiZink Center, Madrid',
    dateDay: '08',
    dateMonth: 'JUN',
    doorsOpen: '16:00',
    requiredStaff: 150,
    activeStaff: 142,
    totalStaffNeeded: 150,
    scanRate: 84,
    loadInPercent: 100
  },
  {
    id: 'ev_02',
    title: 'Indie Rock Showcase',
    location: 'La Riviera • Madrid',
    dateDay: '12',
    dateMonth: 'OCT',
    doorsOpen: '19:00',
    requiredStaff: 45,
    activeStaff: 0,
    totalStaffNeeded: 45,
    scanRate: 0,
    loadInPercent: 40
  },
  {
    id: 'ev_03',
    title: 'Symphony Gala',
    location: 'Teatro Real • Madrid',
    dateDay: '15',
    dateMonth: 'OCT',
    doorsOpen: '20:00',
    requiredStaff: 80,
    activeStaff: 0,
    totalStaffNeeded: 80,
    scanRate: 0,
    loadInPercent: 15
  },
  {
    id: 'ev_04',
    title: 'Urban Tech Conference',
    location: 'IFEMA Madrid',
    dateDay: '22',
    dateMonth: 'OCT',
    doorsOpen: '08:00',
    requiredStaff: 210,
    activeStaff: 0,
    totalStaffNeeded: 210,
    scanRate: 0,
    loadInPercent: 0
  }
];

export const INITIAL_ALERTS: EquipmentAlert[] = [
  {
    id: 'al_01',
    message: 'Audio rig load-out delayed at Zone C.',
    zone: 'Zone C',
    timestamp: '15:10',
    severity: 'warning'
  }
];
