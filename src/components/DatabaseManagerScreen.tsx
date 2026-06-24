import { useState, FormEvent } from 'react';
import { 
  Database, 
  Plus, 
  Trash2, 
  Edit3, 
  RefreshCw, 
  X, 
  Check, 
  Search, 
  Calendar, 
  Users, 
  Clock, 
  AlertCircle,
  HelpCircle
} from 'lucide-react';
import { LiveEvent, StaffMember, Shift, EquipmentAlert } from '../types';
import { 
  addEvent, updateEvent, deleteEvent,
  addStaff, updateStaff, deleteStaff,
  addShift, updateShift, deleteShift,
  addAlert, updateAlert, deleteAlert,
  forceResetDatabase
} from '../dbService';

interface DatabaseManagerScreenProps {
  events: LiveEvent[];
  staff: StaffMember[];
  shifts: Shift[];
  alerts: EquipmentAlert[];
  onClose: () => void;
}

type CollectionTab = 'events' | 'staff' | 'shifts' | 'alerts';

const tabLabelMap: Record<CollectionTab, string> = {
  staff: 'Colaboradores',
  events: 'Eventos',
  shifts: 'Turnos',
  alerts: 'Alertas'
};

const sectorTranslationMap: Record<string, string> = {
  'Auxiliar': 'Auxiliar',
  'Auxiliar Plus': 'Auxiliar Plus',
  'Coordinación': 'Coordinación'
};

export default function DatabaseManagerScreen({
  events,
  staff,
  shifts,
  alerts,
  onClose
}: DatabaseManagerScreenProps) {
  const [activeTab, setActiveTab] = useState<CollectionTab>('staff');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Status message
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  // Edit / Add modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form structured states
  const [eventData, setEventData] = useState<Omit<LiveEvent, 'id'>>({
    title: '', location: '', dateDay: '', dateMonth: '', doorsOpen: '',
    requiredStaff: 0, activeStaff: 0, totalStaffNeeded: 0, scanRate: 0, loadInPercent: 0
  });

  const [staffData, setStaffData] = useState<Omit<StaffMember, 'id'>>({
    idCode: '', name: '', role: 'Auxiliar', roleLabel: '', 
    status: 'OUT', avatar: '', totalHours: 0, currentShiftHours: 0, currentShiftMins: 0, location: ''
  });

  const [shiftData, setShiftData] = useState<Omit<Shift, 'id'>>({
    workerId: '', dateString: '', timespan: '', durationLabel: '', location: '', status: 'Active'
  });

  const [alertData, setAlertData] = useState<Omit<EquipmentAlert, 'id'>>({
    message: '', zone: '', timestamp: '', severity: 'info'
  });

  const showStatus = (text: string, isError = false) => {
    setStatusMessage({ text, isError });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleHardReset = async () => {
    if (!window.confirm('¿Realmente deseas restablecer toda la base de datos a sus valores iniciales por defecto? Se sobrescribirán todos los cambios actuales.')) {
      return;
    }
    setIsResetting(true);
    try {
      await forceResetDatabase();
      showStatus('Base de datos restablecida correctamente a la configuración por defecto.');
    } catch (err: any) {
      showStatus(`Fallo de restablecimiento: ${err.message || err}`, true);
    } finally {
      setIsResetting(false);
    }
  };

  // --- DELETE HANDLER ---
  const handleDelete = async (id: string) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar este registro (${id})? Esto se aplicará de forma directa y permanente en Firestore.`)) {
      return;
    }
    try {
      if (activeTab === 'events') await deleteEvent(id);
      else if (activeTab === 'staff') await deleteStaff(id);
      else if (activeTab === 'shifts') await deleteShift(id);
      else if (activeTab === 'alerts') await deleteAlert(id);
      
      showStatus(`Registro ${id} eliminado correctamente.`);
    } catch (err: any) {
      showStatus(`Error al eliminar el registro: ${err.message || err}`, true);
    }
  };

  // --- OPEN FORM FOR ADD ---
  const handleOpenAdd = () => {
    setFormMode('add');
    setEditingId(null);

    // Initial default presets
    setEventData({
      title: 'Nuevo Concierto Madrid', location: 'WiZink Center', dateDay: '18', dateMonth: 'OCT', doorsOpen: '19:30',
      requiredStaff: 50, activeStaff: 0, totalStaffNeeded: 50, scanRate: 0, loadInPercent: 0
    });
    setStaffData({
      idCode: 'AUX-' + Math.floor(100 + Math.random() * 900), name: '', role: 'Auxiliar', roleLabel: 'AUXILIAR', 
      status: 'OUT', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200',
      totalHours: 12, currentShiftHours: 0, currentShiftMins: 0, location: 'Escenario Principal'
    });
    setShiftData({
      workerId: staff.length > 0 ? staff[0].id : '', dateString: 'Hoy', timespan: '18:00 - Presente', durationLabel: 'Activo', location: 'Escenario Principal', status: 'Active'
    });
    setAlertData({
      message: 'Nueva sugerencia de alerta', zone: 'Zona A', timestamp: '12:00', severity: 'warning'
    });

    setIsFormOpen(true);
  };

  // --- OPEN FORM FOR EDIT ---
  const handleOpenEdit = (record: any) => {
    setFormMode('edit');
    setEditingId(record.id);

    if (activeTab === 'events') {
      const e = record as LiveEvent;
      setEventData({
        title: e.title, location: e.location, dateDay: e.dateDay, dateMonth: e.dateMonth, doorsOpen: e.doorsOpen,
        requiredStaff: e.requiredStaff, activeStaff: e.activeStaff, totalStaffNeeded: e.totalStaffNeeded, scanRate: e.scanRate, loadInPercent: e.loadInPercent
      });
    } else if (activeTab === 'staff') {
      const s = record as StaffMember;
      setStaffData({
        idCode: s.idCode, name: s.name, role: s.role, roleLabel: s.roleLabel, 
        status: s.status, avatar: s.avatar, totalHours: s.totalHours, currentShiftHours: s.currentShiftHours, currentShiftMins: s.currentShiftMins, location: s.location
      });
    } else if (activeTab === 'shifts') {
      const sh = record as Shift;
      setShiftData({
        workerId: sh.workerId, dateString: sh.dateString, timespan: sh.timespan, durationLabel: sh.durationLabel, location: sh.location, status: sh.status
      });
    } else if (activeTab === 'alerts') {
      const al = record as EquipmentAlert;
      setAlertData({
        message: al.message, zone: al.zone, timestamp: al.timestamp, severity: al.severity
      });
    }

    setIsFormOpen(true);
  };

  // --- SUBMIT FORM ---
  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (formMode === 'add') {
        if (activeTab === 'events') await addEvent(eventData);
        else if (activeTab === 'staff') await addStaff({ ...staffData, roleLabel: `${staffData.role.toUpperCase()} PERSONNEL` });
        else if (activeTab === 'shifts') await addShift(shiftData);
        else if (activeTab === 'alerts') await addAlert(alertData);
        showStatus('Nuevo registro creado con éxito.');
      } else {
        if (!editingId) return;
        if (activeTab === 'events') await updateEvent(editingId, eventData);
        else if (activeTab === 'staff') await updateStaff(editingId, { ...staffData, roleLabel: `${staffData.role.toUpperCase()} personnel` });
        else if (activeTab === 'shifts') await updateShift(editingId, shiftData);
        else if (activeTab === 'alerts') await updateAlert(editingId, alertData);
        showStatus('Registro actualizado con éxito.');
      }
      setIsFormOpen(false);
    } catch (err: any) {
      showStatus(`Fallo al guardar: ${err.message || err}`, true);
    }
  };

  // --- FILTER GRID ITEMS ---
  const getFilteredItems = () => {
    const q = searchTerm.toLowerCase();
    if (activeTab === 'events') {
      return events.filter(e => e.title.toLowerCase().includes(q) || e.location.toLowerCase().includes(q) || e.id.toLowerCase().includes(q));
    } else if (activeTab === 'staff') {
      return staff.filter(s => s.name.toLowerCase().includes(q) || s.idCode.toLowerCase().includes(q) || s.role.toLowerCase().includes(q));
    } else if (activeTab === 'shifts') {
      return shifts.filter(sh => sh.workerId.toLowerCase().includes(q) || sh.location.toLowerCase().includes(q) || sh.id.toLowerCase().includes(q));
    } else if (activeTab === 'alerts') {
      return alerts.filter(al => al.message.toLowerCase().includes(q) || al.zone.toLowerCase().includes(q) || al.id.toLowerCase().includes(q));
    }
    return [];
  };

  const filteredItems = getFilteredItems();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#030008]/95 backdrop-blur-md flex flex-col p-4 md:p-6 text-left" id="database-manager-screen">
      {/* HUD Header */}
      <div className="max-w-4xl w-full mx-auto bg-[#0f0a20]/90 border border-indigo-500/20 rounded-3xl overflow-hidden flex flex-col shadow-2xl flex-1 min-h-[500px]">
        
        {/* Title Bar */}
        <div className="bg-indigo-950/40 px-6 py-4 flex items-center justify-between border-b border-indigo-500/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/30">
              <Database className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <h2 className="text-lg font-display font-bold text-white leading-none">EXPLORADOR DE FIRESTORE</h2>
              <p className="text-[10px] font-mono text-indigo-400 mt-1 uppercase tracking-widest leading-none">
                Acceso Directo a la Base de Datos en la Nube
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleHardReset}
              disabled={isResetting}
              className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 disabled:text-rose-300/40 text-xs font-mono px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
              {isResetting ? 'Restableciendo...' : 'Restablecer BD'}
            </button>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Info alerts */}
        {statusMessage && (
          <div className={`px-6 py-3 flex items-center gap-2 font-mono text-xs ${statusMessage.isError ? 'bg-red-500/15 text-red-300 border-b border-red-500/15' : 'bg-emerald-500/15 text-emerald-300 border-b border-emerald-500/15'}`}>
            <AlertCircle className="w-4 h-4" />
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Roster & Grid selector tabs */}
        <div className="bg-[#120e2a]/50 border-b border-white/5 flex flex-wrap gap-2 px-6 py-3">
          {(['staff', 'events', 'shifts', 'alerts'] as const).map(tab => {
            const count = tab === 'staff' ? staff.length : tab === 'events' ? events.length : tab === 'shifts' ? shifts.length : alerts.length;
            return (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setSearchTerm('');
                }}
                className={`px-4 py-2 rounded-xl font-mono text-xs uppercase transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === tab
                    ? 'bg-indigo-500/10 border border-indigo-400/30 text-indigo-300 font-bold'
                    : 'text-white/40 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span>{tabLabelMap[tab]}</span>
                <span className="bg-white/10 text-white/60 text-[9px] px-1.5 py-0.5 rounded-full font-bold">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Selection search and Action header */}
        <div className="px-6 py-4 border-b border-white/5 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`Buscar en ${tabLabelMap[activeTab].toLowerCase()}...`}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white focus:outline-none focus:border-indigo-400"
            />
          </div>

          <button
            onClick={handleOpenAdd}
            className="w-full sm:w-auto bg-indigo-500 hover:bg-indigo-400 text-white font-mono font-medium text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-indigo-500/15"
          >
            <Plus className="w-4 h-4" />
            <span>Añadir {activeTab === 'staff' ? 'Colaborador' : activeTab === 'events' ? 'Evento' : activeTab === 'shifts' ? 'Turno' : 'Alerta'}</span>
          </button>
        </div>

        {/* Database List Table Container */}
        <div className="flex-1 overflow-auto p-6">
          {filteredItems.length === 0 ? (
            <div className="text-center bg-white/5 rounded-3xl p-10 border border-white/5 font-mono text-xs text-white/40">
              No se encontraron registros de {tabLabelMap[activeTab].toLowerCase()} en la nube. Crea uno o restablece los valores por defecto.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredItems.map((item: any) => (
                <div 
                  key={item.id}
                  className="bg-white/5 hover:bg-[#15112e]/50 border border-white/10 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {activeTab === 'staff' && (
                      <img src={item.avatar} alt="" className="w-10 h-10 rounded-full object-cover border border-white/25 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      {/* Technical Header */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-[9px] bg-indigo-500/10 text-indigo-300 border border-indigo-400/20 rounded px-1.5 py-0.5 uppercase tracking-wide">
                          {item.id}
                        </span>
                        {activeTab === 'staff' && (
                          <span className="font-mono text-[9px] bg-white/10 text-white/60 rounded px-1.5 py-0.5">
                            {item.idCode}
                          </span>
                        )}
                        {activeTab === 'shifts' && (
                          <span className={`font-mono text-[9px] border rounded px-1.5 py-0.5 ${item.status === 'Active' ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-300' : 'bg-white/5 border-white/10 text-white/40'}`}>
                            {item.status === 'Active' ? 'Activo' : 'Completado'}
                          </span>
                        )}
                      </div>

                      {/* Descriptive Info */}
                      {activeTab === 'events' && (
                        <div className="text-left">
                          <h4 className="text-sm font-bold text-white">{item.title}</h4>
                          <p className="text-xs text-white/50 font-mono mt-1">
                            {item.location} • Apertura: {item.doorsOpen} • Día: {item.dateDay} {item.dateMonth}
                          </p>
                          <p className="text-[10px] text-indigo-400 mt-1 font-mono">
                            Personal Requerido: {item.totalStaffNeeded} | Escaneos: {item.scanRate} /min | Montaje: {item.loadInPercent}%
                          </p>
                        </div>
                      )}

                      {activeTab === 'staff' && (
                        <div className="text-left">
                          <h4 className="text-sm font-bold text-white">{item.name}</h4>
                          <p className="text-xs text-indigo-300 font-mono mt-0.5">
                            {sectorTranslationMap[item.role] || item.role} ({item.location})
                          </p>
                          <p className="text-[10px] text-white/50 font-mono mt-1">
                            Horas Totales: {item.totalHours.toFixed(1)}h | Estado: {item.status === 'IN' ? 'DENTRO' : 'FUERA'} | Entrada: {item.checkedInTime || '—'}
                          </p>
                        </div>
                      )}

                      {activeTab === 'shifts' && (
                        <div className="text-left">
                          <h4 className="text-xs font-mono text-white/50">ID Colaborador: {item.workerId}</h4>
                          <p className="text-sm font-bold text-white mt-1">
                            {item.location} ({item.timespan === '14:00 - Present' ? '14:00 - Presente' : item.timespan === '14:30 - Present' ? '14:30 - Presente' : item.timespan === '09:00 - Present' ? '09:00 - Presente' : item.timespan})
                          </p>
                          <p className="text-[10px] text-indigo-300 font-mono mt-0.5">
                            Fecha: {item.dateString === 'Today' ? 'Hoy' : item.dateString === 'Yesterday' ? 'Ayer' : item.dateString} | Duración: {item.durationLabel === 'Active' ? 'Activo' : item.durationLabel}
                          </p>
                        </div>
                      )}

                      {activeTab === 'alerts' && (
                        <div className="text-left">
                          <span className={`inline-block text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase mb-1 ${item.severity === 'error' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : item.severity === 'warning' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'}`}>
                            {item.severity === 'error' ? 'ERROR' : item.severity === 'warning' ? 'ADVERTENCIA' : 'INFO'}
                          </span>
                          <h4 className="text-sm text-white leading-snug">{item.message}</h4>
                          <p className="text-xs text-white/40 mt-1 font-mono">
                            Zona: {item.zone} • Hora: {item.timestamp}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions column */}
                  <div className="flex items-center gap-2 shrink-0 md:self-center">
                    <button
                      onClick={() => handleOpenEdit(item)}
                      className="flex-1 md:flex-initial h-9 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 rounded-xl px-3 text-xs font-mono flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="flex-1 md:flex-initial h-9 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-xl px-3 text-xs font-mono flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Eliminar</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MODAL INPUT FORM FOR CREATE / EDIT */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#120e2a] border border-white/10 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setIsFormOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-display font-bold text-white">
              {formMode === 'add' ? 'Añadir Nuevo Registro' : 'Editar Registro de Base de Datos'}
            </h3>
            <p className="text-xs font-mono text-indigo-300 uppercase tracking-wider">
              Colección: {tabLabelMap[activeTab]}
            </p>

            <form onSubmit={handleFormSubmit} className="space-y-4 text-xs font-mono">
              {/* === EVENT SCHEMAS === */}
              {activeTab === 'events' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] text-white/50 block mb-1">Título del Evento</label>
                    <input type="text" required value={eventData.title} onChange={e => setEventData({ ...eventData, title: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" />
                  </div>
                  <div>
                    <label className="text-[10px] text-white/50 block mb-1">Ubicación</label>
                    <input type="text" required value={eventData.location} onChange={e => setEventData({ ...eventData, location: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-white/50 block mb-1">Día (Número)</label>
                      <input type="text" required value={eventData.dateDay} onChange={e => setEventData({ ...eventData, dateDay: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" placeholder="ej. 12" />
                    </div>
                    <div>
                      <label className="text-[10px] text-white/50 block mb-1">Mes (Letras)</label>
                      <input type="text" required value={eventData.dateMonth} onChange={e => setEventData({ ...eventData, dateMonth: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" placeholder="ej. OCT" />
                    </div>
                    <div>
                      <label className="text-[10px] text-white/50 block mb-1">Apertura</label>
                      <input type="text" required value={eventData.doorsOpen} onChange={e => setEventData({ ...eventData, doorsOpen: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" placeholder="ej. 19:00" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-white/50 block mb-1">Personal Requerido</label>
                      <input type="number" required value={eventData.requiredStaff} onChange={e => setEventData({ ...eventData, requiredStaff: Number(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" />
                    </div>
                    <div>
                      <label className="text-[10px] text-white/50 block mb-1">Personal Activo</label>
                      <input type="number" required value={eventData.activeStaff} onChange={e => setEventData({ ...eventData, activeStaff: Number(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-white/50 block mb-1">Objetivo Total</label>
                      <input type="number" required value={eventData.totalStaffNeeded} onChange={e => setEventData({ ...eventData, totalStaffNeeded: Number(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" />
                    </div>
                    <div>
                      <label className="text-[10px] text-white/50 block mb-1">Vel. de Escaneo</label>
                      <input type="number" required value={eventData.scanRate} onChange={e => setEventData({ ...eventData, scanRate: Number(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" />
                    </div>
                    <div>
                      <label className="text-[10px] text-white/50 block mb-1">Progreso %</label>
                      <input type="number" required min="0" max="100" value={eventData.loadInPercent} onChange={e => setEventData({ ...eventData, loadInPercent: Number(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" />
                    </div>
                  </div>
                </div>
              )}

              {/* === STAFF SCHEMAS === */}
              {activeTab === 'staff' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] text-white/50 block mb-1">Nombre Completo</label>
                    <input type="text" required value={staffData.name} onChange={e => setStaffData({ ...staffData, name: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" />
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <label className="text-[10px] text-white/50 block mb-1">Código ID</label>
                      <input type="text" required value={staffData.idCode} onChange={e => setStaffData({ ...staffData, idCode: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" placeholder="ej. AUX-042" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-white/50 block mb-1">Área / Sector</label>
                      <select required value={staffData.role} onChange={e => setStaffData({ ...staffData, role: e.target.value as any })} className="w-full bg-[#1c1836] border border-white/10 rounded-xl p-2.5 text-white">
                        {['Auxiliar', 'Auxiliar Plus', 'Coordinación'].map(r => (
                          <option key={r} value={r}>{sectorTranslationMap[r] || r}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-white/50 block mb-1">Estado de Presencia</label>
                      <select required value={staffData.status} onChange={e => setStaffData({ ...staffData, status: e.target.value as any })} className="w-full bg-[#1c1836] border border-white/10 rounded-xl p-2.5 text-white">
                        <option value="IN">DENTRO (En el recinto)</option>
                        <option value="OUT">FUERA (Salida registrada)</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-white/50 block mb-1">Ubicación de Trabajo</label>
                    <input type="text" required value={staffData.location} onChange={e => setStaffData({ ...staffData, location: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" />
                  </div>
                  <div>
                    <label className="text-[10px] text-white/50 block mb-1">URL Foto de Perfil</label>
                    <input type="text" required value={staffData.avatar} onChange={e => setStaffData({ ...staffData, avatar: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-white/50 block mb-1">Horas Totales</label>
                      <input type="number" step="0.1" required value={staffData.totalHours} onChange={e => setStaffData({ ...staffData, totalHours: Number(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" />
                    </div>
                    <div>
                      <label className="text-[10px] text-white/50 block mb-1">Horas Turno</label>
                      <input type="number" required value={staffData.currentShiftHours} onChange={e => setStaffData({ ...staffData, currentShiftHours: Number(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" />
                    </div>
                    <div>
                      <label className="text-[10px] text-white/50 block mb-1">Mins Turno</label>
                      <input type="number" required value={staffData.currentShiftMins} onChange={e => setStaffData({ ...staffData, currentShiftMins: Number(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" />
                    </div>
                  </div>
                </div>
              )}

              {/* === SHIFT SCHEMAS === */}
              {activeTab === 'shifts' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] text-white/50 block mb-1">Colaborador Asignado</label>
                    <select required value={shiftData.workerId} onChange={e => setShiftData({ ...shiftData, workerId: e.target.value })} className="w-full bg-[#1c1836] border border-white/10 rounded-xl p-2.5 text-white">
                      <option value="">-- Seleccionar Colaborador --</option>
                      {staff.map(w => (
                        <option key={w.id} value={w.id}>{w.name} ({w.idCode})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-white/50 block mb-1">Zona de Trabajo</label>
                    <input type="text" required value={shiftData.location} onChange={e => setShiftData({ ...shiftData, location: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" />
                  </div>
                  <div>
                    <label className="text-[10px] text-white/50 block mb-1">Intervalo de Turno</label>
                    <input type="text" required value={shiftData.timespan} onChange={e => setShiftData({ ...shiftData, timespan: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" placeholder="ej. 14:00 - Presente" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-white/50 block mb-1">Fecha</label>
                      <input type="text" required value={shiftData.dateString} onChange={e => setShiftData({ ...shiftData, dateString: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" placeholder="ej. Hoy" />
                    </div>
                    <div>
                      <label className="text-[10px] text-white/50 block mb-1">Etiqueta Duración</label>
                      <input type="text" required value={shiftData.durationLabel} onChange={e => setShiftData({ ...shiftData, durationLabel: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" placeholder="ej. Activo o 12.5h" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-white/50 block mb-1">Estado de Turno</label>
                    <select required value={shiftData.status} onChange={e => setShiftData({ ...shiftData, status: e.target.value as any })} className="w-full bg-[#1c1836] border border-white/10 rounded-xl p-2.5 text-white">
                      <option value="Active">Activo (Trabajando)</option>
                      <option value="Completed">Completado (Salida registrada)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* === ALERT SCHEMAS === */}
              {activeTab === 'alerts' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] text-white/50 block mb-1 font-bold">Nivel de Gravedad</label>
                    <select required value={alertData.severity} onChange={e => setAlertData({ ...alertData, severity: e.target.value as any })} className="w-full bg-[#1c1836] border border-white/10 rounded-xl p-2.5 text-white">
                      <option value="info">Información (Azul)</option>
                      <option value="warning">Advertencia (Ámbar)</option>
                      <option value="error">Error (Rosa)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-white/50 block mb-1">Mensaje de Alerta</label>
                    <textarea required value={alertData.message} onChange={e => setAlertData({ ...alertData, message: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white h-20 resize-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-white/50 block mb-1">Zona</label>
                      <input type="text" required value={alertData.zone} onChange={e => setAlertData({ ...alertData, zone: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" />
                    </div>
                    <div>
                      <label className="text-[10px] text-white/50 block mb-1">Hora de Alerta</label>
                      <input type="text" required value={alertData.timestamp} onChange={e => setAlertData({ ...alertData, timestamp: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="flex-1 h-11 bg-transparent hover:bg-white/5 border border-white/10 rounded-xl text-white text-xs cursor-pointer text-center font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 h-11 bg-indigo-500 hover:bg-indigo-400 text-white font-bold rounded-xl text-xs cursor-pointer text-center shadow-lg shadow-indigo-500/15"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
