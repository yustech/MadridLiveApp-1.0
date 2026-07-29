import { describe, expect, it } from 'vitest';
import {
  buildCheckoutWhatsAppText,
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

describe('WhatsApp checkout messages', () => {
  it('includes worker, event and Madrid entry/exit clocks', () => {
    const text = buildCheckoutWhatsAppText({
      workerName: 'Lucía Gómez',
      eventTitle: 'Concierto Madrid',
      startedAt: '2026-07-29T16:42:00.000Z',
      endedAt: '2026-07-29T21:17:00.000Z',
    });

    expect(text).toContain('Lucía Gómez');
    expect(text).toContain('Concierto Madrid');
    expect(text).toContain('ENTRADA*: 18:42');
    expect(text).toContain('SALIDA*: 23:17');

    const url = buildWhatsAppShareUrl('602 618 048', text);
    expect(url).not.toBeNull();
    expect(new URL(url!).searchParams.get('text')).toBe(text);
  });
});
