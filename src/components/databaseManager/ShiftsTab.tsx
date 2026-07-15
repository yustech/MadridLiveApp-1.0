import { Shift } from '../../types';
import { formatHoursMinutesFromDecimal } from '../../utils/duration';
import { RecordCard } from './RecordCard';

interface ShiftsTabProps {
  items: Shift[];
  onEdit: (record: Shift) => void;
  onDelete: (id: string) => void;
}

function formatShiftTimespan(timespan: string) {
  if (timespan === '14:00 - Present') return '14:00 - Presente';
  if (timespan === '14:30 - Present') return '14:30 - Presente';
  if (timespan === '09:00 - Present') return '09:00 - Presente';
  return timespan;
}

function formatShiftDate(dateString: string) {
  if (dateString === 'Today') return 'Hoy';
  if (dateString === 'Yesterday') return 'Ayer';
  return dateString;
}

export function ShiftsTab({ items, onEdit, onDelete }: ShiftsTabProps) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <RecordCard
          key={item.id}
          item={item}
          onEdit={onEdit}
          onDelete={onDelete}
          badges={(
            <span className={`font-mono text-[9px] border rounded px-1.5 py-0.5 ${item.status === 'Active' ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-300' : 'bg-white/5 border-white/10 text-white/40'}`}>
              {item.status === 'Active' ? 'Activo' : 'Completado'}
            </span>
          )}
        >
          <div className="text-left">
            <h4 className="text-xs font-mono text-white/50">ID Colaborador: {item.workerId}</h4>
            <p className="text-sm font-bold text-white mt-1">
              {item.eventTitle} ({formatShiftTimespan(item.timespan)})
            </p>
            <p className="text-[10px] text-indigo-300 font-mono mt-0.5">
              Fecha: {formatShiftDate(item.dateString)} | Duración: {item.durationLabel === 'Active' ? 'Activo' : formatHoursMinutesFromDecimal(item.durationLabel)}
            </p>
          </div>
        </RecordCard>
      ))}
    </div>
  );
}
