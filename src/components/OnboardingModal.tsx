import { KeyboardEvent, useEffect, useRef } from 'react';
import { BookOpen, X } from 'lucide-react';

type SessionRole = 'admin' | 'operator' | 'viewer';

interface OnboardingModalProps {
  role: SessionRole;
  onClose: () => void;
}

const ROLE_CONTENT: Record<SessionRole, { title: string; steps: string[] }> = {
  operator: {
    title: 'Bienvenido a MadridLive Access',
    steps: [
      'Entra con tu email y contraseña',
      'Abre el Lector QR',
      'Selecciona el evento de hoy',
      'Escanea según llegan (el panel CONVOCATORIA te dice quién falta)',
      'A la salida, el mismo gesto',
      'BLOQUEAR TERMINAL al terminar',
    ],
  },
  admin: {
    title: 'Bienvenido a MadridLive Access',
    steps: [
      'Crea el evento con fecha y puertas',
      'Gestionar equipo: convocatoria o Aplicar plantilla',
      'El día D, síguelo desde Eventos / Control y KPIs En vivo',
      'Al cierre: Historial sin turnos huérfanos, KPIs Histórico y CSV',
      'Puntúa a quien quieras recordar',
    ],
  },
  viewer: {
    title: 'Bienvenido a MadridLive Access',
    steps: [
      'Entra y navega — lo ves todo en tiempo real, sin riesgo de tocar nada.',
    ],
  },
};

export default function OnboardingModal({ role, onClose }: OnboardingModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const content = ROLE_CONTENT[role];

  useEffect(() => {
    primaryButtonRef.current?.focus();

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const handleFocusTrap = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-content"
        onKeyDown={handleFocusTrap}
        className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-[#120e2a] p-6 shadow-[0_0_50px_rgba(129,140,248,0.18)]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar guía rápida"
          className="absolute right-4 top-4 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/5 text-white/60 transition-all hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-6 flex items-center gap-3 pr-10">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-400/30 bg-indigo-500/10">
            <BookOpen className="h-5 w-5 text-indigo-300" />
          </div>
          <h2 id="onboarding-title" className="font-display text-xl font-black tracking-tight text-white">
            {content.title}
          </h2>
        </div>

        <div id="onboarding-content">
          {role === 'viewer' ? (
            <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-white/80">
              {content.steps[0]}
            </p>
          ) : (
            <ol className="space-y-3">
              {content.steps.map((step, index) => (
                <li key={step} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/80">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 font-mono text-[10px] font-bold text-indigo-200">
                    {index + 1}
                  </span>
                  <span className="pt-0.5 leading-5">{step}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            ref={primaryButtonRef}
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-xl border border-indigo-400/30 bg-indigo-500/20 px-5 py-2.5 text-xs font-bold text-indigo-100 transition-all hover:bg-indigo-500/30"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
