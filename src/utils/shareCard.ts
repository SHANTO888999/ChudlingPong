import type { FireMode } from '../game/types';

export interface SharePayloadInput {
  score: number;
  bestScore: number;
  zappedCount: number;
  bestCombo: number;
  fireMode: FireMode;
  playerName: string;
  isGameInviteOnly?: boolean;
}

const PRODUCTION_PLAY_URL = 'https://chudling.web.app';

export function getSharePlayUrl(): string {
  if (typeof window === 'undefined') return PRODUCTION_PLAY_URL;
  const { origin, hostname } = window.location;
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.run.app')
  ) {
    return PRODUCTION_PLAY_URL;
  }
  return origin;
}

export function buildShareInviteText(input: SharePayloadInput): string {
  const modeLabel = input.fireMode === 'hand' ? 'Normal' : 'Chudling';

  if (input.isGameInviteOnly) {
    return input.bestScore > 0 ? `Chudling Pong — Best ${input.bestScore}` : 'Chudling Pong';
  }

  return `Chudling Pong — ${input.score} (${modeLabel})`;
}

export async function shareChudlingPong(
  input: SharePayloadInput
): Promise<'shared' | 'copied' | 'failed'> {
  const playUrl = getSharePlayUrl();
  const inviteText = buildShareInviteText(input);

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title: 'Chudling Pong',
        text: inviteText,
        url: playUrl,
      });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return 'failed';
      }
    }
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(`${inviteText}\n${playUrl}`);
      return 'copied';
    }
  } catch {
    // Clipboard blocked
  }

  return 'failed';
}
