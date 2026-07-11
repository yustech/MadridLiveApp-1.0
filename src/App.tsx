import { lazy, Suspense, useState, useEffect, FormEvent } from 'react';
import { Menu, Calendar, QrCode, Users, Database, History, TrendingUp, Lock, ShieldAlert, Eye, EyeOff, Terminal, LogOut, CheckCircle } from 'lucide-react';
import { StaffMember, Shift, LiveEvent, EquipmentAlert } from './types';
import { getEventTemporalState, isOperableEvent, sortEventsByDate } from './utils/events';
import { getActiveShiftForWorker, isWorkerPresentNow } from './utils/shifts';


import {
  subscribeToEvents,
  subscribeToStaff,
  subscribeToShifts,
  subscribeToAlerts,
  updateStaff,
  updateShift,
  addShift,
  addStaff,
  deleteShift,
  deleteEvent
} from './dbService';


const DashboardScreen = lazy(() => import('./components/DashboardScreen'));
const StaffScreen = lazy(() => import('./components/StaffScreen'));
const ProfileScreen = lazy(() => import('./components/ProfileScreen'));
const ScannerScreen = lazy(() => import('./components/ScannerScreen'));
const ShiftsScreen = lazy(() => import('./components/ShiftsScreen'));
const KPIScreen = lazy(() => import('./components/KPIScreen'));
const DatabaseManagerScreen = lazy(() => import('./components/DatabaseManagerScreen'));

const isDatabaseManagerEnabled =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DATABASE_MANAGER === 'true';

function selectDefaultActiveEvent(events: LiveEvent[]): string {
  const ordered = sortEventsByDate(events);
  const today = ordered.find((event) => getEventTemporalState(event) === 'today');
  const future = ordered.find((event) => getEventTemporalState(event) === 'future');
  const past = sortEventsByDate(events, 'desc').find((event) => getEventTemporalState(event) === 'past');

  return today?.id || future?.id || past?.id || events[0]?.id || '';
}

export default function App() {
  // Authentication & Security Policy State (Option B)
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(() => sessionStorage.getItem('ml_auth') === 'true');
  const [loginEmail, setLoginEmail] = useState('');
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

  const presentStaffCount = staff.filter((member) => isWorkerPresentNow(member, shifts)).length;
  const activeZonesCount = new Set(
    staff
      .filter((s) => isWorkerPresentNow(s, shifts) && s.location)
      .map((s) => s.location.split('(')[0].trim())
  ).size;

  // Sync activeEventId with loaded events
  useEffect(() => {
    if (events.length > 0 && !activeEventId) {
      setActiveEventId(selectDefaultActiveEvent(events));
    } else if (events.length === 0 && activeEventId) {
      setActiveEventId('');
    }
  }, [events, activeEventId]);

  useEffect(() => {
    if (!isDatabaseManagerEnabled && isDbOpen) {
      setIsDbOpen(false);
    }
  }, [isDbOpen]);

  useEffect(() => {
    if (!isAuthenticated && !isCheckingSession) return;

    let cancelled = false;
    const verifySession = async () => {
      try {
        const response = await fetch('/api/auth/session', { credentials: 'same-origin' });
        const payload = await response.json();
        if (!cancelled) {
          if (payload?.authenticated) {
            setIsAuthenticated(true);
          } else {
            sessionStorage.removeItem('ml_auth');
            setIsAuthenticated(false);
          }
        }
      } catch {
        if (!cancelled) {
          sessionStorage.removeItem('ml_auth');
          setIsAuthenticated(false);
        }
      } finally {
        if (!cancelled) {
          setIsCheckingSession(false);
        }
      }
    };

    void verifySession();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isCheckingSession]);

  // Sync state with polling subscriptions
  useEffect(() => {
    let unsubStaff = () => {};
    let unsubEvents = () => {};
    let unsubShifts = () => {};
    let unsubAlerts = () => {};

    if (!isAuthenticated) {
      setEvents([]);
      setStaff([]);
      setShifts([]);
      setAlerts([]);
      setSelectedWorker(null);
      return () => {};
    }

    const initDatabaseSync = async () => {
      // Real-time dynamic listeners
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
  }, [isAuthenticated]);

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
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setIsAuthenticating(true);
    setLoginError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginEmail.trim(),
          password: loginPassword,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || "Credenciales no validas o autenticacion no configurada.");
      }

      sessionStorage.setItem("ml_auth", "true");
      setIsAuthenticated(true);
      setLoginPassword("");
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "No se pudo autenticar contra el servidor.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Logout handler
  const handleLogout = async () => {
    sessionStorage.removeItem("ml_auth");
    setIsAuthenticated(false);
    setLoginPassword("");

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // Local logout already cleared UI state.
    }
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
    const eventTitle = activeEvent?.title || 'Evento activo';

    try {
      if (isCurrentlyIn) {
        const activeShift = getActiveShiftForWorker(shifts, workerId)
          || shifts.find(sh => sh.workerId === workerId && sh.status === 'Active');
        const canonicalStartIso = activeShift?.startedAt || worker.checkedInTime || nowIso;
        const startTs = new Date(canonicalStartIso).getTime();
        const endTs = new Date(nowIso).getTime();
        const elapsedMs = Number.isFinite(startTs) && endTs > startTs ? endTs - startTs : 0;
        const netAccrued = elapsedMs / (1000 * 60 * 60);
        const finalHours = worker.totalHours + netAccrued;
        const staffPatch: Partial<StaffMember> = {
          status: 'OUT',
          checkedInTime: '',
          lastSeen: nowIso,
          currentShiftHours: 0,
          currentShiftMins: 0,
          totalHours: finalHours,
        };

        await updateStaff(workerId, staffPatch);

        if (activeShift) {
          const startLabel = activeShift.timespan.split(' - ')[0];
          const shiftPatch: Partial<Shift> = {
            status: 'Completed',
            timespan: `${startLabel} - ${nowStr}`,
            durationLabel: `${netAccrued.toFixed(1)}h`,
            endedAt: nowIso,
          };
          await updateShift(activeShift.id, shiftPatch);
          setShifts((prev) => prev.map((shift) => (
            shift.id === activeShift.id ? { ...shift, ...shiftPatch } : shift
          )));
        }

        setStaff((prev) => prev.map((staffMember) => (
          staffMember.id === workerId ? { ...staffMember, ...staffPatch } : staffMember
        )));
        setSelectedWorker((prev) => (
          prev?.id === workerId ? { ...prev, ...staffPatch } : prev
        ));

        return true;
      }

      if (!isOperableEvent(activeEvent)) {
        console.warn('Blocked non-operable event activation for worker', workerId, activeEvent?.title);
        return false;
      }

      const newShift: Omit<Shift, 'id'> = {
        workerId: workerId,
        dateString: todayDateStr,
        timespan: `${nowStr} - Presente`,
        durationLabel: 'Active',
        eventId: activeEvent?.id,
        eventTitle,
        status: 'Active',
        startedAt: nowIso,
      };
      const shiftId = await addShift(newShift);

      try {
        const staffPatch: Partial<StaffMember> = {
          status: 'IN',
          checkedInTime: nowIso,
          currentShiftHours: 0,
          currentShiftMins: 0,
          location: customLocation || worker.location || ''
        };
        await updateStaff(workerId, staffPatch);
        setShifts((prev) => [{ ...newShift, id: shiftId }, ...prev]);
        setStaff((prev) => prev.map((staffMember) => (
          staffMember.id === workerId ? { ...staffMember, ...staffPatch } : staffMember
        )));
        setSelectedWorker((prev) => (
          prev?.id === workerId ? { ...prev, ...staffPatch } : prev
        ));
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
      await addStaff(newCrewData);
    } catch (err) {
      console.error('Failed to register crew member in the API: ', err);
      throw err;
    }
  };

  const handleDeletePastEvent = async (eventId: string) => {
    try {
      await deleteEvent(eventId);
      setActiveEventId((prev) => {
        if (prev !== eventId) return prev;
        const fallback = events.find((event) => event.id !== eventId);
        return fallback?.id || '';
      });
    } catch (err) {
      console.error('Failed to delete past event and related shifts: ', err);
      throw err;
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

  const renderActiveScreenFallback = () => {
    const loadingMeta: Record<'dashboard' | 'staff' | 'scanner' | 'profile' | 'shifts' | 'kpis', {
      title: string;
      subtitle: string;
      icon: typeof Calendar;
    }> = {
      dashboard: {
        title: 'Eventos y Control',
        subtitle: 'Sincronizando agenda y alertas en directo...',
        icon: Calendar,
      },
      scanner: {
        title: 'Lector QR',
        subtitle: 'Inicializando camaras y validadores de acceso...',
        icon: QrCode,
      },
      staff: {
        title: 'Plantilla',
        subtitle: 'Cargando roster operativo y estados de personal...',
        icon: Users,
      },
      profile: {
        title: 'Perfil Especialista',
        subtitle: 'Recuperando historial individual y credencial QR...',
        icon: Users,
      },
      shifts: {
        title: 'Historial de Registros',
        subtitle: 'Compilando entradas, salidas y filtros de turno...',
        icon: History,
      },
      kpis: {
        title: 'KPIs y Estadisticas',
        subtitle: 'Procesando metricas de cobertura y tendencia...',
        icon: TrendingUp,
      },
    };

    const activeMeta = loadingMeta[activeScreen];
    const ActiveIcon = activeMeta.icon;

    return (
      <div className="w-full min-h-[300px] rounded-3xl border border-white/10 bg-white/5 backdrop-blur-lg p-6 md:p-8 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-56 h-56 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute -bottom-16 -left-16 w-44 h-44 rounded-full bg-cyan-500/10 blur-3xl" />

        <div className="relative z-10 space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-400/30 bg-indigo-500/10 text-indigo-200">
            <ActiveIcon className="w-3.5 h-3.5 animate-pulse" />
            <span className="text-[10px] font-mono uppercase tracking-[0.18em]">
              Cargando vista
            </span>
          </div>

          <div>
            <h3 className="text-xl md:text-2xl font-display font-black tracking-tight text-[#dbfcff]">
              {activeMeta.title}
            </h3>
            <p className="mt-1 text-xs md:text-sm text-white/60 font-mono">
              {activeMeta.subtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="h-14 rounded-xl border border-white/10 bg-white/5 animate-pulse" />
            <div className="h-14 rounded-xl border border-white/10 bg-white/5 animate-pulse" />
            <div className="h-14 rounded-xl border border-white/10 bg-white/5 animate-pulse" />
          </div>
        </div>
      </div>
    );
  };

  if (isCheckingSession) {
    return (
      <div className="w-full min-h-screen bg-[#0A051A] text-[#e2e2e8] flex items-center justify-center font-sans px-4">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 text-center shadow-[0_0_50px_rgba(129,140,248,0.15)]">
          <Lock className="w-8 h-8 text-indigo-300 animate-pulse mx-auto mb-4" />
          <p className="text-[10px] font-mono text-indigo-300 uppercase tracking-widest">
            Verificando sesion segura
          </p>
        </div>
      </div>
    );
  }

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

          <div className="mt-8 pt-6 border-t border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-white/30 uppercase tracking-wider">
                Politicas de Seguridad Activas
              </span>
              <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-[9px] rounded-full uppercase">
                Server Auth
              </span>
            </div>
            <div className="bg-[#120f26]/30 border border-white/5 rounded-xl p-3 text-left">
              <p className="text-[10px] font-mono text-white/60 leading-relaxed">
                La autenticacion se valida en el servidor mediante sesion HTTP-only. Configura las credenciales admin en el entorno del backend.
              </p>
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
              <span className="text-emerald-400 font-bold">{presentStaffCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Zonas Activas:</span>
              <span className="text-indigo-300 font-bold">{activeZonesCount}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {isDatabaseManagerEnabled && (
              <button
                onClick={() => setIsDbOpen(true)}
                className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-mono text-[11px] font-bold text-white/80 cursor-pointer transition-colors flex items-center justify-center gap-2"
              >
                <Database className="w-3.5 h-3.5 text-indigo-400" />
                <span>EXPLORADOR BD</span>
              </button>
            )}

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
            {isDatabaseManagerEnabled && (
              <button
                onClick={() => setIsDbOpen(true)}
                className="md:hidden p-2 hover:bg-white/10 rounded-full cursor-pointer text-[#dbfcff] opacity-85 hover:opacity-100 transition-all flex items-center justify-center"
                title="Acceso a Base de Datos (CRUD)"
              >
                <Database className="w-5 h-5" />
              </button>
            )}

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
        <main className="flex-1 w-full max-w-7xl mx-auto px-5 md:px-8 py-6 md:py-8 pb-[calc(11rem+env(safe-area-inset-bottom))] md:pb-12 overflow-y-auto scroll-pb-[calc(11rem+env(safe-area-inset-bottom))]">
          <Suspense
            fallback={renderActiveScreenFallback()}
          >
            {activeScreen === 'dashboard' && (
              <DashboardScreen
                events={events}
                alerts={alerts}
                staff={staff}
                shifts={shifts}
                activeEventId={activeEventId}
                setActiveEventId={setActiveEventId}
                onLaunchScanner={() => setActiveScreen('scanner')}
                onDeletePastEvent={handleDeletePastEvent}
              />
            )}

            {activeScreen === 'staff' && (
              <StaffScreen
                staff={staff}
                shifts={shifts}
                onSelectWorker={handleSelectWorker}
                onAddWorker={handleAddNewCrewMember}
              />
            )}

            {activeScreen === 'scanner' && (
              <ScannerScreen
                staff={staff}
                shifts={shifts}
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
          </Suspense>
        </main>
      </div>

      {/* RENDER DIRECT CORE MYSQL DATABASE MANAGER MODAL */}
      <Suspense fallback={null}>
        {isDatabaseManagerEnabled && isDbOpen && (
          <DatabaseManagerScreen
            events={events}
            staff={staff}
            shifts={shifts}
            alerts={alerts}
            onClose={() => setIsDbOpen(false)}
          />
        )}
      </Suspense>

      {/* MOBILE FLOATING BOTTOM NAV BAR (Hidden on md viewports, gorgeous floating panel on handheld) */}
      <nav id="bottom-navigation-dock" className="md:hidden fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-md z-40 bg-[#120f26]/90 backdrop-blur-xl border border-white/10 flex justify-around items-center py-2 shadow-[0_10px_35px_rgba(0,0,0,0.85)] rounded-2xl">
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
