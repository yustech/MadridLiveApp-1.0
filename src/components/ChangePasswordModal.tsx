import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { CheckCircle, KeyRound, LoaderCircle, X } from 'lucide-react';
import { MIN_USER_PASSWORD_LENGTH } from '../validators';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPasswordChanged: () => void | Promise<void>;
}

export default function ChangePasswordModal({
  isOpen,
  onClose,
  onPasswordChanged,
}: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const currentPasswordRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setError('');
    setSuccessMessage('');
    setIsSubmitting(false);
  };

  const closeModal = () => {
    if (isSubmitting) return;
    resetForm();
    onClose();
  };

  useEffect(() => {
    if (!isOpen) {
      resetForm();
      return;
    }

    currentPasswordRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) closeModal();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, isSubmitting]);

  if (!isOpen) return null;

  const passwordIsLongEnough = newPassword.length >= MIN_USER_PASSWORD_LENGTH;
  const passwordsMatch = newPassword === confirmNewPassword;
  const passwordChanged = newPassword !== currentPassword;
  const isValid = Boolean(currentPassword) && passwordIsLongEnough && passwordsMatch && passwordChanged;

  const handleFocusTrap = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isValid || isSubmitting) return;

    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/mysql/users/me/password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (response.ok) {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        setSuccessMessage('Contraseña actualizada. Vuelve a iniciar sesión.');
        window.setTimeout(() => void onPasswordChanged(), 600);
        return;
      }

      if (response.status === 400) {
        setError(`La contraseña debe tener al menos ${MIN_USER_PASSWORD_LENGTH} caracteres.`);
      } else if (response.status === 401) {
        setError('La contraseña actual es incorrecta.');
      } else {
        setError('No se pudo cambiar la contraseña. Inténtalo de nuevo.');
      }
    } catch {
      setError('No se pudo cambiar la contraseña. Inténtalo de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
        onKeyDown={handleFocusTrap}
        className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#120e2a] p-6 shadow-[0_0_50px_rgba(129,140,248,0.18)]"
      >
        <button
          type="button"
          onClick={closeModal}
          disabled={isSubmitting}
          aria-label="Cerrar cambio de contraseña"
          className="absolute right-4 top-4 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/5 text-white/60 transition-all hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-6 flex items-center gap-3 pr-10">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-400/30 bg-indigo-500/10">
            <KeyRound className="h-5 w-5 text-indigo-300" />
          </div>
          <div>
            <h2 id="change-password-title" className="font-display text-xl font-black tracking-tight text-white">
              Cambiar contraseña
            </h2>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-white/40">
              La sesión se cerrará al guardar
            </p>
          </div>
        </div>

        {successMessage ? (
          <div role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            <CheckCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{successMessage}</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="current-password" className="mb-2 block font-mono text-[10px] uppercase tracking-wider text-white/50">
                Contraseña actual
              </label>
              <input
                ref={currentPasswordRef}
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0A051A]/60 px-4 py-3 text-sm text-white outline-none transition-all focus:border-indigo-400/50"
              />
            </div>

            <div>
              <label htmlFor="new-password" className="mb-2 block font-mono text-[10px] uppercase tracking-wider text-white/50">
                Nueva contraseña
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                aria-describedby="new-password-help"
                className="w-full rounded-xl border border-white/10 bg-[#0A051A]/60 px-4 py-3 text-sm text-white outline-none transition-all focus:border-indigo-400/50"
              />
              <p id="new-password-help" className="mt-1.5 text-[11px] text-white/40">
                Mínimo {MIN_USER_PASSWORD_LENGTH} caracteres y distinta de la actual.
              </p>
            </div>

            <div>
              <label htmlFor="confirm-new-password" className="mb-2 block font-mono text-[10px] uppercase tracking-wider text-white/50">
                Confirmar nueva contraseña
              </label>
              <input
                id="confirm-new-password"
                type="password"
                autoComplete="new-password"
                value={confirmNewPassword}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0A051A]/60 px-4 py-3 text-sm text-white outline-none transition-all focus:border-indigo-400/50"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={closeModal} className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-bold text-white/70 transition-all hover:bg-white/10">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!isValid || isSubmitting}
                className="flex min-w-36 cursor-pointer items-center justify-center gap-2 rounded-xl border border-indigo-400/30 bg-indigo-500/20 px-4 py-2.5 text-xs font-bold text-indigo-100 transition-all hover:bg-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSubmitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
                Guardar contraseña
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
