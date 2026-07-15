import { EquipmentAlert } from '../../types';
import { RecordCard } from './RecordCard';

interface AlertsTabProps {
  items: EquipmentAlert[];
  onEdit: (record: EquipmentAlert) => void;
  onDelete: (id: string) => void;
}

export function AlertsTab({ items, onEdit, onDelete }: AlertsTabProps) {
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
            <span className={`inline-block text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase mb-1 ${item.severity === 'error' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : item.severity === 'warning' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'}`}>
              {item.severity === 'error' ? 'ERROR' : item.severity === 'warning' ? 'ADVERTENCIA' : 'INFO'}
            </span>
            <h4 className="text-sm text-white leading-snug">{item.message}</h4>
            <p className="text-xs text-white/40 mt-1 font-mono">
              Zona: {item.zone} • Hora: {item.timestamp}
            </p>
          </div>
        </RecordCard>
      ))}
    </div>
  );
}
