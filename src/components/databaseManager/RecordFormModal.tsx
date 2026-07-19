import { FormEvent } from 'react';
import { X } from 'lucide-react';
import { EquipmentAlert, LiveEvent, Shift, StaffMember } from '../../types';
import {
  DEFAULT_FEMALE_AVATAR,
  DEFAULT_MALE_AVATAR,
} from '../../utils/avatarUpload';
import { sectorTranslationMap, tabLabelMap } from './constants';
import { CollectionTab } from './types';
import StaffAvatar from '../StaffAvatar';

interface RecordFormModalProps {
  activeTab: CollectionTab;
  formMode: 'add' | 'edit';
  eventData: Omit<LiveEvent, 'id'>;
  staffData: Omit<StaffMember, 'id'>;
  shiftData: Omit<Shift, 'id'>;
  alertData: Omit<EquipmentAlert, 'id'>;
  staff: StaffMember[];
  setEventData: (data: Omit<LiveEvent, 'id'>) => void;
  setStaffData: (data: Omit<StaffMember, 'id'>) => void;
  setShiftData: (data: Omit<Shift, 'id'>) => void;
  setAlertData: (data: Omit<EquipmentAlert, 'id'>) => void;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
  onStaffAvatarFileChange: (file: File | null) => void;
}

export function RecordFormModal({
  activeTab,
  formMode,
  eventData,
  staffData,
  shiftData,
  alertData,
  staff,
  setEventData,
  setStaffData,
  setShiftData,
  setAlertData,
  onSubmit,
  onClose,
  onStaffAvatarFileChange,
}: RecordFormModalProps) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-[#120e2a] border border-white/10 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl relative">
        <button
          onClick={onClose}
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

        <form onSubmit={onSubmit} className="space-y-4 text-xs font-mono">
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="text-[10px] text-white/50 block mb-1">Día (Número)</label>
                  <input type="text" required value={eventData.dateDay} onChange={e => setEventData({ ...eventData, dateDay: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" placeholder="ej. 12" />
                </div>
                <div>
                  <label className="text-[10px] text-white/50 block mb-1">Mes (Letras)</label>
                  <input type="text" required value={eventData.dateMonth} onChange={e => setEventData({ ...eventData, dateMonth: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" placeholder="ej. OCT" />
                </div>
                <div>
                  <label className="text-[10px] text-white/50 block mb-1">Año</label>
                  <input type="number" required min="1900" max="2200" value={eventData.dateYear} onChange={e => setEventData({ ...eventData, dateYear: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" placeholder="ej. 2026" />
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

          {activeTab === 'staff' && (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-white/50 block mb-1">Nombre Completo *</label>
                <input type="text" required value={staffData.name} onChange={e => setStaffData({ ...staffData, name: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" placeholder="ej. Carlos de Diego" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white/50 block mb-1">Código ID *</label>
                  <input type="text" required value={staffData.idCode} onChange={e => setStaffData({ ...staffData, idCode: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" placeholder="ej. AUX-042" />
                </div>
                <div>
                  <label className="text-[10px] text-white/50 block mb-1">Rol *</label>
                  <select required value={staffData.role} onChange={e => setStaffData({ ...staffData, role: e.target.value as any })} className="w-full bg-[#1c1836] border border-white/10 rounded-xl p-2.5 text-white">
                    {['Auxiliar', 'Auxiliar Plus', 'Coordinación'].map(r => (
                      <option key={r} value={r}>{sectorTranslationMap[r] || r}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-white/50 block mb-1">Email</label>
                  <input type="email" value={staffData.email || ''} onChange={e => setStaffData({ ...staffData, email: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" placeholder="ej. carlos@madrid.live" />
                </div>
                <div>
                  <label className="text-[10px] text-white/50 block mb-1">Teléfono</label>
                  <input type="tel" value={staffData.phone || ''} onChange={e => setStaffData({ ...staffData, phone: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" placeholder="ej. +34 600 000 000" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-white/50 block mb-1">Foto de Perfil *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setStaffData({ ...staffData, avatar: DEFAULT_FEMALE_AVATAR })} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-mono text-white/80 hover:bg-white/10">Foto mujer por defecto</button>
                  <button type="button" onClick={() => setStaffData({ ...staffData, avatar: DEFAULT_MALE_AVATAR })} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-mono text-white/80 hover:bg-white/10">Foto hombre por defecto</button>
                </div>
                <input type="file" accept="image/*" onChange={e => void onStaffAvatarFileChange(e.target.files?.[0] || null)} className="w-full rounded-xl border border-white/10 bg-white/5 p-2.5 text-xs text-white file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-500/20 file:px-3 file:py-2 file:text-xs file:font-bold file:text-indigo-200" />
                <input type="text" required value={staffData.avatar} onChange={e => setStaffData({ ...staffData, avatar: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" placeholder="Pega una URL o usa una foto subida desde este dispositivo" />
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 flex items-center gap-3">
                <StaffAvatar
                  worker={staffData}
                  alt="Vista previa avatar"
                  className="h-14 w-14 rounded-2xl object-cover border border-white/10 text-base"
                />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Vista previa avatar</p>
                  <p className="text-xs text-white/70">Puedes subir una imagen del dispositivo o elegir un avatar por defecto de hombre o mujer.</p>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1">Estado *</label>
                <select required value={staffData.status} onChange={e => setStaffData({ ...staffData, status: e.target.value as any })} className="w-full bg-[#1c1836] border border-white/10 rounded-xl p-2.5 text-white">
                  <option value="IN">DENTRO (En el recinto)</option>
                  <option value="OUT">FUERA (Salida registrada)</option>
                </select>
              </div>
            </div>
          )}

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
                <label className="text-[10px] text-white/50 block mb-1">Evento</label>
                <input type="text" required value={shiftData.eventTitle} onChange={e => setShiftData({ ...shiftData, eventTitle: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" />
              </div>
              <div>
                <label className="text-[10px] text-white/50 block mb-1">ID Evento</label>
                <input type="text" value={shiftData.eventId || ''} onChange={e => setShiftData({ ...shiftData, eventId: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white" />
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
              onClick={onClose}
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
  );
}
