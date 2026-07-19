import { useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Database,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { EquipmentAlert, LiveEvent, Shift, StaffMember } from '../types';
import {
  DEFAULT_FEMALE_AVATAR,
  fileToAvatarDataUrl,
} from '../utils/avatarUpload';
import { getMadridCivilDateParts } from '../utils/madridTime';
import {
  addEvent, updateEvent, deleteEvent,
  addStaff, updateStaff, deleteStaff,
  addShift, updateShift, deleteShift,
  addAlert, updateAlert, deleteAlert,
  forceResetDatabase,
} from '../dbService';
import { AlertsTab } from './databaseManager/AlertsTab';
import { collectionTabs, securitySubTabs, tabLabelMap } from './databaseManager/constants';
import { EventsTab } from './databaseManager/EventsTab';
import { RecordFormModal } from './databaseManager/RecordFormModal';
import { SecurityTab } from './databaseManager/SecurityTab';
import { ShiftsTab } from './databaseManager/ShiftsTab';
import { StaffTab } from './databaseManager/StaffTab';
import {
  CollectionTab,
  ConnectionTestResult,
  DatabaseRecord,
  MariaDbConfig,
  SecuritySubTab,
} from './databaseManager/types';

interface DatabaseManagerScreenProps {
  events: LiveEvent[];
  staff: StaffMember[];
  shifts: Shift[];
  alerts: EquipmentAlert[];
  onClose: () => void;
}

type ConfirmIntent = 'danger' | 'warning';

interface ConfirmAction {
  title: string;
  message: string;
  confirmLabel: string;
  intent: ConfirmIntent;
  onConfirm: () => Promise<void>;
}

function getTabCount(
  tab: CollectionTab,
  staff: StaffMember[],
  events: LiveEvent[],
  shifts: Shift[],
  alerts: EquipmentAlert[]
) {
  if (tab === 'staff') return staff.length;
  if (tab === 'events') return events.length;
  if (tab === 'shifts') return shifts.length;
  if (tab === 'alerts') return alerts.length;
  return 'SQL';
}

function getSecuritySubTabLabel(subTab: SecuritySubTab) {
  if (subTab === 'credentials') return 'Políticas & Admin';
  if (subTab === 'schema') return 'Esquema SQL MySQL';
  return 'Código API Node.js Bridge';
}

export default function DatabaseManagerScreen({
  events,
  staff,
  shifts,
  alerts,
  onClose,
}: DatabaseManagerScreenProps) {
  const [activeTab, setActiveTab] = useState<CollectionTab>('staff');
  const [searchTerm, setSearchTerm] = useState('');

  const [securitySubTab, setSecuritySubTab] = useState<SecuritySubTab>('credentials');
  const [copiedText, setCopiedText] = useState(false);
  const [mariadbConfig, setMariadbConfig] = useState<MariaDbConfig>({
    host: '',
    port: '3306',
    user: '',
    name: '',
    password: '',
  });
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<ConnectionTestResult | null>(null);

  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [eventData, setEventData] = useState<Omit<LiveEvent, 'id'>>({
    title: '',
    location: '',
    dateDay: '',
    dateMonth: '',
    dateYear: String(getMadridCivilDateParts().year),
    doorsOpen: '',
    requiredStaff: 0,
    activeStaff: 0,
    totalStaffNeeded: 0,
    scanRate: 0,
    loadInPercent: 0,
  });

  const [staffData, setStaffData] = useState<Omit<StaffMember, 'id'>>({
    idCode: '',
    name: '',
    role: 'Auxiliar',
    roleLabel: '',
    status: 'OUT',
    avatar: DEFAULT_FEMALE_AVATAR,
    email: '',
    phone: '',
    totalHours: 0,
    currentShiftHours: 0,
    currentShiftMins: 0,
    location: '',
  });

  const [shiftData, setShiftData] = useState<Omit<Shift, 'id'>>({
    workerId: '',
    dateString: '',
    timespan: '',
    durationLabel: '',
    eventId: '',
    eventTitle: '',
    status: 'Active',
  });

  const [alertData, setAlertData] = useState<Omit<EquipmentAlert, 'id'>>({
    message: '',
    zone: '',
    timestamp: '',
    severity: 'info',
  });

  const showStatus = (text: string, isError = false) => {
    setStatusMessage({ text, isError });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const testMariaDBConnection = async () => {
    setIsTestingConnection(true);
    setConnectionTestResult(null);
    try {
      const response = await fetch('/api/test-mariadb', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mariadbConfig),
      });
      const data = await response.json();
      setConnectionTestResult({
        success: data.success,
        message: data.message,
        logs: data.logs,
        advice: data.advice,
      });
    } catch (err: any) {
      setConnectionTestResult({
        success: false,
        message: err.message || 'Error de red al conectar con el servidor bridge.',
        logs: ['[ERROR DE RED] No se pudo establecer conexión con el endpoint local /api/test-mariadb.'],
        advice: 'Asegúrate de que el servidor de desarrollo esté corriendo correctamente en el contenedor.',
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleStaffAvatarFileChange = async (file: File | null) => {
    if (!file) return;

    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      setStaffData({ ...staffData, avatar: dataUrl });
      setStatusMessage(null);
    } catch (err: any) {
      showStatus(err?.message || 'No se pudo cargar la imagen seleccionada.', true);
    }
  };

  const runConfirmAction = async () => {
    if (!confirmAction) return;
    setIsConfirming(true);
    try {
      await confirmAction.onConfirm();
      setConfirmAction(null);
    } finally {
      setIsConfirming(false);
    }
  };

  const runHardReset = async () => {
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

  const handleHardReset = () => {
    setConfirmAction({
      title: 'Restablecer base de datos',
      message: 'Se reemplazarán eventos, colaboradores, turnos y alertas por el dataset inicial. Esta acción requiere permisos admin y no debe ejecutarse durante una operación real.',
      confirmLabel: 'Restablecer BD',
      intent: 'warning',
      onConfirm: runHardReset,
    });
  };

  const runDelete = async (id: string, collection: CollectionTab) => {
    try {
      if (collection === 'events') await deleteEvent(id);
      else if (collection === 'staff') await deleteStaff(id);
      else if (collection === 'shifts') await deleteShift(id);
      else if (collection === 'alerts') await deleteAlert(id);

      showStatus(`Registro ${id} eliminado correctamente.`);
    } catch (err: any) {
      showStatus(`Error al eliminar el registro: ${err.message || err}`, true);
    }
  };

  const handleDelete = (id: string) => {
    const collection = activeTab;
    if (collection === 'security') return;

    setConfirmAction({
      title: 'Eliminar registro',
      message: `Se eliminará el registro ${id} de ${tabLabelMap[collection].toLowerCase()}. Esta acción se aplica directamente sobre MySQL.`,
      confirmLabel: 'Eliminar',
      intent: 'danger',
      onConfirm: () => runDelete(id, collection),
    });
  };

  const handleOpenAdd = () => {
    setFormMode('add');
    setEditingId(null);

    const currentYear = String(getMadridCivilDateParts().year);
    setEventData({
      title: 'Nuevo Concierto Madrid',
      location: 'WiZink Center',
      dateDay: '18',
      dateMonth: 'OCT',
      dateYear: currentYear,
      doorsOpen: '19:30',
      requiredStaff: 50,
      activeStaff: 0,
      totalStaffNeeded: 50,
      scanRate: 0,
      loadInPercent: 0,
    });
    setStaffData({
      idCode: 'AUX-' + Math.floor(100 + Math.random() * 900),
      name: '',
      role: 'Auxiliar',
      roleLabel: 'AUXILIAR',
      status: 'OUT',
      avatar: DEFAULT_FEMALE_AVATAR,
      email: '',
      phone: '',
      totalHours: 0,
      currentShiftHours: 0,
      currentShiftMins: 0,
      location: '',
    });
    const defaultEvent = events[0];
    const nowIso = new Date().toISOString();
    setShiftData({
      workerId: staff.length > 0 ? staff[0].id : '',
      dateString: nowIso,
      timespan: '18:00 - Presente',
      durationLabel: 'Active',
      eventId: defaultEvent?.id || '',
      eventTitle: defaultEvent?.title || '',
      status: 'Active',
      startedAt: nowIso,
    });
    setAlertData({
      message: 'Nueva sugerencia de alerta',
      zone: 'Zona A',
      timestamp: '12:00',
      severity: 'warning',
    });

    setIsFormOpen(true);
  };

  const handleOpenEdit = (record: DatabaseRecord) => {
    setFormMode('edit');
    setEditingId(record.id);

    if (activeTab === 'events') {
      const event = record as LiveEvent;
      setEventData({
        title: event.title,
        location: event.location,
        dateDay: event.dateDay,
        dateMonth: event.dateMonth,
        dateYear: event.dateYear || String(getMadridCivilDateParts().year),
        doorsOpen: event.doorsOpen,
        requiredStaff: event.requiredStaff,
        activeStaff: event.activeStaff,
        totalStaffNeeded: event.totalStaffNeeded,
        scanRate: event.scanRate,
        loadInPercent: event.loadInPercent,
      });
    } else if (activeTab === 'staff') {
      const staffMember = record as StaffMember;
      setStaffData({
        idCode: staffMember.idCode,
        name: staffMember.name,
        role: staffMember.role,
        roleLabel: staffMember.roleLabel,
        status: staffMember.status,
        avatar: staffMember.avatar,
        email: staffMember.email || '',
        phone: staffMember.phone || '',
        totalHours: staffMember.totalHours,
        currentShiftHours: staffMember.currentShiftHours,
        currentShiftMins: staffMember.currentShiftMins,
        location: staffMember.location || '',
      });
    } else if (activeTab === 'shifts') {
      const shift = record as Shift;
      setShiftData({
        workerId: shift.workerId,
        dateString: shift.dateString,
        timespan: shift.timespan,
        durationLabel: shift.durationLabel,
        eventId: shift.eventId || '',
        eventTitle: shift.eventTitle,
        status: shift.status,
      });
    } else if (activeTab === 'alerts') {
      const alert = record as EquipmentAlert;
      setAlertData({
        message: alert.message,
        zone: alert.zone,
        timestamp: alert.timestamp,
        severity: alert.severity,
      });
    }

    setIsFormOpen(true);
  };

  const handleFormSubmit = async (event: FormEvent) => {
    event.preventDefault();
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

  const getFilteredItems = (): DatabaseRecord[] => {
    const q = searchTerm.toLowerCase();
    if (activeTab === 'events') {
      return events.filter(e => e.title.toLowerCase().includes(q) || e.location.toLowerCase().includes(q) || e.id.toLowerCase().includes(q));
    }
    if (activeTab === 'staff') {
      return staff.filter(s => s.name.toLowerCase().includes(q) || s.idCode.toLowerCase().includes(q) || s.role.toLowerCase().includes(q));
    }
    if (activeTab === 'shifts') {
      return shifts.filter(sh => sh.workerId.toLowerCase().includes(q) || sh.eventTitle.toLowerCase().includes(q) || sh.id.toLowerCase().includes(q));
    }
    if (activeTab === 'alerts') {
      return alerts.filter(al => al.message.toLowerCase().includes(q) || al.zone.toLowerCase().includes(q) || al.id.toLowerCase().includes(q));
    }
    return [];
  };

  const filteredItems = getFilteredItems();

  const renderActiveDataTab = () => {
    if (activeTab === 'staff') {
      return <StaffTab items={filteredItems as StaffMember[]} onEdit={handleOpenEdit} onDelete={handleDelete} />;
    }
    if (activeTab === 'events') {
      return <EventsTab items={filteredItems as LiveEvent[]} onEdit={handleOpenEdit} onDelete={handleDelete} />;
    }
    if (activeTab === 'shifts') {
      return <ShiftsTab items={filteredItems as Shift[]} onEdit={handleOpenEdit} onDelete={handleDelete} />;
    }
    if (activeTab === 'alerts') {
      return <AlertsTab items={filteredItems as EquipmentAlert[]} onEdit={handleOpenEdit} onDelete={handleDelete} />;
    }
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#030008]/95 backdrop-blur-md flex flex-col p-4 md:p-6 text-left" id="database-manager-screen">
      <div className="max-w-4xl w-full mx-auto bg-[#0f0a20]/90 border border-indigo-500/20 rounded-3xl overflow-hidden flex flex-col shadow-2xl flex-1 min-h-[500px]">
        <div className="bg-indigo-950/40 px-6 py-4 flex items-center justify-between border-b border-indigo-500/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/30">
              <Database className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <h2 className="text-lg font-display font-bold text-white leading-none">MADRID LIVE CONTROL</h2>
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

        {statusMessage && (
          <div className={`px-6 py-3 flex items-center gap-2 font-mono text-xs ${statusMessage.isError ? 'bg-red-500/15 text-red-300 border-b border-red-500/15' : 'bg-emerald-500/15 text-emerald-300 border-b border-emerald-500/15'}`}>
            <AlertCircle className="w-4 h-4" />
            <span>{statusMessage.text}</span>
          </div>
        )}

        <div className="bg-[#120e2a]/50 border-b border-white/5 flex flex-wrap gap-2 px-6 py-3">
          {collectionTabs.map(tab => (
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
              <span className="bg-white/10 text-white/60 text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                {getTabCount(tab, staff, events, shifts, alerts)}
              </span>
            </button>
          ))}
        </div>

        {activeTab !== 'security' ? (
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
        ) : (
          <div className="px-6 py-3 border-b border-white/5 bg-indigo-950/20 flex flex-wrap gap-2 items-center justify-between">
            <div className="flex gap-1.5">
              {securitySubTabs.map((sub) => (
                <button
                  key={sub}
                  onClick={() => {
                    setSecuritySubTab(sub);
                    setCopiedText(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg font-mono text-[10px] uppercase transition-all cursor-pointer ${
                    securitySubTab === sub
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold'
                      : 'text-white/40 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {getSecuritySubTabLabel(sub)}
                </button>
              ))}
            </div>
            <div className="text-[9px] font-mono text-white/30 uppercase tracking-widest hidden md:block">
              INTEGRACIÓN MYSQL & SESIÓN ADMIN
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'security' ? (
            <SecurityTab
              securitySubTab={securitySubTab}
              copiedText={copiedText}
              mariadbConfig={mariadbConfig}
              isTestingConnection={isTestingConnection}
              connectionTestResult={connectionTestResult}
              onConfigChange={setMariadbConfig}
              onTestConnection={() => void testMariaDBConnection()}
              onCopiedTextChange={setCopiedText}
              showStatus={showStatus}
            />
          ) : filteredItems.length === 0 ? (
            <div className="text-center bg-white/5 rounded-3xl p-10 border border-white/5 font-mono text-xs text-white/40">
              No se encontraron registros de {tabLabelMap[activeTab].toLowerCase()} en la nube. Crea uno o restablece los valores por defecto.
            </div>
          ) : (
            renderActiveDataTab()
          )}
        </div>
      </div>

      {isFormOpen && (
        <RecordFormModal
          activeTab={activeTab}
          formMode={formMode}
          eventData={eventData}
          staffData={staffData}
          shiftData={shiftData}
          alertData={alertData}
          staff={staff}
          setEventData={setEventData}
          setStaffData={setStaffData}
          setShiftData={setShiftData}
          setAlertData={setAlertData}
          onSubmit={handleFormSubmit}
          onClose={() => setIsFormOpen(false)}
          onStaffAvatarFileChange={handleStaffAvatarFileChange}
        />
      )}

      {confirmAction && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#120e2a] p-6 shadow-2xl">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border mb-4 ${
              confirmAction.intent === 'danger'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}>
              <AlertCircle className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-display font-bold text-white">
              {confirmAction.title}
            </h3>
            <p className="mt-2 text-sm text-white/60 leading-relaxed">
              {confirmAction.message}
            </p>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                disabled={isConfirming}
                onClick={() => setConfirmAction(null)}
                className="flex-1 h-11 rounded-xl border border-white/10 bg-white/5 text-xs font-mono font-bold text-white/70 hover:bg-white/10 disabled:opacity-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isConfirming}
                onClick={() => void runConfirmAction()}
                className={`flex-1 h-11 rounded-xl text-xs font-mono font-bold text-white transition-all disabled:opacity-50 cursor-pointer ${
                  confirmAction.intent === 'danger'
                    ? 'bg-rose-500 hover:bg-rose-400'
                    : 'bg-amber-500 hover:bg-amber-400'
                }`}
              >
                {isConfirming ? 'Procesando...' : confirmAction.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
