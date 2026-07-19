const SPANISH_MOBILE_NUMBER = /^[67]\d{8}$/;

export function normalizeSpanishMobilePhone(phone: string | null | undefined): string | null {
  let nationalNumber = (phone || '').trim().replace(/[\s-]/g, '');

  if (nationalNumber.startsWith('0034')) {
    nationalNumber = nationalNumber.slice(4);
  } else if (nationalNumber.startsWith('+34')) {
    nationalNumber = nationalNumber.slice(3);
  } else if (nationalNumber.startsWith('34')) {
    nationalNumber = nationalNumber.slice(2);
  }

  return SPANISH_MOBILE_NUMBER.test(nationalNumber) ? `34${nationalNumber}` : null;
}

export function buildWhatsAppShareUrl(
  phone: string | null | undefined,
  text: string,
): string | null {
  const normalizedPhone = normalizeSpanishMobilePhone(phone);
  if (!normalizedPhone) return null;

  return `https://api.whatsapp.com/send?phone=${normalizedPhone}&text=${encodeURIComponent(text)}`;
}
