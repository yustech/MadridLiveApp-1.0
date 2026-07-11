import { useState } from 'react';
import { 
  ArrowLeft, 
  Clock, 
  Timer, 
  CalendarRange, 
  ChevronRight, 
  CheckCircle,
} from 'lucide-react';
import { StaffMember, Shift } from '../types';
import { formatHoursMinutesFromDecimal } from '../utils/duration';
import {
  formatShiftDateLabel,
  getActiveShiftForWorker,
  getShiftStartTimestamp,
  isShiftActiveNow,
  isWorkerPresentNow,
} from '../utils/shifts';

interface ProfileScreenProps {
  worker: StaffMember;
  onBack: () => void;
  onToggleStatus: (workerId: string, customLocation?: string) => void;
  workerShifts: Shift[];
}

const zoneTranslationMap: Record<string, string> = {
  'Stage Left': 'Escenario Izquierda',
  'FOH Audio': 'Control de Audio (FOH)',
  'Loading Dock': 'Muelle de Carga',
  'Backstage VIP': 'Backstage / VIP',
  'Artist Lounge': 'Camerino de Artistas',
  'Artist Entrance': 'Entrada de Artistas'
};

function formatTimespanLabel(timespan: string): string {
  return timespan.replace('Present', 'Presente');
}

export default function ProfileScreen({
  worker,
  onBack,
  onToggleStatus,
  workerShifts
}: ProfileScreenProps) {
  const [isCheckInModalOpen, setIsCheckInModalOpen] = useState(false);
  const [customLocation, setCustomLocation] = useState(worker.location || 'Stage Left');

  const isMarkedIn = worker.status === 'IN';
  const activeShift = getActiveShiftForWorker(workerShifts, worker.id);
  const isLiveNow = isWorkerPresentNow(worker, workerShifts);

  const getCurrentShiftParts = (member: StaffMember, currentShift: Shift | null) => {
    const fallbackMinutes = (member.currentShiftHours || 0) * 60 + (member.currentShiftMins || 0);
    const shiftStartTs = currentShift ? getShiftStartTimestamp(currentShift) : null;
    const workerStartTs = member.checkedInTime ? new Date(member.checkedInTime).getTime() : Number.NaN;
    const startTs = shiftStartTs ?? workerStartTs;
    const elapsedMinutes = Number.isFinite(startTs) && Date.now() > startTs
      ? Math.floor((Date.now() - startTs) / (1000 * 60))
      : fallbackMinutes;
    const shiftMinutes = Math.max(fallbackMinutes, elapsedMinutes);

    return {
      hours: Math.floor(shiftMinutes / 60),
      mins: shiftMinutes % 60,
    };
  };

  const liveShift = isLiveNow ? getCurrentShiftParts(worker, activeShift) : { hours: 0, mins: 0 };

  const handleToggle = () => {
    if (isMarkedIn) {
      // Check-out is straight-forward
      onToggleStatus(worker.id);
    } else {
      // Open modal to select check-in location first
      setIsCheckInModalOpen(true);
    }
  };

  const confirmCheckIn = () => {
    onToggleStatus(worker.id, customLocation);
    setIsCheckInModalOpen(false);
  };

  return (
    <div id="profile-view" className="space-y-6">
      {/* Back Button and Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="w-11 h-11 flex items-center justify-center bg-white/5 rounded-full border border-white/10 text-white hover:bg-white/10 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-display font-black tracking-tight text-white">
          Perfil del Colaborador
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 space-y-0">
        {/* LEFT COLUMN: Profile Info & Credentials */}
        <div className="lg:col-span-7 space-y-6">
          {/* Main Profile Card */}
          <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-3xl p-6 relative overflow-hidden">
            {/* Decorative background glow sphere */}
            <div className="absolute -right-8 -top-8 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none"></div>

            {/* Technical header label */}
            <div className="absolute top-4 right-4 text-[10px] font-mono text-white/30 uppercase tracking-widest">
              {worker.id.toUpperCase()}
            </div>

            <div className="flex flex-col items-center text-center space-y-4 pt-4">
              {/* Avatar Container */}
              <div className="w-24 h-24 rounded-full bg-white/5 border-2 border-indigo-400 overflow-hidden p-1 shadow-hud-glow">
                <img
                  alt={worker.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover rounded-full"
                  src={worker.avatar}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=100';
                  }}
                />
              </div>

              <div>
                <h2 className="text-2xl font-display font-bold text-white">
                  {worker.name}
                </h2>
                <p className="text-xs font-mono text-white/50 mt-1.5 uppercase tracking-widest font-semibold">
                  {worker.roleLabel || worker.role}
                </p>
              </div>

              <div className="flex gap-2">
                {isLiveNow ? (
                  <span className="bg-emerald-400/10 text-emerald-300 text-xs font-mono px-3 py-1 rounded-full border border-emerald-400/20 flex items-center gap-1.5 font-bold shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    En el Recinto
                  </span>
                ) : isMarkedIn ? (
                  <span className="bg-amber-400/10 text-amber-300 text-xs font-mono px-3 py-1 rounded-full border border-amber-400/20 flex items-center gap-1.5 font-bold shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    IN fuera de fecha
                  </span>
                ) : (
                  <span className="bg-white/5 text-white/50 text-xs font-mono px-3 py-1 rounded-full border border-white/10 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/30"></span>
                    Fuera de Turno
                  </span>
                )}
                <span className="bg-white/10 text-white/70 text-xs font-mono px-3 py-1 rounded-full border border-white/10">
                  ID: {worker.idCode}
                </span>
              </div>
            </div>
          </div>

          {/* Stats Bento Box */}
          <div className="grid grid-cols-2 gap-4">
            {/* Bento 1: Total Hours */}
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-5 flex flex-col justify-between">
              <div className="text-[10px] font-mono text-white/40 uppercase tracking-wider font-bold">
                Horas Totales
              </div>
              <div className="text-3xl font-display font-black text-indigo-300 my-2 leading-none">
                {formatHoursMinutesFromDecimal(worker.totalHours)}
              </div>
              <div className="text-[10px] font-mono text-white/40">
                Esta Producción
              </div>
            </div>

            {/* Bento 2: Current Shift */}
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-5 flex flex-col justify-between">
              <div className="text-[10px] font-mono text-white/40 uppercase tracking-wider font-bold">
                Turno Actual
              </div>
              <div className="text-3xl font-display font-black text-white my-2 leading-none">
                {isLiveNow ? (
                  <>
                    {String(liveShift.hours).padStart(2, '0')}
                    <span className="text-sm font-mono text-white/30 ml-0.5 mr-1.5">h</span>
                    {String(liveShift.mins).padStart(2, '0')}
                    <span className="text-sm font-mono text-white/30 ml-0.5">m</span>
                  </>
                ) : (
                  '00h 00m'
                )}
              </div>
              {isLiveNow ? (
                <div className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 font-bold">
                  <Timer className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '6s' }} />
                  Activo Ahora
                </div>
              ) : isMarkedIn ? (
                <div className="text-[10px] font-mono text-amber-300 flex items-center gap-1 font-bold">
                  <Clock className="w-3.5 h-3.5" />
                  Sin turno activo hoy
                </div>
              ) : (
                <div className="text-[10px] font-mono text-white/20">
                  Sin Registrar Entrada
                </div>
              )}
            </div>
          </div>

          {/* QR DIGITAL CREDENTIAL PASS */}
          <div className="bg-[#120f26]/85 backdrop-blur-xl border border-white/10 rounded-3xl p-6 relative overflow-hidden flex flex-col items-center text-center space-y-4">
            {/* Laser alignment lines/grid in background */}
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[#818cf8] via-[#a855f7] to-[#ec4899]" />
            
            <div className="w-full flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-indigo-300 uppercase tracking-widest">
                CREDENCIAL DIGITAL QR
              </span>
              <span className="text-[9px] font-mono text-white/40">ID: {worker.idCode}</span>
            </div>

            {/* Dynamic High-Contrast QR Code box */}
            <div className="p-4 bg-white rounded-2xl flex items-center justify-center shadow-xl border border-white/10">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=165x165&bgcolor=ffffff&color=120f26&qzone=1&data=${encodeURIComponent(worker.idCode)}`}
                alt={`Acreditación QR de ${worker.name}`}
                className="w-36 h-36 object-contain select-none"
                title={worker.idCode}
              />
            </div>

            <div className="space-y-1 text-center w-full">
              <p className="font-mono text-xs text-white/95 font-bold tracking-widest uppercase">
                {worker.name}
              </p>
              <p className="text-[11px] font-mono text-white/50 leading-relaxed max-w-xs mx-auto mb-2">
                Muestra este código QR en el lector del acceso principal para registrar tu entrada o salida automáticamente.
              </p>
              
              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                  `🎸 *MADRID LIVE ACCESS* 🎸\n\nHola, *${worker.name}*.\nAquí tienes tu acreditación de acceso oficial para el concierto:\n\n📋 *PUESTO*: ${worker.roleLabel || worker.role}\n🔑 *CÓDIGO DE CREDENCIAL*: ${worker.idCode}\n\nAccede al siguiente enlace para ver y guardar tu código QR Oficial:\n👉 https://api.qrserver.com/v1/create-qr-code/?size=400x400&bgcolor=ffffff&color=120f26&qzone=1&data=${encodeURIComponent(worker.idCode)}\n\n⚠️ *INSTRUCCIONES*: Guarda esta imagen en tu móvil. Al llegar y salir del recinto de Madrid Live, muestra este código QR en el lector del supervisor para registrar tu entrada/salida rápidamente.`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold uppercase rounded-xl tracking-wider transition-all flex items-center justify-center gap-2 mt-4 cursor-pointer"
              >
                <span>💬</span>
                <span>COMPARTIR POR WHATSAPP</span>
              </a>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Actions and Shift Records */}
        <div className="lg:col-span-5 space-y-6">
          {/* Manual Actions panel */}
          <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-3xl p-5 space-y-4">
            <h3 className="text-sm font-mono font-bold text-white/80 uppercase tracking-wider">
              Acciones Administrativas
            </h3>
            <p className="text-xs text-white/50 leading-relaxed font-mono">
              Registrar entrada o salida forzada de forma manual, sobrescribiendo las lecturas automáticas de los códigos QR.
            </p>
            <button
              onClick={handleToggle}
              className={`w-full h-12 bg-transparent text-indigo-300 hover:text-white font-mono text-xs rounded-2xl border border-indigo-400 transition-all uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer ${
                isMarkedIn
                  ? 'hover:bg-rose-500/10 hover:border-rose-400 hover:text-rose-400' 
                  : 'hover:bg-indigo-400/10'
              }`}
            >
              <CalendarRange className="w-4 h-4" />
              {isMarkedIn ? 'Salida Manual' : 'Entrada Manual'}
            </button>
          </div>

          {/* Shift History List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-display font-bold text-white">
                Historial de Turnos
              </h3>
              <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest font-semibold">
                Historial completo
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {workerShifts.length === 0 ? (
                <div className="bg-white/5 rounded-3xl border border-white/10 p-5 text-center">
                  <p className="text-xs font-mono text-white/40">No hay registros en el historial de turnos</p>
                </div>
              ) : (
                workerShifts.map(shift => {
                  const isActive = isShiftActiveNow(shift);
                  const isOpenOutOfRange = shift.status === 'Active' && !isActive;

                  return (
                    <div
                      key={shift.id}
                      className={`bg-white/5 rounded-3xl p-4 flex justify-between items-center border relative overflow-hidden ${
                        isActive 
                          ? 'border-emerald-400/30 bg-emerald-500/10' 
                          : isOpenOutOfRange
                            ? 'border-amber-400/25 bg-amber-500/10'
                          : 'border-white/10'
                      }`}
                    >
                      {/* Left neon indicator for active shifts */}
                      {(isActive || isOpenOutOfRange) && (
                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${isActive ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                      )}

                      <div className="flex flex-col ml-1 text-left">
                        <span className="text-sm font-semibold text-white">
                          {formatShiftDateLabel(shift)}
                        </span>
                        <span className="text-xs font-mono text-white/40 mt-1">
                          {formatTimespanLabel(shift.timespan)}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className={`text-xs font-mono font-bold uppercase ${
                            isActive ? 'text-emerald-400' : isOpenOutOfRange ? 'text-amber-300' : 'text-white'
                          }`}>
                            {isActive ? 'Activo ahora' : isOpenOutOfRange ? 'Activo antiguo' : 'Completado'}
                          </p>
                          <p className="text-[10px] font-mono text-white/50 mt-0.5">
                            {shift.eventTitle}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-white/30" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Manual Check-In Dialog */}
      {isCheckInModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
          <div className="bg-[#120f26]/90 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <h3 className="text-lg font-display font-medium text-white text-left">Confirmar Detalles de Entrada</h3>
            <p className="text-xs font-mono text-white/50 text-left">
              Seleccione la zona técnica de trabajo activa para iniciar el turno de {worker.name}:
            </p>

            <div className="space-y-2 text-left">
              {(['Stage Left', 'FOH Audio', 'Loading Dock', 'Backstage VIP', 'Artist Entrance'] as const).map(zone => (
                <button
                  key={zone}
                  onClick={() => setCustomLocation(zone)}
                  className={`w-full p-3 font-mono text-xs rounded-xl border text-left flex justify-between items-center transition-colors ${
                    customLocation === zone
                      ? 'bg-indigo-500/20 border-indigo-400 text-white'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                >
                  <span>{zoneTranslationMap[zone] || zone}</span>
                  {customLocation === zone && <CheckCircle className="w-4 h-4 text-indigo-400" />}
                </button>
              ))}
            </div>

            <div className="flex gap-3 pt-2 font-mono">
              <button
                onClick={() => setIsCheckInModalOpen(false)}
                className="flex-1 h-11 bg-transparent hover:bg-white/5 border border-white/10 text-white rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={confirmCheckIn}
                className="flex-1 h-11 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Registrar Entrada
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
