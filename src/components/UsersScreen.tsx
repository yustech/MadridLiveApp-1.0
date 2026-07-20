import { FormEvent, useEffect, useState } from "react";
import { LoaderCircle, UserPlus } from "lucide-react";
import type { UserRole } from "../validators";

interface User { id: string; email: string; role: UserRole; status: "active" | "inactive" }

async function api(path: string, init?: RequestInit) {
  const response = await fetch(`/api/mysql${path}`, { credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...init });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "No se pudo completar la operación.");
  return payload;
}

export default function UsersScreen() {
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
      </div>)}
    </div>
  </div>;
}
