import type { PlayerHUDState } from '../ui/store/gameStore';

// ── Bridge types between game loop (imperative) and React (declarative).
// NOTE: These are a transitional pattern. The long-term plan is to
// make gameStore the single source of truth and remove window globals.
// See ANALYSIS.md Phase 5.7 for the migration plan.

declare global {
  interface Window {
    // HUD real-time state (updated by hudSync, read by HUD.tsx)
    __kosmHUD?: PlayerHUDState;

    // Radar blips
    __kosmRadarBlips?: Array<{
      x: number; y: number; height: number;
      health: number;
      type: 'enemy' | 'station' | 'player';
    }>;

    // Navigator blips (wide-range radar)
    __kosmNavBlips?: Array<{
      x: number; y: number; height: number;
      health: number;
      type: 'enemy' | 'station' | 'player' | 'star' | 'planet' | 'orbit';
      r?: number; // planet/orbit radius
    }>;

    // Target markers (auto-aim)
    __kosmTargets?: Array<{
      screenX: number; screenY: number;
      distance: number;
      type: string;
      health?: number;
    }>;

    // MP entities (from server snapshots)
    __kosmMPEntities?: Array<{
      id: string;
      px: number; py: number; pz: number;
      health: number;
      isNPC: boolean;
      isPlayer: boolean;
      npcType: string;
    }>;

    // Route data (from server)
    __kosmRoutes?: Array<{
      id: string; type: string;
      waypoints: Array<{ x: number; y: number; z: number }>;
    }>;

    // Damage flash timers
    __kosmLastDmg?: number;
    __kosmLastHit?: number;
  }
}

export {};
