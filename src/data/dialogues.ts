export interface DialogueLine {
  speaker: 'left' | 'right';
  text: string;
}

export const TUTORIAL_INTRO: DialogueLine[] = [
  { speaker: 'left', text: 'Ты пидор' },
  { speaker: 'right', text: 'Нет, ты пидор' },
  { speaker: 'left', text: 'Давай драться?' },
  { speaker: 'right', text: 'Давай!' },
];

export const TUTORIAL_POSTFIGHT: DialogueLine[] = [
  { speaker: 'left', text: 'Ох, хорошо подрались' },
  { speaker: 'right', text: 'Да, размялись хорошо' },
  { speaker: 'left', text: 'Ну пошли в клуб' },
];

/**
 * Post-intro dialogue — Качер даёт 100к.
 * Показывается после того как правый уходит.
 */
export const POSTINTRO_DIALOGUE: DialogueLine[] = [
  {
    speaker: 'left',
    text: 'Кстати, а я рассказывал, что по ночам сдавал наш офис под хостел? Вот 100к заработал, берите, мне не жалко!',
  },
];

/**
 * Generic fight intro lines — picked for non-tutorial bouts.
 * Speakers use their catchphrases from character data.
 */
export function getFightIntroDialogue(leftName: string, rightName: string, leftCatchphrase: string, rightCatchphrase: string): DialogueLine[] {
  return [
    { speaker: 'left', text: leftCatchphrase },
    { speaker: 'right', text: rightCatchphrase },
    { speaker: 'left', text: `${rightName}, тебе конец!` },
    { speaker: 'right', text: `Посмотрим, ${leftName}!` },
  ];
}
