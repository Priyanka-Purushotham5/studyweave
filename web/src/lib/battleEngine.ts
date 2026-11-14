export type Difficulty = 1 | 2 | 3;
export interface Attack { conceptId: string; difficulty: Difficulty }
export interface Battle {
  remaining: string[];
  hearts: number;
  xp: number;
  queue: Attack[];
  levels: Record<string, { difficulty: Difficulty; streak: number }>;
}

export function startBattle(conceptIds: string[]): Battle {
  return { remaining: [...new Set(conceptIds)], hearts: 3, xp: 0, queue: [], levels: {} };
}

export function nextAttack(battle: Battle): Attack | undefined {
  if (!battle.hearts || !battle.remaining.length) return;
  return battle.queue[0] ?? { conceptId: battle.remaining[0], difficulty: battle.levels[battle.remaining[0]]?.difficulty ?? 1 };
}

export function recordAttack(battle: Battle, attack: Attack, correct: boolean, xp: number, rootConceptId?: string): Battle {
  if (!nextAttack(battle)) return battle;
  const { conceptId, difficulty } = attack;
  const streak = correct ? (battle.levels[conceptId]?.streak ?? 0) + 1 : 0;
  const level = Math.min(3, Math.max(1, difficulty + (correct ? Number(streak >= 2) : -1))) as Difficulty;
  const queue = battle.queue[0]?.conceptId === conceptId ? battle.queue.slice(1) : battle.queue;
  const retry = { conceptId, difficulty: level };
  const review = rootConceptId && rootConceptId !== conceptId ? [{ conceptId: rootConceptId, difficulty: 1 as const }] : [];
  return {
    remaining: correct ? battle.remaining.filter(id => id !== conceptId) : battle.remaining,
    hearts: battle.hearts - Number(!correct),
    xp: battle.xp + xp,
    levels: { ...battle.levels, [conceptId]: { difficulty: level, streak: streak >= 2 ? 0 : streak } },
    queue: correct ? queue : [...review, retry, ...queue.filter(item => item.conceptId !== conceptId && item.conceptId !== rootConceptId)],
  };
}
