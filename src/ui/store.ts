// UI-side game store: holds the mutable GameState, dispatches commands into the
// sim, persists to localStorage, and notifies React subscribers.
import { useSyncExternalStore } from 'react';
import type { Command, CommandResult } from '../sim/commands';
import { applyCommand, dailySeed, migrateSave, newGame, newTutorialGame } from '../sim/game';
import { SAVE_VERSION, type GameState } from '../sim/state';
import { netWorth, annualizedReturn } from '../sim/economy';

const SAVE_KEY = 'goldrush-save-v1';
const SCORES_KEY = 'goldrush-scores-v1';

let state: GameState | null = null;
let version = 0;
const listeners = new Set<() => void>();
let toast: { text: string; kind: 'error' | 'info'; id: number } | null = null;

function emit() {
  version++;
  for (const l of listeners) l();
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}

function saveNow() {
  saveTimer = null;
  if (!state) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: play continues unsaved */
  }
}

export const store = {
  get state() {
    return state;
  },
  get toast() {
    return toast;
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  dispatch(cmd: Command): CommandResult {
    if (!state) return { ok: false, error: 'No game' };
    const wasOver = !!state.gameOver;
    const r = applyCommand(state, cmd);
    if (!r.ok && r.error) toast = { text: r.error, kind: 'error', id: version };
    if (!wasOver && state.gameOver) recordScore(state);
    save();
    emit();
    return r;
  },
  /** Re-render after a pure UI mutation (e.g. marking notices seen). */
  touch() {
    save();
    emit();
  },
  clearToast() {
    toast = null;
    emit();
  },
  newTutorial() {
    state = newTutorialGame();
    save();
    emit();
  },
  newGame(mode: 'standard' | 'daily') {
    const today = new Date();
    const seed = mode === 'daily' ? dailySeed(today) : (Math.random() * 2 ** 31) >>> 0;
    const label = mode === 'daily' ? `Daily ${today.toISOString().slice(0, 10)}` : `Seed ${seed}`;
    state = newGame(seed, mode, label);
    save();
    emit();
  },
  hasSave(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      return JSON.parse(raw).version <= SAVE_VERSION;
    } catch {
      return false;
    }
  },
  load(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = migrateSave(JSON.parse(raw) as GameState);
      if (!s) return false;
      state = s;
      emit();
      return true;
    } catch {
      return false;
    }
  },
  quit() {
    saveNow();
    state = null;
    emit();
  },
};

export function useGame(): GameState | null {
  useSyncExternalStore(store.subscribe, () => version);
  return state;
}

export function useVersion(): number {
  return useSyncExternalStore(store.subscribe, () => version);
}

export interface ScoreEntry {
  label: string;
  netWorth: number;
  annual: number;
  date: string;
  reason: string;
}

function recordScore(s: GameState) {
  try {
    const w = netWorth(s);
    const list = loadScores();
    list.push({
      label: s.label,
      netWorth: w,
      annual: annualizedReturn(s.startCash, w, s.day),
      date: new Date().toISOString().slice(0, 10),
      reason: s.gameOver?.reason ?? '',
    });
    list.sort((a, b) => b.netWorth - a.netWorth);
    localStorage.setItem(SCORES_KEY, JSON.stringify(list.slice(0, 20)));
  } catch {
    /* ignore */
  }
}

export function loadScores(): ScoreEntry[] {
  try {
    return JSON.parse(localStorage.getItem(SCORES_KEY) ?? '[]');
  } catch {
    return [];
  }
}
