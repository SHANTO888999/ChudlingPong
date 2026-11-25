import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import { Crown, LogIn, LogOut, Trophy, X } from 'lucide-react';
import {
  getActivePlayerUid,
  type LeaderboardRecord,
  saveLocalPlayerName,
  signInWithGoogle,
  signOutUser,
  submitLeaderboardScore,
} from '../firebase';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import type { FireMode } from '../game/types';

interface LeaderboardModalProps {
  open: boolean;
  onClose: () => void;
  entries: LeaderboardRecord[];
  loading: boolean;
  errorText: string | null;
  user: User | null;
  playerName: string;
  onPlayerNameChange: (name: string) => void;
  bestScore: number;
  bestMode: FireMode;
  bestZapped: number;
  bestCombo: number;
  onEntriesRefresh?: () => void;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  open,
  onClose,
  entries,
  loading,
  errorText,
  user,
  playerName,
  onPlayerNameChange,
  bestScore,
  bestMode,
  bestZapped,
  bestCombo,
  onEntriesRefresh,
}) => {
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const isOnline = useOnlineStatus();

  if (!open) return null;

  const activeUid = getActivePlayerUid();

  const handleSignIn = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      const signedUser = await signInWithGoogle();
      const nextName = saveLocalPlayerName(
        playerName || signedUser.displayName || 'Player'
      );
      onPlayerNameChange(nextName);
      setStatusMsg('Signed in with Google. Score auto-synced!');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      await signOutUser();
      setStatusMsg('Signed out (Guest mode active).');
    } catch {
      setStatusMsg('Could not sign out.');
    } finally {
      setBusy(false);
    }
  };

  const handleNicknameAutoSave = async () => {
    const cleanName = saveLocalPlayerName(playerName);
    onPlayerNameChange(cleanName);
    if (bestScore <= 0) return;
    setBusy(true);
    try {
      const res = await submitLeaderboardScore({
        playerName: cleanName,
        score: bestScore,
        fireMode: bestMode,
        zappedCount: bestZapped,
        bestCombo,
        allowSameScoreRename: true,
      });
      if (res.offlineQueued) {
        onEntriesRefresh?.();
        setStatusMsg(`Saved offline (${res.bestScore} pts). Will sync online.`);
      } else if (res.saved) {
        onEntriesRefresh?.();
        setStatusMsg(`Name updated & synced (${res.bestScore} pts).`);
      }
    } catch {
      setStatusMsg('Name saved locally.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-[368px] max-h-[86dvh] rounded-2xl bg-[#121218] border-2 border-white/20 shadow-2xl flex flex-col overflow-hidden text-white">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/15 bg-white/5">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h2 className="font-display text-lg font-extrabold tracking-tight">
              Chudling Pong Top 20
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close leaderboard"
            className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>

        {/* Auto-Synced Nickname & Optional Google Sign-In Bar */}
        <div className="px-4 py-3 bg-white/6 border-b border-white/12 flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-[11px] text-zinc-300 font-semibold">
            <span>
              {!isOnline
                ? 'Offline · Cached Leaderboard'
                : user
                  ? 'Google Account Linked'
                  : 'Guest Mode · Auto-Saved'}
            </span>
            <span className="text-emerald-400 font-bold tabular-nums">
              Best: {bestScore} pts
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              maxLength={24}
              value={playerName}
              onChange={(e) => onPlayerNameChange(e.target.value)}
              onBlur={handleNicknameAutoSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              placeholder="Your nickname"
              className="flex-1 min-w-0 rounded-xl bg-[#09090D] border-2 border-white/20 px-3 py-2 text-xs font-semibold text-white placeholder-zinc-500 focus:outline-none focus:border-white/50"
            />
            {!user ? (
              <button
                type="button"
                disabled={busy}
                onClick={handleSignIn}
                className="shrink-0 px-3 py-2 rounded-xl bg-white hover:bg-zinc-200 text-[#050507] border-2 border-white font-extrabold text-xs inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-sm"
              >
                <LogIn className="w-3.5 h-3.5" />
                Google Login
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={handleSignOut}
                className="shrink-0 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white border-2 border-white/25 font-bold text-xs inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            )}
          </div>

          {statusMsg && (
            <p className="text-[11px] text-amber-300 font-medium">{statusMsg}</p>
          )}
        </div>

        {/* Entries List */}
        <div className="flex-1 overflow-y-auto px-3 py-2.5 space-y-1.5">
          {loading ? (
            <p className="py-8 text-center text-xs text-zinc-400">Loading leaderboard...</p>
          ) : errorText ? (
            <p className="py-8 text-center text-xs text-red-400 px-3">{errorText}</p>
          ) : entries.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-400">
              No scores yet. Play a round to claim #1!
            </p>
          ) : (
            entries.map((entry, index) => {
              const isSelf = activeUid === entry.uid;
              return (
                <div
                  key={entry.uid}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${
                    isSelf
                      ? 'bg-red-500/18 border-red-400/50'
                      : 'bg-white/6 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 text-center text-xs font-extrabold tabular-nums text-zinc-300">
                      {index === 0 ? (
                        <Crown className="w-4 h-4 text-amber-400 mx-auto" />
                      ) : (
                        `#${index + 1}`
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">
                        {entry.playerName}
                        {isSelf ? ' (You)' : ''}
                      </p>
                      <p className="text-[10px] text-zinc-400">
                        {entry.fireMode === 'hand' ? 'Normal' : 'Chudling'} · {entry.zappedCount} zapped
                      </p>
                    </div>
                  </div>
                  <span className="font-display text-base font-extrabold tabular-nums text-white pl-2">
                    {entry.score}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
