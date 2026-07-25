import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, Database, LoaderCircle, Trash2, UserPlus } from "lucide-react";
import type { UserRole } from "../validators";
import {
  PURGE_COLLECTION_OPTIONS,
  PURGE_CONFIRM_WORD,
  canConfirmPurge,
} from "../utils/dbPurge";
import {
  fetchDatabaseCounts,
  purgeDatabaseCollections,
  type DatabaseCounts,
} from "../dbService";

interface User { id: string; email: string; role: UserRole; status: "active" | "inactive" }

interface UsersScreenProps { currentUserEmail?: string | null }

async function api(path: string, init?: RequestInit) {
  const response = await fetch(`/api/mysql${path}`, { credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...init });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "No se pudo completar la operación.");
  return payload;
}

const COUNT_KEY: Record<string, keyof DatabaseCounts> = { staff: "staff", events: "events", shifts: "shifts", alerts: "alerts" };

export default function UsersScreen({ currentUserEmail = null }: UsersScreenProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("operator");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => setUsers((await api("/users")).users);
  useEffect(() => { void load().catch((error) => setMessage(error.message)); }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try { await api("/users", { method: "POST", body: JSON.stringify({ email, password, role }) }); setEmail(""); setPassword(""); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Error"); }
    finally { setBusy(false); }
  };
  const patch = async (user: User, changes: Partial<User>) => {
    setMessage("");
    try { await api(`/users/${encodeURIComponent(user.id)}`, { method: "PATCH", body: JSON.stringify(changes) }); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Error"); }
  };

  // --- Hard delete: irreversible, guarded server-side (never the last admin, never yourself) ---
  const [pendingDelete, setPendingDelete] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const remove = async (user: User) => {
    setIsDeleting(true); setMessage("");
    try { await api(`/users/${encodeURIComponent(user.id)}`, { method: "DELETE" }); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Error"); }
    finally { setIsDeleting(false); setPendingDelete(null); }
  };

  // --- Maintenance: selective database purge ---
  const [isPurgeOpen, setIsPurgeOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmText, setConfirmText] = useState("");
  const [isPurging, setIsPurging] = useState(false);
  const [purgeMessage, setPurgeMessage] = useState("");
  const [counts, setCounts] = useState<DatabaseCounts | null>(null);

  const allKeys = PURGE_COLLECTION_OPTIONS.map((option) => option.key);

  const openPurge = () => {
    setSelected([]); setConfirmText(""); setCounts(null); setPurgeMessage(""); setIsPurgeOpen(true);
    void fetchDatabaseCounts().then(setCounts).catch(() => setCounts(null));
  };
  const toggleCollection = (key: string) =>
    setSelected((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));
  const toggleAll = () =>
    setSelected((current) => (current.length === allKeys.length ? [] : [...allKeys]));
  const countFor = (key: string): number | null => {
    const countKey = COUNT_KEY[key];
    if (!countKey || !counts) return null;
    return counts[countKey];
  };
  const runPurge = async () => {
    if (!canConfirmPurge(selected, confirmText)) return;
    setIsPurging(true);
    try {
      const result = await purgeDatabaseCollections(selected);
      const total = Object.values(result.deleted).reduce((sum, n) => sum + n, 0);
      setPurgeMessage(`Base de datos vaciada: ${total} registro(s) eliminado(s).`);
      setIsPurgeOpen(false);
    } catch (error) {
      setPurgeMessage(error instanceof Error ? error.message : "No se pudo vaciar la base de datos.");
    } finally {
      setIsPurging(false);
    }
  };

  return <div className="space-y-6" data-testid="users-screen">
    <div><h2 className="text-3xl font-black text-white">Gestión de usuarios</h2><p className="mt-1 text-xs font-mono text-white/50">Cuentas, roles y acceso al terminal</p></div>
    <form onSubmit={create} className="grid gap-3 rounded-3xl border border-white/10 bg-white/5 p-5 md:grid-cols-4">
      <input aria-label="Email de usuario" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@dominio.com" className="rounded-xl border border-white/10 bg-[#120f26] px-3 py-2 text-white" />
      <input aria-label="Contraseña inicial" type="password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña inicial" className="rounded-xl border border-white/10 bg-[#120f26] px-3 py-2 text-white" />
      <select aria-label="Rol inicial" value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="rounded-xl border border-white/10 bg-[#120f26] px-3 py-2 text-white"><option value="admin">Admin</option><option value="operator">Operador</option><option value="viewer">Lectura</option></select>
      <button disabled={busy} className="flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 font-bold text-white disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Crear usuario</button>
    </form>
    {message && <p role="alert" className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-200">{message}</p>}
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
      {users.map((user) => <div key={user.id} className="flex flex-col gap-3 border-b border-white/10 p-4 last:border-0 md:flex-row md:items-center">
        <span className="flex-1 font-mono text-sm text-white">{user.email}</span>
        <select aria-label={`Rol de ${user.email}`} value={user.role} onChange={(e) => void patch(user, { role: e.target.value as UserRole })} className="rounded-lg border border-white/10 bg-[#120f26] px-3 py-2 text-white"><option value="admin">Admin</option><option value="operator">Operador</option><option value="viewer">Lectura</option></select>
        <button onClick={() => void patch(user, { status: user.status === "active" ? "inactive" : "active" })} className={`rounded-lg border px-3 py-2 text-xs font-bold ${user.status === "active" ? "border-rose-400/20 text-rose-300" : "border-emerald-400/20 text-emerald-300"}`}>{user.status === "active" ? "Desactivar" : "Activar"}</button>
        {user.email !== currentUserEmail && <button type="button" onClick={() => setPendingDelete(user)} aria-label={`Borrar ${user.email}`} data-testid={`user-delete-${user.id}`} className="flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200 hover:bg-rose-500/20 transition-colors cursor-pointer"><Trash2 className="h-3.5 w-3.5" /> Borrar</button>}
      </div>)}
    </div>

    {/* DELETE USER CONFIRMATION */}
    {pendingDelete && (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="user-delete-title" data-testid="user-delete-dialog">
        <div className="w-full max-w-md rounded-3xl border border-rose-500/20 bg-[#120e2a] p-6 shadow-2xl">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-300"><AlertTriangle className="h-6 w-6" /></div>
          <h3 id="user-delete-title" className="text-lg font-display font-bold text-white">Borrar usuario</h3>
          <p className="mt-2 text-sm text-white/60 leading-relaxed">Se borrará la cuenta <span className="font-mono font-bold text-white">{pendingDelete.email}</span> por completo y no se puede deshacer. Si solo quieres quitarle el acceso conservando la cuenta, usa <span className="font-bold text-white/80">Desactivar</span>.</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button type="button" disabled={isDeleting} onClick={() => setPendingDelete(null)} className="flex-1 h-11 rounded-xl border border-white/10 bg-white/5 text-xs font-mono font-bold text-white/70 hover:bg-white/10 disabled:opacity-50 cursor-pointer">Cancelar</button>
            <button type="button" disabled={isDeleting} onClick={() => void remove(pendingDelete)} data-testid="user-delete-confirm" className="flex-1 h-11 rounded-xl bg-rose-500 text-xs font-mono font-bold text-white hover:bg-rose-400 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">{isDeleting ? "Borrando..." : "Borrar usuario"}</button>
          </div>
        </div>
      </div>
    )}

    {/* MAINTENANCE / DANGER ZONE */}
    <div className="rounded-3xl border border-rose-500/20 bg-rose-500/[0.04] p-5" data-testid="maintenance-card">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-300"><Database className="h-5 w-5" /></div>
        <div className="flex-1">
          <h3 className="text-lg font-display font-bold text-white">Mantenimiento</h3>
          <p className="mt-1 text-sm text-white/60 leading-relaxed">Vacía las colecciones de datos que elijas (colaboradores, eventos, turnos, alertas, convocatorias, plantillas). Tu cuenta y las de usuarios <span className="font-bold text-white/80">nunca</span> se borran. Acción irreversible.</p>
        </div>
      </div>
      {purgeMessage && <p role="status" className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/80">{purgeMessage}</p>}
      <div className="mt-4">
        <button type="button" onClick={openPurge} data-testid="purge-open" className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-mono font-bold text-rose-200 hover:bg-rose-500/20 transition-colors cursor-pointer">
          <Trash2 className="h-4 w-4" /> Vaciar base de datos
        </button>
      </div>
    </div>

    {/* PURGE DIALOG */}
    {isPurgeOpen && (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="purge-title" data-testid="purge-dialog">
        <div className="w-full max-w-md rounded-3xl border border-rose-500/20 bg-[#120e2a] p-6 shadow-2xl">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-300"><AlertTriangle className="h-6 w-6" /></div>
          <h3 id="purge-title" className="text-lg font-display font-bold text-white">Vaciar base de datos</h3>
          <p className="mt-2 text-sm text-white/60 leading-relaxed">Elige qué colecciones borrar. Se eliminan por completo y no se puede deshacer. Los usuarios del terminal no se ven afectados.</p>

          <div className="mt-5 space-y-2">
            <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-mono font-bold text-white/70 cursor-pointer">
              <input type="checkbox" checked={selected.length === allKeys.length} onChange={toggleAll} data-testid="purge-select-all" className="h-4 w-4 accent-rose-500" />
              Seleccionar todo
            </label>
            {PURGE_COLLECTION_OPTIONS.map((option) => {
              const count = countFor(option.key);
              return (
                <label key={option.key} className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#0d0a1f] px-3 py-2.5 text-sm text-white cursor-pointer">
                  <input type="checkbox" checked={selected.includes(option.key)} onChange={() => toggleCollection(option.key)} data-testid={`purge-collection-${option.key}`} className="h-4 w-4 accent-rose-500" />
                  <span className="flex-1">{option.label}</span>
                  <span className="font-mono text-xs text-white/40">{count === null ? "—" : count}</span>
                </label>
              );
            })}
          </div>

          <div className="mt-5">
            <label htmlFor="purge-confirm" className="block text-xs font-mono text-white/50">Escribe <span className="font-bold text-rose-300">{PURGE_CONFIRM_WORD}</span> para confirmar</label>
            <input id="purge-confirm" type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} data-testid="purge-confirm-input" autoComplete="off" className="mt-1 w-full rounded-xl border border-white/10 bg-[#0d0a1f] px-3 py-2 text-white" />
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button type="button" disabled={isPurging} onClick={() => setIsPurgeOpen(false)} className="flex-1 h-11 rounded-xl border border-white/10 bg-white/5 text-xs font-mono font-bold text-white/70 hover:bg-white/10 disabled:opacity-50 cursor-pointer">Cancelar</button>
            <button type="button" disabled={isPurging || !canConfirmPurge(selected, confirmText)} onClick={() => void runPurge()} data-testid="purge-submit" className="flex-1 h-11 rounded-xl bg-rose-500 text-xs font-mono font-bold text-white hover:bg-rose-400 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">{isPurging ? "Vaciando..." : "Vaciar BD"}</button>
          </div>
        </div>
      </div>
    )}
  </div>;
}
