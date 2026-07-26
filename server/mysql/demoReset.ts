/**
 * Gate del reseed a datos demo (`POST /api/mysql/reset-initial`).
 *
 * Ese endpoint borra TODO el contenido de negocio y siembra el dataset demo de
 * 6 trabajadores de `src/data.ts`. En un entorno con datos reales es
 * destructivo e irreversible, y hasta ahora solo pedía rol admin.
 *
 * El permiso es **opt-in explícito**: hay que poner `ALLOW_DEMO_DATA_RESET=true`
 * en el entorno. Un entorno nuevo, o uno al que se le olvide la variable, queda
 * protegido por defecto — al revés (una variable para desactivarlo) un despiste
 * costaría el roster entero.
 *
 * Quién lo necesita activado: staging (`scripts/setup-staging.sh` lo usa para
 * sembrar) y el job de CI que prepara el fixture del gate e2e. Producción NO.
 *
 * No sirve mirar `NODE_ENV`: staging también corre con `NODE_ENV=production`.
 */
export const DEMO_RESET_FLAG = "ALLOW_DEMO_DATA_RESET";

export function isDemoResetAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  // Estricto a propósito: solo el literal "true" (sin distinguir mayúsculas ni
  // espacios) habilita el reseed. Nada de '1'/'yes'/'on', que se activan por
  // accidente con más facilidad.
  return String(env[DEMO_RESET_FLAG] ?? "").trim().toLowerCase() === "true";
}

export const DEMO_RESET_DISABLED_RESPONSE = {
  success: false,
  code: "DEMO_RESET_DISABLED",
  message:
    "El reseed a datos demo está desactivado en este entorno. " +
    `Requiere ${DEMO_RESET_FLAG}=true, que solo se pone en staging y CI.`,
} as const;
