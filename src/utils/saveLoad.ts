const SAVE_KEY = 'kosm_save';

export interface SaveData {
  credits: number;
  cargoUsed: number;
  missionProgress: Record<number, { progress: number; completed: boolean }>;
  timestamp: number;
}

export function saveGame(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, timestamp: Date.now() }));
  } catch {
    // localStorage full or unavailable
  }
}

export function loadGame(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SaveData;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}
