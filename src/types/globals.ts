import type { PlayerHUDState, RadarBlip } from '../ui/store/gameStore';

declare global {
  interface Window {
    __kosmLastDmg?: number;
    __kosmLastHit?: number;
    __kosmHUD?: PlayerHUDState;
    __kosmRadarBlips?: RadarBlip[];
  }
}

export {};
