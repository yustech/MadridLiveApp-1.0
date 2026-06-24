import { useState } from 'react';
import { 
  Activity, 
  MapPin, 
  AlertTriangle, 
  ChevronRight, 
  Calendar, 
  QrCode, 
  Users, 
  CheckCircle2, 
  Clock 
} from 'lucide-react';
import { LiveEvent, EquipmentAlert, StaffMember } from '../types';

interface DashboardScreenProps {
  events: LiveEvent[];
  alerts: EquipmentAlert[];
  staff: StaffMember[];
  onLaunchScanner: () => void;
  onSelectEvent: (event: LiveEvent) => void;
}

export default function DashboardScreen({
  events,
  alerts,
  staff,
  onLaunchScanner,
  onSelectEvent
}: DashboardScreenProps) {
  // Let's filter live vs upcoming events
  const liveEvent = events.find(e => e.id === 'ev_01') || events[0] || null;
  const upcomingEvents = liveEvent ? events.filter(e => e.id !== liveEvent.id) : events;

  // Dynamically calculate active staff count from local state
  const checkedInStaffCount = staff.filter(s => s.status === 'IN').length;

  return (
    <div id="dashboard-view" className="space-y-6">
      {/* Status Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-display font-black tracking-tight text-white">
            Panel de Control
          </h1>
          <p className="text-sm font-mono text-white/50 mt-1">
            Operaciones de Eventos en Vivo • Madrid
          </p>
        </div>
        <div className="flex items-center space-x-2 bg-emerald-400/10 border border-emerald-400/20 px-3 py-1.5 rounded-full">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest font-semibold">
            SISTEMA ACTIVO
          </span>
        </div>
      </div>

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Active Event Focus Card */}
        <div className="md:col-span-2 bg-white/5 backdrop-blur-lg border border-white/10 rounded-3xl p-6 relative overflow-hidden flex flex-col justify-between min-h-[280px] shadow-hud-glow">
          {/* Top Identifier Badge */}
          <div className="absolute top-4 right-4 bg-white/10 border border-white/10 px-2.5 py-1 rounded-full text-xs font-mono text-white/70">
            ID: WZK-2409
          </div>

          <div>
            <div className="inline-flex items-center space-x-2 bg-indigo-500/10 text-indigo-300 px-3 py-1 rounded-full text-xs font-mono mb-4 border border-indigo-400/20">
              <Activity className="w-3.5 h-3.5" />
              <span>PRODUCCIÓN EN VIVO</span>
            </div>

            <h2 className="text-2xl font-display font-bold text-white mb-2">
              {liveEvent?.title || "Sin Evento Activo"}
            </h2>
            <p className="text-sm text-white/60 flex items-center mb-6">
              <MapPin className="w-4 h-4 mr-2 text-indigo-400" />
              {liveEvent?.location || "Ubicación No Especificada"}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 border-t border-white/10 pt-5 mt-auto">
            <div>
              <p className="text-[10px] font-mono text-white/40 uppercase tracking-wider mb-1">
                Personal Activo
              </p>
              <p className="text-xl font-display font-medium text-indigo-300">
                {checkedInStaffCount + 138} <span className="text-xs text-white/20">/ 150</span>
              </p>
            </div>
            <div>
              <p className="text-[10px] font-mono text-white/40 uppercase tracking-wider mb-1">
                Escaneos / Min
              </p>
              <p className="text-xl font-display font-medium text-purple-300">
                {liveEvent?.scanRate ?? 0}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-mono text-white/40 uppercase tracking-wider mb-1">
                Estado del Montaje
              </p>
              <p className="text-xl font-display font-medium text-pink-300">
                {liveEvent?.loadInPercent ?? 0}%
              </p>
            </div>
          </div>

          {/* Decorative circular vector gradient glow */}
          <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
        </div>

        {/* Quick Stats Side Column */}
        <div className="flex flex-col gap-4 justify-between">
          {/* Action Card: Launch Virtual Scanner */}
          <button
            onClick={onLaunchScanner}
            className="w-full flex-1 bg-white/5 backdrop-blur-lg border border-white/10 hover:border-indigo-400/40 rounded-3xl p-6 flex flex-col justify-center items-center text-center group cursor-pointer transition-all duration-300 relative overflow-hidden shadow-sm hover:shadow-hud-glow"
          >
            <div className="w-14 h-14 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 border border-indigo-400/25">
              <QrCode className="w-7 h-7 text-indigo-300" />
            </div>
            <h3 className="text-base font-display font-bold text-white mb-2 group-hover:text-indigo-300 transition-colors">
              Iniciar Escáner
            </h3>
            <p className="text-xs text-white/60 max-w-[180px]">
              Cambiar al modo de control de accesos rápido en la Puerta A.
            </p>
          </button>

          {/* Alert Card */}
          {alerts.map(alert => (
            <div
              key={alert.id}
              className="bg-rose-500/10 border border-rose-500/20 rounded-3xl p-5 flex items-start space-x-3"
            >
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-mono font-bold text-rose-400 uppercase tracking-wider">
                  Alerta de Equipo
                </h4>
                <p className="text-xs text-white/70 mt-1">
                  {alert.message}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming Deployments List */}
      <div className="space-y-4">
        <h3 className="text-xs font-mono font-bold text-white/40 uppercase tracking-widest">
          PRÓXIMOS DESPLIEGUES
        </h3>
        
        <div className="flex flex-col gap-3">
          {upcomingEvents.map(event => (
            <div
              key={event.id}
              onClick={() => onSelectEvent(event)}
              className="bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-5 flex items-center justify-between hover:bg-white/10 transition-all duration-200 cursor-pointer group"
            >
              <div className="flex items-center space-x-4">
                {/* Date Square */}
                <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-xl flex flex-col items-center justify-center">
                  <span className="text-[10px] font-mono text-white/40 uppercase tracking-wide leading-none">
                    {event.dateMonth}
                  </span>
                  <span className="text-lg font-display font-black text-indigo-300 mt-1 leading-none">
                    {event.dateDay}
                  </span>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors">
                    {event.title}
                  </h4>
                  <p className="text-xs text-white/60 mt-1">
                    {event.location} • Puertas: {event.doorsOpen}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="hidden md:block text-right">
                  <p className="text-[10px] font-mono text-white/40 uppercase">Personal Requerido</p>
                  <p className="text-xs font-semibold text-white mt-1">{event.requiredStaff} Especialistas</p>
                </div>
                <ChevronRight className="w-5 h-5 text-white/40 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
