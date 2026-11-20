import { useSyncExternalStore } from 'react';
import type { Kingdom } from './types';
import { sampleKingdom } from './factory';

const KEY = 'kingdom-manager/v1';
const UNDO_LIMIT = 40;

interface AppState {
  kingdoms: Kingdom[];
  activeId: string | null;
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as AppState;
      if (Array.isArray(s.kingdoms)) return s;
    }
  } catch {
    /* storage unavailable or corrupt: start fresh */
  }
  const k = sampleKingdom();
  return { kingdoms: [k], activeId: k.id };
}

let state: AppState = load();
let undoStack: { id: string; snapshot: Kingdom; label: string }[] = [];
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore: the app keeps working in memory */
  }
}

function set(next: AppState) {
  state = next;
  persist();
  listeners.forEach((l) => l());
}

export function useApp() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => state,
  );
}

export function useUndo() {
  useApp();
  const active = state.activeId;
  const top = [...undoStack].reverse().find((u) => u.id === active);
  return top?.label ?? null;
}

/** Apply a change to the active kingdom on a fresh copy, remembering the previous version for Undo. */
export function update(label: string, fn: (k: Kingdom) => void) {
  const cur = state.kingdoms.find((k) => k.id === state.activeId);
  if (!cur) return;
  const next = structuredClone(cur);
  fn(next);
  next.updatedAt = Date.now();
  undoStack.push({ id: cur.id, snapshot: cur, label });
  if (undoStack.length > UNDO_LIMIT) undoStack = undoStack.slice(-UNDO_LIMIT);
  set({ ...state, kingdoms: state.kingdoms.map((k) => (k.id === cur.id ? next : k)) });
}

export function undo() {
  const idx = undoStack.map((u) => u.id).lastIndexOf(state.activeId ?? '');
  if (idx < 0) return;
  const [u] = undoStack.splice(idx, 1);
  set({ ...state, kingdoms: state.kingdoms.map((k) => (k.id === u.id ? u.snapshot : k)) });
}

export function addKingdom(k: Kingdom) {
  set({ kingdoms: [...state.kingdoms, k], activeId: k.id });
}

export function selectKingdom(id: string | null) {
  set({ ...state, activeId: id });
}

export function deleteKingdom(id: string) {
  const kingdoms = state.kingdoms.filter((k) => k.id !== id);
  undoStack = undoStack.filter((u) => u.id !== id);
  set({ kingdoms, activeId: state.activeId === id ? kingdoms[0]?.id ?? null : state.activeId });
}

export function exportKingdom(k: Kingdom) {
  return JSON.stringify({ format: 'kingdom-manager', version: 1, kingdom: k }, null, 2);
}

export function importKingdom(json: string): Kingdom {
  const data = JSON.parse(json);
  const k: Kingdom = data?.kingdom ?? data;
  if (!k || typeof k !== 'object' || !Array.isArray(k.settlements) || typeof k.name !== 'string')
    throw new Error('That file is not a Kingdom Manager export.');
  const copy: Kingdom = { ...structuredClone(k), id: Math.random().toString(36).slice(2, 10) };
  addKingdom(copy);
  return copy;
}
