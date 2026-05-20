const UPPER   = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I, O
const LOWER   = 'abcdefghjkmnpqrstuvwxyz';  // no i, l, o
const DIGITS  = '23456789';                  // no 0, 1
const SYMBOLS = '!@#$%&*';

const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

function pick(charset: string): string {
  return charset[Math.floor(Math.random() * charset.length)];
}

export function generatePassword(length = 14): string {
  // Guarantee at least one character from each required class
  const mandatory = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  const rest = Array.from({ length: length - 4 }, () => pick(ALL));
  return [...mandatory, ...rest].sort(() => Math.random() - 0.5).join('');
}
