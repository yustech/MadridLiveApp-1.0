import { FormEvent, useState } from 'react';
import { CheckCircle, KeyRound, ShieldAlert } from 'lucide-react';
import { MIN_USER_PASSWORD_LENGTH } from '../validators';

export default function ResetPasswordScreen() {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState(token ? '' : 'El enlace no es válido o ha caducado.');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < MIN_USER_PASSWORD_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_USER_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || payload?.errors?.[0]?.message || 'El enlace no es válido o ha caducado.');
      setSuccess(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'El enlace no es válido o ha caducado.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A051A] text-white flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-[0_0_50px_rgba(129,140,248,0.15)]">
        <KeyRound className="w-10 h-10 text-indigo-400 mb-5" />
        <h1 className="text-2xl font-black text-[#dbfcff]">Nueva contraseña</h1>
        <p className="mt-2 mb-6 text-sm text-white/50">Elige una contraseña segura para tu cuenta.</p>
        {success ? (
          <div className="space-y-5">
            <div className="flex gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200"><CheckCircle className="w-5 h-5 shrink-0" />Contraseña actualizada. Inicia sesión de nuevo.</div>
            <a href="/" className="block text-center rounded-xl bg-indigo-600 hover:bg-indigo-500 py-3 text-sm font-bold transition-colors">Ir al inicio de sesión</a>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <input aria-label="Nueva contraseña" type="password" disabled={!token} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-[#120f26]/60 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-indigo-400/40" placeholder="Nueva contraseña" />
            <input aria-label="Confirmar contraseña" type="password" disabled={!token} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className="w-full bg-[#120f26]/60 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-indigo-400/40" placeholder="Confirma la contraseña" />
            {error && <div className="flex gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300"><ShieldAlert className="w-4 h-4 shrink-0" />{error}</div>}
            <button disabled={!token || submitting} className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 py-3 font-bold transition-colors">{submitting ? 'ACTUALIZANDO...' : 'ACTUALIZAR CONTRASEÑA'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
