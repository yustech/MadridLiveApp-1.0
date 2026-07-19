import { describe, expect, it } from 'vitest';
import {
  buildWhatsAppShareUrl,
  normalizeSpanishMobilePhone,
} from '../../src/utils/whatsappShare';

describe('Spanish WhatsApp phone normalization', () => {
  it.each([
    ['602618048', '34602618048'],
    ['602 618 048', '34602618048'],
    ['602-618-048', '34602618048'],
    ['+34 602 618 048', '34602618048'],
    ['0034-602-618-048', '34602618048'],
    ['34 602 618 048', '34602618048'],
  ])('normalizes %s to E.164 digits without plus', (input, expected) => {
    expect(normalizeSpanishMobilePhone(input)).toBe(expected);
  });

  it.each([
    ['', null],
    ['   ', null],
    ['60261', null],
    ['912618048', null],
  ])('rejects missing or implausible mobile number %j', (input, expected) => {
    expect(normalizeSpanishMobilePhone(input)).toBe(expected);
  });

  it('builds a directed WhatsApp URL with encoded text', () => {
    expect(buildWhatsAppShareUrl('602 618 048', 'Hola Ángela & equipo')).toBe(
      'https://api.whatsapp.com/send?phone=34602618048&text=Hola%20%C3%81ngela%20%26%20equipo',
    );
  });

  it('does not build a recipient-less fallback URL', () => {
    expect(buildWhatsAppShareUrl(undefined, 'Hola')).toBeNull();
  });
});
