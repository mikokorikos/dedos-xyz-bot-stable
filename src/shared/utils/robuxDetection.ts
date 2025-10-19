// =============================================================================
// RUTA: src/shared/utils/robuxDetection.ts
// =============================================================================

const CHARACTER_SUBSTITUTIONS: Record<string, string> = {
  '0': 'o',
  '1': 'l',
  '2': 'z',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '6': 'g',
  '7': 't',
  '8': 'b',
  '9': 'g',
  '@': 'a',
  '!': 'i',
  '|': 'l',
  '$': 's',
  '€': 'e',
  '£': 'l',
  '¥': 'y',
  '+': 't',
  '×': 'x',
  '✕': 'x',
  '✖': 'x',
  '❌': 'x',
  '🅇': 'x',
  '🆇': 'x',
  '🅧': 'x',
  'Ⓧ': 'x',
  'χ': 'x',
  'ⅹ': 'x',
  'ˣ': 'x',
  '🅢': 's',
  '🆂': 's',
  '🅾': 'o',
  '🅱': 'b',
  'Ⓡ': 'r',
  'ⓞ': 'o',
  'ⓑ': 'b',
  'ⓤ': 'u',
  'ⓧ': 'x',
  '®': 'r',
  'ℝ': 'r',
  '℞': 'r',
  'ᵣ': 'r',
  'ₓ': 'x',
  'ₒ': 'o',
  'ᵒ': 'o',
  '⁰': 'o',
  '₀': 'o',
  'ᵇ': 'b',
  '₍': '',
  '₎': '',
};

const CURRENCY_REGEX = /\p{Sc}/gu;
const DIACRITIC_REGEX = /\p{Diacritic}/gu;
const NON_ALPHANUMERIC_REGEX = /[^a-z0-9]/gu;

function substituteCharacter(char: string): string {
  const substitution = CHARACTER_SUBSTITUTIONS[char];

  if (substitution) {
    return substitution;
  }

  const normalized = char.normalize('NFKD');
  const withoutDiacritics = normalized.replace(DIACRITIC_REGEX, '');

  const fallback = CHARACTER_SUBSTITUTIONS[withoutDiacritics];

  if (fallback) {
    return fallback;
  }

  const asciiOnly = withoutDiacritics.replace(NON_ALPHANUMERIC_REGEX, '');

  return asciiOnly;
}

function normalizeForRobuxDetection(text: string): string {
  const preprocessed = text
    .toLowerCase()
    .replace(CURRENCY_REGEX, 's');

  let sanitized = '';

  for (const char of preprocessed) {
    sanitized += substituteCharacter(char);
  }

  return sanitized.replace(NON_ALPHANUMERIC_REGEX, '');
}

const ROBUX_PATTERNS = [
  /r[a-z0-9]{0,3}o[a-z0-9]{0,3}b[a-z0-9]{0,3}u[a-z0-9]{0,3}x/,
  /b[a-z0-9]{0,3}u[a-z0-9]{0,3}x/,
];

export function containsRobuxLikeTerms(rawText: string | null | undefined): boolean {
  if (!rawText) {
    return false;
  }

  const normalized = normalizeForRobuxDetection(rawText);

  if (normalized.length === 0) {
    return false;
  }

  return ROBUX_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function containsRobuxLikeTermsInCollection(values: Array<string | null | undefined>): boolean {
  return values.some((value) => containsRobuxLikeTerms(value));
}
