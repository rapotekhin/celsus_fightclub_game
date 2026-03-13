import type { CharacterDef } from '../types';

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'kacher',
    name: 'Качер',
    catchphrase: 'Я хараси́л, харасю́ и буду хараси́ть.',
    stats: {
      strength: 10,
      agility: 2,
      endurance: 10,
      intelligence: 2,
      wisdom: 10,
      charisma: 10,
    },
  },
  {
    id: 'zheka',
    name: 'Жека',
    catchphrase: 'Я БЛЯТЬ AI!',
    stats: {
      strength: 2,
      agility: 2,
      endurance: 3,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
  },
  {
    id: 'romzan',
    name: 'Ромзан Безумный',
    catchphrase: 'Я дерусь как я дышу — хаотично.',
    stats: {
      strength: 3,
      agility: 3,
      endurance: 5,
      intelligence: 5,
      wisdom: 5,
      charisma: 10,
    },
  },
  {
    id: 'kolyan',
    name: 'Колян Лето',
    catchphrase: 'Лето, жара, кулак в рыло.',
    stats: {
      strength: 4,
      agility: 4,
      endurance: 4,
      intelligence: 4,
      wisdom: 4,
      charisma: 10,
    },
  },
  {
    id: 'tonik',
    name: 'Тоник',
    catchphrase: 'Освежи меня, если сможешь.',
    stats: {
      strength: 5,
      agility: 5,
      endurance: 5,
      intelligence: 5,
      wisdom: 5,
      charisma: 10,
    },
  },
  {
    id: 'makaroni',
    name: 'Евгений Макаронни',
    catchphrase: 'Аль денте — так и мои удары.',
    stats: {
      strength: 6,
      agility: 6,
      endurance: 6,
      intelligence: 6,
      wisdom: 6,
      charisma: 10,
    },
  },
  {
    id: 'durov',
    name: 'Евгений Дуров',
    catchphrase: 'Каналы закрываю, челюсти ломаю.',
    stats: {
      strength: 7,
      agility: 7,
      endurance: 7,
      intelligence: 7,
      wisdom: 7,
      charisma: 7,
    },
  },
  {
    id: 'ohrenenny',
    name: 'Евгений Охрененский',
    catchphrase: 'Говорят, я охренительный. Сейчас проверим.',
    stats: {
      strength: 1,
      agility: 9,
      endurance: 9,
      intelligence: 9,
      wisdom: 9,
      charisma: 9,
    },
  },
  {
    id: 'nikitos',
    name: 'Никитос',
    catchphrase: 'Маленький, да удаленький.',
    stats: {
      strength: 10,
      agility: 10,
      endurance: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
  },
  {
    id: 'biba',
    name: 'Биба',
    catchphrase: 'Где Боба, там и я — и вдвойне больней.',
    stats: {
      strength: 2,
      agility: 2,
      endurance: 2,
      intelligence: 2,
      wisdom: 2,
      charisma: 2,
    },
  },
  {
    id: 'boba',
    name: 'Боба',
    catchphrase: 'Где Биба, там и я. Он уже проиграл.',
    stats: {
      strength: 3,
      agility: 3,
      endurance: 3,
      intelligence: 3,
      wisdom: 3,
      charisma: 3,
    },
  },
  {
    id: 'novichek',
    name: 'Саша Новичёк',
    catchphrase: 'Соприкосновение со мной — необратимо.',
    stats: {
      strength: 4,
      agility: 4,
      endurance: 4,
      intelligence: 4,
      wisdom: 4,
      charisma: 4,
    },
  },
];

export const TUTORIAL_FIGHTERS = ['kacher', 'zheka'] as const;

export function getAvailablePool(usedIds: string[]): CharacterDef[] {
  return CHARACTERS.filter(
    (c) => !usedIds.includes(c.id)
  );
}

export function pickRandomPair(usedIds: string[]): [CharacterDef, CharacterDef] {
  const pool = getAvailablePool(usedIds);
  if (pool.length < 2) throw new Error('Not enough characters left');
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return [shuffled[0], shuffled[1]];
}

export function getCharacterDef(id: string): CharacterDef {
  const c = CHARACTERS.find((ch) => ch.id === id);
  if (!c) throw new Error(`Unknown character: ${id}`);
  return c;
}

/**
 * Check if a character has sprite assets available.
 * Characters without sprites will be excluded from the pool.
 */
export function hasSprites(id: string): boolean {
  return ['kacher', 'zheka', 'kolyan', 'makaroni', 'ohrenenny', 'tonik'].includes(id);
}

/**
 * Get pool of characters that have sprites available.
 */
export function getAvailablePoolWithSprites(usedIds: string[]): CharacterDef[] {
  return getAvailablePool(usedIds).filter((c) => hasSprites(c.id));
}

export function pickRandomPairWithSprites(usedIds: string[]): [CharacterDef, CharacterDef] | null {
  const pool = getAvailablePoolWithSprites(usedIds);
  if (pool.length < 2) return null;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return [shuffled[0], shuffled[1]];
}
