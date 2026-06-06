import { useSyncExternalStore } from 'react';
import type { Mission } from '../../gameplay/MissionSystem';
import { UPGRADES } from '../../data/upgrades';

export interface PlayerHUDState {
  speed: number; throttle: number; boostEnergy: number;
  shield: number; hull: number; flightMode: string;
  distanceToStar: number; starName: string; fps: number;
  cargoUsed: number; cargoMax: number;
  targetDist: number; targetHealth: number;
}
export interface RadarBlip {
  x: number; y: number; height: number; health: number; type: 'enemy' | 'station';
}
export interface TradeItem {
  id: string; name: string; price: number; playerQty: number; stationQty: number;
}

interface State {
  player: PlayerHUDState;
  hudVisible: boolean;
  showRadar: boolean;
  radarBlips: RadarBlip[];
  tradeOpen: boolean;
  tradeGoods: TradeItem[];
  playerCredits: number;
  cargoUsed: number;
  cargoMax: number;
  missions: Mission[];
  missionsTab: 'trade' | 'missions';
  upgrades: Record<string, number>; // upgrade id → level
  stationTab: 'trade' | 'missions' | 'upgrades';
}

type Listener = () => void;

function createSimpleStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    getState: () => state,
    setState: (partial: Partial<T>) => {
      state = { ...state, ...partial };
      listeners.forEach(l => l());
    },
    updateState: (fn: (s: T) => T) => {
      state = fn(state);
      listeners.forEach(l => l());
    },
    subscribe: (l: Listener) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

const store = createSimpleStore<State>({
  player: { speed: 0, throttle: 0, boostEnergy: 100, shield: 100, hull: 100, flightMode: 'flight_assist', distanceToStar: 0, starName: 'Нова', fps: 60, cargoUsed: 0, cargoMax: 20, targetDist: 0, targetHealth: 0 },
  hudVisible: true, showRadar: true, radarBlips: [],
  tradeOpen: false, tradeGoods: [], playerCredits: 1000, cargoUsed: 0, cargoMax: 20,
  missions: [], missionsTab: 'trade', stationTab: 'trade',
  upgrades: Object.fromEntries(UPGRADES.map(u => [u.id, 1])),
  reputation: { federation: 0, miners: 0, traders: 0, pirates: -20 },
  factionLog: [],
  storyStep: 1,
  lastDamageTime: 0, // 1-4=active story mission
});

// React hook
export function useGameStore<R>(selector: (s: State) => R): R {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}

// Direct access (for game loop)
export const gameState = {
  get player() { return store.getState().player; },
  set player(p: PlayerHUDState) { store.setState({ player: p }); },
  get radarBlips() { return store.getState().radarBlips; },
  set radarBlips(b: RadarBlip[]) { store.setState({ radarBlips: b }); },
  get tradeOpen() { return store.getState().tradeOpen; },
  get playerCredits() { return store.getState().playerCredits; },
  set playerCredits(v: number) { store.setState({ playerCredits: v }); },
  get cargoUsed() { return store.getState().cargoUsed; },
  set cargoUsed(v: number) { store.setState({ cargoUsed: v }); },
  get cargoMax() { return store.getState().cargoMax; },
  get tradeGoods() { return store.getState().tradeGoods; },
  get missions() { return store.getState().missions; },
  get missionsTab() { return store.getState().missionsTab; },
  get hudVisible() { return store.getState().hudVisible; },
  get showRadar() { return store.getState().showRadar; },

  updatePlayer(data: Partial<PlayerHUDState>) {
    const s = store.getState();
    store.setState({ player: { ...s.player, ...data } });
  },
  setRadarBlips(blips: RadarBlip[]) { store.setState({ radarBlips: blips }); },
  toggleHUD() { store.setState({ hudVisible: !store.getState().hudVisible }); },
  toggleRadar() { store.setState({ showRadar: !store.getState().showRadar }); },
  openTrade(goods: TradeItem[]) { store.setState({ tradeOpen: true, tradeGoods: goods }); },
  closeTrade() { store.setState({ tradeOpen: false }); },
  buyItem(id: string, qty: number) {
    const s = store.getState();
    const goods = s.tradeGoods.map(g => {
      if (g.id !== id) return g;
      if (g.stationQty >= qty && s.playerCredits >= g.price * qty && s.cargoUsed + qty <= s.cargoMax) {
        return { ...g, playerQty: g.playerQty + qty, stationQty: g.stationQty - qty };
      }
      return g;
    });
    const item = s.tradeGoods.find(g => g.id === id);
    if (!item || item.stationQty < qty || s.playerCredits < item.price * qty || s.cargoUsed + qty > s.cargoMax) return;
    store.setState({ tradeGoods: goods, playerCredits: s.playerCredits - item.price * qty, cargoUsed: s.cargoUsed + qty });
  },
  sellItem(id: string, qty: number) {
    const s = store.getState();
    const goods = s.tradeGoods.map(g => {
      if (g.id !== id) return g;
      if (g.playerQty >= qty) return { ...g, playerQty: g.playerQty - qty, stationQty: g.stationQty + qty };
      return g;
    });
    const item = s.tradeGoods.find(g => g.id === id);
    if (!item || item.playerQty < qty) return;
    store.setState({ tradeGoods: goods, playerCredits: s.playerCredits + Math.floor(item.price * qty * 0.8), cargoUsed: Math.max(0, s.cargoUsed - qty) });
  },
  setMissions(missions: Mission[]) { store.setState({ missions }); },
  updateMissionProgress(id: number, progress: number) {
    store.updateState(s => ({ ...s, missions: s.missions.map(m => m.id === id ? { ...m, progress } : m) }));
  },
  completeMission(id: number) {
    store.updateState(s => {
      const reward = s.missions.find(m => m.id === id)?.reward || 0;
      return {
        ...s,
        missions: s.missions.map(m => m.id === id && !m.completed ? { ...m, completed: true } : m),
        playerCredits: s.playerCredits + reward,
      };
    });
  },
  switchTab(tab: 'trade' | 'missions') { store.setState({ missionsTab: tab }); },
  setStationTab(tab: 'trade' | 'missions' | 'upgrades') { store.setState({ stationTab: tab }); },
  buyUpgrade(id: string) {
    const s = store.getState();
    const def = UPGRADES.find(u => u.id === id);
    if (!def) return;
    const currentLvl = s.upgrades[id] || 1;
    const nextLvl = def.levels.find(l => l.level === currentLvl + 1);
    if (!nextLvl || s.playerCredits < nextLvl.cost) return;
    store.updateState(st => ({
      ...st,
      playerCredits: st.playerCredits - nextLvl.cost,
      upgrades: { ...st.upgrades, [id]: currentLvl + 1 },
    }));
  },
  getUpgradeLevel(id: string): number { return store.getState().upgrades[id] || 1; },
  changeReputation(factionId: string, delta: number) {
    store.updateState(s => {
      const current = s.reputation[factionId] || 0;
      const rep = { ...s.reputation, [factionId]: Math.max(-100, Math.min(100, current + delta)) };
      const log = [...s.factionLog, `${factionId}: ${delta > 0 ? '+' : ''}${delta}`].slice(-5);
      return { ...s, reputation: rep, factionLog: log };
    });
  },
  flashDamage() { store.setState({ player: { ...store.getState().player, shield: store.getState().player.shield, hull: store.getState().player.hull } }); },
  getReputation(factionId: string): number { return store.getState().reputation[factionId] || 0; },
  get lastDamageTime() { return store.getState().lastDamageTime || 0; },
  set lastDamageTime(v: number) { store.setState({ lastDamageTime: v }); },
  mapData: null as any,
  showMap: false,
  toggleMap() { const s = store.getState(); store.setState({ showMap: !s.showMap }); },
  setMapData(d: any) { store.setState({ mapData: d }); },
  getStoryStep(): number { return store.getState().storyStep || 0; },
  advanceStory() {
    store.updateState(s => ({ ...s, storyStep: Math.min(4, (s.storyStep || 0) + 1) }));
  },
  loadProgress(credits: number, cargoUsed: number, mp: Record<number, { progress: number; completed: boolean }>) {
    store.updateState(s => ({
      ...s,
      playerCredits: credits,
      cargoUsed,
      missions: s.missions.map(m => {
        const saved = mp[m.id];
        if (saved) return { ...m, progress: saved.progress, completed: saved.completed };
        return m;
      }),
    }));
  },
};
