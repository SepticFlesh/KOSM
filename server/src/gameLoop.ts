import { Vector3, Quaternion } from 'three';
import { ShipEntity, DEFAULT_CONFIG } from './entities/ShipEntity.js';
import type { PlayerSession } from './wsServer.js';
import type { WorldSnapshot, EntitySnapshot, InputPayload, ServerMessage } from './protocol/messages.js';

const TICK_RATE = 20;
const TICK_DT = 1 / TICK_RATE;

interface PlayerEntry {
  session: PlayerSession;
  ship: ShipEntity;
  currentSystem: number;
  inputBuffer: InputPayload[];
  lastInputTick: number;
}

interface NPCEntry {
  id: string;
  ship: ShipEntity;
  systemSeed: number;
  aiState: 'patrol' | 'chase' | 'attack';
  aiTimer: number;
  patrolTarget: Vector3;
  orbitRadius: number; // planet orbit this pirate guards
}

export class GameLoop {
  private players = new Map<string, PlayerEntry>();
  private npcs = new Map<string, NPCEntry>();
  private tick = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private broadcastFn: ((msg: ServerMessage) => void) | null = null;
  private onKillFn: ((playerId: string, killCount: number) => void) | null = null;
  private onTradeFn: ((playerId: string) => void) | null = null;

  setBroadcast(fn: (msg: ServerMessage) => void): void { this.broadcastFn = fn; }
  onKill(fn: (playerId: string, killCount: number) => void): void { this.onKillFn = fn; }
  onTradeRequest(fn: (playerId: string) => void): void { this.onTradeFn = fn; }

  getPlayerSystem(playerId: string): number {
    return this.players.get(playerId)?.currentSystem || 0;
  }

  playerCount(): number {
    return this.players.size;
  }

  addPlayer(session: PlayerSession): void {
    const ship = new ShipEntity(DEFAULT_CONFIG);
    ship.playerControlled = true; // rotation is client-authoritative
    ship.reset(new Vector3(1600, 80, -400));
    this.players.set(session.playerId, {
      session,
      ship,
      currentSystem: 0,
      inputBuffer: [],
      lastInputTick: 0,
    });
    console.log(`[GameLoop] Player joined: ${session.username} (${session.playerId})`);
  }

  removePlayer(playerId: string): void {
    this.players.delete(playerId);
    console.log(`[GameLoop] Player left: ${playerId}`);
  }

  /** Ray-vs-sphere hit test for bolt-based combat */
  handleFireBolt(session: PlayerSession, payload: { pos: {x:number;y:number;z:number}; dir: {x:number;y:number;z:number} }): void {
    const entry = this.players.get(session.playerId);
    if (!entry) return;
    const origin = new Vector3(payload.pos.x, payload.pos.y, payload.pos.z);
    const dir = new Vector3(payload.dir.x, payload.dir.y, payload.dir.z).normalize();
    const BOLT_RANGE = 1000;
    const HIT_RADIUS = 5;

    let bestDist = Infinity;
    let bestNpc: NPCEntry | null = null;

    for (const [, npc] of this.npcs) {
      if (npc.systemSeed !== entry.currentSystem) continue;
      if ((npc as any)._dead) continue;
      const npcPos = npc.ship.state.position;
      // Ray-sphere intersection
      const toNpc = npcPos.clone().sub(origin);
      const tca = toNpc.dot(dir);
      if (tca < 0 || tca > BOLT_RANGE) continue; // behind or beyond range
      const d2 = toNpc.dot(toNpc) - tca * tca;
      if (d2 > HIT_RADIUS * HIT_RADIUS) continue; // miss
      if (tca < bestDist) { bestDist = tca; bestNpc = npc; }
    }

    if (bestNpc) {
      bestNpc.ship.state.health -= 10;
      if (bestNpc.ship.state.health <= 0 && !(bestNpc as any)._dead) {
        (bestNpc as any)._dead = true;
        bestNpc.ship.state.health = 0;
        // Hide after 500ms (client sees death + explosion)
        const deadPos = bestNpc.ship.state.position.clone();
        setTimeout(() => { bestNpc!.ship.state.position.set(0, -99999, 0); }, 500);
        // Respawn near same planet orbit after 5 seconds
        const orbitR = bestNpc.orbitRadius;
        setTimeout(() => {
          const a = Math.random() * Math.PI * 2;
          const r = orbitR + (Math.random() - 0.5) * 10000;
          bestNpc!.ship.reset(new Vector3(
            Math.cos(a) * r,
            (Math.random() - 0.5) * 5000,
            Math.sin(a) * r,
          ));
          (bestNpc as any)._dead = false;
        }, 5000);
        if (this.onKillFn) this.onKillFn(session.playerId, 1);
      }
    }
  }

  handleInput(session: PlayerSession, payload: InputPayload): void {
    const entry = this.players.get(session.playerId);
    if (!entry) return;
    // Apply fire immediately (don't let regular inputs overwrite it)
    if (payload.fire) {
      entry.ship.inputFire = true;
      setTimeout(() => { entry.ship.inputFire = false; }, 200);
    }
    entry.inputBuffer.push(payload);
    if (entry.inputBuffer.length > 5) entry.inputBuffer.shift();
  }

  handleJumpRequest(session: PlayerSession, targetSystem: number): void {
    const entry = this.players.get(session.playerId);
    if (!entry) return;
    entry.currentSystem = targetSystem;
    entry.ship.reset(new Vector3(600, 250, -800));
    if (this.broadcastFn) {
      this.broadcastFn({
        type: 'system_switch',
        payload: {
          systemSeed: targetSystem,
          position: { x: 600, y: 250, z: -800 },
        },
      });
    }
  }

  /** Simple seeded RNG matching client StarSystem planet generation */
  private generatePlanetOrbits(systemSeed: number): number[] {
    // Mulberry32 PRNG (same as client)
    let s = systemSeed;
    const next = (): number => {
      s |= 0; s = s + 0x6D2B79F5 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) | 0;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    const count = 5 + Math.floor(next() * 6); // 5-10 planets
    const orbits: number[] = [];
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      orbits.push(80000 + Math.pow(t, 1.5) * 500000);
    }
    return orbits;
  }

  initNPCs(): void {
    let npcIdx = 0;
    // Generate planet orbits matching client StarSystem
    const orbits = this.generatePlanetOrbits(0);
    for (const orbitRadius of orbits) {
      // Spawn 5 pirates per planet
      for (let p = 0; p < 5; p++) {
        const id = `npc_${npcIdx++}`;
        const ship = new ShipEntity({
          thrust: 250,
          rotationalSpeed: 5.0,
          maxSpeedAssist: 250,
        });
        // Place pirate near the planet's orbit
        const orbitAngle = (p / 5) * Math.PI * 2 + Math.random() * 0.5;
        const radialOffset = (Math.random() - 0.5) * 10000;
        const r = orbitRadius + radialOffset;
        const x = Math.cos(orbitAngle) * r;
        const z = Math.sin(orbitAngle) * r;
        const y = (Math.random() - 0.5) * 5000;
        ship.reset(new Vector3(x, y, z));
        this.npcs.set(id, {
          id,
          ship,
          systemSeed: 0,
          aiState: 'patrol',
          aiTimer: 4 + Math.random() * 6,
          orbitRadius,
          patrolTarget: new Vector3(
            x + (Math.random() - 0.5) * 20000,
            y + (Math.random() - 0.5) * 10000,
            z + (Math.random() - 0.5) * 20000,
          ),
        });
      }
    }
    console.log(`[GameLoop] Spawned ${this.npcs.size} pirates across ${orbits.length} planets`);
  }

  start(): void {
    this.initNPCs();
    this.timer = setInterval(() => this.tickLoop(), TICK_DT * 1000);
    console.log(`[GameLoop] Started at ${TICK_RATE}Hz`);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private tickLoop(): void {
    this.tick++;

    // 1. Process player inputs
    for (const [, entry] of this.players) {
      const input = entry.inputBuffer.length > 0
        ? entry.inputBuffer[entry.inputBuffer.length - 1]
        : null;
      if (input) {
        entry.ship.applyInput(
          input.throttle,
          input.boost,
          new Vector3(0, 0, 0),
          input.mode,
          input.fire,
        );
        entry.ship.clientOrientation.set(
          input.orientation.x,
          input.orientation.y,
          input.orientation.z,
          input.orientation.w,
        );
        entry.inputBuffer.length = 0;
      }
    }

    // 2. Simulate player ships
    for (const [, entry] of this.players) {
      entry.ship.simulate(TICK_DT);
    }

    // 3. Traffic removed — no civilian ships

    // 4. NPC AI (simplified)
    for (const [, npc] of this.npcs) {
      // Find nearest player in same system
      let nearestPlayer: PlayerEntry | null = null;
      let nearestDist = Infinity;
      for (const [, p] of this.players) {
        if (p.currentSystem === npc.systemSeed) {
          const d = p.ship.state.position.distanceTo(npc.ship.state.position);
          if (d < nearestDist) { nearestDist = d; nearestPlayer = p; }
        }
      }

      npc.aiTimer -= TICK_DT;

      if (nearestPlayer && nearestDist < 200) {
        npc.aiState = 'attack';
        // Steer toward player
        const toPlayer = nearestPlayer.ship.state.position.clone()
          .sub(npc.ship.state.position).normalize();
        const forward = new Vector3(0, 0, 1).applyQuaternion(npc.ship.state.orientation);
        const dot = forward.dot(toPlayer);

        if (dot > 0.5) {
          // In front — fire (simplified: just log)
          if (Math.random() < 0.05 * TICK_DT * 20) {
            // NPC would fire a bolt — handled in combat phase
          }
        }
        const up = new Vector3(0, 1, 0).applyQuaternion(npc.ship.state.orientation);
        const right = new Vector3(1, 0, 0).applyQuaternion(npc.ship.state.orientation);
        npc.ship.applyInput(0.5, false, new Vector3(
          Math.max(-1, Math.min(1, toPlayer.dot(up) * 3)),
          Math.max(-1, Math.min(1, toPlayer.dot(right) * 3)),
          0,
        ));
      } else if (nearestPlayer && nearestDist < 2000) {
        npc.aiState = 'chase';
        const toPlayer = nearestPlayer.ship.state.position.clone()
          .sub(npc.ship.state.position).normalize();
        const up = new Vector3(0, 1, 0).applyQuaternion(npc.ship.state.orientation);
        const right = new Vector3(1, 0, 0).applyQuaternion(npc.ship.state.orientation);
        npc.ship.applyInput(0.3, false, new Vector3(
          Math.max(-1, Math.min(1, toPlayer.dot(up) * 2)),
          Math.max(-1, Math.min(1, toPlayer.dot(right) * 2)),
          0,
        ));
      } else {
        npc.aiState = 'patrol';
        if (npc.aiTimer <= 0) {
          npc.aiTimer = 4 + Math.random() * 6;
          npc.patrolTarget.set(
            npc.ship.state.position.x + (Math.random() - 0.5) * 2000,
            npc.ship.state.position.y + (Math.random() - 0.5) * 800,
            npc.ship.state.position.z + (Math.random() - 0.5) * 2000,
          );
        }
        const toPatrol = npc.patrolTarget.clone()
          .sub(npc.ship.state.position).normalize();
        const up = new Vector3(0, 1, 0).applyQuaternion(npc.ship.state.orientation);
        const right = new Vector3(1, 0, 0).applyQuaternion(npc.ship.state.orientation);
        npc.ship.applyInput(0.2, false, new Vector3(
          Math.max(-1, Math.min(1, toPatrol.dot(up) * 2)),
          Math.max(-1, Math.min(1, toPatrol.dot(right) * 2)),
          0,
        ));
      }
      npc.ship.simulate(TICK_DT);
    }

    // 4. Combat check
    const killsByPlayer = new Map<string, number>();
    for (const [, player] of this.players) {
      for (const [, npc] of this.npcs) {
        if (npc.systemSeed !== player.currentSystem) continue;
        const dist = player.ship.state.position.distanceTo(npc.ship.state.position);

        // NPC weapon hit player (if NPC is attacking and in range)
        if (dist < 200 && npc.aiState === 'attack' && Math.random() < 0.1 * TICK_DT * 20) {
          if (player.ship.state.shield > 0) {
            player.ship.state.shield = Math.max(0, player.ship.state.shield - 5 * TICK_DT);
          } else {
            player.ship.state.health = Math.max(0, player.ship.state.health - 3 * TICK_DT);
          }
        }
      }
    }

    // Notify kills
    for (const [playerId, count] of killsByPlayer) {
      if (this.onKillFn) this.onKillFn(playerId, count);
      if (this.broadcastFn) {
        this.broadcastFn({
          type: 'combat_event',
          payload: { damage: 25, sourceId: playerId, targetId: 'npc' },
        });
      }
    }

    // 5. Broadcast world snapshot (every 2 ticks = 10Hz)
    if (this.tick % 2 === 0 && this.broadcastFn) {
      const entities: EntitySnapshot[] = [];

      // Players (always included)
      for (const [id, entry] of this.players) {
        const s = entry.ship.state;
        entities.push({
          id,
          position: { x: s.position.x, y: s.position.y, z: s.position.z },
          orientation: { x: s.orientation.x, y: s.orientation.y, z: s.orientation.z, w: s.orientation.w },
          velocity: { x: s.velocity.x, y: s.velocity.y, z: s.velocity.z },
          health: s.health,
          shield: s.shield,
          ownerId: id,
        });
      }

      // NPCs — skip dead ones
      for (const [id, npc] of this.npcs) {
        if ((npc as any)._dead) continue;
        const s = npc.ship.state;
        entities.push({
          id,
          position: { x: s.position.x, y: s.position.y, z: s.position.z },
          orientation: { x: s.orientation.x, y: s.orientation.y, z: s.orientation.z, w: s.orientation.w },
          velocity: { x: s.velocity.x, y: s.velocity.y, z: s.velocity.z },
          health: s.health,
          shield: 0,
          npcType: 'pirate',
        });
      }

      const snapshot: WorldSnapshot = {
        tick: this.tick,
        timestamp: Date.now(),
        systemSeed: 0,
        entities,
        station: { id: 'station_0', position: { x: 600, y: 50, z: -400 } },
      };

      this.broadcastFn({ type: 'world_snapshot', payload: snapshot });
    }
  }
}
