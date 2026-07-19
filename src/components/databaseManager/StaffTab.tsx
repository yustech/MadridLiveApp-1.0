import { StaffMember } from '../../types';
import { formatHoursMinutesFromDecimal } from '../../utils/duration';
import StaffAvatar from '../StaffAvatar';
import { sectorTranslationMap } from './constants';
import { RecordCard } from './RecordCard';
import { formatMadridDateTime } from '../../utils/madridTime';

function formatCheckInTime(value?: string) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : formatMadridDateTime(parsed);
}

interface StaffTabProps {
  items: StaffMember[];
  onEdit: (record: StaffMember) => void;
  onDelete: (id: string) => void;
}

export function StaffTab({ items, onEdit, onDelete }: StaffTabProps) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <RecordCard
          key={item.id}
          item={item}
          onEdit={onEdit}
          onDelete={onDelete}
          leading={(
            <StaffAvatar
              worker={item}
              alt=""
              className="w-10 h-10 rounded-full object-cover border border-white/25 mt-0.5 text-xs"
            />
          )}
          badges={(
            <span className="font-mono text-[9px] bg-white/10 text-white/60 rounded px-1.5 py-0.5">
              {item.idCode}
            </span>
          )}
        >
          <div className="text-left">
            <h4 className="text-sm font-bold text-white">{item.name}</h4>
            <p className="text-xs text-indigo-300 font-mono mt-0.5">
              {sectorTranslationMap[item.role] || item.role}
            </p>
            <p className="text-[10px] text-white/50 font-mono mt-1">
              Horas Totales: {formatHoursMinutesFromDecimal(item.totalHours)} | Estado: {item.status === 'IN' ? 'DENTRO' : 'FUERA'} | Entrada: {formatCheckInTime(item.checkedInTime)}
            </p>
          </div>
        </RecordCard>
      ))}
    </div>
  );
}
