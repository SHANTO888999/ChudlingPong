import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type { FireMode } from './game/types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

if (typeof window !== 'undefined') {
  testConnection();
}

export interface LeaderboardRecord {
  uid: string;
  playerName: string;
  score: number;
  totalScore: number;
  fireMode: FireMode;
  zappedCount: number;
  bestCombo: number;
  isGuest?: boolean;
  hasTotalField?: boolean;
  updatedAt?: Timestamp;
}

const PLAYER_NAME_KEY = 'chudling_pong_player_name_v1';
const GUEST_UID_KEY = 'chudling_pong_guest_uid_v1';
const LEADERBOARD_CACHE_KEY = 'chudling_pong_leaderboard_cache_v1';
const PENDING_SYNC_KEY = 'chudling_pong_pending_sync_v1';

interface PendingSyncPayload {
  ownerUid: string;
  playerName: string;
  score: number;
  totalScore: number;
  runDelta: number;
  fireMode: FireMode;
  zappedCount: number;
  bestCombo: number;
  isGuest: boolean;
}

export function loadCachedLeaderboard(): LeaderboardRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LEADERBOARD_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is LeaderboardRecord =>
          Boolean(item) &&
          typeof item.uid === 'string' &&
          item.uid.length > 0 &&
          typeof item.playerName === 'string' &&
          typeof item.score === 'number' &&
          Number.isFinite(item.score)
      )
      .map((item): LeaderboardRecord => {
        const cleanScore = Math.max(0, Math.floor(item.score));
        const cleanTotal =
          typeof item.totalScore === 'number' && Number.isFinite(item.totalScore)
            ? Math.max(cleanScore, Math.floor(item.totalScore))
            : cleanScore;
        return {
          uid: item.uid,
          playerName: sanitizePlayerName(item.playerName),
          score: cleanScore,
          totalScore: cleanTotal,
          fireMode: item.fireMode === 'hand' ? 'hand' : 'thirdLeg',
          zappedCount:
            typeof item.zappedCount === 'number' && Number.isFinite(item.zappedCount)
              ? Math.max(0, Math.floor(item.zappedCount))
              : 0,
          bestCombo:
            typeof item.bestCombo === 'number' && Number.isFinite(item.bestCombo)
              ? Math.max(0, Math.floor(item.bestCombo))
              : 0,
          isGuest: Boolean(item.isGuest),
        };
      })
      .sort((a, b) => b.totalScore - a.totalScore || b.score - a.score);
  } catch {
    return [];
  }
}

export function saveCachedLeaderboard(entries: LeaderboardRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    const slim = entries.slice(0, 20).map((e) => ({
      uid: e.uid,
      playerName: e.playerName,
      score: e.score,
      totalScore: Math.max(e.score, e.totalScore ?? e.score),
      fireMode: e.fireMode,
      zappedCount: e.zappedCount,
      bestCombo: e.bestCombo,
      isGuest: Boolean(e.isGuest),
    }));
    localStorage.setItem(LEADERBOARD_CACHE_KEY, JSON.stringify(slim));
  } catch {
    // Ignore storage quota errors
  }
}

export function mergeLocalEntryIntoCache(entry: {
  uid: string;
  playerName: string;
  score: number;
  totalScore: number;
  fireMode: FireMode;
  zappedCount: number;
  bestCombo: number;
  isGuest?: boolean;
}): LeaderboardRecord[] {
  const existing = loadCachedLeaderboard();
  const idx = existing.findIndex((row) => row.uid === entry.uid);
  const prev = idx >= 0 ? existing[idx] : null;
  const isNewHigh = !prev || entry.score > prev.score;
  const nextBest = prev ? Math.max(prev.score, entry.score) : entry.score;
  const nextTotal = Math.max(nextBest, entry.totalScore, prev ? prev.totalScore : 0);

  const merged: LeaderboardRecord = {
    uid: entry.uid,
    playerName: entry.playerName,
    score: nextBest,
    totalScore: nextTotal,
    fireMode: isNewHigh || !prev ? entry.fireMode : prev.fireMode,
    zappedCount:
      isNewHigh || !prev
        ? entry.zappedCount
        : entry.score === prev.score && entry.zappedCount > 0
          ? entry.zappedCount
          : prev.zappedCount,
    bestCombo:
      isNewHigh || !prev
        ? entry.bestCombo
        : entry.score === prev.score && entry.bestCombo > 0
          ? entry.bestCombo
          : prev.bestCombo,
    isGuest: entry.isGuest,
  };
  const next = [...existing.filter((row) => row.uid !== entry.uid), merged]
    .sort((a, b) => b.totalScore - a.totalScore || b.score - a.score)
    .slice(0, 20);
  saveCachedLeaderboard(next);
  return next;
}

function savePendingOfflineSync(payload: PendingSyncPayload): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = loadPendingOfflineSync();
    const merged: PendingSyncPayload =
      existing && existing.ownerUid === payload.ownerUid
        ? {
            ownerUid: payload.ownerUid,
            playerName: payload.playerName,
            score: Math.max(existing.score, payload.score),
            totalScore: Math.max(existing.totalScore, payload.totalScore),
            runDelta: Math.max(0, existing.runDelta + payload.runDelta),
            fireMode: payload.score >= existing.score ? payload.fireMode : existing.fireMode,
            zappedCount: Math.max(existing.zappedCount, payload.zappedCount),
            bestCombo: Math.max(existing.bestCombo, payload.bestCombo),
            isGuest: payload.isGuest,
          }
        : payload;
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(merged));
  } catch {
    // Ignore storage errors
  }
}

export function loadPendingOfflineSync(): PendingSyncPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingSyncPayload>;
    if (
      typeof parsed.ownerUid !== 'string' ||
      typeof parsed.playerName !== 'string' ||
      typeof parsed.score !== 'number'
    ) {
      return null;
    }
    const cleanScore = Math.max(0, Math.floor(parsed.score));
    return {
      ownerUid: parsed.ownerUid,
      playerName: parsed.playerName,
      score: cleanScore,
      totalScore:
        typeof parsed.totalScore === 'number' && Number.isFinite(parsed.totalScore)
          ? Math.max(cleanScore, Math.floor(parsed.totalScore))
          : cleanScore,
      runDelta:
        typeof parsed.runDelta === 'number' && Number.isFinite(parsed.runDelta)
          ? Math.max(0, Math.floor(parsed.runDelta))
          : 0,
      fireMode: parsed.fireMode === 'hand' ? 'hand' : 'thirdLeg',
      zappedCount: typeof parsed.zappedCount === 'number' ? parsed.zappedCount : 0,
      bestCombo: typeof parsed.bestCombo === 'number' ? parsed.bestCombo : 0,
      isGuest: Boolean(parsed.isGuest),
    };
  } catch {
    return null;
  }
}

function clearPendingOfflineSync(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PENDING_SYNC_KEY);
  } catch {
    // Ignore
  }
}

const RANDOM_PREFIXES = [
  'NightZap',
  'MoshaKing',
  'SilentShot',
  'SleepyPro',
  'DarkHunter',
  'MoonSniper',
  'RapidZap',
  'DreamGuard',
];

function generateRandomAlnum(len: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < len; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

export function getOrCreateGuestId(): string {
  if (typeof window === 'undefined') {
    return 'guest_ServerPreview0001';
  }
  const existing = localStorage.getItem(GUEST_UID_KEY);
  if (existing && /^guest_[a-zA-Z0-9]{16,32}$/.test(existing)) {
    return existing;
  }
  const created = `guest_${generateRandomAlnum(20)}`;
  localStorage.setItem(GUEST_UID_KEY, created);
  return created;
}

export function generateRandomGuestName(): string {
  const prefix = RANDOM_PREFIXES[Math.floor(Math.random() * RANDOM_PREFIXES.length)];
  const num = 100 + Math.floor(Math.random() * 900);
  return `${prefix}${num}`;
}

export function getActivePlayerUid(): string {
  return auth.currentUser ? auth.currentUser.uid : getOrCreateGuestId();
}

// Matches firebase-blueprint.json: ^[a-zA-Z0-9 _\-\.]{1,24}$
export function sanitizePlayerName(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9 _\-.]/g, '').trim().slice(0, 24);
  return cleaned.length > 0 ? cleaned : generateRandomGuestName();
}

export function loadSavedPlayerName(fallbackUser?: User | null): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(PLAYER_NAME_KEY);
    if (stored && stored.trim().length > 0 && stored !== 'Player') {
      return sanitizePlayerName(stored);
    }
  }
  if (fallbackUser?.displayName) {
    const clean = sanitizePlayerName(fallbackUser.displayName);
    if (typeof window !== 'undefined') {
      localStorage.setItem(PLAYER_NAME_KEY, clean);
    }
    return clean;
  }
  const randomName = generateRandomGuestName();
  if (typeof window !== 'undefined') {
    localStorage.setItem(PLAYER_NAME_KEY, randomName);
  }
  return randomName;
}

export function saveLocalPlayerName(name: string): string {
  const sanitized = sanitizePlayerName(name);
  if (typeof window !== 'undefined') {
    localStorage.setItem(PLAYER_NAME_KEY, sanitized);
  }
  return sanitized;
}

export function subscribeAuth(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

export async function signInWithGoogle(): Promise<User> {
  const res = await signInWithPopup(auth, googleProvider);
  return res.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export function subscribeLeaderboard(
  onData: (entries: LeaderboardRecord[]) => void,
  onError?: (err: unknown) => void,
  maxEntries: number = 20
): () => void {
  const boundedLimit = Math.max(1, Math.min(50, Math.floor(maxEntries)));
  const fetchLimit = 50;
  const path = 'leaderboard';

  const qByTotal = query(
    collection(db, path),
    where('totalScore', '>=', 0),
    orderBy('totalScore', 'desc'),
    limit(fetchLimit)
  );
  const qByBest = query(
    collection(db, path),
    where('score', '>=', 0),
    orderBy('score', 'desc'),
    limit(fetchLimit)
  );

  let totalRows: LeaderboardRecord[] = [];
  let bestRows: LeaderboardRecord[] = [];
  let hasTotalSnapshot = false;
  let hasBestSnapshot = false;
  let totalError: unknown = null;
  let bestError: unknown = null;

  const mapDoc = (d: { id: string; data: () => unknown }): LeaderboardRecord => {
    const raw = d.data() as Partial<LeaderboardRecord>;
    const cleanScore = typeof raw.score === 'number' ? Math.max(0, Math.floor(raw.score)) : 0;
    const cleanTotal =
      typeof raw.totalScore === 'number'
        ? Math.max(cleanScore, Math.floor(raw.totalScore))
        : cleanScore;
    return {
      uid: raw.uid || d.id,
      playerName: sanitizePlayerName(raw.playerName || 'Player'),
      score: cleanScore,
      totalScore: cleanTotal,
      fireMode: raw.fireMode === 'hand' ? 'hand' : 'thirdLeg',
      zappedCount: typeof raw.zappedCount === 'number' ? raw.zappedCount : 0,
      bestCombo: typeof raw.bestCombo === 'number' ? raw.bestCombo : 0,
      isGuest: Boolean(raw.isGuest),
      hasTotalField: typeof raw.totalScore === 'number',
      updatedAt: raw.updatedAt,
    };
  };

  const emitMerged = () => {
    if (!hasTotalSnapshot && !hasBestSnapshot) return;

    const mergedMap = new Map<string, LeaderboardRecord>();
    for (const row of bestRows) {
      mergedMap.set(row.uid, row);
    }
    for (const row of totalRows) {
      const prev = mergedMap.get(row.uid);
      if (!prev || row.totalScore >= prev.totalScore || row.score >= prev.score) {
        mergedMap.set(row.uid, {
          ...prev,
          ...row,
          score: Math.max(prev ? prev.score : 0, row.score),
          totalScore: Math.max(prev ? prev.totalScore : 0, row.totalScore),
        });
      }
    }

    const pending = loadPendingOfflineSync();
    if (pending) {
      const existing = mergedMap.get(pending.ownerUid);
      if (existing) {
        const nextBest = Math.max(existing.score, pending.score);
        const nextTotal = Math.max(
          nextBest,
          pending.totalScore,
          existing.totalScore + pending.runDelta
        );
        if (nextTotal > existing.totalScore || nextBest > existing.score) {
          mergedMap.set(pending.ownerUid, {
            ...existing,
            ...pending,
            uid: pending.ownerUid,
            score: nextBest,
            totalScore: nextTotal,
          });
        }
      } else {
        mergedMap.set(pending.ownerUid, { ...pending, uid: pending.ownerUid });
      }
    }

    const combined = Array.from(mergedMap.values())
      .sort((a, b) => b.totalScore - a.totalScore || b.score - a.score)
      .slice(0, boundedLimit);

    saveCachedLeaderboard(combined);
    onData(combined);
  };

  const handleQueryError = (error: unknown, source: 'total' | 'best') => {
    if (source === 'total') {
      totalError = error;
    } else {
      bestError = error;
    }
    try {
      handleFirestoreError(error, OperationType.LIST, path);
    } catch (wrapped) {
      if (onError && totalError && bestError) {
        onError(wrapped);
      } else if (onError && source === 'best' && !hasTotalSnapshot && !hasBestSnapshot) {
        onError(wrapped);
      }
    }
  };

  const unsubTotal = onSnapshot(
    qByTotal,
    (snapshot) => {
      totalRows = snapshot.docs.map(mapDoc);
      hasTotalSnapshot = true;
      totalError = null;
      emitMerged();
    },
    (error) => {
      handleQueryError(error, 'total');
    }
  );

  const unsubBest = onSnapshot(
    qByBest,
    (snapshot) => {
      bestRows = snapshot.docs.map(mapDoc);
      hasBestSnapshot = true;
      bestError = null;
      emitMerged();
    },
    (error) => {
      handleQueryError(error, 'best');
    }
  );

  return () => {
    unsubTotal();
    unsubBest();
  };
}

export async function fetchUserCloudScore(uid: string): Promise<LeaderboardRecord | null> {
  const path = `leaderboard/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'leaderboard', uid));
    if (!snap.exists()) return null;
    const raw = snap.data() as Partial<LeaderboardRecord>;
    const cleanScore = typeof raw.score === 'number' ? Math.max(0, Math.floor(raw.score)) : 0;
    return {
      uid: raw.uid || snap.id,
      playerName: sanitizePlayerName(raw.playerName || 'Player'),
      score: cleanScore,
      totalScore:
        typeof raw.totalScore === 'number'
          ? Math.max(cleanScore, Math.floor(raw.totalScore))
          : cleanScore,
      fireMode: raw.fireMode === 'hand' ? 'hand' : 'thirdLeg',
      zappedCount: typeof raw.zappedCount === 'number' ? raw.zappedCount : 0,
      bestCombo: typeof raw.bestCombo === 'number' ? raw.bestCombo : 0,
      isGuest: Boolean(raw.isGuest),
      hasTotalField: typeof raw.totalScore === 'number',
      updatedAt: raw.updatedAt,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function submitLeaderboardScore(params: {
  playerName: string;
  score: number;
  totalScore: number;
  runDelta?: number;
  fireMode: FireMode;
  zappedCount: number;
  bestCombo: number;
  allowSameScoreRename?: boolean;
}): Promise<{
  saved: boolean;
  bestScore: number;
  totalScore: number;
  reason?: string;
  offlineQueued?: boolean;
}> {
  const user = auth.currentUser;
  const isGuest = !user;
  const ownerUid = user ? user.uid : getOrCreateGuestId();

  const rawScore = Number.isFinite(params.score) ? Math.floor(params.score) : 0;
  const rawTotal = Number.isFinite(params.totalScore) ? Math.floor(params.totalScore) : rawScore;
  const rawDelta =
    typeof params.runDelta === 'number' && Number.isFinite(params.runDelta)
      ? Math.floor(params.runDelta)
      : 0;
  const rawZapped = Number.isFinite(params.zappedCount) ? Math.floor(params.zappedCount) : 0;
  const rawCombo = Number.isFinite(params.bestCombo) ? Math.floor(params.bestCombo) : 0;

  const clampedScore = Math.max(0, Math.min(100000, rawScore));
  const clampedDelta = Math.max(0, Math.min(100000, rawDelta));
  const clampedTotal = Math.max(clampedScore, Math.min(10000000, rawTotal));
  const clampedZapped = Math.max(0, Math.min(100000, rawZapped));
  const clampedCombo = Math.max(0, Math.min(10000, rawCombo));
  const safeName = sanitizePlayerName(params.playerName);
  const safeMode: FireMode = params.fireMode === 'hand' ? 'hand' : 'thirdLeg';

  mergeLocalEntryIntoCache({
    uid: ownerUid,
    playerName: safeName,
    score: clampedScore,
    totalScore: clampedTotal,
    fireMode: safeMode,
    zappedCount: clampedZapped,
    bestCombo: clampedCombo,
    isGuest,
  });

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    savePendingOfflineSync({
      ownerUid,
      playerName: safeName,
      score: clampedScore,
      totalScore: clampedTotal,
      runDelta: clampedDelta,
      fireMode: safeMode,
      zappedCount: clampedZapped,
      bestCombo: clampedCombo,
      isGuest,
    });
    return {
      saved: true,
      bestScore: clampedScore,
      totalScore: clampedTotal,
      offlineQueued: true,
    };
  }

  const entryPath = `leaderboard/${ownerUid}`;
  const docRef = doc(db, 'leaderboard', ownerUid);

  let existingScore = -1;
  let existingTotal = 0;
  let existingHasTotalField = false;
  let existingZapped = 0;
  let existingCombo = 0;
  let existingMode: FireMode = safeMode;
  try {
    const existingSnap = await getDoc(docRef);
    if (existingSnap.exists()) {
      const existingData = existingSnap.data() as Partial<LeaderboardRecord>;
      if (typeof existingData.score === 'number') {
        existingScore = existingData.score;
      }
      if (typeof existingData.totalScore === 'number') {
        existingTotal = existingData.totalScore;
        existingHasTotalField = true;
      } else if (existingScore >= 0) {
        existingTotal = existingScore;
      }
      if (typeof existingData.zappedCount === 'number') {
        existingZapped = existingData.zappedCount;
      }
      if (typeof existingData.bestCombo === 'number') {
        existingCombo = existingData.bestCombo;
      }
      if (existingData.fireMode === 'hand' || existingData.fireMode === 'thirdLeg') {
        existingMode = existingData.fireMode;
      }
    }
  } catch (error) {
    savePendingOfflineSync({
      ownerUid,
      playerName: safeName,
      score: clampedScore,
      totalScore: clampedTotal,
      runDelta: clampedDelta,
      fireMode: safeMode,
      zappedCount: clampedZapped,
      bestCombo: clampedCombo,
      isGuest,
    });
    handleFirestoreError(error, OperationType.GET, entryPath);
  }

  const nextBest = Math.max(0, existingScore, clampedScore);
  const nextTotal = Math.min(
    10000000,
    Math.max(nextBest, clampedTotal, existingTotal + clampedDelta)
  );

  const nothingNewToSave =
    existingScore >= 0 &&
    existingHasTotalField &&
    nextBest <= existingScore &&
    nextTotal <= existingTotal &&
    !params.allowSameScoreRename;

  if (nothingNewToSave) {
    clearPendingOfflineSync();
    return {
      saved: false,
      bestScore: existingScore,
      totalScore: existingTotal,
      reason: 'already_synced',
    };
  }

  const isHigherBest = existingScore < 0 || clampedScore > existingScore;
  const payload = {
    uid: ownerUid,
    playerName: safeName,
    score: nextBest,
    totalScore: nextTotal,
    fireMode: isHigherBest ? safeMode : existingMode,
    zappedCount: isHigherBest
      ? clampedZapped
      : clampedZapped > 0
        ? clampedZapped
        : existingZapped,
    bestCombo: isHigherBest
      ? clampedCombo
      : clampedCombo > 0
        ? clampedCombo
        : existingCombo,
    isGuest,
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(docRef, payload);
    clearPendingOfflineSync();
    mergeLocalEntryIntoCache({
      uid: ownerUid,
      playerName: safeName,
      score: nextBest,
      totalScore: nextTotal,
      fireMode: payload.fireMode,
      zappedCount: payload.zappedCount,
      bestCombo: payload.bestCombo,
      isGuest,
    });
    return { saved: true, bestScore: nextBest, totalScore: nextTotal };
  } catch (error) {
    savePendingOfflineSync({
      ownerUid,
      playerName: safeName,
      score: nextBest,
      totalScore: nextTotal,
      runDelta: clampedDelta,
      fireMode: safeMode,
      zappedCount: clampedZapped,
      bestCombo: clampedCombo,
      isGuest,
    });
    handleFirestoreError(
      error,
      existingScore >= 0 ? OperationType.UPDATE : OperationType.CREATE,
      entryPath
    );
  }
}

export async function flushPendingOfflineSync(): Promise<{
  synced: boolean;
  bestScore?: number;
  totalScore?: number;
}> {
  const pending = loadPendingOfflineSync();
  if (!pending) return { synced: false };
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { synced: false };
  }
  try {
    const res = await submitLeaderboardScore({
      playerName: pending.playerName,
      score: pending.score,
      totalScore: pending.totalScore,
      runDelta: pending.runDelta,
      fireMode: pending.fireMode,
      zappedCount: pending.zappedCount,
      bestCombo: pending.bestCombo,
      allowSameScoreRename: true,
    });
    if (res.saved && !res.offlineQueued) {
      clearPendingOfflineSync();
      return { synced: true, bestScore: res.bestScore, totalScore: res.totalScore };
    }
    if (res.reason === 'already_synced') {
      clearPendingOfflineSync();
    }
    return { synced: false };
  } catch {
    return { synced: false };
  }
}
