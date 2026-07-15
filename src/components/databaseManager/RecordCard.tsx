import type { ReactNode } from 'react';
import { Edit3, Trash2 } from 'lucide-react';

interface RecordCardProps {
  key?: string;
  item: { id: string };
  leading?: ReactNode;
  badges?: ReactNode;
  children: ReactNode;
  onEdit: (record: any) => void;
  onDelete: (id: string) => void;
}

export function RecordCard({
  item,
  leading,
  badges,
  children,
  onEdit,
  onDelete,
}: RecordCardProps) {
  return (
    <div className="bg-white/5 hover:bg-[#15112e]/50 border border-white/10 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {leading}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[9px] bg-indigo-500/10 text-indigo-300 border border-indigo-400/20 rounded px-1.5 py-0.5 uppercase tracking-wide">
              {item.id}
            </span>
            {badges}
          </div>
          {children}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 md:self-center">
        <button
          onClick={() => onEdit(item)}
          className="flex-1 md:flex-initial h-9 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 rounded-xl px-3 text-xs font-mono flex items-center justify-center gap-1 cursor-pointer"
        >
          <Edit3 className="w-3.5 h-3.5" />
          <span>Editar</span>
        </button>
        <button
          onClick={() => onDelete(item.id)}
          className="flex-1 md:flex-initial h-9 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-xl px-3 text-xs font-mono flex items-center justify-center gap-1 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Eliminar</span>
        </button>
      </div>
    </div>
  );
}
