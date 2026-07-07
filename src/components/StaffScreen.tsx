import { useMemo, useState, FormEvent } from 'react';
import {
  Search,
  CheckCircle2,
  Clock,
  UserPlus,
  X,
  QrCode,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { StaffMember } from '../types';
import { addStaffBatch } from '../dbService';

interface StaffScreenProps {
  staff: StaffMember[];
  onSelectWorker: (worker: StaffMember) => void;
  onAddWorker: (worker: Omit<StaffMember, 'id'>) => void;
}

const roleLabelMap: Record<string, string> = {
  All: 'Todos los Roles',
  Auxiliar: 'Auxiliar',
  'Auxiliar Plus': 'Auxiliar Plus',
  Coordinación: 'Coordinación',
};

type SortMode = 'Newest' | 'Oldest' | 'NameAZ' | 'NameZA' | 'ActiveFirst';

function formatPresenceTimestamp(raw?: string): string {
  if (!raw) return 'Sin registro';

  const trimmed = raw.trim();
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  return trimmed;
}

function normalizeRole(role: string): StaffMember['role'] {
  if (role === 'Auxiliar Plus' || role === 'Coordinación' || role === 'Auxiliar') {
    return role;
  }
  return 'Auxiliar';
}

export default function StaffScreen({
  staff,
  onSelectWorker,
  onAddWorker,
}: StaffScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'All' | 'Auxiliar' | 'Auxiliar Plus' | 'Coordinación'>('All');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedQrWorker, setSelectedQrWorker] = useState<StaffMember | null>(null);

  const [sortMode, setSortMode] = useState<SortMode>('ActiveFirst');
  const [pageSize, setPageSize] = useState<12 | 24 | 48>(12);
  const [currentPage, setCurrentPage] = useState(1);

  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'Auxiliar' | 'Auxiliar Plus' | 'Coordinación'>('Auxiliar');

  const [addMode, setAddMode] = useState<'single' | 'bulk'>('single');
  const [bulkText, setBulkText] = useState('');
  const [bulkRole, setBulkRole] = useState<'Auxiliar' | 'Auxiliar Plus' | 'Coordinación'>('Auxiliar');
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');

  const checkedInCount = staff.filter((s) => s.status === 'IN').length;

  const filteredStaff = useMemo(() => {
    return staff.filter((worker) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        worker.name.toLowerCase().includes(q) ||
        worker.idCode.toLowerCase().includes(q) ||
        worker.role.toLowerCase().includes(q);
      const matchesRole = activeTab === 'All' || worker.role === activeTab;
      return matchesSearch && matchesRole;
    });
  }, [staff, searchQuery, activeTab]);

  const orderedStaff = useMemo(() => {
    const copied = [...filteredStaff];

    switch (sortMode) {
      case 'NameAZ':
        return copied.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
      case 'NameZA':
        return copied.sort((a, b) => b.name.localeCompare(a.name, 'es', { sensitivity: 'base' }));
      case 'Newest':
        return copied.sort((a, b) => b.id.localeCompare(a.id));
      case 'Oldest':
        return copied.sort((a, b) => a.id.localeCompare(b.id));
      case 'ActiveFirst':
      default:
        return copied.sort((a, b) => {
          if (a.status === b.status) {
            return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
          }
          return a.status === 'IN' ? -1 : 1;
        });
    }
  }, [filteredStaff, sortMode]);

  const totalPages = Math.max(1, Math.ceil(orderedStaff.length / pageSize));
  const pageStartIndex = (currentPage - 1) * pageSize;
  const pageStart = orderedStaff.length === 0 ? 0 : pageStartIndex + 1;
  const pageEnd = Math.min(pageStartIndex + pageSize, orderedStaff.length);
  const paginatedStaff = orderedStaff.slice(pageStartIndex, pageStartIndex + pageSize);

  const resetAndCloseAddModal = () => {
    setNewName('');
    setNewRole('Auxiliar');
    setBulkText('');
    setImportStatus('');
    setIsImporting(false);
    setAddMode('single');
    setIsAddModalOpen(false);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const avatars = [
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=200',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200',
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200',
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200',
    ];
    const selectAvatar = avatars[Math.floor(Math.random() * avatars.length)];

    onAddWorker({
      name: newName.trim(),
      idCode: `${newRole.substring(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`,
      role: newRole,
      roleLabel: newRole.toUpperCase(),
      status: 'OUT',
      checkedInTime: '',
      lastSeen: new Date().toISOString(),
      avatar: selectAvatar,
      totalHours: 0,
      currentShiftHours: 0,
      currentShiftMins: 0,
    });

    resetAndCloseAddModal();
  };

  const handleBulkSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!bulkText.trim()) return;

    setIsImporting(true);
    setImportStatus('Procesando nombres...');

    const lines = bulkText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    const parsed: Omit<StaffMember, 'id'>[] = [];

    const avatars = [
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=200',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200',
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200',
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200',
    ];

    lines.forEach((line) => {
      const parts = line.split(',').map((p) => p.trim());
      const name = parts[0];
      if (!name) return;

      const role = normalizeRole(parts[1] || bulkRole);
      const idCode = `${role.substring(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

      parsed.push({
        name,
        idCode,
        role,
        roleLabel: role.toUpperCase(),
        status: 'OUT',
        checkedInTime: '',
        avatar: avatars[Math.floor(Math.random() * avatars.length)],
        totalHours: 0,
        currentShiftHours: 0,
        currentShiftMins: 0,
        lastSeen: new Date().toISOString(),
      });
    });

    if (parsed.length === 0) {
      setImportStatus('No se detectaron nombres válidos.');
      setIsImporting(false);
      return;
    }

    try {
      setImportStatus(`Cargando ${parsed.length} colaboradores...`);
      await addStaffBatch(parsed);
      setImportStatus(`Importados ${parsed.length} colaboradores.`);
      setTimeout(() => {
        resetAndCloseAddModal();
      }, 1200);
    } catch (err) {
      console.error('Error during bulk upload:', err);
      setImportStatus('Fallo al subir a la base de datos. Reintenta.');
      setIsImporting(false);
    }
  };

  return (
    <div id="staff-view" className="space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-3 mb-2">
        <div>
          <h2 className="text-3xl font-display font-black tracking-tight text-white">
            Plantilla de Personal
          </h2>
          <p className="text-xs font-mono text-white/50 mt-1">
            {staff.length} Personal Registrado
          </p>
        </div>
        <div>
          <span className="bg-emerald-400/10 text-emerald-300 px-3.5 py-1.5 rounded-full text-xs font-mono border border-emerald-400/20 flex items-center gap-1.5 font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            {checkedInCount} DENTRO
          </span>
        </div>
      </div>

      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          <Search className="w-4 h-4 text-white/30 group-focus-within:text-indigo-300 transition-colors" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setCurrentPage(1);
          }}
          className="w-full bg-white/5 text-white placeholder-white/30 rounded-2xl py-3.5 pl-10 pr-4 border border-white/10 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all text-sm"
          placeholder="Buscar por ID, nombre o rol..."
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 no-scrollbar">
        {(['All', 'Auxiliar', 'Auxiliar Plus', 'Coordinación'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              setCurrentPage(1);
            }}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-mono font-medium border transition-all cursor-pointer ${
              activeTab === tab
                ? 'bg-indigo-500/20 border-indigo-400/30 text-white'
                : 'bg-white/5 border-transparent text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            {roleLabelMap[tab] || tab}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-white/35">Orden:</span>
        <select
          value={sortMode}
          onChange={(e) => {
            setSortMode(e.target.value as SortMode);
            setCurrentPage(1);
          }}
          className="bg-[#120f26] border border-white/10 rounded-lg px-2.5 py-1 text-[10px] font-mono text-white cursor-pointer"
        >
          <option value="ActiveFirst">Activos primero</option>
          <option value="Newest">Más reciente</option>
          <option value="Oldest">Más antiguo</option>
          <option value="NameAZ">Nombre A-Z</option>
          <option value="NameZA">Nombre Z-A</option>
        </select>

        <span className="text-[10px] font-mono uppercase tracking-wider text-white/35">Por página:</span>
        <select
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value) as 12 | 24 | 48);
            setCurrentPage(1);
          }}
          className="bg-[#120f26] border border-white/10 rounded-lg px-2.5 py-1 text-[10px] font-mono text-white cursor-pointer"
        >
          <option value={12}>12</option>
          <option value={24}>24</option>
          <option value={48}>48</option>
        </select>

        <span className="ml-auto text-[10px] font-mono uppercase tracking-wider text-white/45 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1">
          Mostrando {pageStart}-{pageEnd} de {orderedStaff.length}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {paginatedStaff.length === 0 ? (
          <div className="bg-white/5 rounded-3xl border border-white/10 p-10 text-center sm:col-span-2 xl:col-span-3">
            <p className="text-sm font-mono text-white/40">No se encontraron colaboradores que coincidan con la búsqueda</p>
          </div>
        ) : (
          paginatedStaff.map((worker) => {
            const isCheckedIn = worker.status === 'IN';

            return (
              <div
                key={worker.id}
                onClick={() => onSelectWorker(worker)}
                className={`rounded-3xl p-5 relative overflow-hidden group cursor-pointer transition-all duration-200 border ${
                  isCheckedIn
                    ? 'bg-emerald-500/10 border-emerald-400/20 hover:bg-emerald-500/15'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                <div className={`absolute top-0 right-0 px-3 py-1 rounded-bl-xl text-[10px] font-mono font-bold flex items-center gap-1.5 ${
                  isCheckedIn
                    ? 'bg-emerald-400 text-slate-900 shadow-success-glow'
                    : 'bg-white/10 text-white/60 border-l border-b border-white/10'
                }`}>
                  {isCheckedIn && <CheckCircle2 className="w-3.5 h-3.5" />}
                  {isCheckedIn ? 'DENTRO' : 'FUERA'}
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/5 shrink-0 border border-white/10">
                    <img
                      alt={worker.name}
                      referrerPolicy="no-referrer"
                      className={`w-full h-full object-cover transition-all ${!isCheckedIn ? 'grayscale opacity-75' : ''}`}
                      src={worker.avatar}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=100';
                      }}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-white group-hover:text-indigo-300 transition-colors truncate">
                      {worker.name}
                    </h3>

                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[10px] font-mono font-bold text-indigo-300 bg-indigo-500/15 px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-indigo-400/10">
                        {roleLabelMap[worker.role] || worker.role}
                      </span>
                      <span className="text-[10px] font-mono text-white/50">ID: {worker.idCode}</span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-white/60 mt-3 font-mono flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 font-mono min-w-0">
                        <Clock className={`w-3.5 h-3.5 mr-0.5 ${isCheckedIn ? 'text-emerald-400' : 'text-white/40'}`} />
                        <span className="truncate">
                          {isCheckedIn
                            ? `Entrada: ${formatPresenceTimestamp(worker.checkedInTime)}`
                            : `Última vez: ${formatPresenceTimestamp(worker.lastSeen)}`}
                        </span>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedQrWorker(worker);
                        }}
                        className="p-1 px-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 font-mono text-[9px] font-bold rounded-lg border border-indigo-400/20 transition-all flex items-center gap-1 cursor-pointer ml-auto"
                        title="Ver credencial QR"
                      >
                        <QrCode className="w-3.5 h-3.5 text-indigo-400" />
                        <span>VER QR</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-2 border-t border-white/10">
        <span className="text-[10px] font-mono text-white/50 uppercase tracking-wider">
          Página {currentPage} de {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white/70 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/10 transition-colors text-xs font-mono flex items-center gap-1"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Anterior
          </button>
          <button
            type="button"
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={currentPage >= totalPages}
            className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white/70 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/10 transition-colors text-xs font-mono flex items-center gap-1"
          >
            Siguiente
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <button
        onClick={() => setIsAddModalOpen(true)}
        className="w-full py-4 bg-transparent hover:bg-indigo-500/10 text-indigo-300 hover:text-white font-mono text-xs rounded-2xl border border-dashed border-indigo-500/30 transition-colors uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer"
      >
        <UserPlus className="w-4 h-4" />
        Registrar Miembro de Personal
      </button>

      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
          <div className={`bg-[#120f26]/90 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 w-full ${addMode === 'bulk' ? 'max-w-lg' : 'max-w-sm'} space-y-4 shadow-2xl transition-all duration-300`}>
            <div className="flex justify-between items-center pb-2 border-b border-white/10">
              <h3 className="text-lg font-display font-bold text-white">Registrar Colaborador</h3>
              <button onClick={resetAndCloseAddModal} className="text-white/60 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 text-xs font-mono">
              <button
                type="button"
                onClick={() => setAddMode('single')}
                className={`flex-1 py-2 rounded-lg font-bold transition-all cursor-pointer ${addMode === 'single' ? 'bg-indigo-500 text-white shadow-md' : 'text-white/60 hover:text-white'}`}
              >
                Registro Único
              </button>
              <button
                type="button"
                onClick={() => setAddMode('bulk')}
                className={`flex-1 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${addMode === 'bulk' ? 'bg-indigo-500 text-white shadow-md' : 'text-white/60 hover:text-white'}`}
              >
                Carga Masiva
              </button>
            </div>

            {addMode === 'bulk' ? (
              <form onSubmit={handleBulkSubmit} className="space-y-4 text-sm font-mono text-left">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs text-white/50">Lista de Nombres o CSV</label>
                    <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full font-bold">
                      {bulkText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0).length} detectados
                    </span>
                  </div>
                  <textarea
                    required
                    rows={6}
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder="Uno por línea o CSV: Nombre, Rol"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-xs focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 font-mono leading-relaxed resize-y min-h-[120px]"
                    disabled={isImporting}
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-white/50 mb-1">Rol por Defecto</label>
                  <select
                    value={bulkRole}
                    onChange={(e) => setBulkRole(e.target.value as 'Auxiliar' | 'Auxiliar Plus' | 'Coordinación')}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white text-xs focus:outline-none focus:border-indigo-400"
                    disabled={isImporting}
                  >
                    <option value="Auxiliar" className="bg-[#0A051A] text-white">Auxiliar</option>
                    <option value="Auxiliar Plus" className="bg-[#0A051A] text-white">Auxiliar Plus</option>
                    <option value="Coordinación" className="bg-[#0A051A] text-white">Coordinación</option>
                  </select>
                </div>

                {importStatus && (
                  <div className="p-3 bg-indigo-500/10 border border-indigo-400/20 rounded-xl text-center">
                    <p className="text-xs text-indigo-300 font-bold animate-pulse">{importStatus}</p>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isImporting}
                    className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold uppercase rounded-xl text-xs transition-colors cursor-pointer shadow-lg disabled:opacity-50"
                  >
                    {isImporting ? 'Cargando...' : 'Importar colaboradores'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 text-sm font-mono text-left">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Nombre Completo</label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="ej. Carlos de Diego"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-xs focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                  />
                </div>

                <div>
                  <label className="block text-xs text-white/50 mb-1">Rol Estándar</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as 'Auxiliar' | 'Auxiliar Plus' | 'Coordinación')}
                    className="w-full bg-[#120f26] border border-white/10 rounded-xl p-3 text-white text-xs focus:outline-none focus:border-indigo-400"
                  >
                    <option value="Auxiliar">Auxiliar</option>
                    <option value="Auxiliar Plus">Auxiliar Plus</option>
                    <option value="Coordinación">Coordinación</option>
                  </select>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full h-12 bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-white font-bold uppercase rounded-xl text-xs transition-colors cursor-pointer shadow-lg"
                  >
                    Agregar colaborador
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {selectedQrWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-4 backdrop-blur-sm">
          <div className="bg-[#120f26]/95 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 w-full max-w-xs text-center space-y-4 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center pb-2 border-b border-white/10 text-left">
              <h3 className="text-sm font-display font-black text-indigo-300 uppercase tracking-widest flex items-center gap-1.5">
                <QrCode className="w-4 h-4" /> Acreditación QR
              </h3>
              <button onClick={() => setSelectedQrWorker(null)} className="text-white/40 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-3 text-left bg-white/5 p-3 rounded-2xl border border-white/5 font-mono">
              <img
                src={selectedQrWorker.avatar}
                className="w-10 h-10 rounded-xl object-cover border border-indigo-400 shrink-0"
                alt=""
              />
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-white truncate">{selectedQrWorker.name}</h4>
                <p className="text-[10px] text-white/50 uppercase tracking-wider">{selectedQrWorker.roleLabel || selectedQrWorker.role}</p>
                <span className="text-[9px] text-indigo-400 font-mono font-bold">ID: {selectedQrWorker.idCode}</span>
              </div>
            </div>

            <div className="p-3 bg-white rounded-2xl flex items-center justify-center border border-white/10 shadow-lg select-none">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&bgcolor=ffffff&color=120f26&qzone=1&data=${encodeURIComponent(selectedQrWorker.idCode)}`}
                alt={`Acreditación QR de ${selectedQrWorker.name}`}
                className="w-36 h-36 object-contain"
              />
            </div>

            <button
              onClick={() => setSelectedQrWorker(null)}
              className="w-full h-11 bg-white hover:bg-white/95 text-slate-900 font-mono font-bold text-xs uppercase rounded-xl transition-all cursor-pointer shadow-lg"
            >
              Cerrar Vista
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
