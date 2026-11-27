export interface LevelAchievement {
  level: number;
  minScore: number;
  title: string;
  rewardLabel: string;
  accentColor: string;
  glowRgb: string;
  icon: 'sleep' | 'target' | 'heart' | 'zap' | 'crown';
}

export const LEVEL_ACHIEVEMENTS: ReadonlyArray<LevelAchievement> = [
  {
    level: 1,
    minScore: 0,
    title: 'Sleepy Rookie',
    rewardLabel: 'Starter Gear',
    accentColor: '#94A3B8',
    glowRgb: '148, 163, 184',
    icon: 'sleep',
  },
  {
    level: 2,
    minScore: 300,
    title: 'Mosha Hunter',
    rewardLabel: 'Neon Aura + Bigger 3rd Leg',
    accentColor: '#38BDF8',
    glowRgb: '56, 189, 248',
    icon: 'target',
  },
  {
    level: 3,
    minScore: 600,
    title: 'Night Sniper',
    rewardLabel: '+1 Extra Heart (4) + Gold Halo',
    accentColor: '#F59E0B',
    glowRgb: '245, 158, 11',
    icon: 'heart',
  },
  {
    level: 4,
    minScore: 1000,
    title: 'Pro Zapper',
    rewardLabel: 'Emerald Aura + Pro Rank',
    accentColor: '#10B981',
    glowRgb: '16, 185, 129',
    icon: 'zap',
  },
  {
    level: 5,
    minScore: 1500,
    title: 'Chudling King',
    rewardLabel: 'Royal Gold Crown + Max Aura',
    accentColor: '#FBBF24',
    glowRgb: '251, 191, 36',
    icon: 'crown',
  },
];

export function getLevelFromScore(totalScore: number): number {
  const s = Math.max(0, Math.floor(totalScore));
  if (s >= 1500) return 5 + Math.floor((s - 1500) / 600);
  if (s >= 1000) return 4;
  if (s >= 600) return 3;
  if (s >= 300) return 2;
  return 1;
}

export function getLevelFloor(level: number): number {
  if (level <= 1) return 0;
  if (level === 2) return 300;
  if (level === 3) return 600;
  if (level === 4) return 1000;
  if (level === 5) return 1500;
  return 1500 + (level - 5) * 600;
}

export function getNextLevelTarget(level: number): number {
  if (level <= 1) return 300;
  if (level === 2) return 600;
  if (level === 3) return 1000;
  if (level === 4) return 1500;
  return 1500 + (level - 4) * 600;
}

export function getAchievementForLevel(level: number): LevelAchievement {
  if (level >= 6) {
    return {
      level,
      minScore: getLevelFloor(level),
      title: `Grand Legend ${level - 4}`,
      rewardLabel: 'Legend Halo + Peak Power',
      accentColor: '#EC4899',
      glowRgb: '236, 72, 153',
      icon: 'crown',
    };
  }
  const found = LEVEL_ACHIEVEMENTS.find((a) => a.level === Math.max(1, level));
  return found ?? LEVEL_ACHIEVEMENTS[0];
}

export function getMaxLivesForLevel(level: number): number {
  return level >= 3 ? 4 : 3;
}

export function getTripleShotDurationForLevel(): number {
  return 6.5;
}

export interface LevelProgress {
  level: number;
  totalScore: number;
  floor: number;
  nextTarget: number;
  currentInLevel: number;
  requiredForNext: number;
  remaining: number;
  percent: number;
  achievement: LevelAchievement;
}

export function getLevelProgress(totalScore: number): LevelProgress {
  const cleanTotal = Math.max(0, Math.floor(totalScore));
  const level = getLevelFromScore(cleanTotal);
  const floor = getLevelFloor(level);
  const nextTarget = getNextLevelTarget(level);
  const requiredForNext = Math.max(1, nextTarget - floor);
  const currentInLevel = Math.max(0, cleanTotal - floor);
  const remaining = Math.max(0, nextTarget - cleanTotal);
  const percent = Math.min(100, Math.max(0, Math.round((currentInLevel / requiredForNext) * 100)));

  return {
    level,
    totalScore: cleanTotal,
    floor,
    nextTarget,
    currentInLevel,
    requiredForNext,
    remaining,
    percent,
    achievement: getAchievementForLevel(level),
  };
}
