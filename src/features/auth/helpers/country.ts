/* Phone country helpers keep auth restricted to France, Belgium, and Switzerland. */

export type SupportedPhoneCountry = 'FR' | 'BE' | 'CH';

export type SupportedPhoneCountryConfig = {
  country: SupportedPhoneCountry;
  callingCode: '+33' | '+32' | '+41';
  label: string;
  example: string;
};

export const SUPPORTED_PHONE_COUNTRIES: readonly SupportedPhoneCountryConfig[] = [
  {
    country: 'FR',
    callingCode: '+33',
    label: 'France',
    example: '6 12 34 56 78',
  },
  {
    country: 'BE',
    callingCode: '+32',
    label: 'Belgique',
    example: '470 12 34 56',
  },
  {
    country: 'CH',
    callingCode: '+41',
    label: 'Suisse',
    example: '78 123 45 67',
  },
] as const;

const E164_PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

function normalizeInternationalInput(phone: string): string {
  const trimmedPhone = phone.trim();

  if (trimmedPhone.startsWith('00')) {
    return `+${trimmedPhone.slice(2).replace(/\D/g, '')}`;
  }

  if (trimmedPhone.startsWith('+')) {
    return `+${trimmedPhone.slice(1).replace(/\D/g, '')}`;
  }

  return trimmedPhone.replace(/\D/g, '');
}

export function isE164Phone(phone: string): boolean {
  return E164_PHONE_PATTERN.test(normalizeInternationalInput(phone));
}

export function getCountryFromE164Phone(
  phone: string,
): SupportedPhoneCountry | null {
  const normalizedPhone = normalizeInternationalInput(phone);

  if (!E164_PHONE_PATTERN.test(normalizedPhone)) {
    return null;
  }

  const country = SUPPORTED_PHONE_COUNTRIES.find(({ callingCode }) =>
    normalizedPhone.startsWith(callingCode),
  );

  return country?.country ?? null;
}

export function isSupportedE164Phone(phone: string): boolean {
  return getCountryFromE164Phone(phone) !== null;
}

export function formatPhoneAsE164(
  phone: string,
  callingCode: SupportedPhoneCountryConfig['callingCode'],
): string | null {
  const normalizedPhone = normalizeInternationalInput(phone);
  const normalizedCallingCode = normalizeInternationalInput(callingCode);

  const e164Phone = normalizedPhone.startsWith('+')
    ? normalizedPhone
    : normalizedPhone.startsWith(normalizedCallingCode.slice(1))
      ? `+${normalizedPhone}`
      : `${callingCode}${normalizedPhone.replace(/^0+/, '')}`;

  if (!E164_PHONE_PATTERN.test(e164Phone)) {
    return null;
  }

  if (!e164Phone.startsWith(callingCode)) {
    return null;
  }

  return isSupportedE164Phone(e164Phone) ? e164Phone : null;
}
