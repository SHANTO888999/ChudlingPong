import React from 'react';
import { Award, Check, Crown, Heart, Lock, Sparkles, Target, Trophy, X, Zap } from 'lucide-react';
import {
  getAchievementForLevel,
  LEVEL_ACHIEVEMENTS,
  type LevelAchievement,
} from '../game/levels';

interface AchievementsModalProps {
  open: boolean;
  onClose: () => void;
  currentLevel: number;
  totalScore: number;
  onReplayCelebration: (achievement: LevelAchievement) => void;
}

function TierIcon({
  icon,
  className,
}: {
  icon: LevelAchievement['icon'];
  className?: string;
}) {
  switch (icon) {
    case 'crown':
      return <Crown className={className} />;
    case 'heart':
      return <Heart className={`${className} fill-current`} />;
    case 'zap':
      return <Zap className={`${className} fill-current`} />;
    case 'target':
      return <Target className={className} />;
    default:
      return <Trophy className={className} />;
  }
}

export const AchievementsModal: React.FC<AchievementsModalProps> = ({
  open,
  onClose,
  currentLevel,
  totalScore,
  onReplayCelebration,
}) => {
  if (!open) return null;

  const tiers: LevelAchievement[] = [...LEVEL_ACHIEVEMENTS];
  if (currentLevel >= 6) {
    for (let lv = 6; lv <= currentLevel; lv++) {
      tiers.push(getAchievementForLevel(lv));
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-[376px] max-h-[86dvh] rounded-2xl bg-[#121218] border-2 border-white/20 shadow-2xl flex flex-col overflow-hidden text-white">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/15 bg-white/5">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-400" />
            <h2 className="font-display text-lg font-extrabold tracking-tight">
              Achievements
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close achievements"
            className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>

        <div className="px-4 py-2.5 bg-white/5 border-b border-white/10 flex items-center justify-between text-xs font-bold tabular-nums">
          <span className="text-amber-300">LV {currentLevel}</span>
          <span className="text-zinc-300">Total {totalScore.toLocaleString()}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {tiers.map((ach) => {
            const unlocked = currentLevel >= ach.level;
            return (
              <div
                key={ach.level}
                className={`rounded-xl border p-3 flex items-center gap-3 transition-colors ${
                  unlocked
                    ? 'bg-white/8 border-white/20'
                    : 'bg-white/3 border-white/8 opacity-70'
                }`}
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: unlocked ? ach.accentColor : 'rgba(255,255,255,0.08)',
                    color: unlocked ? '#09090D' : '#94A3B8',
                  }}
                >
                  {unlocked ? (
                    <TierIcon icon={ach.icon} className="w-5 h-5" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-[11px] font-extrabold uppercase tracking-wider tabular-nums"
                      style={{ color: unlocked ? ach.accentColor : '#71717A' }}
                    >
                      LV {ach.level}
                    </span>
                    <span aria-hidden="true" className="text-zinc-500 text-[11px]">
                      ·
                    </span>
                    <span className="text-xs font-extrabold text-white truncate">
                      {ach.title}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] font-semibold text-zinc-300 truncate">
                    {ach.rewardLabel}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold text-zinc-500 tabular-nums">
                    {ach.minScore.toLocaleString()} Total
                  </p>
                </div>

                {unlocked ? (
                  <button
                    type="button"
                    onClick={() => onReplayCelebration(ach)}
                    aria-label={`Celebrate ${ach.title}`}
                    className="shrink-0 h-8 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold text-amber-300 inline-flex items-center gap-1 transition-colors"
                  >
                    {ach.level >= 2 ? (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        Play
                      </>
                    ) : (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                  </button>
                ) : (
                  <span className="shrink-0 text-[11px] font-bold text-zinc-500 tabular-nums">
                    {Math.max(0, ach.minScore - totalScore).toLocaleString()} left
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
