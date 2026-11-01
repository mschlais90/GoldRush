// Background music: alternates between the soundtrack files forever, with the
// on/off toggle and volume persisted to localStorage alongside the save.
import { useSyncExternalStore } from 'react';
import standardUrl from '../../Music/GoldRush_Standard.mp3?url';
import workingUrl from '../../Music/GoldRush_Working.mp3?url';

const SETTINGS_KEY = 'goldrush-settings-v1';
const PLAYLIST = [standardUrl, workingUrl];

export interface MusicSettings {
  enabled: boolean;
  /** 0..1 */
  volume: number;
}

let settings: MusicSettings = loadSettings();
let track = 0;
let audio: HTMLAudioElement | null = null;
const listeners = new Set<() => void>();

function loadSettings(): MusicSettings {
  const def: MusicSettings = { enabled: true, volume: 0.5 };
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    return {
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : def.enabled,
      volume: typeof raw.volume === 'number' ? Math.min(1, Math.max(0, raw.volume)) : def.volume,
    };
  } catch {
    return def;
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable: settings last for this session only */
  }
}

function el(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(PLAYLIST[track]);
    audio.preload = 'auto';
    audio.volume = settings.volume;
    audio.addEventListener('ended', () => {
      track = (track + 1) % PLAYLIST.length;
      audio!.src = PLAYLIST[track];
      play();
    });
  }
  return audio;
}

function play() {
  if (!settings.enabled) return;
  // Browsers reject play() until the page has had a user gesture; unlockOnGesture retries then.
  el().play().catch(() => {});
}

function emit() {
  for (const l of listeners) l();
}

export const music = {
  get settings() {
    return settings;
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  setEnabled(enabled: boolean) {
    settings = { ...settings, enabled };
    if (enabled) play();
    else audio?.pause();
    saveSettings();
    emit();
  },
  setVolume(volume: number) {
    settings = { ...settings, volume };
    if (audio) audio.volume = volume;
    saveSettings();
    emit();
  },
  /** Start playback on the first click/keypress, since autoplay with sound is blocked. */
  unlockOnGesture() {
    const start = () => {
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
      play();
    };
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);
    play();
  },
};

export function useMusicSettings(): MusicSettings {
  return useSyncExternalStore(music.subscribe, () => settings);
}
