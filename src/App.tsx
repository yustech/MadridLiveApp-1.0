import { useState, useEffect, FormEvent } from 'react';
import { Menu, Calendar, QrCode, Users, Database, History, TrendingUp, Lock, ShieldAlert, Eye, EyeOff, Terminal, LogOut, CheckCircle } from 'lucide-react';
import { StaffMember, Shift, LiveEvent, EquipmentAlert } from './types';

import DashboardScreen from './components/DashboardScreen';
import StaffScreen from './components/StaffScreen';
import ProfileScreen from './components/ProfileScreen';
import ScannerScreen from './components/ScannerScreen';
import ShiftsScreen from './components/ShiftsScreen';
import KPIScreen from './components/KPIScreen';
import DatabaseManagerScreen from './components/DatabaseManagerScreen';

import {
  seedDatabaseIfEmpty,
  subscribeToEvents,
  subscribeToStaff,
  subscribeToShifts,
  subscribeToAlerts,
  updateStaff,
  updateShift,
  addShift,
  addStaff,
  deleteShift
} from './dbService';


const MONTH_INDEX: Record<string, number> = {
  ENE: 0,
  JAN: 0,
  FEB: 1,
  MAR: 2,
  ABR: 3,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AGO: 7,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DIC: 11,
  DEC: 11,
};

function isFutureEvent(event?: LiveEvent | null): boolean {
  if (!event) return false;

  const day = Number(event.dateDay);
  const month = MONTH_INDEX[event.dateMonth.trim().toUpperCase()];
  const [hourRaw, minuteRaw] = event.doorsOpen.split(':');
  const now = new Date();

  const eventDate = new Date(
    now.getFullYear(),
    month ?? 0,
    Number.isFinite(day) ? day : 1,
    Number(hourRaw) || 0,
    Number(minuteRaw) || 0,
    0,
    0
  );

  return eventDate.getTime() > Date.now();
}

export default function App() {
  // Authentication & Security Policy State (Option B)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem('ml_auth') === 'true';
  });
  const [loginEmail, setLoginEmail] = useState('admin@madridlive.com');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Screens navigation state: 'dashboard' | 'staff' | 'scanner' | 'profile' | 'shifts' | 'kpis'
  const [activeScreen, setActiveScreen] = useState<'dashboard' | 'staff' | 'scanner' | 'profile' | 'shifts' | 'kpis'>('dashboard');
  
  // Database Manager view modal
  const [isDbOpen, setIsDbOpen] = useState(false);

  // State variables synchronized with the live MySQL-backed API instead of LocalStorage
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [alerts, setAlerts] = useState<EquipmentAlert[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<StaffMember | null>(null);
  const [activeEventId, setActiveEventId] = useState<string>('');

  const activeZonesCount = new Set(
    staff
      .filter((s) => s.status === 'IN' && s.location)
      .map((s) => s.location.split('(')[0].trim())
  ).size;

  // Sync activeEventId with loaded events
  useEffect(() => {
    if (events.length > 0 && !activeEventId) {
      setActiveEventId(events[0].id);
    }
  }, [events, activeEventId]);

  // Sync state with polling subscriptions
  useEffect(() => {
    let unsubStaff = () => {};
    let unsubEvents = () => {};
    let unsubShifts = () => {};
    let unsubAlerts = () => {};

    const initDatabaseSync = async () => {
      // 1. Seed database with defaults if empty
      await seedDatabaseIfEmpty();

      // 2. Real-time dynamic listeners
      unsubEvents = subscribeToEvents((data) => {
        setEvents(data);
      });

      unsubStaff = subscribeToStaff((data) => {
        setStaff(data);
        
        // Resolve selected worker profile sync
        setSelectedWorker((prev) => {
          if (!prev) {
            return data.find(w => w.id === 'usr_842') || data[0] || null;
          }
          const fresh = data.find(w => w.id === prev.id);
          return fresh || prev;
        });
      });

      unsubShifts = subscribeToShifts((data) => {
        setShifts(data);
      });

      unsubAlerts = subscribeToAlerts((data) => {
        setAlerts(data);
      });
    };

    initDatabaseSync();

    return () => {
      unsubStaff();
      unsubEvents();
      unsubShifts();
      unsubAlerts();
    };
  }, []);

  // System time helper
  const getCurrentTimeStr = () => {
    return new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  const getTodayDateStr = () => {
    const options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: '2-digit' };
    const formatted = new Date().toLocaleDateString('es-ES', options); // e.g. "dom, 28 oct"
    // Convert generic day name "dom, 28 oct" to "Hoy, 28 oct"
    const parts = formatted.split(', ');
    const rest = parts[1] || parts[0];
    return `Hoy, ${rest}`;
  };

  const getIsoForTodayTime = (clockLabel: string) => {
    const [hourRaw, minuteRaw] = clockLabel.split(':');
    const hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    const base = new Date();
    base.setHours(Number.isFinite(hour) ? hour : 0, Number.isFinite(minute) ? minute : 0, 0, 0);
    return base.toISOString();
  };

  // Login handler
  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    setIsAuthenticating(true);
    setLoginError('');

    setTimeout(() => {
      if (loginEmail.trim().toLowerCase() === 'admin@madridlive.com' && loginPassword === 'CREW2026') {
        sessionStorage.setItem('ml_auth', 'true');
        setIsAuthenticated(true);
      } else {
        setLoginError('ACCESO DENEGADO: Credenciales de seguridad inválidas.');
      }
      setIsAuthenticating(false);
    }, 800);
  };

  // Logout handler
  const handleLogout = () => {
    sessionStorage.removeItem('ml_auth');
    setIsAuthenticated(false);
    setLoginPassword('');
  };

  // Check worker toggle IN/OUT
  const handleToggleWorkerStatus = async (workerId: string, customLocation?: string) => {
    const nowStr = getCurrentTimeStr();
    const nowIso = new Date().toISOString();
    const todayDateStr = getTodayDateStr();

    const worker = staff.find(w => w.id === workerId);
    if (!worker) return false;

    const isCurrentlyIn = worker.status === 'IN';
    const activeEvent = events.find(e => e.id === activeEventId) || events[0];
    const eventSuffix = activeEvent ? ` (${activeEvent.title})` : '';

    try {
      if (isCurrentlyIn) {
        const activeHours = worker.currentShiftHours || 0;
        const activeMins = worker.currentShiftMins || 0;
        const netAccrued = activeHours + (activeMins / 60);
        const finalHours = worker.totalHours + netAccrued;

        await updateStaff(workerId, {
          status: 'OUT',
          checkedInTime: '',
          lastSeen: `Hoy a las ${nowStr}`,
          currentShiftHours: 0,
          currentShiftMins: 0,
          totalHours: finalHours
        });

        const activeShift = shifts.find(sh => sh.workerId === workerId && sh.status === 'Active');
        if (activeShift) {
          const startLabel = activeShift.timespan.split(' - ')[0];
          await updateShift(activeShift.id, {
            status: 'Completed',
            timespan: `${startLabel} - ${nowStr}`,
            durationLabel: `${(activeHours + activeMins / 60).toFixed(1)}h`,
            endedAt: nowIso,
          });
        }

        return true;
      }

      if (isFutureEvent(activeEvent)) {
        console.warn('Blocked future event activation for worker', workerId, activeEvent?.title);
        return false;
      }

      const baseLoc = customLocation || worker.location || 'Stage Left';
      const chosenLoc = `${baseLoc}${eventSuffix}`;

      const shiftId = await addShift({
        workerId: workerId,
        dateString: todayDateStr,
        timespan: `${nowStr} - Presente`,
        durationLabel: 'Active',
        location: chosenLoc,
        status: 'Active',
        startedAt: nowIso,
      });

      try {
        await updateStaff(workerId, {
          status: 'IN',
          checkedInTime: nowStr,
          currentShiftHours: 4,
          currentShiftMins: 30,
          location: chosenLoc
        });
      } catch (staffErr) {
        await deleteShift(shiftId);
        throw staffErr;
      }

      return true;
    } catch (err) {
      console.error('Failed to alter staff status: ', err);
      return false;
    }
  };

  const handleAddNewCrewMember = async (newCrewData: Omit<StaffMember, 'id'>) => {
    try {
      const newId = await addStaff(newCrewData);

      const checkedInClock = newCrewData.checkedInTime || '14:00';
      await addShift({
        workerId: newId,
        dateString: getTodayDateStr(),
        timespan: `${checkedInClock} - Presente`,
        durationLabel: 'Activo',
        location: newCrewData.location || 'Stage Left',
        status: 'Active',
        startedAt: getIsoForTodayTime(checkedInClock),
      });
    } catch (err) {
      console.error("Failed to register crew member in the API: ", err);
    }
  };

  // Worker detail shifts lists locator
  const getSelectedWorkerShifts = () => {
    if (!selectedWorker) return [];
    return shifts.filter(sh => sh.workerId === selectedWorker.id);
  };

  // Main wrapper navigation click sync
  const handleSelectWorker = (worker: StaffMember) => {
    setSelectedWorker(worker);
    setActiveScreen('profile');
  };

  if (!isAuthenticated) {
    return (
      <div className="w-full min-h-screen bg-[#0A051A] text-[#e2e2e8] flex items-center justify-center font-sans relative overflow-hidden px-4 py-8">
        {/* Mesh Gradient Background Layers */}
        <div className="absolute top-[-100px] left-[-100px] w-[500px] h-[500px] bg-purple-600/15 rounded-full blur-[120px] pointer-events-none z-0"></div>
        <div className="absolute bottom-[-100px] right-[-100px] w-[500px] h-[500px] bg-indigo-500/15 rounded-full blur-[120px] pointer-events-none z-0"></div>

        <div className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl shadow-[0_0_50px_rgba(129,140,248,0.15)] p-8 relative z-10">
          
          {/* Header */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-indigo-500/10 border border-indigo-400/30 rounded-2xl flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
              <Lock className="w-8 h-8 text-indigo-400 animate-pulse" />
            </div>
            
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              <span className="text-[10px] font-mono text-red-400 uppercase tracking-widest font-bold">
                CONEXIÓN ENCRIPTADA CON MYSQL
              </span>
            </div>

            <h1 className="text-2xl font-display font-black tracking-tighter text-[#dbfcff] text-center">
              TERMINAL DE ACCESO
            </h1>
            <p className="text-[11px] font-mono text-white/40 uppercase tracking-wider mt-1">
              MADRID LIVE PRODUCTION PORTAL
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-[10px] font-mono text-white/50 uppercase tracking-wider mb-2">
                Identificador / Email
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full bg-[#120f26]/60 border border-white/10 focus:border-indigo-400/40 rounded-xl px-4 py-3 text-sm text-white/90 placeholder-white/20 font-mono transition-all outline-none"
                  placeholder="admin@madridlive.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-white/50 uppercase tracking-wider mb-2">
                Clave de Seguridad (Master Pass)
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full bg-[#120f26]/60 border border-white/10 focus:border-indigo-400/40 rounded-xl pl-4 pr-11 py-3 text-sm text-white/90 placeholder-white/20 font-mono transition-all outline-none"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors p-1 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {loginError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs font-mono text-red-300 leading-normal">{loginError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isAuthenticating}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-[0_4px_20px_rgba(99,102,241,0.3)] hover:shadow-[0_4px_25px_rgba(99,102,241,0.5)] flex items-center justify-center gap-2 cursor-pointer"
            >
              <Terminal className="w-4 h-4" />
              <span>{isAuthenticating ? "DECRIPTANDO..." : "AUTENTICAR EN ENTORNO"}</span>
            </button>
          </form>

          {/* Quick Demo Assist */}
          <div className="mt-8 pt-6 border-t border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-white/30 uppercase tracking-wider">
                Políticas de Seguridad Activas
              </span>
              <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-[9px] rounded-full uppercase">
                Estable / OK
              </span>
            </div>
            
            <div className="bg-[#120f26]/30 border border-white/5 rounded-xl p-3 text-left">
              <p className="text-[10px] font-mono text-white/60 leading-relaxed mb-2">
                💡 <strong className="text-indigo-300">DEMO PASSKEY:</strong> Usa el botón inferior para autocompletar la clave maestra predefinida para producciones.
              </p>
              <button
                type="button"
                onClick={() => {
                  setLoginEmail('admin@madridlive.com');
                  setLoginPassword('CREW2026');
                  setLoginError('');
                }}
                className="w-full py-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 hover:border-indigo-400/30 text-indigo-200 font-mono text-[10px] font-semibold rounded-lg transition-all cursor-pointer"
              >
                Rellenar Credenciales Demo
              </button>
            </div>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-[#0A051A] text-[#e2e2e8] flex flex-col md:flex-row font-sans relative overflow-x-hidden">
      
      {/* Mesh Gradient Background Layers */}
      <div className="absolute top-[-100px] left-[-100px] w-[500px] h-[500px] bg-purple-600/15 rounded-full blur-[120px] pointer-events-none z-0"></div>
      <div className="absolute bottom-[-100px] right-[-100px] w-[500px] h-[500px] bg-blue-500/15 rounded-full blur-[120px] pointer-events-none z-0"></div>
      <div className="absolute top-[20%] right-[10%] w-[300px] h-[300px] bg-pink-500/10 rounded-full blur-[100px] pointer-events-none z-0"></div>

      {/* DESKTOP LEFT SIDEBAR NAVIGATION */}
      <aside className="hidden md:flex md:w-64 lg:w-72 border-r border-white/10 flex-col bg-[#0c0822]/95 backdrop-blur-xl shrink-0 h-screen sticky top-0 z-30 overflow-y-auto p-6 justify-between text-left">
        <div className="space-y-8">
          {/* Logo Brand Header */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse shadow-[0_0_10px_#818cf8]" />
              <h1 className="text-lg font-display font-black tracking-tighter text-[#dbfcff]">
                MADRID LIVE
              </h1>
            </div>
            <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest pl-4">
              Control de Accesos v2.4
            </p>
          </div>

          {/* Main Navigation Menu */}
          <nav className="flex flex-col gap-2">
            <button
              onClick={() => setActiveScreen('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-mono text-xs font-semibold cursor-pointer border transition-all ${
                activeScreen === 'dashboard'
                  ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-200'
                  : 'bg-transparent border-transparent text-white/50 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Calendar className="w-[18px] h-[18px]" />
              <span>Eventos / Control</span>
            </button>

            <button
              onClick={() => setActiveScreen('scanner')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-mono text-xs font-semibold cursor-pointer border transition-all ${
                activeScreen === 'scanner'
                  ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-200'
                  : 'bg-transparent border-transparent text-white/50 hover:bg-white/5 hover:text-white'
              }`}
            >
              <QrCode className="w-[18px] h-[18px]" />
              <span>Lector QR</span>
            </button>

            <button
              onClick={() => setActiveScreen('staff')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-mono text-xs font-semibold cursor-pointer border transition-all ${
                activeScreen === 'staff' || activeScreen === 'profile'
                  ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-200'
                  : 'bg-transparent border-transparent text-white/50 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Users className="w-[18px] h-[18px]" />
              <span>Plantilla</span>
            </button>

            <button
              onClick={() => setActiveScreen('shifts')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-mono text-xs font-semibold cursor-pointer border transition-all ${
                activeScreen === 'shifts'
                  ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-200'
                  : 'bg-transparent border-transparent text-white/50 hover:bg-white/5 hover:text-white'
              }`}
            >
              <History className="w-[18px] h-[18px]" />
              <span>Historial Registros</span>
            </button>

            <button
              onClick={() => setActiveScreen('kpis')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-mono text-xs font-semibold cursor-pointer border transition-all ${
                activeScreen === 'kpis'
                  ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-200'
                  : 'bg-transparent border-transparent text-white/50 hover:bg-white/5 hover:text-white'
              }`}
            >
              <TrendingUp className="w-[18px] h-[18px]" />
              <span>KPIs y Estadísticas</span>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer Elements */}
        <div className="space-y-6 pt-6 border-t border-white/10">
          {/* Quick Metrics */}
          <div className="space-y-2.5 font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-white/40">Presentes:</span>
              <span className="text-emerald-400 font-bold">{staff.filter(s => s.status === 'IN').length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Zonas Activas:</span>
              <span className="text-indigo-300 font-bold">{activeZonesCount}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {/* Database Admin trigger */}
            <button
              onClick={() => setIsDbOpen(true)}
              className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-mono text-[11px] font-bold text-white/80 cursor-pointer transition-colors flex items-center justify-center gap-2"
            >
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              <span>EXPLORADOR BD</span>
            </button>

            {/* Profile trigger */}
            <button
              onClick={() => {
                const javier = staff.find(w => w.id === 'usr_842') || staff[0];
                setSelectedWorker(javier);
                setActiveScreen('profile');
              }}
              className="w-full p-2.5 bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-400/30 rounded-xl text-left flex items-center gap-2.5 cursor-pointer transition-all"
            >
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDC_NElRUlTxk860ETAyeeMiDTpE8tBnFJ74xyp5-NRSBtYQsm_svmfkP7nLHyou6LwqDDzexrIJOSrwP7u_TJAsGXcL7Y7g9_wRVSysXuccSJczUOeU1Bp6zRYPh5YwIZdeopltCYPGmjijbfp53H5q9azOxk2jsIoMeiBHgkbClhgty1nM1cLQjldyegOMlpM9A-qZ7MXP5bNiJBBYY8N3lOwZSmVbaUMtpcoeH5313BXoiLxOrNHhn_4x9ffMlsS6O5nGHBVhA4"
                className="w-7 h-7 rounded-lg object-cover border border-white/20 shrink-0"
                alt=""
              />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-white truncate">Javier R.</p>
                <p className="text-[9px] font-mono text-indigo-300">Supervisor</p>
              </div>
            </button>

            {/* Logout trigger */}
            <button
              onClick={handleLogout}
              className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl font-mono text-[11px] font-bold text-red-300 cursor-pointer transition-colors flex items-center justify-center gap-2"
              title="Cerrar sesión de terminal"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>BLOQUEAR TERMINAL</span>
            </button>
          </div>
        </div>
      </aside>

      {/* RIGHT SIDE MASTER CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen relative z-10">
        
        {/* GLOBAL TOP APP BAR */}
        <header className="sticky top-0 z-40 bg-white/5 backdrop-blur-lg border-b border-white/10 px-6 h-16 w-full flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button className="md:hidden text-[#dbfcff] opacity-80 hover:opacity-100 transition-opacity p-2 hover:bg-white/10 rounded-full cursor-pointer">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-display font-black tracking-tighter text-[#dbfcff] md:hidden">
              MADRID LIVE
            </h1>
            <div className="hidden md:flex items-center gap-2">
              <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest bg-white/5 border border-white/5 rounded px-2.5 py-1">
                UTC GLOBAL TERMINAL
              </span>
            </div>
          </div>

          {/* Header Right Actions */}
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsDbOpen(true)}
              className="md:hidden p-2 hover:bg-white/10 rounded-full cursor-pointer text-[#dbfcff] opacity-85 hover:opacity-100 transition-all flex items-center justify-center"
              title="Acceso a Base de Datos (CRUD)"
            >
              <Database className="w-5 h-5" />
            </button>

            {/* Header Logout for Quick Access / Mobile viewports too */}
            <button
              onClick={handleLogout}
              className="p-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-full cursor-pointer text-red-400 hover:text-red-300 transition-all flex items-center justify-center"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>

            {/* Right Clickable Crew Headshot (Click toggles Javier Rodriguez's Profile) */}
            <button 
              onClick={() => {
                const javier = staff.find(w => w.id === 'usr_842') || staff[0];
                setSelectedWorker(javier);
                setActiveScreen('profile');
              }}
              className="w-10 h-10 rounded-full overflow-hidden bg-white/5 border border-white/25 cursor-pointer hover:border-[#818cf8] transition-colors"
              title="Ver perfil de Javier Rodríguez"
            >
              <img 
                alt="Avatar de perfil" 
                className="w-full h-full object-cover" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDC_NElRUlTxk860ETAyeeMiDTpE8tBnFJ74xyp5-NRSBtYQsm_svmfkP7nLHyou6LwqDDzexrIJOSrwP7u_TJAsGXcL7Y7g9_wRVSysXuccSJczUOeU1Bp6zRYPh5YwIZdeopltCYPGmjijbfp53H5q9azOxk2jsIoMeiBHgkbClhgty1nM1cLQjldyegOMlpM9A-qZ7MXP5bNiJBBYY8N3lOwZSmVbaUMtpcoeH5313BXoiLxOrNHhn_4x9ffMlsS6O5nGHBVhA4" 
              />
            </button>
          </div>
        </header>

        {/* RENDERED ACTIVE VIEW CANVASES WITH FLUID VIEWPORTS */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-5 md:px-8 py-6 md:py-8 pb-32 md:pb-12 overflow-y-auto">
          {activeScreen === 'dashboard' && (
            <DashboardScreen
              events={events}
              alerts={alerts}
              staff={staff}
              activeEventId={activeEventId}
              setActiveEventId={setActiveEventId}
              onLaunchScanner={() => setActiveScreen('scanner')}
            />
          )}

          {activeScreen === 'staff' && (
            <StaffScreen
              staff={staff}
              onSelectWorker={handleSelectWorker}
              onAddWorker={handleAddNewCrewMember}
            />
          )}

          {activeScreen === 'scanner' && (
            <ScannerScreen
              staff={staff}
              events={events}
              activeEventId={activeEventId}
              setActiveEventId={setActiveEventId}
              onScanWorkerToggle={handleToggleWorkerStatus}
              onNavigateToWorker={handleSelectWorker}
            />
          )}

          {activeScreen === 'profile' && selectedWorker && (
            <ProfileScreen
              worker={selectedWorker}
              workerShifts={getSelectedWorkerShifts()}
              onToggleStatus={handleToggleWorkerStatus}
              onBack={() => setActiveScreen('staff')}
            />
          )}

          {activeScreen === 'shifts' && (
            <ShiftsScreen
              shifts={shifts}
              staff={staff}
              events={events}
              onToggleStatus={handleToggleWorkerStatus}
              onSelectWorker={handleSelectWorker}
            />
          )}

          {activeScreen === 'kpis' && (
            <KPIScreen
              shifts={shifts}
              staff={staff}
              events={events}
              activeEventId={activeEventId}
            />
          )}
        </main>
      </div>

      {/* RENDER DIRECT CORE MYSQL DATABASE MANAGER MODAL */}
      {isDbOpen && (
        <DatabaseManagerScreen
          events={events}
          staff={staff}
          shifts={shifts}
          alerts={alerts}
          onClose={() => setIsDbOpen(false)}
        />
      )}

      {/* MOBILE FLOATING BOTTOM NAV BAR (Hidden on md viewports, gorgeous floating panel on handheld) */}
      <nav id="bottom-navigation-dock" className="md:hidden fixed bottom-5 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-md z-40 bg-[#120f26]/90 backdrop-blur-xl border border-white/10 flex justify-around items-center py-2 shadow-[0_10px_35px_rgba(0,0,0,0.85)] rounded-2xl">
        {/* Events active screen trigger */}
        <button
          onClick={() => setActiveScreen('dashboard')}
          className={`flex flex-col items-center justify-center px-2 py-1 rounded-xl transition-all duration-200 cursor-pointer ${
            activeScreen === 'dashboard'
              ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 font-bold scale-100'
              : 'text-white/50 border border-transparent hover:text-white scale-95'
          }`}
        >
          <Calendar className="w-4.5 h-4.5" />
          <span className="text-[9px] font-mono mt-0.5">Eventos</span>
        </button>

        {/* Scanner active screen trigger */}
        <button
          onClick={() => setActiveScreen('scanner')}
          className={`flex flex-col items-center justify-center px-2 py-1 rounded-xl transition-all duration-200 cursor-pointer ${
            activeScreen === 'scanner'
              ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 font-bold scale-100'
              : 'text-white/50 border border-transparent hover:text-white scale-95'
          }`}
        >
          <QrCode className="w-4.5 h-4.5" />
          <span className="text-[9px] font-mono mt-0.5">Escáner</span>
        </button>

        {/* Staff / crew active screen trigger */}
        <button
          onClick={() => setActiveScreen('staff')}
          className={`flex flex-col items-center justify-center px-2 py-1 rounded-xl transition-all duration-200 cursor-pointer ${
            activeScreen === 'staff' || activeScreen === 'profile'
              ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 font-bold scale-100'
              : 'text-white/50 border border-transparent hover:text-white scale-95'
          }`}
        >
          <Users className="w-4.5 h-4.5" />
          <span className="text-[9px] font-mono mt-0.5">Personal</span>
        </button>

        {/* Shifts active screen trigger */}
        <button
          onClick={() => setActiveScreen('shifts')}
          className={`flex flex-col items-center justify-center px-2 py-1 rounded-xl transition-all duration-200 cursor-pointer ${
            activeScreen === 'shifts'
              ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 font-bold scale-100'
              : 'text-white/50 border border-transparent hover:text-white scale-95'
          }`}
        >
          <History className="w-4.5 h-4.5" />
          <span className="text-[9px] font-mono mt-0.5">Registros</span>
        </button>

        {/* KPIs active screen trigger */}
        <button
          onClick={() => setActiveScreen('kpis')}
          className={`flex flex-col items-center justify-center px-2 py-1 rounded-xl transition-all duration-200 cursor-pointer ${
            activeScreen === 'kpis'
              ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 font-bold scale-100'
              : 'text-white/50 border border-transparent hover:text-white scale-95'
          }`}
        >
          <TrendingUp className="w-4.5 h-4.5" />
          <span className="text-[9px] font-mono mt-0.5">KPIs</span>
        </button>
      </nav>
    </div>
  );
}
