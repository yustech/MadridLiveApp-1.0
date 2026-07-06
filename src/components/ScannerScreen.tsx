import { useState, FormEvent, useEffect, useRef } from 'react';
import { 
  Flashlight, 
  RotateCw, 
  Keyboard, 
  CheckCircle2, 
  AlertCircle,
  Sparkles,
  QrCode,
  ArrowRight,
  Camera,
  Search,
  Users,
  Tv
} from 'lucide-react';
import { StaffMember, LiveEvent } from '../types';

interface ScannerScreenProps {
  staff: StaffMember[];
  events: LiveEvent[];
  activeEventId: string;
  setActiveEventId: (id: string) => void;
  onScanWorkerToggle: (workerId: string, customLocation?: string) => Promise<boolean>;
  onNavigateToWorker: (worker: StaffMember) => void;
}

interface Html5QrcodeCameraConfig {
  facingMode: 'environment' | 'user';
}

interface Html5QrcodeConfig {
  fps: number;
  qrbox: (width: number, height: number) => { width: number; height: number };
}

interface Html5QrcodeInstance {
  isScanning: boolean;
  start(
    cameraConfig: Html5QrcodeCameraConfig,
    config: Html5QrcodeConfig,
    onSuccess: (decodedText: string) => void,
    onError: (errorMessage: string) => void
  ): Promise<void>;
  stop(): Promise<void>;
}

interface Html5QrcodeConstructor {
  new (elementId: string): Html5QrcodeInstance;
}

const roleIconMap: Record<string, string> = {
  Auxiliar: '👥 Auxiliar',
  'Auxiliar Plus': '⭐ Auxiliar Plus',
  Coordinación: '👑 Coordinación'
};

export default function ScannerScreen({
  staff,
  events,
  activeEventId,
  setActiveEventId,
  onScanWorkerToggle,
  onNavigateToWorker
}: ScannerScreenProps) {
  const activeEvent = events.find(e => e.id === activeEventId) || events[0] || null;
  const [flashlightOn, setFlashlightOn] = useState(false);
  const [cameraMode, setCameraMode] = useState<'back' | 'front'>('back');
  
  // Real webcam integration
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  // Ref to track last scanned code to avoid duplicate triggers
  const lastScannedTimeRef = useRef<number>(0);

  // Digital credential presenter deck state
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>(staff[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Audio chime feedback using Web Audio API
  const playAccessBeep = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1450, ctx.currentTime); // high pitch scanner chime
      
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.12);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch (err) {
      console.log("Access chime audio playback failed:", err);
    }
  };

  // Scanner status and simulated loading
  const [isScanActive, setIsScanActive] = useState(false);
  const [scannedResult, setScannedResult] = useState<{
    worker: StaffMember;
    previousStatus: 'IN' | 'OUT';
    newStatus: 'IN' | 'OUT';
  } | null>(null);

  // Manual code entry mode
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualError, setManualError] = useState('');
  const [scanError, setScanError] = useState('');

  // Handle successful optical QR scan
  const handleQrScanned = (decodedText: string) => {
    const now = Date.now();
    // 3.5 seconds lockout for scanning to prevent repeating IN/OUT toggles quickly
    if (now - lastScannedTimeRef.current < 3500) {
      return;
    }

    const cleanText = decodedText.trim();
    if (!cleanText) return;

    // Search for a worker with matched idCode, or if qr contains it as substring
    const matchedWorker = staff.find(
      s => s.idCode.toLowerCase() === cleanText.toLowerCase() ||
           cleanText.toLowerCase().includes(s.idCode.toLowerCase())
    );

    if (matchedWorker) {
      lastScannedTimeRef.current = now;
      triggerScanOperation(matchedWorker.id);
    }
  };

  // Handle real-time optical html5-qrcode startup, camera hook, and shutdown
  useEffect(() => {
    let qrScanner: Html5QrcodeInstance | null = null;
    let isMounted = true;

    const startScanner = async () => {
      setCameraError(null);

      try {
        const scannerModule = await import('html5-qrcode');
        if (!isMounted) return;

        const Html5Qrcode = scannerModule.Html5Qrcode as unknown as Html5QrcodeConstructor;
        qrScanner = new Html5Qrcode('reader-element');

        await qrScanner.start(
          { facingMode: cameraMode === 'back' ? 'environment' : 'user' },
          {
            fps: 15,
            qrbox: (width: number, height: number) => {
              const boxSize = Math.min(width, height) * 0.72;
              return { width: Math.floor(boxSize), height: Math.floor(boxSize) };
            }
          },
          (decodedText) => {
            if (isMounted && !isScanActive && !scannedResult) {
              handleQrScanned(decodedText);
            }
          },
          () => {
            // silent scanning tick
          }
        );
      } catch (error) {
        console.error('html5-qrcode startup failure:', error);
        if (isMounted) {
          setCameraError('La cámara no está disponible. Para escanear, por favor abre la app con HTTPS o en una nueva pestaña del navegador.');
          setIsWebcamActive(false);
        }
      }
    };

    if (!isWebcamActive) {
      return undefined;
    }

    const startupTimeout = setTimeout(() => {
      void startScanner();
    }, 350);

    return () => {
      isMounted = false;
      clearTimeout(startupTimeout);
      if (qrScanner?.isScanning) {
        qrScanner.stop().catch((stopError) => {
          console.error('Error clean closing qrScanner:', stopError);
        });
      }
    };
  }, [isWebcamActive, cameraMode]);

  // Execute actual database toggle and show success animation
  const triggerScanOperation = (workerId: string) => {
    const targetWorker = staff.find(s => s.id === workerId);
    if (!targetWorker) return;

    setIsScanActive(true);
    setManualError('');
    setScanError('');

    setTimeout(async () => {
      const prev = targetWorker.status;
      const nextStatus = prev === 'IN' ? 'OUT' : 'IN';

      const success = await onScanWorkerToggle(workerId, 'Lector Puerta Principal');
      if (!success) {
        setScannedResult(null);
        setScanError('No se puede fichar personal en conciertos con fecha futura.');
        setIsScanActive(false);
        return;
      }

      playAccessBeep();

      const updatedWorker = { ...targetWorker, status: nextStatus };

      setScannedResult({
        worker: updatedWorker,
        previousStatus: prev,
        newStatus: nextStatus
      });
      setIsScanActive(false);
    }, 1200);
  };

  const handleManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;

    const matchedWorker = staff.find(
      s => s.idCode.toLowerCase() === manualCode.trim().toLowerCase() ||
           s.name.toLowerCase().includes(manualCode.trim().toLowerCase())
    );

    if (matchedWorker) {
      setManualCode('');
      setIsManualEntryOpen(false);
      triggerScanOperation(matchedWorker.id);
    } else {
      setManualError('ID o nombre inválido. Ingresa algo como SEC-042 o MAD-L-842');
    }
  };

  // Filter staff list in presenter deck
  const filteredStaff = staff.filter(w => 
    w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.idCode.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeSelectedWorker = staff.find(w => w.id === selectedWorkerId) || staff[0];

  return (
    <div className="space-y-6">
      {/* Selector de Evento Activo Banner */}
      <div className="bg-white/5 border border-white/10 rounded-3xl p-5 text-left flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-mono text-indigo-300 uppercase tracking-widest font-bold">
            Punto de Registro QR Activo
          </span>
          <h3 className="text-lg font-display font-black text-white mt-0.5">
            {activeEvent?.title || "Sin Evento Seleccionado"}
          </h3>
          <p className="text-xs text-white/50">
            {activeEvent?.location || "—"} • Apertura de Puertas: {activeEvent?.doorsOpen || "—"} hs
          </p>
        </div>
        <div className="shrink-0 flex flex-col items-start md:items-end">
          <label className="block text-[10px] font-mono text-white/40 uppercase mb-1">
            CAMBIAR EVENTO DE CONTROL
          </label>
          <select
            value={activeEventId}
            onChange={(e) => setActiveEventId(e.target.value)}
            className="bg-[#120f26] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-400 w-full md:w-64 cursor-pointer"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id} className="bg-[#0A051A] text-white">
                {ev.title} ({ev.dateDay} {ev.dateMonth})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="qr-access-system">
      
      {/* LEFT COLUMN: THE QR SCANNER TERMINAL */}
      <div className="lg:col-span-7 flex flex-col space-y-4">
        
        {/* Main interactive QR scanner viewport block */}
        <div className="relative flex flex-col min-h-[460px] h-[460px] md:h-[580px] rounded-3xl overflow-hidden border border-white/10 bg-[#0A051A]/80 backdrop-blur-md">
          
          {/* Viewfinder backdrop content (Webcam feed vs static high-tech mock) */}
          <div className="absolute inset-0 z-0 select-none bg-black">
            {isWebcamActive ? (
              <div 
                id="reader-element" 
                className="w-full h-full [&>video]:object-cover [&>video]:w-full [&>video]:h-full [&>video]:scale-x-100" 
              />
            ) : (
              <img
                alt="Cyberpunk Laser Viewfinder"
                className="w-full h-full object-cover grayscale opacity-45 brightness-50"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBeO2WOq8CS3jl6Yc0y16WLd8GtGKR13DR-mIzAhq1GrwXixmdHHbvyqMfzzQn2avbV1-YCbJSVFVQV24F1W-UIuhmrFysfZvfm-Nk6AbPaOwPBv6yJQ0tIaZEQSQuqENaLdMZa44GNT4AlpaOAzbhnNNQjprd2c5pylCHtyVpsApk4DrXz8LZpcNpReADc9BgAFAilLy0dkLGV9AVUnDrM_AiCL9KY0xGP3pEOITAntu1AdAYFL1H9YjK4ttYwxJOnHAcQ7tLs6wc"
              />
            )}
            
            {/* Ambient vignette gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/60 pointer-events-none" />
          </div>

          {/* Top HUD overlays (Live camera trigger, flashlight and rotation controls) */}
          <div className="absolute top-4 left-4 z-20 flex gap-2">
            <button
              onClick={() => setIsWebcamActive(!isWebcamActive)}
              className={`px-3 py-1.5 rounded-full flex items-center gap-1.5 border backdrop-blur-md text-[10px] font-mono font-bold transition-all cursor-pointer ${
                isWebcamActive
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                  : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
              }`}
              title="Iniciar escaner con cámara web real"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{isWebcamActive ? 'CÁMARA: ON' : 'ACTIVAR CÁMARA'}</span>
            </button>
            
            {cameraError && (
              <span className="bg-rose-500/25 border border-rose-450/40 text-rose-300 px-3 py-1.5 rounded-2xl text-[9px] font-mono flex items-center gap-1 max-w-[200px] truncate">
                <AlertCircle className="w-3 h-3 shrink-0" /> Camera Error
              </span>
            )}
          </div>

          <div className="absolute top-4 right-4 z-20 flex gap-2">
            <button
              onClick={() => setFlashlightOn(!flashlightOn)}
              className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md transition-colors border active:scale-95 cursor-pointer ${
                flashlightOn 
                  ? 'bg-indigo-500/25 border-indigo-400 text-indigo-300' 
                  : 'bg-white/5 border-white/10 text-white/50'
              }`}
              title="Encender Linterna"
            >
              <Flashlight className="w-4 h-4" />
            </button>
            {isWebcamActive && (
              <button
                onClick={() => setCameraMode(cameraMode === 'back' ? 'front' : 'back')}
                className="w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 active:scale-95 cursor-pointer"
                title="Cambiar Vista de Cámara"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Floating Cyberpunk Viewfinder Target Area */}
          <div className="flex-1 z-10 flex flex-col items-center justify-center px-6 py-12">
            
            {/* Target alignment frame */}
            <div className={`relative w-[230px] h-[230px] mb-8 border border-white/5 bg-transparent transition-all duration-300 rounded-2xl ${
              isScanActive ? 'scale-105 border-indigo-400/20 shadow-hud-glow' : ''
            }`}>
              
              {/* Corner markings */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-indigo-400 rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-indigo-400 rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-indigo-400 rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-indigo-400 rounded-br-xl" />

              {/* Sweeping scan laser beam line */}
              <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-indigo-400 to-transparent shadow-[0_0_12px_#6366f1] scan-indicator-line" />

              {/* Central crosshair */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/10 text-xl font-mono">
                +
              </div>
              
              {/* Status Scanning tag */}
              {isScanActive && (
                <div className="absolute inset-0 bg-indigo-555/15 flex items-center justify-center">
                  <span className="bg-indigo-500/90 text-white font-mono text-[9px] font-bold tracking-widest px-3 py-1 rounded-full animate-pulse border border-indigo-400">
                    ESCANEANDO CÓDIGO...
                  </span>
                </div>
              )}
            </div>

            {/* Instruction container */}
            <div className="text-center bg-[#120f26]/85 backdrop-blur-md border border-white/12 rounded-2xl p-4.5 max-w-[280px] shadow-2xl">
              <p className="font-display font-medium text-sm text-indigo-300 mb-1 flex items-center justify-center gap-1.5">
                <QrCode className="w-4 h-4" />
                Lector de Credenciales QR
              </p>
              <p className="text-[10px] font-mono text-white/50 leading-relaxed">
                Coloca la credencial QR del colaborador frente a la cámara o selecciónala en el módulo lateral para realizar el fichaje.
              </p>
              {scanError && (
                <p className="mt-3 text-[10px] text-rose-400 flex items-center justify-center gap-1 font-bold">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {scanError}
                </p>
              )}
            </div>
          </div>

          {/* Manual ID Input Area */}
          <div className="z-10 bg-[#0f0a20]/90 border-t border-white/10 p-4">
            {!isManualEntryOpen ? (
              <button
                onClick={() => {
                  setIsManualEntryOpen(true);
                  setManualError('');
                }}
                className="w-full h-11 bg-transparent border border-indigo-500/40 text-indigo-300 hover:bg-white/5 font-mono text-xs rounded-xl flex items-center justify-center gap-2 uppercase tracking-wider cursor-pointer"
              >
                <Keyboard className="w-4 h-4" />
                Ingreso Manual de ID
              </button>
            ) : (
              <form onSubmit={handleManualSubmit} className="space-y-3.5 text-left font-mono">
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="ej. SEC-042 o STG-315"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-indigo-400"
                  />
                  <button
                    type="submit"
                    className="bg-indigo-500 hover:bg-indigo-400 text-white font-bold px-4 rounded-xl text-xs cursor-pointer"
                  >
                    ENVIAR
                  </button>
                </div>
                {manualError && (
                  <p className="text-[10px] text-rose-400 flex items-center gap-1 font-bold">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {manualError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsManualEntryOpen(false);
                    setManualError('');
                  }}
                  className="text-xs text-white/50 hover:text-white underline pt-0.5 inline-block"
                >
                  Cancelar
                </button>
              </form>
            )}
          </div>

        </div>
      </div>

      {/* RIGHT COLUMN: STAFF SELECTION & WORKER QR CREDENTIAL BADGE PRESENTER */}
      <div className="lg:col-span-5 flex flex-col space-y-4">
        
        {/* Title area */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-5 text-left">
          <h3 className="text-base font-display font-black text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" />
            CREDENCIALES Y SIMULADOR
          </h3>
          <p className="text-xs text-white/50 mt-1">
            Lista de personal activo para comprobar el sistema generador de identificaciones QR interactivo.
          </p>
        </div>

        {/* Crew selector widget */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-4 flex flex-col space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-white/30" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar colaborador..."
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-4 text-xs text-white focus:outline-none focus:border-indigo-400"
            />
          </div>

          <div className="max-h-[140px] overflow-y-auto space-y-1.5 no-scrollbar pr-1">
            {filteredStaff.length === 0 ? (
              <p className="text-[11px] font-mono text-white/30 text-center py-4">No se encontraron resultados</p>
            ) : (
              filteredStaff.map(w => (
                <button
                  key={w.id}
                  onClick={() => setSelectedWorkerId(w.id)}
                  className={`w-full p-2 rounded-xl flex items-center gap-2 border text-left font-mono text-xs transition-colors cursor-pointer ${
                    w.id === activeSelectedWorker?.id
                      ? 'bg-indigo-500/15 border-indigo-400/40 text-white'
                      : 'bg-white/5 border-transparent text-white/60 hover:bg-white/10'
                  }`}
                >
                  <img src={w.avatar} className="w-6 h-6 rounded-full object-cover shrink-0" alt="" />
                  <span className="truncate flex-1 font-semibold">{w.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                    w.status === 'IN' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/40'
                  }`}>
                    {w.status === 'IN' ? 'DENTRO' : 'FUERA'}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* HIGH TECH PHYSICAL ACCESS PASS TEMPLATE */}
        {activeSelectedWorker && (
          <div className="bg-[#120f26]/80 backdrop-blur-2xl border border-white/15 rounded-3xl p-5 relative overflow-hidden flex flex-col items-center text-center shadow-2xl space-y-4 text-left">
            
            {/* Hologram pattern detail elements */}
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-teal-400 via-indigo-500 to-purple-500" />
            <div className="absolute -left-12 -bottom-12 w-32 h-32 bg-indigo-500/5 rounded-full blur-xl pointer-events-none" />
            <div className="absolute right-4 top-4 text-[9px] font-mono text-white/30 uppercase tracking-widest">
              DOC: ID-{activeSelectedWorker.idCode}
            </div>

            {/* Credential Title Header */}
            <div className="w-full flex items-center gap-2 pb-2.5 border-b border-white/10 text-left">
              <div className="p-1 px-2.5 bg-indigo-500/20 rounded-lg text-indigo-300 font-mono text-[9px] font-black uppercase tracking-widest border border-indigo-400/10">
                PASE OFICIAL DE ACCESO
              </div>
              <span className="text-[10px] font-mono text-white/40">MADRID LIVE</span>
            </div>

            {/* Profile Micro Details */}
            <div className="flex items-center gap-3.5 w-full text-left">
              <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-white/15 bg-white/5 shadow-inner">
                <img
                  src={activeSelectedWorker.avatar}
                  className="w-full h-full object-cover"
                  alt={activeSelectedWorker.name}
                />
              </div>

              <div className="min-w-0 flex-1">
                <h4 className="text-base font-bold text-white leading-tight truncate">
                  {activeSelectedWorker.name}
                </h4>
                <p className="text-[10px] font-mono text-indigo-300 mt-1 uppercase font-bold tracking-wider">
                  {roleIconMap[activeSelectedWorker.role] || activeSelectedWorker.role}
                </p>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase font-bold ${
                    activeSelectedWorker.status === 'IN' 
                      ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-300' 
                      : 'bg-white/10 border-white/10 text-white/50'
                  }`}>
                    {activeSelectedWorker.status === 'IN' ? 'EN EL RECINTO' : 'FUERA DEL RECINTO'}
                  </span>
                </div>
              </div>
            </div>

            {/* DYNAMIC QR GENERATION BOX */}
            <div className="relative group p-3.5 bg-white rounded-2xl flex items-center justify-center shadow-2xl border border-white/10">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=165x165&bgcolor=ffffff&color=120f26&qzone=1&data=${encodeURIComponent(activeSelectedWorker.idCode)}`}
                alt={`Código QR oficial para ${activeSelectedWorker.name}`}
                className="w-[160px] h-[160px] object-contain select-none"
              />
              
              {/* Scan HUD layout accent overlay */}
              <div className="absolute inset-0 border-2 border-transparent group-hover:border-indigo-500 rounded-2xl transition-colors pointer-events-none" />
            </div>

            <div className="text-center space-y-1 w-full">
              <span className="font-mono text-xs text-white/80 font-bold tracking-widest pl-1">
                IDBADGE: {activeSelectedWorker.idCode}
              </span>
              <p className="text-[10px] font-mono text-white/40 leading-relaxed max-w-sm mx-auto mb-2.5">
                Registra la entrada/salida de este colaborador de manera inmediata simulando la lectura óptica del QR de su credencial.
              </p>

              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                  `🎸 *MADRID LIVE ACCESS* 🎸\n\nHola, *${activeSelectedWorker.name}*.\nAquí tienes tu acreditación de acceso oficial para el concierto:\n\n📋 *PUESTO*: ${activeSelectedWorker.role}\n🔑 *CÓDIGO DE CREDENCIAL*: ${activeSelectedWorker.idCode}\n\nAccede al siguiente enlace para ver y guardar tu código QR Oficial:\n👉 https://api.qrserver.com/v1/create-qr-code/?size=400x400&bgcolor=ffffff&color=120f26&qzone=1&data=${encodeURIComponent(activeSelectedWorker.idCode)}\n\n⚠️ *INSTRUCCIONES*: Guarda esta imagen en tu móvil. Al llegar y salir del recinto de Madrid Live, muestra este código QR en el lector del supervisor para registrar tu entrada/salida rápidamente.`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold uppercase rounded-xl tracking-wider transition-all flex items-center justify-center gap-2 mt-4 cursor-pointer"
              >
                <span>💬</span>
                <span>Enviar QR por WhatsApp</span>
              </a>
            </div>

            {/* EMULATION ACTION BUTTON */}
            <div className="w-full pt-2">
              <button
                onClick={() => triggerScanOperation(activeSelectedWorker.id)}
                disabled={isScanActive}
                className="w-full h-12 bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white disabled:from-white/10 disabled:to-white/5 disabled:text-white/40 font-mono text-xs font-bold uppercase rounded-xl tracking-wider transition-all duration-350 cursor-pointer shadow-indigo-500/10 hover:shadow-indigo-500/25 flex items-center justify-center gap-2"
              >
                <QrCode className={`w-4 h-4 ${isScanActive ? 'animate-spin' : ''}`} />
                <span>ESCANEAR ESTA CREDENCIAL (QR)</span>
              </button>
            </div>

          </div>
        )}

      </div>

      {/* DETAILED SCAN SUCCESS OVERLAY DIALOG */}
      {scannedResult && (
        <div className="fixed inset-0 z-50 bg-black/85 flex flex-col justify-center items-center p-6 text-center backdrop-blur-md">
          <div className="w-full max-w-sm bg-[#120f26]/95 border border-white/20 rounded-3xl p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in duration-300">
            
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center border-2 border-emerald-400 shadow-success-glow">
                <CheckCircle2 className="w-9 h-9 text-emerald-400" />
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-display font-black text-white">Escaneo Completado</h3>
              <p className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest font-bold">
                CÓDIGO QR RECONOCIDO • REGISTRO EXITOSO
              </p>
            </div>

            {/* Inboard Member Micro Card */}
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10 flex items-center gap-3.5 text-left font-mono">
              <img
                src={scannedResult.worker.avatar}
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-full object-cover border border-indigo-400 shrink-0"
                alt=""
              />
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-semibold text-white truncate">{scannedResult.worker.name}</h4>
                <p className="text-[10px] text-white/40 mt-0.5">Credencial ID: {scannedResult.worker.idCode}</p>
                
                {/* Status action message feedback */}
                <div className="mt-2.5">
                  <span className={`inline-block text-[9px] font-black px-2.5 py-1 rounded-full uppercase border ${
                    scannedResult.newStatus === 'IN' 
                      ? 'bg-emerald-500/15 border-emerald-400/20 text-emerald-300' 
                      : 'bg-rose-500/15 border-rose-450/20 text-rose-300'
                  }`}>
                    {scannedResult.newStatus === 'IN' ? 'ENTRADA REGISTRADA' : 'SALIDA REGISTRADA'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 font-mono">
              <button
                onClick={() => {
                  const updateTarget = staff.find(s => s.id === scannedResult.worker.id);
                  if (updateTarget) {
                    onNavigateToWorker(updateTarget);
                  }
                  setScannedResult(null);
                }}
                className="w-full h-11 bg-white hover:bg-white/90 text-slate-900 font-bold rounded-xl text-xs tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer uppercase"
              >
                <span>Ver historial de turnos</span>
                <ArrowRight className="w-4 h-4 text-slate-900" />
              </button>
              <button
                onClick={() => setScannedResult(null)}
                className="w-full py-2 text-xs text-white/50 hover:text-white underline cursor-pointer"
              >
                Volver a Escanear
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
    </div>
  );
}
