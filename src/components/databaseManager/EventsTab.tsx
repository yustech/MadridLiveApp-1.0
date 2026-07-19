import { LiveEvent } from '../../types';
import { RecordCard } from './RecordCard';

interface EventsTabProps {
  items: LiveEvent[];
  onEdit: (record: LiveEvent) => void;
  onDelete: (id: string) => void;
}

export function EventsTab({ items, onEdit, onDelete }: EventsTabProps) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <RecordCard
          key={item.id}
          item={item}
          onEdit={onEdit}
          onDelete={onDelete}
        >
          <div className="text-left">
            <h4 className="text-sm font-bold text-white">{item.title}</h4>
            <p className="text-xs text-white/50 font-mono mt-1">
              {item.location} • Apertura: {item.doorsOpen} • Día: {item.dateDay} {item.dateMonth} {item.dateYear}
            </p>
            <p className="text-[10px] text-indigo-400 mt-1 font-mono">
              Personal Requerido: {item.totalStaffNeeded} | Escaneos: {item.scanRate} /min
            </p>
          </div>
        </RecordCard>
      ))}
    </div>
  );
}
