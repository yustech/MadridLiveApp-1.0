import { useState, FormEvent } from 'react';
import { 
  Search, 
  CheckCircle2, 
  MapPin, 
  Clock, 
  Plus, 
  ShieldAlert, 
  UserPlus, 
  BadgeCheck, 
  X,
  QrCode
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
  Coordinación: 'Coordinación'
};

export default function StaffScreen({
  staff,
  onSelectWorker,
  onAddWorker
}: StaffScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'All' | 'Auxiliar' | 'Auxiliar Plus' | 'Coordinación'>('All');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedQrWorker, setSelectedQrWorker] = useState<StaffMember | null>(null);
  
  // New Worker Form state
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'Auxiliar' | 'Auxiliar Plus' | 'Coordinación'>('Auxiliar');
  const [newLocation, setNewLocation] = useState('Escenario Principal');

  // Bulk upload states
  const [addMode, setAddMode] = useState<'single' | 'bulk'>('single');
  const [bulkText, setBulkText] = useState('');
  const [bulkRole, setBulkRole] = useState<'Auxiliar' | 'Auxiliar Plus' | 'Coordinación'>('Auxiliar');
  const [bulkLocation, setBulkLocation] = useState('Escenario Principal');
  const [bulkCheckIn, setBulkCheckIn] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState('');

  const handleBulkSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!bulkText.trim()) return;

    setIsImporting(true);
    setImportStatus('Procesando nombres...');

    const lines = bulkText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const parsed: Omit<StaffMember, 'id'>[] = [];

    const avatars = [
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=200',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200',
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200',
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200'
    ];

    lines.forEach((line) => {
      const parts = line.split(',').map(p => p.trim());
      const name = parts[0];
      if (!name) return;

      // Extract details, fallback to defaults
      const role = (parts[1] || bulkRole) as any;
      const location = parts[2] || bulkLocation;

      const idCode = `${role.substring(0,3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

      parsed.push({
        name,
        idCode,
        role,
        roleLabel: role.toUpperCase(),
        status: bulkCheckIn ? 'IN' : 'OUT',
        checkedInTime: bulkCheckIn ? new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '',
        avatar: avatars[Math.floor(Math.random() * avatars.length)],
        totalHours: 0,
        currentShiftHours: 0,
        currentShiftMins: 0,
        location,
        lastSeen: bulkCheckIn ? 'Activo' : 'Nunca'
      });
    });

    if (parsed.length === 0) {
      setImportStatus('No se detectaron nombres válidos.');
      setIsImporting(false);
      return;
    }

    try {
      setImportStatus(`Cargando ${parsed.length} colaboradores a la base de datos...`);
      await addStaffBatch(parsed);
      setImportStatus(`¡Éxito! Se han importado ${parsed.length} colaboradores.`);
      setTimeout(() => {
        setBulkText('');
        setIsAddModalOpen(false);
        setIsImporting(false);
        setImportStatus('');
      }, 1500);
    } catch (err) {
      console.error('Error during bulk upload:', err);
      setImportStatus('Fallo al subir a la base de datos. Por favor reintenta.');
      setIsImporting(false);
    }
  };

  // Filter list
  const filteredStaff = staff.filter(worker => {
    // Search filter
    const matchesSearch = 
      worker.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      worker.idCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      worker.role.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Role filter
    const matchesRole = activeTab === 'All' || worker.role === activeTab;

    return matchesSearch && matchesRole;
  });

  const checkedInCount = staff.filter(s => s.status === 'IN').length;
  // Let's add simulated dynamic base numbers (e.g., 141 background workers check in, matching 145 total checked in)
  const totalInDisplayCount = checkedInCount + 138;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    // generate appropriate mock avatar based on gender/profile name
    const avatars = [
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=200',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200',
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200',
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200'
    ];
    const selectAvatar = avatars[Math.floor(Math.random() * avatars.length)];

    onAddWorker({
      name: newName,
      idCode: `${newRole.substring(0,3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`,
      role: newRole,
      roleLabel: newRole.toUpperCase(),
      status: 'IN', // default new worker is logged in instantly
      checkedInTime: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      avatar: selectAvatar,
      totalHours: 0,
      currentShiftHours: 0,
      currentShiftMins: 0,
      location: newLocation
    });

    // Reset Form
    setNewName('');
    setNewRole('Auxiliar');
    setNewLocation('Escenario Principal');
    setIsAddModalOpen(false);
  };

  return (
    <div id="staff-view" className="space-y-6">
      {/* Roster Header */}
      <div className="flex justify-between items-end mb-2">
        <div>
          <h2 className="text-3xl font-display font-black tracking-tight text-white">
            Plantilla de Personal
          </h2>
          <p className="text-xs font-mono text-white/50 mt-1">
            200 Personal Registrado
          </p>
        </div>
        <div>
          <span className="bg-emerald-400/10 text-emerald-300 px-3.5 py-1.5 rounded-full text-xs font-mono border border-emerald-400/20 flex items-center gap-1.5 font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span> 
            {totalInDisplayCount} DENTRO
          </span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          <Search className="w-4 h-4 text-white/30 group-focus-within:text-indigo-300 transition-colors" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-white/5 text-white placeholder-white/30 rounded-2xl py-3.5 pl-10 pr-4 border border-white/10 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all text-sm"
          placeholder="Buscar por ID, nombre o rol..."
        />
      </div>

      {/* Role Filters Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 no-scrollbar">
        {(['All', 'Auxiliar', 'Auxiliar Plus', 'Coordinación'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
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

      {/* Roster Cards View */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredStaff.length === 0 ? (
          <div className="bg-white/5 rounded-3xl border border-white/10 p-10 text-center">
            <p className="text-sm font-mono text-white/40">No se encontraron colaboradores que coincidan con la búsqueda</p>
          </div>
        ) : (
          filteredStaff.map(worker => {
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
                {/* IN/OUT Banner badge */}
                <div className={`absolute top-0 right-0 px-3 py-1 rounded-bl-xl text-[10px] font-mono font-bold flex items-center gap-1.5 ${
                  isCheckedIn 
                    ? 'bg-emerald-400 text-slate-900 shadow-success-glow' 
                    : 'bg-white/10 text-white/60 border-l border-b border-white/10'
                }`}>
                  {isCheckedIn && <CheckCircle2 className="w-3.5 h-3.5" />}
                  {isCheckedIn ? 'DENTRO' : 'FUERA'}
                </div>

                <div className="flex items-start gap-4">
                  {/* Photo representation */}
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/5 shrink-0 border border-white/10">
                    <img
                      alt={worker.name}
                      referrerPolicy="no-referrer"
                      className={`w-full h-full object-cover transition-all ${!isCheckedIn ? 'grayscale opacity-75' : ''}`}
                      src={worker.avatar}
                      onError={(e) => {
                        // fallback
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
                      <span className="text-[10px] font-mono text-white/50">
                        ID: {worker.idCode}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-white/60 mt-3 font-mono flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 font-mono">
                        {isCheckedIn ? (
                          <>
                            <Clock className="w-3.5 h-3.5 mr-0.5 text-emerald-400" />
                            <span>Entrada: {worker.checkedInTime}</span>
                          </>
                        ) : (
                          <>
                            <MapPin className="w-3.5 h-3.5 mr-0.5 text-white/40" />
                            <span>Última vez: {worker.lastSeen === 'Yesterday' ? 'Ayer' : worker.lastSeen === '2 days ago' ? 'Hace 2 días' : (worker.lastSeen || 'Recientemente')}</span>
                          </>
                        )}
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

      {/* Inline controls to Add New Staff Member */}
      <button
        onClick={() => setIsAddModalOpen(true)}
        className="w-full py-4 bg-transparent hover:bg-indigo-500/10 text-indigo-300 hover:text-white font-mono text-xs rounded-2xl border border-dashed border-indigo-500/30 transition-colors uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer"
      >
        <UserPlus className="w-4 h-4" />
        Registrar Miembro de Personal
      </button>

      {/* Add Staff Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
          <div className={`bg-[#120f26]/90 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 w-full ${addMode === 'bulk' ? 'max-w-lg' : 'max-w-sm'} space-y-4 shadow-2xl transition-all duration-300`}>
            <div className="flex justify-between items-center pb-2 border-b border-white/10">
              <h3 className="text-lg font-display font-bold text-white">Registrar Colaborador</h3>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="text-white/60 hover:text-white"
              >
                <X className="w-5 h-5"/>
              </button>
            </div>

            {/* Mode Selection Tabs */}
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
                🚀 Carga Masiva (120+)
              </button>
            </div>

            {addMode === 'bulk' ? (
              <form onSubmit={handleBulkSubmit} className="space-y-4 text-sm font-mono text-left">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs text-white/50">Lista de Nombres o CSV</label>
                    <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full font-bold">
                      {bulkText.split('\n').map(l => l.trim()).filter(l => l.length > 0).length} detectados
                    </span>
                  </div>
                  <textarea
                    required
                    rows={6}
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder="Escribe o pega los nombres (uno por línea):&#10;Juan Pérez&#10;María Gómez&#10;&#10;O formato CSV completo:&#10;Carlos García, Security, L3, Control Acceso&#10;Marta López, Stagehand, L1, Escenario"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-xs focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 font-mono leading-relaxed resize-y min-h-[120px]"
                    disabled={isImporting}
                  />
                  <p className="text-[10px] text-white/40 mt-1 leading-relaxed">
                    💡 Si solo pegas nombres, se usarán los valores por defecto configurados abajo para cada trabajador.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-white/50 mb-1">Rol por Defecto</label>
                    <select
                      value={bulkRole}
                      onChange={(e) => setBulkRole(e.target.value as any)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white text-xs focus:outline-none focus:border-indigo-400"
                      disabled={isImporting}
                    >
                      <option value="Auxiliar" className="bg-[#0A051A] text-white">Auxiliar</option>
                      <option value="Auxiliar Plus" className="bg-[#0A051A] text-white">Auxiliar Plus</option>
                      <option value="Coordinación" className="bg-[#0A051A] text-white">Coordinación</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-white/50 mb-1">Ubicación por Defecto</label>
                    <input
                      type="text"
                      required
                      value={bulkLocation}
                      onChange={(e) => setBulkLocation(e.target.value)}
                      placeholder="ej. Escenario Principal"
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-white text-xs focus:outline-none focus:border-indigo-400"
                      disabled={isImporting}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    id="bulkCheckIn"
                    checked={bulkCheckIn}
                    onChange={(e) => setBulkCheckIn(e.target.checked)}
                    className="rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-0 focus:ring-offset-0 w-4 h-4 cursor-pointer"
                    disabled={isImporting}
                  />
                  <label htmlFor="bulkCheckIn" className="text-xs text-white/70 select-none cursor-pointer">
                    Registrar con Entrada Activa (IN) de inmediato
                  </label>
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
                    className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold uppercase rounded-xl text-xs transition-colors cursor-pointer shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <span>{isImporting ? 'Cargando...' : 'Comenzar Carga Masiva 🚀'}</span>
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
                    onChange={(e) => setNewRole(e.target.value as any)}
                    className="w-full bg-[#120f26] border border-white/10 rounded-xl p-3 text-white text-xs focus:outline-none focus:border-indigo-400"
                  >
                    <option value="Auxiliar">Auxiliar</option>
                    <option value="Auxiliar Plus">Auxiliar Plus</option>
                    <option value="Coordinación">Coordinación</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-white/50 mb-1">Zona de Trabajo Primaria</label>
                  <input
                    type="text"
                    required
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    placeholder="ej. Escenario Principal, Control de Sonido"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white text-xs focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full h-12 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 text-white font-bold uppercase rounded-xl text-xs transition-colors cursor-pointer shadow-lg"
                  >
                    Agregar y Registrar Entrada
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* QUICK VIEW QR MODAL OVERLAY */}
      {selectedQrWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-4 backdrop-blur-sm">
          <div className="bg-[#120f26]/95 backdrop-blur-2xl border border-white/15 rounded-3xl p-6 w-full max-w-xs text-center space-y-4 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center pb-2 border-b border-white/10 text-left">
              <h3 className="text-sm font-display font-black text-indigo-300 uppercase tracking-widest flex items-center gap-1.5">
                <QrCode className="w-4 h-4" /> Acreditación QR
              </h3>
              <button 
                onClick={() => setSelectedQrWorker(null)}
                className="text-white/40 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5"/>
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

            <p className="text-[10px] font-mono text-white/40 leading-relaxed max-w-xs mx-auto">
              Coloca este código QR en el visor de acceso a Madrid Live para registrar tu entrada o salida.
            </p>

            <a
              href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                `🎸 *MADRID LIVE ACCESS* 🎸\n\nHola, *${selectedQrWorker.name}*.\nAquí tienes tu acreditación de acceso oficial para el concierto:\n\n📋 *PUESTO*: ${selectedQrWorker.roleLabel || selectedQrWorker.role}\n🔑 *CÓDIGO DE CREDENCIAL*: ${selectedQrWorker.idCode}\n\nAccede al siguiente enlace para ver y guardar tu código QR Oficial:\n👉 https://api.qrserver.com/v1/create-qr-code/?size=400x400&bgcolor=ffffff&color=120f26&qzone=1&data=${encodeURIComponent(selectedQrWorker.idCode)}\n\n⚠️ *INSTRUCCIONES*: Guarda esta imagen en tu móvil. Al llegar y salir del recinto de Madrid Live, muestra este código QR en el lector del supervisor para registrar tu entrada/salida rápidamente.`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold uppercase rounded-xl tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg"
            >
              <span>💬</span>
              <span>COMPARTIR POR WHATSAPP</span>
            </a>

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
