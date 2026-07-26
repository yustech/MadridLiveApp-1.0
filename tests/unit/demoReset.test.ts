import { describe, expect, it } from 'vitest';
import {
  DEMO_RESET_DISABLED_RESPONSE,
  DEMO_RESET_FLAG,
  isDemoResetAllowed,
} from '../../server/mysql/demoReset';

describe('isDemoResetAllowed', () => {
  it('está desactivado por defecto: un entorno sin la variable queda protegido', () => {
    expect(isDemoResetAllowed({})).toBe(false);
    expect(isDemoResetAllowed({ [DEMO_RESET_FLAG]: undefined })).toBe(false);
    expect(isDemoResetAllowed({ [DEMO_RESET_FLAG]: '' })).toBe(false);
  });

  it('solo habilita con el literal "true"', () => {
    expect(isDemoResetAllowed({ [DEMO_RESET_FLAG]: 'true' })).toBe(true);
    expect(isDemoResetAllowed({ [DEMO_RESET_FLAG]: 'TRUE' })).toBe(true);
    expect(isDemoResetAllowed({ [DEMO_RESET_FLAG]: '  true  ' })).toBe(true);
  });

  it('no se activa por accidente con valores parecidos', () => {
    for (const value of ['1', 'yes', 'on', 'sí', 'false', 'no', '0', 'truthy', 'True!']) {
      expect(isDemoResetAllowed({ [DEMO_RESET_FLAG]: value }), value).toBe(false);
    }
  });

  it('NODE_ENV no influye: staging también corre en production', () => {
    expect(isDemoResetAllowed({ NODE_ENV: 'development' })).toBe(false);
    expect(isDemoResetAllowed({ NODE_ENV: 'production', [DEMO_RESET_FLAG]: 'true' })).toBe(true);
  });

  it('la respuesta de bloqueo lleva un código estable y no filtra datos', () => {
    expect(DEMO_RESET_DISABLED_RESPONSE.success).toBe(false);
    expect(DEMO_RESET_DISABLED_RESPONSE.code).toBe('DEMO_RESET_DISABLED');
    expect(DEMO_RESET_DISABLED_RESPONSE.message).toContain(DEMO_RESET_FLAG);
  });
});
