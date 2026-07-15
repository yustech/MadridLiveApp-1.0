import { StaffMember } from '../../types';
import { formatHoursMinutesFromDecimal } from '../../utils/duration';
import { getAvatarSrc, setFallbackAvatar } from '../../utils/avatarUpload';
import { sectorTranslationMap } from './constants';
import { RecordCard } from './RecordCard';

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
            <img
              src={getAvatarSrc(item.avatar)}
              alt=""
              className="w-10 h-10 rounded-full object-cover border border-white/25 mt-0.5"
              onError={(event) => setFallbackAvatar(event.currentTarget)}
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
              {sectorTranslationMap[item.role] || item.role} ({item.location})
            </p>
            <p className="text-[10px] text-white/50 font-mono mt-1">
              Horas Totales: {formatHoursMinutesFromDecimal(item.totalHours)} | Estado: {item.status === 'IN' ? 'DENTRO' : 'FUERA'} | Entrada: {item.checkedInTime || '—'}
            </p>
          </div>
        </RecordCard>
      ))}
    </div>
  );
}
