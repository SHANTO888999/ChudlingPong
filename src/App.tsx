import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowLeft,
  Check,
  Heart,
  LogIn,
  LogOut,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Share2,
  Trophy,
  Upload,
  User as UserIcon,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { soundEngine } from './audio/soundEngine';
import { AchievementCelebration } from './components/AchievementCelebration';
import { AchievementsModal } from './components/AchievementsModal';
import { FaceCropModal } from './components/FaceCropModal';
import { LeaderboardModal } from './components/LeaderboardModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import {
  fetchUserCloudScore,
  flushPendingOfflineSync,
  getActivePlayerUid,
  type LeaderboardRecord,
  loadCachedLeaderboard,
  loadSavedPlayerName,
  saveLocalPlayerName,
  signInWithGoogle,
  signOutUser,
  submitLeaderboardScore,
  subscribeAuth,
  subscribeLeaderboard,
} from './firebase';
import {
  getAchievementForLevel,
  getLevelFromScore,
  getLevelProgress,
  getMaxLivesForLevel,
  type LevelAchievement,
} from './game/levels';
import { getBedOrigin, getSleeperTarget, renderGame } from './game/renderer';
import {
  AvatarStyle,
  BeamEffect,
  FireMode,
  FloatingText,
  GameMode,
  GameState,
  Mosquito,
  Particle,
  PoopSplat,
  PowerUp,
  SleeperMood,
  ZzzBubble,
} from './game/types';
import { loadImageForCrop } from './utils/imageLoader';
import { shareChudlingPong } from './utils/shareCard';

const BEST_SCORE_KEY = 'sleepy_zapper_best_v1';
const TOTAL_SCORE_KEY = 'sleepy_zapper_total_v1';
const LAST_ACHIEVED_LV_KEY = 'sleepy_zapper_last_ach_lv_v1';
const BEST_ZAPPED_KEY = 'sleepy_zapper_best_zapped_v1';
const BEST_COMBO_KEY = 'sleepy_zapper_best_combo_v1';
const BEST_MODE_KEY = 'sleepy_zapper_best_mode_v1';
const BEST_OWNER_KEY = 'sleepy_zapper_best_owner_v1';
const AVATAR_STYLE_KEY = 'sleepy_zapper_avatar_v1';
const CUSTOM_FACE_STORAGE_KEY = 'sleepy_zapper_custom_face_v1';
const FIRE_MODE_KEY = 'sleepy_zapper_fire_mode_v1';

const AVATAR_OPTIONS: { id: AvatarStyle; emoji: string; label: string }[] = [
  { id: 'sleepy', emoji: '😴', label: 'Sleepy' },
  { id: 'emoji', emoji: '😊', label: 'Emoji' },
  { id: 'cool', emoji: '😎', label: 'Shades' },
  { id: 'uncle', emoji: '🧔', label: 'Uncle' },
];

function loadBestScore(): number {
  if (typeof window === 'undefined') return 0;
  const parsed = Number.parseInt(localStorage.getItem(BEST_SCORE_KEY) || '0', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function loadTotalScore(): number {
  if (typeof window === 'undefined') return 0;
  const parsed = Number.parseInt(localStorage.getItem(TOTAL_SCORE_KEY) || '0', 10);
  const clean = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  return Math.max(clean, loadBestScore());
}

function saveTotalScore(total: number): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOTAL_SCORE_KEY, String(Math.max(0, Math.floor(total))));
}

function loadBestOwner(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(BEST_OWNER_KEY);
}

function loadBestMeta(): { zappedCount: number; bestCombo: number; fireMode: FireMode } {
  if (typeof window === 'undefined') {
    return { zappedCount: 0, bestCombo: 0, fireMode: 'thirdLeg' };
  }
  const zapped = Number.parseInt(localStorage.getItem(BEST_ZAPPED_KEY) || '0', 10);
  const combo = Number.parseInt(localStorage.getItem(BEST_COMBO_KEY) || '0', 10);
  const mode = localStorage.getItem(BEST_MODE_KEY);
  return {
    zappedCount: Number.isFinite(zapped) && zapped > 0 ? zapped : 0,
    bestCombo: Number.isFinite(combo) && combo > 0 ? combo : 0,
    fireMode: mode === 'hand' || mode === 'thirdLeg' ? mode : loadFireMode(),
  };
}

function saveBestRecord(
  score: number,
  mode: FireMode,
  zapped: number,
  combo: number,
  ownerUid: string
): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(BEST_SCORE_KEY, String(score));
  localStorage.setItem(BEST_ZAPPED_KEY, String(zapped));
  localStorage.setItem(BEST_COMBO_KEY, String(combo));
  localStorage.setItem(BEST_MODE_KEY, mode);
  localStorage.setItem(BEST_OWNER_KEY, ownerUid);
}

function loadSavedCustomFace(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(CUSTOM_FACE_STORAGE_KEY);
    return saved && saved.startsWith('data:image/') ? saved : null;
  } catch {
    return null;
  }
}

function loadAvatarStyle(): AvatarStyle {
  if (typeof window === 'undefined') return 'sleepy';
  const saved = localStorage.getItem(AVATAR_STYLE_KEY) as AvatarStyle | null;
  if (saved === 'sleepy' || saved === 'emoji' || saved === 'cool' || saved === 'uncle') {
    return saved;
  }
  if (saved === 'custom' && loadSavedCustomFace()) {
    return 'custom';
  }
  return 'sleepy';
}

function loadFireMode(): FireMode {
  if (typeof window === 'undefined') return 'thirdLeg';
  const saved = localStorage.getItem(FIRE_MODE_KEY);
  if (saved === 'hand' || saved === 'thirdLeg') {
    return saved;
  }
  return 'thirdLeg';
}

function rayCircleIntersect(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  cx: number,
  cy: number,
  r: number
): number | null {
  const fx = cx - ox;
  const fy = cy - oy;
  const proj = fx * dx + fy * dy;
  if (proj <= 0) return null;
  const closestX = ox + dx * proj;
  const closestY = oy + dy * proj;
  const distSq = (cx - closestX) ** 2 + (cy - closestY) ** 2;
  if (distSq <= r * r) {
    return proj;
  }
  return null;
}

function getDifficultyLevel(playTime: number, score: number, mode: FireMode = 'thirdLeg'): number {
  const base = (playTime * 0.28 + score * 0.45) / 12;
  return mode === 'hand' ? base * 0.62 : base;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [gameMode] = useState<GameMode>('arcade');
  const [fireMode, setFireMode] = useState<FireMode>(() => loadFireMode());
  const [score, setScore] = useState<number>(0);
  const [bestScore, setBestScore] = useState<number>(() => loadBestScore());
  const [totalScore, setTotalScore] = useState<number>(() => loadTotalScore());
  const [level, setLevel] = useState<number>(() => getLevelFromScore(loadTotalScore()));
  const [isNewBest, setIsNewBest] = useState<boolean>(false);
  const [lives, setLives] = useState<number>(3);
  const [maxLives, setMaxLives] = useState<number>(3);
  const [zappedCount, setZappedCount] = useState<number>(0);
  const [bestCombo, setBestCombo] = useState<number>(0);
  const [tripleShotSeconds, setTripleShotSeconds] = useState<number>(0);
  const [muted, setMuted] = useState<boolean>(() => soundEngine.isMuted());
  const [avatarStyle, setAvatarStyle] = useState<AvatarStyle>(() => loadAvatarStyle());
  const [customFaceUrl, setCustomFaceUrl] = useState<string | null>(() => loadSavedCustomFace());
  const [hasCustomImage, setHasCustomImage] = useState<boolean>(() => Boolean(loadSavedCustomFace()));
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null);
  const [cropError, setCropError] = useState<string | null>(null);
  const [cropModalOpen, setCropModalOpen] = useState<boolean>(false);

  // Firebase Auth & Leaderboard state
  const [user, setUser] = useState<User | null>(null);
  const [playerName, setPlayerName] = useState<string>(() => loadSavedPlayerName(null));
  const [leaderboardOpen, setLeaderboardOpen] = useState<boolean>(false);
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardRecord[]>(() =>
    loadCachedLeaderboard()
  );
  const [leaderboardLoading, setLeaderboardLoading] = useState<boolean>(
    () => loadCachedLeaderboard().length === 0
  );
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [shareLabel, setShareLabel] = useState<string>('Share');
  const [editingProfileName, setEditingProfileName] = useState<boolean>(false);
  const [profileBusy, setProfileBusy] = useState<boolean>(false);
  const [achievementsOpen, setAchievementsOpen] = useState<boolean>(false);
  const [showcaseAchievement, setShowcaseAchievement] = useState<LevelAchievement | null>(null);

  // Mutable simulation state inside ref for smooth 60fps loop
  const simRef = useRef({
    width: 420,
    height: 760,
    time: 0,
    playTime: 0,
    score: 0,
    bestScore: loadBestScore(),
    baseTotalAtRunStart: loadTotalScore(),
    settledPointsForThisRun: 0,
    currentLevel: getLevelFromScore(loadTotalScore()),
    crossedBestThisRun: false,
    lives: 3,
    combo: 0,
    bestCombo: 0,
    zappedCount: 0,
    aimAngle: 0,
    isAiming: false,
    pointerId: null as number | null,
    dragStartX: 0,
    dragStartY: 0,
    dragStartAngle: 0,
    pointerMovedDist: 0,
    shotCooldown: 0,
    spawnTimer: 0.4,
    powerUpTimer: 12,
    nextBossScore: 10,
    tripleShotTimer: 0,
    lastTripleDisplaySec: 0,
    zzzTimer: 0.5,
    nextId: 1,
    mosquitoes: [] as Mosquito[],
    powerUps: [] as PowerUp[],
    beams: [] as BeamEffect[],
    splats: [] as PoopSplat[],
    particles: [] as Particle[],
    floatingTexts: [] as FloatingText[],
    zzzBubbles: [] as ZzzBubble[],
    sleeperMood: 'idle' as SleeperMood,
    moodTimer: 0,
    shakeTime: 0,
    shakeIntensity: 0,
    biteFlashAlpha: 0,
    rubPhase: 0,
    fireMomentum: 0,
    lastShotTime: -10,
    keysPressed: { left: false, right: false },
  });

  const gameStateRef = useRef<GameState>(gameState);
  gameStateRef.current = gameState;

  const avatarStyleRef = useRef<AvatarStyle>(avatarStyle);
  avatarStyleRef.current = avatarStyle;

  const fireModeRef = useRef<FireMode>(fireMode);
  fireModeRef.current = fireMode;

  const playerNameRef = useRef<string>(playerName);
  playerNameRef.current = playerName;

  const totalScoreRef = useRef<number>(totalScore);
  totalScoreRef.current = totalScore;

  const customAvatarImgRef = useRef<HTMLImageElement | null>(null);
  const uploadSeqRef = useRef<number>(0);

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Show profile achievement unlock animation on the Home/Profile screen whenever a new level >= 2 is reached
  useEffect(() => {
    if (typeof window === 'undefined' || gameState !== 'TITLE_MENU') return;
    const savedLvRaw = localStorage.getItem(LAST_ACHIEVED_LV_KEY);
    const savedLv = savedLvRaw ? Number.parseInt(savedLvRaw, 10) : 1;
    const currentLv = getLevelFromScore(totalScore);
    if (currentLv >= 2 && (!Number.isFinite(savedLv) || currentLv > savedLv)) {
      localStorage.setItem(LAST_ACHIEVED_LV_KEY, String(currentLv));
      soundEngine.playAchievement();
      setShowcaseAchievement(getAchievementForLevel(currentLv));
    } else if (!savedLvRaw) {
      localStorage.setItem(LAST_ACHIEVED_LV_KEY, String(currentLv));
    }
  }, [gameState, totalScore]);

  const syncRunToCloud = useCallback(
    async (
      bestScoreCandidate: number,
      totalToSync: number,
      runDelta: number,
      mode: FireMode,
      zapped: number,
      combo: number
    ) => {
      if (bestScoreCandidate <= 0 && totalToSync <= 0) return;
      try {
        const cleanName = saveLocalPlayerName(playerNameRef.current);
        const syncPromise = submitLeaderboardScore({
          playerName: cleanName,
          score: bestScoreCandidate,
          totalScore: totalToSync,
          runDelta,
          fireMode: mode,
          zappedCount: zapped,
          bestCombo: combo,
        });
        setLeaderboardEntries(loadCachedLeaderboard());
        setLeaderboardLoading(false);
        setLeaderboardError(null);
        await syncPromise;
        setLeaderboardEntries(loadCachedLeaderboard());
      } catch {
        setLeaderboardEntries(loadCachedLeaderboard());
      }
    },
    []
  );

  const settleCurrentRun = useCallback(
    (isGameOver: boolean) => {
      const sim = simRef.current;
      const finalScore = sim.score;
      const prevSavedBest = sim.bestScore;
      const beatSavedBest = finalScore > prevSavedBest;
      const nextBest = beatSavedBest ? finalScore : prevSavedBest;

      const delta = Math.max(0, finalScore - sim.settledPointsForThisRun);
      if (delta > 0) {
        sim.settledPointsForThisRun = finalScore;
      }

      const nextTotal = Math.max(nextBest, totalScoreRef.current + delta);
      if (nextTotal !== totalScoreRef.current) {
        totalScoreRef.current = nextTotal;
        saveTotalScore(nextTotal);
        setTotalScore(nextTotal);
      }

      const nextLv = getLevelFromScore(nextTotal);
      sim.currentLevel = nextLv;
      setLevel(nextLv);

      if (beatSavedBest) {
        sim.bestScore = finalScore;
        saveBestRecord(
          finalScore,
          fireModeRef.current,
          sim.zappedCount,
          sim.bestCombo,
          getActivePlayerUid()
        );
        setBestScore(finalScore);
      } else {
        setBestScore(prevSavedBest);
      }

      if (isGameOver) {
        setIsNewBest(beatSavedBest);
      }

      if (delta > 0 || beatSavedBest) {
        void syncRunToCloud(
          nextBest,
          nextTotal,
          delta,
          fireModeRef.current,
          sim.zappedCount,
          sim.bestCombo
        );
      }
    },
    [syncRunToCloud]
  );

  // Auth & Top-20 Leaderboard subscriptions + offline queue flush & automatic score sync
  useEffect(() => {
    const unsubAuth = subscribeAuth(async (nextUser) => {
      setUser(nextUser);
      const resolvedName = loadSavedPlayerName(nextUser);
      setPlayerName(resolvedName);
      playerNameRef.current = resolvedName;

      const activeUid = nextUser ? nextUser.uid : getActivePlayerUid();
      const storedOwner = loadBestOwner();
      const switchedFromGoogleToGuest =
        !nextUser && Boolean(storedOwner) && !storedOwner!.startsWith('guest_');

      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          await flushPendingOfflineSync();
          const cloudEntry = await fetchUserCloudScore(activeUid);
          if (switchedFromGoogleToGuest) {
            const guestScore = cloudEntry ? cloudEntry.score : 0;
            const guestTotal = cloudEntry ? Math.max(guestScore, cloudEntry.totalScore) : 0;
            simRef.current.bestScore = guestScore;
            setBestScore(guestScore);
            totalScoreRef.current = guestTotal;
            saveTotalScore(guestTotal);
            setTotalScore(guestTotal);
            const guestLv = getLevelFromScore(guestTotal);
            simRef.current.currentLevel = guestLv;
            setLevel(guestLv);
            if (gameStateRef.current === 'TITLE_MENU') {
              simRef.current.baseTotalAtRunStart = guestTotal;
            }
            saveBestRecord(
              guestScore,
              cloudEntry ? cloudEntry.fireMode : fireModeRef.current,
              cloudEntry ? cloudEntry.zappedCount : 0,
              cloudEntry ? cloudEntry.bestCombo : 0,
              activeUid
            );
            return;
          }

          const localBest = simRef.current.bestScore;
          const localTotal = totalScoreRef.current;
          const cloudBest = cloudEntry ? cloudEntry.score : 0;
          const cloudTotal = cloudEntry ? Math.max(cloudBest, cloudEntry.totalScore) : 0;
          const resolvedBest = Math.max(localBest, cloudBest);
          const resolvedTotal = Math.max(resolvedBest, localTotal, cloudTotal);

          if (resolvedBest > localBest && cloudEntry) {
            simRef.current.bestScore = resolvedBest;
            setBestScore(resolvedBest);
            saveBestRecord(
              cloudEntry.score,
              cloudEntry.fireMode,
              cloudEntry.zappedCount,
              cloudEntry.bestCombo,
              activeUid
            );
          }

          if (resolvedTotal > localTotal) {
            totalScoreRef.current = resolvedTotal;
            saveTotalScore(resolvedTotal);
            setTotalScore(resolvedTotal);
            const resolvedLv = getLevelFromScore(resolvedTotal);
            simRef.current.currentLevel = resolvedLv;
            setLevel(resolvedLv);
            if (gameStateRef.current === 'TITLE_MENU') {
              simRef.current.baseTotalAtRunStart = resolvedTotal;
            }
          }

          const cloudNeedsSync =
            !cloudEntry ||
            resolvedBest > cloudEntry.score ||
            resolvedTotal > cloudEntry.totalScore ||
            cloudEntry.hasTotalField === false;

          if (resolvedTotal > 0 && cloudNeedsSync) {
            const bestMeta = loadBestMeta();
            await submitLeaderboardScore({
              playerName: saveLocalPlayerName(resolvedName),
              score: resolvedBest,
              totalScore: resolvedTotal,
              runDelta: 0,
              fireMode: bestMeta.fireMode,
              zappedCount: bestMeta.zappedCount,
              bestCombo: bestMeta.bestCombo,
            });
            if (resolvedBest === localBest) {
              saveBestRecord(
                resolvedBest,
                bestMeta.fireMode,
                bestMeta.zappedCount,
                bestMeta.bestCombo,
                activeUid
              );
            }
            setLeaderboardEntries(loadCachedLeaderboard());
          }
        } catch {
          // Structured error already logged if needed
        }
      } else if (switchedFromGoogleToGuest) {
        const cachedGuest = loadCachedLeaderboard().find((row) => row.uid === activeUid);
        const guestScore = cachedGuest ? cachedGuest.score : 0;
        const guestTotal = cachedGuest ? Math.max(guestScore, cachedGuest.totalScore) : 0;
        simRef.current.bestScore = guestScore;
        setBestScore(guestScore);
        totalScoreRef.current = guestTotal;
        saveTotalScore(guestTotal);
        setTotalScore(guestTotal);
        const guestLv = getLevelFromScore(guestTotal);
        simRef.current.currentLevel = guestLv;
        setLevel(guestLv);
        if (gameStateRef.current === 'TITLE_MENU') {
          simRef.current.baseTotalAtRunStart = guestTotal;
        }
        saveBestRecord(
          guestScore,
          cachedGuest ? cachedGuest.fireMode : fireModeRef.current,
          cachedGuest ? cachedGuest.zappedCount : 0,
          cachedGuest ? cachedGuest.bestCombo : 0,
          activeUid
        );
      } else if (simRef.current.bestScore > 0 || totalScoreRef.current > 0) {
        const bestMeta = loadBestMeta();
        await submitLeaderboardScore({
          playerName: saveLocalPlayerName(resolvedName),
          score: simRef.current.bestScore,
          totalScore: Math.max(simRef.current.bestScore, totalScoreRef.current),
          runDelta: 0,
          fireMode: bestMeta.fireMode,
          zappedCount: bestMeta.zappedCount,
          bestCombo: bestMeta.bestCombo,
        });
        setLeaderboardEntries(loadCachedLeaderboard());
        setLeaderboardLoading(false);
      }
    });

    const unsubBoard = subscribeLeaderboard(
      (rows) => {
        setLeaderboardEntries(rows);
        setLeaderboardLoading(false);
        setLeaderboardError(null);
      },
      (err) => {
        const cached = loadCachedLeaderboard();
        setLeaderboardLoading(false);
        if (cached.length > 0) {
          setLeaderboardEntries(cached);
          setLeaderboardError(null);
        } else {
          setLeaderboardError(
            err instanceof Error && err.message.includes('Quota exceeded')
              ? 'Daily Firestore quota exceeded. Try again tomorrow.'
              : 'No scores available offline.'
          );
        }
      },
      20
    );

    const resetTransientInputs = () => {
      const sim = simRef.current;
      sim.keysPressed.left = false;
      sim.keysPressed.right = false;
      sim.isAiming = false;
      sim.pointerId = null;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        resetTransientInputs();
        soundEngine.stopThirdLegEffect();
        if (gameStateRef.current === 'PLAYING' && simRef.current.score > 0) {
          settleCurrentRun(false);
        }
      }
    };

    const handleReconnect = async () => {
      await flushPendingOfflineSync();
      setLeaderboardEntries(loadCachedLeaderboard());
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', resetTransientInputs);
    window.addEventListener('online', handleReconnect);

    return () => {
      unsubAuth();
      unsubBoard();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', resetTransientInputs);
      window.removeEventListener('online', handleReconnect);
    };
  }, [settleCurrentRun]);

  const spawnMosquito = useCallback(
    (currentScore: number, playTime: number, forceBoss: boolean = false) => {
      const sim = simRef.current;
      const { width, height } = sim;
      const isNormalMode = fireModeRef.current === 'hand';
      const d = getDifficultyLevel(playTime, currentScore, fireModeRef.current);
      const fromLeft = Math.random() < 0.5;
      const startX = fromLeft ? -22 : width + 22;
      const startY = height * (0.14 + Math.random() * 0.28);

      const speedBoost = 1 + Math.min(d * 0.14, isNormalMode ? 0.75 : 1.15);
      const kind: Mosquito['kind'] = forceBoss
        ? 'boss'
        : currentScore >= 3 && Math.random() < 0.18
          ? 'golden'
          : 'normal';
      const modeSpeedScale = isNormalMode ? 0.8 : 1;
      const baseSpeed =
        kind === 'boss'
          ? 96 * modeSpeedScale * (1 + Math.min(d * 0.10, 0.8))
          : (kind === 'golden' ? 148 : 114) * modeSpeedScale * speedBoost;

      const targetX = width * (0.25 + Math.random() * 0.5);
      const angleToCenter = Math.atan2(height * 0.26 - startY, targetX - startX);
      const maxHp = kind === 'boss' ? 3 : 1;

      sim.mosquitoes.push({
        id: sim.nextId++,
        x: startX,
        y: startY,
        vx: Math.cos(angleToCenter) * baseSpeed,
        vy: Math.sin(angleToCenter) * baseSpeed,
        radius: kind === 'boss' ? 25 : kind === 'golden' ? 15 : 17,
        wingPhase: Math.random() * Math.PI * 2,
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleSpeed: (isNormalMode ? 3.2 : 4.2) + Math.min(d * 0.42, 3.0) + Math.random() * 2.2,
        kind,
        hp: maxHp,
        maxHp,
        hitFlash: 0,
        state: 'roaming',
        stateTimer:
          (kind === 'boss'
            ? Math.max(2.6, 4.8 - d * 0.2)
            : Math.max(1.35, 3.8 - d * 0.28) + Math.random() * Math.max(0.7, 1.8 - d * 0.14)) *
          (isNormalMode ? 1.25 : 1),
        diveTargetX: 0,
        diveTargetY: 0,
        facing: fromLeft ? -1 : 1,
      });

      if (kind === 'boss') {
        soundEngine.playDiveAlert();
        sim.floatingTexts.push({
          x: width * 0.5,
          y: Math.max(106, startY),
          vy: -24,
          text: 'BOSS!',
          color: '#F43F5E',
          life: 1.15,
          maxLife: 1.15,
          scale: 1.08,
        });
      }
    },
    []
  );

  const spawnPowerUp = useCallback(() => {
    const sim = simRef.current;
    const { width, height } = sim;
    const fromLeft = Math.random() < 0.5;
    const startX = fromLeft ? -20 : width + 20;
    const startY = height * (0.16 + Math.random() * 0.2);
    sim.powerUps.push({
      id: sim.nextId++,
      x: startX,
      y: startY,
      vx: fromLeft ? 95 : -95,
      vy: 0,
      radius: 17,
      phase: Math.random() * Math.PI * 2,
      kind: 'triple',
    });
  }, []);

  const resetSimulation = useCallback(
    (mode: GameMode, startPlaying: boolean) => {
      const sim = simRef.current;
      if (sim.score > 0 && gameStateRef.current !== 'GAME_OVER') {
        settleCurrentRun(false);
      }
      const startLevel = getLevelFromScore(totalScoreRef.current);
      const initialLives = mode === 'classic' ? 1 : getMaxLivesForLevel(startLevel);
      sim.playTime = 0;
      sim.score = 0;
      sim.settledPointsForThisRun = 0;
      sim.baseTotalAtRunStart = totalScoreRef.current;
      sim.currentLevel = startLevel;
      sim.crossedBestThisRun = false;
      sim.lives = initialLives;
      sim.combo = 0;
      sim.bestCombo = 0;
      sim.zappedCount = 0;
      sim.aimAngle = 0;
      sim.isAiming = false;
      sim.pointerId = null;
      sim.shotCooldown = 0;
      sim.spawnTimer = 0.25;
      sim.powerUpTimer = 12;
      sim.nextBossScore = 10;
      sim.tripleShotTimer = 0;
      sim.lastTripleDisplaySec = 0;
      sim.mosquitoes = [];
      sim.powerUps = [];
      sim.beams = [];
      sim.splats = [];
      sim.particles = [];
      sim.floatingTexts = [];
      sim.zzzBubbles = [];
      sim.sleeperMood = 'idle';
      sim.moodTimer = 0;
      sim.shakeTime = 0;
      sim.biteFlashAlpha = 0;
      sim.fireMomentum = 0;
      sim.lastShotTime = -10;

      setScore(0);
      setBestScore(sim.bestScore);
      setLevel(startLevel);
      setIsNewBest(false);
      setLives(initialLives);
      setMaxLives(initialLives);
      setZappedCount(0);
      setBestCombo(0);
      setTripleShotSeconds(0);
      setShareLabel('Share');

      soundEngine.stopThirdLegEffect();
      if (startPlaying) {
        spawnMosquito(0, 0, false);
        setGameState('PLAYING');
      } else {
        setGameState('TITLE_MENU');
      }
    },
    [settleCurrentRun, spawnMosquito]
  );

  const startGame = useCallback(() => {
    resetSimulation(gameMode, true);
    soundEngine.preloadDeathAudio();
    if (fireModeRef.current === 'thirdLeg') {
      soundEngine.preloadThirdLegAudio();
    } else {
      soundEngine.stopThirdLegEffect();
    }
  }, [gameMode, resetSimulation]);

  const fireBeam = useCallback(() => {
    const sim = simRef.current;
    if (gameStateRef.current !== 'PLAYING' || sim.shotCooldown > 0) return;

    const origin = getBedOrigin(sim.width, sim.height, fireModeRef.current, sim.currentLevel);
    const tripleActive = sim.tripleShotTimer > 0;
    const angles = tripleActive ? [sim.aimAngle - 0.22, sim.aimAngle, sim.aimAngle + 0.22] : [sim.aimAngle];

    const isNormalMode = fireModeRef.current === 'hand';
    const d = getDifficultyLevel(sim.playTime, sim.score, fireModeRef.current);
    const hitForgiveness = isNormalMode
      ? Math.max(11, 16 - d * 0.45)
      : Math.max(7, 12 - d * 0.55);
    const visualKind: 'white' | 'fire' = isNormalMode ? 'fire' : 'white';
    const maxLen = Math.hypot(sim.width, sim.height);

    let anyHit = false;
    let mosquitoDefeated = false;
    let mosquitoDamaged = false;
    let hitGolden = false;
    let hitBossKill = false;
    let activatedPowerUp = false;

    for (const angle of angles) {
      const dx = Math.sin(angle);
      const dy = -Math.cos(angle);

      let closestDist = Infinity;
      let hitMosquitoIdx = -1;
      let hitPowerUpIdx = -1;

      sim.powerUps.forEach((pu, idx) => {
        const hitDist = rayCircleIntersect(
          origin.x,
          origin.y,
          dx,
          dy,
          pu.x,
          pu.y,
          pu.radius + 10
        );
        if (hitDist !== null && hitDist < closestDist) {
          closestDist = hitDist;
          hitPowerUpIdx = idx;
          hitMosquitoIdx = -1;
        }
      });

      sim.mosquitoes.forEach((m, idx) => {
        const hitDist = rayCircleIntersect(
          origin.x,
          origin.y,
          dx,
          dy,
          m.x,
          m.y,
          m.radius + hitForgiveness
        );
        if (hitDist !== null && hitDist < closestDist) {
          closestDist = hitDist;
          hitMosquitoIdx = idx;
          hitPowerUpIdx = -1;
        }
      });

      const beamLen = hitMosquitoIdx !== -1 || hitPowerUpIdx !== -1 ? closestDist : maxLen;
      const endX = origin.x + dx * beamLen;
      const endY = origin.y + dy * beamLen;

      sim.beams.push({
        id: sim.nextId++,
        x1: origin.x,
        y1: origin.y,
        x2: endX,
        y2: endY,
        hit: hitMosquitoIdx !== -1 || hitPowerUpIdx !== -1,
        life: 0.21,
        maxLife: 0.21,
        kind: visualKind,
      });

      if (hitPowerUpIdx !== -1) {
        const pu = sim.powerUps[hitPowerUpIdx];
        sim.powerUps.splice(hitPowerUpIdx, 1);
        sim.tripleShotTimer = 6.5;
        sim.lastTripleDisplaySec = 7;
        setTripleShotSeconds(7);
        anyHit = true;
        activatedPowerUp = true;

        for (let i = 0; i < 16; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 75 + Math.random() * 170;
          sim.particles.push({
            x: pu.x,
            y: pu.y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd - 20,
            size: 4 + Math.random() * 4,
            color: i % 2 === 0 ? '#38BDF8' : '#FFFFFF',
            alpha: 1,
            life: 0.45 + Math.random() * 0.2,
            maxLife: 0.65,
            rotation: Math.random() * Math.PI,
            vRot: (Math.random() - 0.5) * 12,
          });
        }

        sim.floatingTexts.push({
          x: pu.x,
          y: pu.y - 16,
          vy: -48,
          text: '3X',
          color: '#38BDF8',
          life: 1.0,
          maxLife: 1.0,
          scale: 1.15,
        });
      } else if (hitMosquitoIdx !== -1) {
        const target = sim.mosquitoes[hitMosquitoIdx];
        anyHit = true;
        target.hp -= 1;
        target.hitFlash = 0.14;

        const isBoss = target.kind === 'boss';
        const isGolden = target.kind === 'golden';

        // Impact burst: fiery embers in Normal mode, sticky white splat in Chudling mode
        sim.splats.push({
          id: sim.nextId++,
          x: target.x,
          y: target.y,
          scale: isBoss ? 1.35 : isGolden ? 1.18 : 0.95 + Math.random() * 0.25,
          rotation: (Math.random() - 0.5) * 1.4,
          life: isNormalMode ? 0.65 : 1.45,
          maxLife: isNormalMode ? 0.65 : 1.45,
          kind: visualKind,
        });

        const impactPalette = isNormalMode
          ? ['#FEF08A', '#FACC15', '#F97316', '#EF4444']
          : ['#FFFFFF', '#F8FAFC', '#F1F5F9', 'rgba(255, 255, 255, 0.9)'];
        for (let i = 0; i < (isBoss && target.hp <= 0 ? 26 : 16); i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 65 + Math.random() * 190;
          sim.particles.push({
            x: target.x,
            y: target.y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd - 35,
            size: 4.4 + Math.random() * 5.2,
            color: impactPalette[i % impactPalette.length],
            alpha: 1,
            life: 0.48 + Math.random() * 0.28,
            maxLife: 0.76,
            rotation: Math.random() * Math.PI,
            vRot: (Math.random() - 0.5) * 14,
          });
        }

        if (target.hp > 0) {
          // Boss survives hit: knock slightly upward & keep fighting (no heart restoration)
          mosquitoDamaged = true;
          target.y = Math.max(88, target.y - 18);
          if (target.state === 'diving') {
            target.state = 'roaming';
            target.stateTimer = 1.4;
          }
          sim.floatingTexts.push({
            x: target.x,
            y: target.y - 22,
            vy: -44,
            text: `${target.hp}`,
            color: '#F472B6',
            life: 0.65,
            maxLife: 0.65,
            scale: 1,
          });
        } else {
          sim.mosquitoes.splice(hitMosquitoIdx, 1);
          mosquitoDefeated = true;
          if (isGolden) hitGolden = true;
          if (isBoss) hitBossKill = true;

          // Boss awards +5 bonus points (NEVER restores hearts)
          const points = isBoss ? 5 : isGolden ? 2 : 1;
          sim.combo += 1;
          if (sim.combo > sim.bestCombo) {
            sim.bestCombo = sim.combo;
            setBestCombo(sim.bestCombo);
          }
          sim.zappedCount += 1;
          setZappedCount(sim.zappedCount);

          sim.score += points;
          setScore(sim.score);
          setBestScore(Math.max(sim.bestScore, sim.score));

          const liveTotal = Math.max(totalScoreRef.current, sim.baseTotalAtRunStart + sim.score);
          const nextLevel = getLevelFromScore(liveTotal);
          if (nextLevel > sim.currentLevel) {
            const prevLevel = sim.currentLevel;
            sim.currentLevel = nextLevel;
            setLevel(nextLevel);

            if (gameMode === 'arcade') {
              const prevMaxLives = getMaxLivesForLevel(prevLevel);
              const upgradedMaxLives = getMaxLivesForLevel(nextLevel);
              if (upgradedMaxLives > prevMaxLives) {
                setMaxLives(upgradedMaxLives);
                sim.lives = Math.min(upgradedMaxLives, sim.lives + 1);
                setLives(sim.lives);
              }
            }

            soundEngine.playNewBest();

            sim.floatingTexts.push({
              x: sim.width * 0.5,
              y: Math.max(120, target.y - 42),
              vy: -36,
              text: `LV ${nextLevel}!`,
              color: '#FBBF24',
              life: 1.35,
              maxLife: 1.35,
              scale: 1.35,
            });
          }

          if (sim.score > sim.bestScore && !sim.crossedBestThisRun) {
            sim.crossedBestThisRun = true;
            if (sim.bestScore > 0) {
              soundEngine.playNewBest();
            }
          }

          const label = isBoss ? '+5' : isGolden ? '+2' : '+1';

          sim.floatingTexts.push({
            x: target.x,
            y: target.y - 18,
            vy: -54,
            text: label,
            color: isBoss ? '#F472B6' : isGolden ? '#FACC15' : '#FFFFFF',
            life: isBoss ? 1.05 : 0.75,
            maxLife: isBoss ? 1.05 : 0.75,
            scale: isBoss ? 1.28 : isGolden ? 1.15 : 1,
          });
        }
      }
    }

    sim.shotCooldown = 0.14;
    const dtSinceLastShot = Math.max(0.14, sim.time - sim.lastShotTime);
    sim.lastShotTime = sim.time;
    const shotRateBoost = dtSinceLastShot < 1.5 ? Math.min(1.6, 0.36 / dtSinceLastShot) : 0.35;
    sim.fireMomentum = Math.min(2.0, Math.max(sim.fireMomentum * 0.65, 0) + shotRateBoost);

    // Muzzle burst particles: fiery sparks in Normal mode, white sticky droplets in Chudling mode
    const muzzlePalette = isNormalMode
      ? ['#FEF08A', '#FACC15', '#F97316']
      : ['#FFFFFF', '#F8FAFC', 'rgba(255, 255, 255, 0.88)'];
    for (let i = 0; i < 6; i++) {
      const spread = sim.aimAngle + (Math.random() - 0.5) * 0.55;
      const spd = 90 + Math.random() * 140;
      sim.particles.push({
        x: origin.x,
        y: origin.y,
        vx: Math.sin(spread) * spd,
        vy: -Math.cos(spread) * spd,
        size: 3.6 + Math.random() * 2.8,
        color: muzzlePalette[i % muzzlePalette.length],
        alpha: 1,
        life: 0.24 + Math.random() * 0.12,
        maxLife: 0.36,
        rotation: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 12,
      });
    }

    if (anyHit) {
      if (activatedPowerUp) {
        soundEngine.playPowerUp();
      }
      if (mosquitoDefeated || mosquitoDamaged) {
        soundEngine.playZap(true);
        soundEngine.playHit(sim.combo, hitGolden || hitBossKill);
        soundEngine.playFireHit();
        if (fireModeRef.current === 'thirdLeg' && mosquitoDefeated) {
          soundEngine.playThirdLegHit();
        }
        sim.sleeperMood = 'happy';
        sim.moodTimer = 0.45;
        if (!prefersReducedMotion) {
          sim.shakeTime = hitBossKill ? 0.2 : 0.11;
          sim.shakeIntensity = hitBossKill ? 6 : 3.5;
        }
      }
      if (sim.mosquitoes.length === 0) {
        sim.spawnTimer = Math.min(sim.spawnTimer, 0.25);
      }
    } else {
      const missDx = Math.sin(sim.aimAngle);
      const missDy = -Math.cos(sim.aimAngle);
      sim.combo = 0;
      if (sim.score > 0) {
        sim.score = Math.max(0, sim.score - 1);
        setScore(sim.score);
        setBestScore(Math.max(sim.bestScore, sim.score));
        sim.floatingTexts.push({
          x: origin.x + missDx * 120,
          y: origin.y + missDy * 120,
          vy: -42,
          text: '-1',
          color: '#EF4444',
          life: 0.65,
          maxLife: 0.65,
          scale: 1,
        });
      }
      soundEngine.playZap(false);
      if (fireModeRef.current === 'thirdLeg') {
        soundEngine.playThirdLegMiss();
      }
    }
  }, [gameMode, prefersReducedMotion]);

  // Resize canvas crisply for HiDPI displays
  useEffect(() => {
    const updateSize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      simRef.current.width = rect.width;
      simRef.current.height = rect.height;
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Main 60fps requestAnimationFrame loop
  useEffect(() => {
    let rafId = 0;
    let lastTs = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      const sim = simRef.current;
      const state = gameStateRef.current;
      sim.time += dt;

      // Keyboard continuous aiming
      if (state === 'PLAYING') {
        if (sim.keysPressed.left) {
          sim.aimAngle = Math.max(-1.12, sim.aimAngle - 2.1 * dt);
          sim.isAiming = true;
        }
        if (sim.keysPressed.right) {
          sim.aimAngle = Math.min(1.12, sim.aimAngle + 2.1 * dt);
          sim.isAiming = true;
        }
      }

      if (sim.shotCooldown > 0) {
        sim.shotCooldown = Math.max(0, sim.shotCooldown - dt);
      }

      if (state === 'PLAYING' && sim.tripleShotTimer > 0) {
        sim.tripleShotTimer = Math.max(0, sim.tripleShotTimer - dt);
        const ceilSec = Math.ceil(sim.tripleShotTimer);
        if (ceilSec !== sim.lastTripleDisplaySec) {
          sim.lastTripleDisplaySec = ceilSec;
          setTripleShotSeconds(ceilSec);
        }
      }

      if (state !== 'PAUSED') {
        sim.fireMomentum = Math.max(0, sim.fireMomentum - dt * 0.85);
        const aimBoost = state === 'PLAYING' && sim.isAiming ? 5 : 0;
        const scoreBoost = state === 'PLAYING' ? Math.min(14, sim.score * 0.45) : 0;
        const rubSpeed = 15 + aimBoost + sim.fireMomentum * 22 + scoreBoost;
        sim.rubPhase += dt * rubSpeed;
      }

      if (sim.moodTimer > 0) {
        sim.moodTimer -= dt;
        if (sim.moodTimer <= 0) {
          sim.sleeperMood = sim.isAiming ? 'aiming' : 'idle';
        }
      } else if (state === 'PLAYING') {
        sim.sleeperMood = sim.isAiming ? 'aiming' : 'idle';
      }

      if (sim.shakeTime > 0) {
        sim.shakeTime = Math.max(0, sim.shakeTime - dt);
      }
      if (sim.biteFlashAlpha > 0) {
        sim.biteFlashAlpha = Math.max(0, sim.biteFlashAlpha - dt * 2.4);
      }

      // Ambient Zzz bubbles while idle during gameplay
      if (state === 'PLAYING' && !sim.isAiming && sim.sleeperMood === 'idle') {
        sim.zzzTimer -= dt;
        if (sim.zzzTimer <= 0) {
          sim.zzzTimer = 1.5;
          const sleeper = getSleeperTarget(sim.width, sim.height);
          sim.zzzBubbles.push({
            x: sleeper.x - 16 + (Math.random() - 0.5) * 12,
            y: sleeper.y - 34,
            vy: -26 - Math.random() * 10,
            driftPhase: Math.random() * Math.PI * 2,
            life: 1.8,
            maxLife: 1.8,
            size: 15 + Math.random() * 7,
          });
        }
      }

      for (let i = sim.zzzBubbles.length - 1; i >= 0; i--) {
        const z = sim.zzzBubbles[i];
        z.y += z.vy * dt;
        z.driftPhase += dt * 3;
        z.life -= dt;
        if (z.life <= 0) sim.zzzBubbles.splice(i, 1);
      }

      // Update active gameplay (difficulty ramps continuously with elapsed playTime & score)
      if (state === 'PLAYING') {
        sim.playTime += dt;
        const isNormalMode = fireModeRef.current === 'hand';
        const d = getDifficultyLevel(sim.playTime, sim.score, fireModeRef.current);
        const maxActive = isNormalMode
          ? d >= 4.2
            ? 4
            : d >= 2.6
              ? 3
              : d >= 1.2
                ? 2
                : 1
          : d >= 6.2
            ? 6
            : d >= 4.5
              ? 5
              : d >= 3.0
                ? 4
                : d >= 1.8
                  ? 3
                  : d >= 0.8
                    ? 2
                    : 1;

        // Spawn Boss Mosquito periodically when score reaches milestone
        const hasBossActive = sim.mosquitoes.some((m) => m.kind === 'boss');
        if (sim.score >= sim.nextBossScore && !hasBossActive) {
          spawnMosquito(sim.score, sim.playTime, true);
          sim.nextBossScore = sim.score + 12;
        }

        sim.spawnTimer -= dt;
        if (sim.spawnTimer <= 0 && sim.mosquitoes.length < maxActive) {
          spawnMosquito(sim.score, sim.playTime, false);
          sim.spawnTimer = isNormalMode
            ? Math.max(0.92, 2.1 - d * 0.14)
            : Math.max(0.65, 1.85 - d * 0.16);
        }

        // Spawn Triple Shot power-up periodically
        if (sim.powerUps.length === 0 && sim.tripleShotTimer <= 0) {
          sim.powerUpTimer -= dt;
          if (sim.powerUpTimer <= 0) {
            spawnPowerUp();
            sim.powerUpTimer = 18 + Math.random() * 7;
          }
        }

        for (let i = sim.powerUps.length - 1; i >= 0; i--) {
          const pu = sim.powerUps[i];
          pu.phase += dt * 4.2;
          pu.x += pu.vx * dt;
          pu.y += Math.sin(pu.phase) * 32 * dt;
          if (pu.x < -36 || pu.x > sim.width + 36) {
            sim.powerUps.splice(i, 1);
          }
        }

        const sleeper = getSleeperTarget(sim.width, sim.height);
        const topBound = Math.max(92, sim.height * 0.13);
        const bottomRoamBound = sim.height * 0.53;
        const leftBound = 32;
        const rightBound = sim.width - 32;
        const wobbleAmp = 28 + Math.min(d * 5, 32);
        const shiftRate = 0.9 + Math.min(d * 0.25, 1.6);

        for (let i = sim.mosquitoes.length - 1; i >= 0; i--) {
          const m = sim.mosquitoes[i];
          if (m.hitFlash > 0) {
            m.hitFlash = Math.max(0, m.hitFlash - dt);
          }
          m.wingPhase += dt * (m.state === 'diving' ? 58 : 42);
          m.wobblePhase += dt * m.wobbleSpeed;

          if (m.state === 'roaming') {
            m.x += m.vx * dt;
            m.y += (m.vy + Math.sin(m.wobblePhase) * wobbleAmp) * dt;

            // Gentle mosquito dodging shifts increase gradually over time
            if (Math.random() < dt * shiftRate) {
              const spd = Math.hypot(m.vx, m.vy);
              const shift = (Math.random() - 0.5) * 1.1;
              const ang = Math.atan2(m.vy, m.vx) + shift;
              m.vx = Math.cos(ang) * spd;
              m.vy = Math.sin(ang) * spd;
            }

            // Keep inside upper play zone
            if (m.x < leftBound) {
              m.x = leftBound;
              m.vx = Math.abs(m.vx);
            } else if (m.x > rightBound) {
              m.x = rightBound;
              m.vx = -Math.abs(m.vx);
            }
            if (m.y < topBound) {
              m.y = topBound;
              m.vy = Math.abs(m.vy);
            } else if (m.y > bottomRoamBound) {
              m.y = bottomRoamBound;
              m.vy = -Math.abs(m.vy);
            }

            m.facing = m.vx >= 0 ? -1 : 1;
            m.stateTimer -= dt;

            if (m.stateTimer <= 0) {
              m.state = 'telegraph';
              m.stateTimer = isNormalMode
                ? Math.max(0.58, 0.88 - d * 0.03)
                : Math.max(0.45, 0.72 - d * 0.03);
              m.diveTargetX = sleeper.x + (Math.random() - 0.5) * 28;
              m.diveTargetY = sleeper.y;
              soundEngine.playDiveAlert();
            }
          } else if (m.state === 'telegraph') {
            // Hover and jitter before diving
            m.x += Math.sin(sim.time * 45) * 1.1;
            m.y += Math.cos(sim.time * 40) * 0.9;
            m.facing = m.diveTargetX >= m.x ? -1 : 1;
            m.stateTimer -= dt;
            if (m.stateTimer <= 0) {
              m.state = 'diving';
              const dx = m.diveTargetX - m.x;
              const dy = m.diveTargetY - m.y;
              const dist = Math.hypot(dx, dy) || 1;
              const diveScale = isNormalMode ? 0.78 : 1;
              const diveSpeed =
                (m.kind === 'boss'
                  ? 180 + Math.min(d * 18, 130)
                  : 210 + Math.min(d * 24, 180)) * diveScale;
              m.vx = (dx / dist) * diveSpeed;
              m.vy = (dy / dist) * diveSpeed;
            }
          } else if (m.state === 'diving') {
            m.x += m.vx * dt;
            m.y += m.vy * dt;

            const distToSleeper = Math.hypot(m.x - m.diveTargetX, m.y - m.diveTargetY);
            if (distToSleeper < 24 || m.y >= sleeper.y + 8) {
              // Mosquito bit the sleeper!
              sim.mosquitoes.splice(i, 1);
              sim.lives -= 1;
              sim.combo = 0;
              setLives(sim.lives);

              soundEngine.playBite();
              if (sim.lives <= 0) {
                soundEngine.playDeathSound();
              } else if (fireModeRef.current === 'thirdLeg') {
                soundEngine.playThirdLegBite();
              }
              sim.sleeperMood = 'bitten';
              sim.moodTimer = 0.75;
              sim.biteFlashAlpha = 1;
              if (!prefersReducedMotion) {
                sim.shakeTime = 0.25;
                sim.shakeIntensity = 7;
              }

              sim.floatingTexts.push({
                x: sleeper.x,
                y: sleeper.y - 36,
                vy: -40,
                text: '-1',
                color: '#DC2626',
                life: 0.85,
                maxLife: 0.85,
                scale: 1.1,
              });

              if (sim.lives <= 0) {
                sim.isAiming = false;
                sim.pointerId = null;
                setGameState('GAME_OVER');
                settleCurrentRun(true);
              } else {
                sim.spawnTimer = Math.min(sim.spawnTimer, 0.45);
              }
            }
          }
        }
      }

      // Beams, splats, particles & floating text keep animating cleanly even on Game Over
      if (state !== 'PAUSED') {
        for (let i = sim.beams.length - 1; i >= 0; i--) {
          sim.beams[i].life -= dt;
          if (sim.beams[i].life <= 0) sim.beams.splice(i, 1);
        }

        for (let i = sim.splats.length - 1; i >= 0; i--) {
          sim.splats[i].life -= dt;
          if (sim.splats[i].life <= 0) sim.splats.splice(i, 1);
        }

        for (let i = sim.particles.length - 1; i >= 0; i--) {
          const p = sim.particles[i];
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 320 * dt; // gravity
          p.rotation += p.vRot * dt;
          p.life -= dt;
          p.alpha = Math.max(0, p.life / p.maxLife);
          if (p.life <= 0) sim.particles.splice(i, 1);
        }

        for (let i = sim.floatingTexts.length - 1; i >= 0; i--) {
          const ft = sim.floatingTexts[i];
          ft.y += ft.vy * dt;
          ft.life -= dt;
          if (ft.life <= 0) sim.floatingTexts.splice(i, 1);
        }
      }

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        const liveTotal =
          state === 'PLAYING' || state === 'PAUSED'
            ? Math.max(totalScoreRef.current, sim.baseTotalAtRunStart + sim.score)
            : totalScoreRef.current;
        const liveLevel = getLevelFromScore(liveTotal);
        if (liveLevel !== sim.currentLevel) {
          sim.currentLevel = liveLevel;
          setLevel(liveLevel);
        }
        const origin = getBedOrigin(sim.width, sim.height, fireModeRef.current, liveLevel);
        const shakeMag =
          sim.shakeTime > 0 && !prefersReducedMotion ? sim.shakeIntensity * (sim.shakeTime / 0.2) : 0;
        const shakeX = shakeMag > 0 ? (Math.random() - 0.5) * shakeMag * 2 : 0;
        const shakeY = shakeMag > 0 ? (Math.random() - 0.5) * shakeMag * 2 : 0;

        renderGame({
          ctx,
          width: sim.width,
          height: sim.height,
          time: sim.time,
          gameState: state,
          originX: origin.x,
          originY: origin.y,
          aimAngle: sim.aimAngle,
          isAiming: state === 'PLAYING' && sim.isAiming,
          mosquitoes: sim.mosquitoes,
          powerUps: sim.powerUps,
          beams: sim.beams,
          splats: sim.splats,
          particles: sim.particles,
          floatingTexts: sim.floatingTexts,
          zzzBubbles: sim.zzzBubbles,
          avatarStyle: avatarStyleRef.current,
          fireMode: fireModeRef.current,
          level: liveLevel,
          sleeperMood: sim.sleeperMood,
          customAvatarImg: customAvatarImgRef.current,
          rubPhase: sim.rubPhase,
          fireIntensity: sim.fireMomentum,
          tripleShotTimer: sim.tripleShotTimer,
          shakeX,
          shakeY,
          biteFlashAlpha: sim.biteFlashAlpha,
        });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [prefersReducedMotion, settleCurrentRun, spawnMosquito, spawnPowerUp]);

  // Keyboard support (Left/Right or A/D to aim, Space/Enter to fire, Escape/P to pause)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (leaderboardOpen || cropModalOpen) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        simRef.current.keysPressed.left = true;
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        simRef.current.keysPressed.right = true;
      } else if (e.key === ' ' || e.key === 'Enter') {
        if (gameStateRef.current === 'PLAYING') {
          e.preventDefault();
          fireBeam();
        }
      } else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (gameStateRef.current === 'PLAYING') {
          soundEngine.stopThirdLegEffect();
          setGameState('PAUSED');
        } else if (gameStateRef.current === 'PAUSED') {
          setGameState('PLAYING');
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        simRef.current.keysPressed.left = false;
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        simRef.current.keysPressed.right = false;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [fireBeam, leaderboardOpen, cropModalOpen]);

  // Restore saved custom cropped face image on mount / change
  useEffect(() => {
    if (!customFaceUrl) {
      customAvatarImgRef.current = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      customAvatarImgRef.current = img;
    };
    img.src = customFaceUrl;
  }, [customFaceUrl]);

  const updateAimFromPointer = (clientX: number, clientY: number, isInitialPress: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const sim = simRef.current;
    const origin = getBedOrigin(sim.width, sim.height, fireModeRef.current, sim.currentLevel);

    if (py < origin.y - 36) {
      const dx = px - origin.x;
      const dy = origin.y - py;
      const angle = Math.atan2(dx, Math.max(24, dy));
      sim.aimAngle = Math.max(-1.12, Math.min(1.12, angle));
      sim.dragStartX = px;
      sim.dragStartAngle = sim.aimAngle;
    } else if (isInitialPress) {
      sim.dragStartX = px;
      sim.dragStartAngle = sim.aimAngle;
    } else {
      const deltaX = px - sim.dragStartX;
      const angle = sim.dragStartAngle + deltaX * 0.008;
      sim.aimAngle = Math.max(-1.12, Math.min(1.12, angle));
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gameState !== 'PLAYING') return;
    const sim = simRef.current;
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    const px = rect ? e.clientX - rect.left : e.clientX;
    const py = rect ? e.clientY - rect.top : e.clientY;

    sim.pointerId = e.pointerId;
    sim.isAiming = true;
    sim.dragStartY = py;
    sim.pointerMovedDist = 0;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture is unavailable
    }
    updateAimFromPointer(e.clientX, e.clientY, true);
    if (rect) {
      sim.dragStartX = px;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gameState !== 'PLAYING') return;
    const sim = simRef.current;
    if (!sim.isAiming || sim.pointerId !== e.pointerId) return;
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    if (rect) {
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      sim.pointerMovedDist = Math.max(
        sim.pointerMovedDist,
        Math.hypot(px - sim.dragStartX, py - sim.dragStartY)
      );
    }
    updateAimFromPointer(e.clientX, e.clientY, false);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gameState !== 'PLAYING') return;
    const sim = simRef.current;
    if (!sim.isAiming || sim.pointerId !== e.pointerId) return;
    updateAimFromPointer(e.clientX, e.clientY, false);
    sim.isAiming = false;
    sim.pointerId = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore if pointer already released
    }
    fireBeam();
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    if (sim.pointerId === e.pointerId) {
      sim.isAiming = false;
      sim.pointerId = null;
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundEngine.setMuted(next);
  };

  const selectAvatar = (style: AvatarStyle) => {
    setAvatarStyle(style);
    try {
      localStorage.setItem(AVATAR_STYLE_KEY, style);
    } catch {
      // Ignore storage quota errors
    }
  };

  const selectFireMode = (mode: FireMode) => {
    setFireMode(mode);
    localStorage.setItem(FIRE_MODE_KEY, mode);
    if (mode !== 'thirdLeg') {
      soundEngine.stopThirdLegEffect();
    }
  };

  const closeCropModal = () => {
    uploadSeqRef.current += 1;
    setCropModalOpen(false);
    setCropSourceUrl(null);
    setCropError(null);
  };

  const handleCustomPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const seq = ++uploadSeqRef.current;
    setCropError(null);
    setCropSourceUrl(null);
    setCropModalOpen(true);

    try {
      const normalizedDataUrl = await loadImageForCrop(file);
      if (uploadSeqRef.current !== seq) return;
      setCropSourceUrl(normalizedDataUrl);
    } catch {
      if (uploadSeqRef.current !== seq) return;
      setCropError('Unsupported image');
    }
  };

  const handleCropConfirm = (croppedDataUrl: string) => {
    const img = new Image();
    img.onload = () => {
      customAvatarImgRef.current = img;
      setCustomFaceUrl(croppedDataUrl);
      setHasCustomImage(true);
      selectAvatar('custom');
      try {
        localStorage.setItem(CUSTOM_FACE_STORAGE_KEY, croppedDataUrl);
      } catch {
        // Ignore storage quota errors
      }
      closeCropModal();
    };
    img.src = croppedDataUrl;
  };

  const handleShareScore = async (inviteOnly: boolean = false) => {
    const result = await shareChudlingPong({
      score,
      bestScore,
      zappedCount,
      bestCombo,
      fireMode,
      playerName,
      isGameInviteOnly: inviteOnly,
    });
    if (result === 'shared') {
      setShareLabel('Shared!');
      setTimeout(() => setShareLabel('Share'), 2000);
    } else if (result === 'copied') {
      setShareLabel('Copied!');
      setTimeout(() => setShareLabel('Share'), 2000);
    }
  };

  const handleProfileNameSave = async () => {
    const cleanName = saveLocalPlayerName(playerName);
    setPlayerName(cleanName);
    playerNameRef.current = cleanName;
    setEditingProfileName(false);
    if (bestScore <= 0 && totalScore <= 0) return;
    setProfileBusy(true);
    try {
      const meta = loadBestMeta();
      await submitLeaderboardScore({
        playerName: cleanName,
        score: bestScore,
        totalScore,
        runDelta: 0,
        fireMode: meta.fireMode,
        zappedCount: meta.zappedCount,
        bestCombo: meta.bestCombo,
        allowSameScoreRename: true,
      });
      setLeaderboardEntries(loadCachedLeaderboard());
    } catch {
      setLeaderboardEntries(loadCachedLeaderboard());
    } finally {
      setProfileBusy(false);
    }
  };

  const handleProfileSignIn = async () => {
    setProfileBusy(true);
    try {
      const signedUser = await signInWithGoogle();
      const nextName = saveLocalPlayerName(playerName || signedUser.displayName || 'Player');
      setPlayerName(nextName);
      playerNameRef.current = nextName;
    } catch {
      // Ignore user-cancelled sign-in popup
    } finally {
      setProfileBusy(false);
    }
  };

  const handleProfileSignOut = async () => {
    setProfileBusy(true);
    try {
      await signOutUser();
    } catch {
      // Ignore sign-out errors
    } finally {
      setProfileBusy(false);
    }
  };

  const levelProgress = getLevelProgress(totalScore);

  return (
    <main className="h-dvh w-full overflow-hidden flex items-center justify-center bg-[#020203] md:p-4 select-none">
      {/* Vertical Arcade Playfield Stage */}
      <div
        ref={containerRef}
        className="relative w-full h-full md:h-[min(94dvh,860px)] md:max-w-[480px] md:rounded-[28px] md:shadow-[0_24px_60px_rgba(0,0,0,0.65)] md:border md:border-white/10 overflow-hidden bg-[#050507]"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          className="block w-full h-full touch-none cursor-crosshair"
        />

        {/* Top HUD */}
        <header className="pointer-events-none absolute top-0 left-0 right-0 flex items-start justify-between gap-2 px-3.5 pt-3.5 sm:px-4 sm:pt-4 z-20">
          {/* Top-Left: Compact Gamer Profile on Home Screen OR Back + Hearts in Game */}
          {gameState === 'TITLE_MENU' ? (
            <div className="pointer-events-auto flex items-center gap-2.5 min-w-0 max-w-[calc(100%-56px)] rounded-2xl bg-[#121218]/90 backdrop-blur-md border border-white/14 px-2.5 py-2 shadow-lg">
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={playerName}
                  referrerPolicy="no-referrer"
                  className="w-9 h-9 rounded-xl object-cover border border-white/25 shrink-0"
                />
              ) : customFaceUrl && avatarStyle === 'custom' ? (
                <img
                  src={customFaceUrl}
                  alt={playerName}
                  className="w-9 h-9 rounded-xl object-cover border border-white/25 shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 text-zinc-200 flex items-center justify-center shrink-0">
                  <UserIcon className="w-4 h-4" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                {editingProfileName ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      maxLength={24}
                      autoFocus
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      onBlur={() => {
                        void handleProfileNameSave();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                        } else if (e.key === 'Escape') {
                          setEditingProfileName(false);
                        }
                      }}
                      aria-label="Edit gamer name"
                      className="w-28 sm:w-36 rounded-lg bg-[#09090D] border border-white/35 px-2 py-0.5 text-xs font-bold text-white focus:outline-none focus:border-amber-300"
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        void handleProfileNameSave();
                      }}
                      aria-label="Save name"
                      className="w-6 h-6 rounded-md bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/35 flex items-center justify-center shrink-0"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => setEditingProfileName(true)}
                      aria-label="Edit gamer name"
                      className="inline-flex items-center gap-1 min-w-0 text-left group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white rounded"
                    >
                      <span className="text-xs sm:text-sm font-extrabold text-white truncate max-w-[125px] sm:max-w-[160px]">
                        {playerName}
                      </span>
                      <Pencil className="w-3 h-3 text-zinc-400 group-hover:text-white shrink-0 transition-colors" />
                    </button>
                  </div>
                )}

                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 tabular-nums truncate">
                  <span>Best {bestScore.toLocaleString()}</span>
                  <span aria-hidden="true">·</span>
                  <span>Total {totalScore.toLocaleString()}</span>
                </div>
              </div>

              {!user ? (
                <button
                  type="button"
                  disabled={profileBusy}
                  onClick={() => {
                    void handleProfileSignIn();
                  }}
                  aria-label="Sign in with Google"
                  className="shrink-0 h-8 px-2.5 rounded-xl bg-white/12 hover:bg-white/20 border border-white/20 text-white text-[11px] font-bold inline-flex items-center gap-1 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sign In</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={profileBusy}
                  onClick={() => {
                    void handleProfileSignOut();
                  }}
                  aria-label="Sign out"
                  title="Sign Out"
                  className="shrink-0 w-8 h-8 rounded-xl bg-white/8 hover:bg-white/16 border border-white/15 text-zinc-300 hover:text-white flex items-center justify-center transition-colors disabled:opacity-50"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => resetSimulation(gameMode, false)}
                aria-label="Back to menu"
                className="w-10 h-10 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border-2 border-white/35 active:scale-95 text-white flex items-center justify-center shadow-lg transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <ArrowLeft className="w-5 h-5" strokeWidth={2.5} />
              </button>
              <div
                className="flex items-center gap-1 px-2.5 h-10 rounded-xl bg-zinc-900/80 border border-white/20 shadow-lg"
                aria-label={`Lives remaining: ${lives} of ${maxLives}`}
              >
                {Array.from({ length: maxLives }).map((_, idx) => {
                  const alive = idx < lives;
                  return (
                    <Heart
                      key={idx}
                      className={`w-4 h-4 transition-transform duration-200 ${
                        alive
                          ? 'text-[#EF4444] fill-[#EF4444] scale-100'
                          : 'text-white/25 fill-transparent scale-90'
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Top-Center Score + Level + Best + Triple Shot indicator */}
          {gameState !== 'TITLE_MENU' ? (
            <div className="flex flex-col items-center text-center pt-0.5">
              <span className="font-display text-4xl font-extrabold leading-none tracking-tight text-white tabular-nums">
                {score}
              </span>
              <span className="mt-1 text-[11px] font-bold tracking-wider uppercase text-zinc-300 tabular-nums">
                LV {level} · Best {bestScore}
              </span>
              {gameState === 'PLAYING' && tripleShotSeconds > 0 && (
                <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-sky-500/25 border border-sky-400/50 px-2 py-0.5 text-[11px] font-extrabold text-sky-200 tabular-nums">
                  <Zap className="w-3 h-3 fill-sky-300 text-sky-300" />
                  3X {tripleShotSeconds}s
                </div>
              )}
            </div>
          ) : (
            <div aria-hidden="true" />
          )}

          {/* Top-Right Sound & Pause buttons */}
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? 'Unmute sound' : 'Mute sound'}
              className="w-11 h-11 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border-2 border-white/35 text-white flex items-center justify-center shadow-lg transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            {gameState !== 'TITLE_MENU' && gameState !== 'GAME_OVER' && (
              <button
                type="button"
                onClick={() => {
                  if (gameState === 'PAUSED') {
                    setGameState('PLAYING');
                  } else {
                    soundEngine.stopThirdLegEffect();
                    setGameState('PAUSED');
                  }
                }}
                aria-label={gameState === 'PAUSED' ? 'Resume game' : 'Pause game'}
                className="w-11 h-11 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border-2 border-white/35 active:scale-95 text-white flex items-center justify-center shadow-lg transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {gameState === 'PAUSED' ? (
                  <Play className="w-5 h-5 fill-current" />
                ) : (
                  <Pause className="w-5 h-5 fill-current" />
                )}
              </button>
            )}
          </div>
        </header>

        {/* Bottom-Docked Sleek Main Menu Overlay (Standing Character Showcase Above) */}
        {gameState === 'TITLE_MENU' && (
          <div className="absolute inset-0 flex flex-col items-center justify-end px-3.5 pb-3.5 sm:px-4 sm:pb-4 z-20 pointer-events-none">
            <div className="pointer-events-auto w-full max-w-[396px] rounded-[24px] bg-[#121218]/92 backdrop-blur-md border border-white/14 p-3.5 sm:p-4 shadow-[0_-12px_40px_rgba(0,0,0,0.75)] flex flex-col gap-2.5">
              {/* Title + Clickable Level Progress & Achievements Section */}
              <button
                type="button"
                onClick={() => setAchievementsOpen(true)}
                aria-label={`View level ${levelProgress.level} achievements and rewards`}
                className="w-full text-left flex flex-col gap-1.5 px-1 py-0.5 rounded-xl hover:bg-white/5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h1 className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-white leading-none">
                    Chudling Pong
                  </h1>
                  <span className="text-xs font-extrabold text-amber-300 tabular-nums whitespace-nowrap shrink-0">
                    LV {levelProgress.level} · {levelProgress.achievement.title} ·{' '}
                    {levelProgress.percent}% ›
                  </span>
                </div>

                {/* Level Completion Progress Bar */}
                <div className="flex flex-col gap-1">
                  <div
                    className="h-2 w-full rounded-full bg-white/10 overflow-hidden"
                    role="progressbar"
                    aria-valuenow={levelProgress.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Level ${levelProgress.level} progress`}
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-emerald-400 transition-all duration-300"
                      style={{
                        width: `${levelProgress.percent === 0 ? 0 : Math.max(4, levelProgress.percent)}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 tabular-nums">
                    <span>
                      {levelProgress.totalScore.toLocaleString()} /{' '}
                      {levelProgress.nextTarget.toLocaleString()}
                    </span>
                    <span>
                      {levelProgress.remaining.toLocaleString()} to LV {levelProgress.level + 1}
                    </span>
                  </div>
                </div>
              </button>

              {/* Character Picker (Transforms the standing character above live) */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif,.heic,.heif"
                onChange={handleCustomPhotoUpload}
                className="hidden"
              />
              <div className="grid grid-cols-5 gap-1.5">
                {AVATAR_OPTIONS.map((opt) => {
                  const active = avatarStyle === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => selectAvatar(opt.id)}
                      aria-label={opt.label}
                      aria-pressed={active}
                      className={`min-h-[48px] py-1.5 px-1 rounded-xl border transition-all flex flex-col items-center justify-center gap-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                        active
                          ? 'bg-white/16 border-white/60 text-white shadow-sm'
                          : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                      }`}
                    >
                      <span className="text-base leading-none">{opt.emoji}</span>
                      <span className="text-[10px] font-bold leading-none whitespace-nowrap">
                        {opt.label}
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    if (hasCustomImage && avatarStyle !== 'custom') {
                      selectAvatar('custom');
                    } else {
                      fileInputRef.current?.click();
                    }
                  }}
                  aria-label={
                    hasCustomImage && avatarStyle === 'custom'
                      ? 'Change custom face photo'
                      : 'Upload custom face photo'
                  }
                  aria-pressed={avatarStyle === 'custom' && hasCustomImage}
                  className={`min-h-[48px] py-1.5 px-1 rounded-xl border transition-all flex flex-col items-center justify-center gap-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                    avatarStyle === 'custom' && hasCustomImage
                      ? 'bg-white/16 border-white/60 text-white shadow-sm'
                      : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                  }`}
                >
                  {customFaceUrl ? (
                    <img
                      src={customFaceUrl}
                      alt="Custom face"
                      className="w-5 h-5 rounded-full object-cover border border-white/50 shrink-0"
                    />
                  ) : (
                    <Upload className="w-4 h-4 shrink-0" />
                  )}
                  <span className="text-[10px] font-bold leading-none whitespace-nowrap">
                    {hasCustomImage && avatarStyle === 'custom' ? 'Change' : 'Photo'}
                  </span>
                </button>
              </div>

              {/* 2 Playable Modes: Normal vs Chudling */}
              <div className="grid grid-cols-2 gap-1.5 bg-black/45 p-1 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => selectFireMode('hand')}
                  aria-pressed={fireMode === 'hand'}
                  className={`min-h-[40px] py-2 px-3 rounded-lg text-xs sm:text-sm font-extrabold whitespace-nowrap transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                    fireMode === 'hand'
                      ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-sm'
                      : 'text-zinc-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  Normal
                </button>

                <button
                  type="button"
                  onClick={() => selectFireMode('thirdLeg')}
                  aria-pressed={fireMode === 'thirdLeg'}
                  className={`min-h-[40px] py-2 px-3 rounded-lg text-xs sm:text-sm font-extrabold whitespace-nowrap transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                    fireMode === 'thirdLeg'
                      ? 'bg-white text-[#0E0E13] shadow-sm'
                      : 'text-zinc-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  Chudling
                </button>
              </div>

              {/* Primary CTA */}
              <button
                type="button"
                onClick={startGame}
                className="w-full min-h-[46px] py-3 px-5 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] active:scale-[0.98] text-white font-extrabold text-sm sm:text-base shadow-[0_6px_20px_rgba(239,68,68,0.38)] inline-flex items-center justify-center gap-2 transition-all whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <Play className="w-4 h-4 fill-current shrink-0" />
                Play
              </button>

              {/* Secondary Utility Row */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const cached = loadCachedLeaderboard();
                    if (cached.length > 0 && (!navigator.onLine || leaderboardEntries.length === 0)) {
                      setLeaderboardEntries(cached);
                      setLeaderboardLoading(false);
                      setLeaderboardError(null);
                    }
                    setLeaderboardOpen(true);
                  }}
                  className="min-h-[42px] py-2 px-3 rounded-xl bg-amber-400/14 hover:bg-amber-400/22 border border-amber-400/35 text-amber-200 font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
                  Leaderboard
                </button>

                <button
                  type="button"
                  onClick={() => handleShareScore(true)}
                  className="min-h-[42px] py-2 px-3 rounded-xl bg-white/8 hover:bg-white/14 border border-white/14 text-zinc-100 font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <Share2 className="w-4 h-4 text-zinc-200 shrink-0" />
                  {shareLabel}
                </button>
              </div>

              <PWAInstallButton />
            </div>
          </div>
        )}

        {/* Pause Modal */}
        {gameState === 'PAUSED' && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center px-6 z-30">
            <div className="w-full max-w-[310px] bg-white rounded-2xl p-6 border-2 border-black/15 shadow-2xl flex flex-col gap-3 text-center">
              <h2 className="font-display text-2xl font-extrabold text-[#1E1C21]">Paused</h2>
              <p className="text-sm font-semibold text-[#4B4751] tabular-nums">
                {score} · Best {bestScore}
              </p>
              <button
                type="button"
                onClick={() => setGameState('PLAYING')}
                className="mt-2 w-full py-3 px-5 rounded-xl bg-[#1E1C21] hover:bg-black border-2 border-[#1E1C21] text-white font-extrabold text-sm transition-colors whitespace-nowrap shrink-0 shadow-sm"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={startGame}
                className="w-full py-3 px-5 rounded-xl bg-[#F4F1F0] hover:bg-[#E7E3E1] border-2 border-zinc-300 text-[#1E1C21] font-bold text-sm transition-colors whitespace-nowrap shrink-0"
              >
                Restart
              </button>
              <button
                type="button"
                onClick={() => resetSimulation(gameMode, false)}
                className="w-full py-2.5 px-5 rounded-xl bg-white hover:bg-zinc-100 border-2 border-zinc-300 text-[#1E1C21] font-bold text-sm transition-colors whitespace-nowrap shrink-0"
              >
                Menu
              </button>
            </div>
          </div>
        )}

        {/* Game Over Modal */}
        {gameState === 'GAME_OVER' && (
          <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] flex items-center justify-center px-6 z-30">
            <div className="w-full max-w-[324px] bg-white rounded-2xl p-6 border-2 border-black/15 shadow-2xl flex flex-col items-center text-center">
              <h2 className="font-display text-3xl font-extrabold text-[#1E1C21]">
                Game Over
              </h2>

              <div className="mt-3 flex items-baseline">
                <span className="font-display text-5xl font-extrabold text-[#1E1C21] tabular-nums">
                  {score}
                </span>
              </div>

              <div className="mt-2 flex items-center gap-2 text-xs font-bold text-[#4B4751] tabular-nums">
                <span>{isNewBest ? 'New Best' : `Best ${bestScore}`}</span>
                <span aria-hidden="true">·</span>
                <span>{bestCombo}x</span>
              </div>

              <button
                type="button"
                onClick={startGame}
                className="mt-5 w-full py-3.5 px-6 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] border-2 border-red-700/40 active:scale-[0.98] text-white font-extrabold text-base shadow-[0_6px_18px_rgba(239,68,68,0.32)] inline-flex items-center justify-center gap-2 transition-all whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-4 h-4" />
                Play Again
              </button>

              <div className="mt-2.5 w-full grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleShareScore(false)}
                  className="py-2.5 px-3 rounded-xl bg-[#F4F1F0] hover:bg-[#E7E3E1] border-2 border-zinc-300 text-[#1E1C21] font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  {shareLabel}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const cached = loadCachedLeaderboard();
                    if (cached.length > 0 && (!navigator.onLine || leaderboardEntries.length === 0)) {
                      setLeaderboardEntries(cached);
                      setLeaderboardLoading(false);
                      setLeaderboardError(null);
                    }
                    setLeaderboardOpen(true);
                  }}
                  className="py-2.5 px-3 rounded-xl bg-amber-100 hover:bg-amber-200 border-2 border-amber-300 text-[#1E1C21] font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Trophy className="w-3.5 h-3.5 text-amber-600" />
                  Leaderboard
                </button>
              </div>

              <button
                type="button"
                onClick={() => resetSimulation(gameMode, false)}
                className="mt-2.5 w-full py-2.5 px-4 rounded-xl bg-white hover:bg-zinc-100 border-2 border-zinc-300 text-[#1E1C21] font-bold text-sm transition-colors whitespace-nowrap shrink-0"
              >
                Menu
              </button>
            </div>
          </div>
        )}
      </div>

      <LeaderboardModal
        open={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
        entries={leaderboardEntries}
        loading={leaderboardLoading}
        errorText={leaderboardError}
        user={user}
        playerName={playerName}
        onPlayerNameChange={setPlayerName}
        bestScore={bestScore}
        totalScore={totalScore}
        bestMode={
          gameState === 'GAME_OVER' && score >= bestScore
            ? fireMode
            : loadBestMeta().fireMode
        }
        bestZapped={
          gameState === 'GAME_OVER' && score >= bestScore
            ? zappedCount
            : loadBestMeta().zappedCount
        }
        bestCombo={
          gameState === 'GAME_OVER' && score >= bestScore
            ? bestCombo
            : loadBestMeta().bestCombo
        }
        onEntriesRefresh={() => setLeaderboardEntries(loadCachedLeaderboard())}
      />

      <AchievementsModal
        open={achievementsOpen}
        onClose={() => setAchievementsOpen(false)}
        currentLevel={level}
        totalScore={totalScore}
        onReplayCelebration={(ach) => {
          setAchievementsOpen(false);
          soundEngine.playAchievement();
          setShowcaseAchievement(ach);
        }}
      />

      <AchievementCelebration
        achievement={showcaseAchievement}
        onDismiss={() => setShowcaseAchievement(null)}
      />

      <FaceCropModal
        open={cropModalOpen}
        imageSrc={cropSourceUrl}
        errorMessage={cropError}
        onCancel={closeCropModal}
        onConfirm={handleCropConfirm}
      />
    </main>
  );
}
