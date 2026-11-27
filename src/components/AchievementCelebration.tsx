import React from 'react';
import { Award, Crown, Heart, Sparkles, Target, Trophy, Zap } from 'lucide-react';
import type { LevelAchievement } from '../game/levels';

interface AchievementCelebrationProps {
  achievement: LevelAchievement | null;
  onDismiss?: () => void;
}

function AchievementEmblem({
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

const CONFETTI_BURSTS: ReadonlyArray<{ tx: string; ty: string; color: string; delay: string }> = [
  { tx: '-92px', ty: '-86px', color: '#FBBF24', delay: '0s' },
  { tx: '88px', ty: '-94px', color: '#38BDF8', delay: '0.1s' },
  { tx: '-118px', ty: '-22px', color: '#34D399', delay: '0.2s' },
  { tx: '115px', ty: '-30px', color: '#F472B6', delay: '0.15s' },
  { tx: '-64px', ty: '-122px', color: '#FACC15', delay: '0.25s' },
  { tx: '62px', ty: '-118px', color: '#FB7185', delay: '0.05s' },
  { tx: '-98px', ty: '52px', color: '#A78BFA', delay: '0.3s' },
  { tx: '96px', ty: '48px', color: '#2DD4BF', delay: '0.22s' },
  { tx: '0px', ty: '-132px', color: '#FDE047', delay: '0.12s' },
  { tx: '-44px', ty: '84px', color: '#F59E0B', delay: '0.28s' },
  { tx: '48px', ty: '86px', color: '#60A5FA', delay: '0.18s' },
  { tx: '0px', ty: '104px', color: '#EC4899', delay: '0.08s' },
];

export const AchievementCelebration: React.FC<AchievementCelebrationProps> = ({
  achievement,
  onDismiss,
}) => {
  if (!achievement) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Achievement unlocked: ${achievement.title}`}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-5"
    >
      <div className="animate-ach-card relative w-full max-w-[340px] rounded-[26px] bg-[#12121A] border-2 p-6 text-center overflow-hidden shadow-2xl"
        style={{
          borderColor: achievement.accentColor,
          boxShadow: `0 24px 64px rgba(0,0,0,0.85), 0 0 42px rgba(${achievement.glowRgb}, 0.35)`,
        }}
      >
        {/* Rotating sunburst aura behind emblem */}
        <div
          aria-hidden="true"
          className="animate-ach-spin pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 -translate-y-1/2 w-56 h-56 opacity-25 rounded-full"
          style={{
            background: `conic-gradient(from 0deg, transparent 0deg 20deg, ${achievement.accentColor} 20deg 40deg, transparent 40deg 80deg, ${achievement.accentColor} 80deg 100deg, transparent 100deg 140deg, ${achievement.accentColor} 140deg 160deg, transparent 160deg 200deg, ${achievement.accentColor} 200deg 220deg, transparent 220deg 260deg, ${achievement.accentColor} 260deg 280deg, transparent 280deg 320deg, ${achievement.accentColor} 320deg 340deg, transparent 340deg 360deg)`,
          }}
        />

        {/* Metallic light sweep */}
        <div
          aria-hidden="true"
          className="animate-ach-shine pointer-events-none absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-white/15 to-transparent"
        />

        {/* Confetti sparks */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-20"
        >
          {CONFETTI_BURSTS.map((c, idx) => (
            <span
              key={idx}
              className="animate-ach-confetti absolute w-2.5 h-2.5 rounded-sm"
              style={
                {
                  backgroundColor: c.color,
                  animationDelay: c.delay,
                  '--tx': c.tx,
                  '--ty': c.ty,
                } as React.CSSProperties
              }
            />
          ))}
        </div>

        {/* Center trophy/crown medal */}
        <div className="relative mx-auto mt-1 mb-4 w-20 h-20 flex items-center justify-center">
          <span
            aria-hidden="true"
            className="animate-ach-ring absolute inset-0 rounded-2xl border-2"
            style={{ borderColor: achievement.accentColor }}
          />
          <div
            className="relative w-20 h-20 rounded-2xl flex items-center justify-center text-[#09090D] shadow-xl"
            style={{
              backgroundColor: achievement.accentColor,
              boxShadow: `0 10px 28px rgba(${achievement.glowRgb}, 0.5)`,
            }}
          >
            <AchievementEmblem icon={achievement.icon} className="w-10 h-10" />
          </div>
        </div>

        <p
          className="relative inline-flex items-center justify-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.16em]"
          style={{ color: achievement.accentColor }}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Achievement Unlocked
        </p>

        <h2 className="relative mt-1.5 font-display text-2xl font-extrabold text-white tracking-tight">
          LV {achievement.level} · {achievement.title}
        </h2>

        <div className="relative mt-3 rounded-xl bg-white/6 border border-white/12 px-3.5 py-2.5 flex items-center justify-center gap-2 text-xs font-bold text-zinc-100">
          <Award className="w-4 h-4 shrink-0" style={{ color: achievement.accentColor }} />
          <span>{achievement.rewardLabel}</span>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="relative mt-5 w-full min-h-[44px] py-3 px-5 rounded-xl text-[#09090D] font-extrabold text-sm shadow-lg active:scale-[0.98] transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          style={{ backgroundColor: achievement.accentColor }}
        >
          Claim
        </button>
      </div>
    </div>
  );
};
