export const TAP_PHRASES = [
  'БЕЙ!',
  'ТАК ЕГО!',
  'СИЛЬНЕЕ!',
  'НЕ СДАВАЙСЯ!',
  'ДАВАЙ!',
  'ВПЕРЁД!',
  'КРУШИ!',
  'МОЛОДЕЦ!',
  'ЕЩЁ!',
  'МОЧИ!',
  'В РЫЛО!',
  'КРАСАВА!',
];

export function pickTapPhrase(): string {
  return TAP_PHRASES[Math.floor(Math.random() * TAP_PHRASES.length)];
}
