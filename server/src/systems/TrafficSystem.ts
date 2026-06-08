import { Vector3 } from 'three';
import { ShipEntity } from '../entities/ShipEntity.js';
import { getShipType, getShipsByRole, type ShipTypeDef } from '../entities/ShipTypes.js';
import { generateRoutes, type Route } from './RouteSystem.js';

export interface CivilianShip {
  id: string;
  ship: ShipEntity;
  shipType: ShipTypeDef;
  route: Route;
  currentWaypoint: number;
  direction: 1 | -1;
  systemSeed: number;
  lastAttackTime: number;
  stoppedAtBase: boolean;
  stopTimer: number;
  /** Skip simulation this tick if far from all players (LOD) */
  lodSkipCounter: number;
}

const TRAFFIC_PER_ROUTE = 20; // down from 50-79
const LOD_SIM_EVERY_N_TICKS = 4; // simulate distant ships every 4th tick

export class TrafficSystem {
  public ships: CivilianShip[] = [];
  public routes: Route[] = [];
  private tickCounter = 0;

  init(systemSeed: number): void {
    this.routes = generateRoutes(systemSeed);
    this.ships = [];

    const traders = getShipsByRole('trader');

    // Spawn ships on trade routes with spacing
    for (const route of this.routes) {
      const totalLength = this.routeLength(route);
      const count = TRAFFIC_PER_ROUTE + Math.floor(Math.random() * 5); // 20-24 ships per route
      const spacing = totalLength / count;

      for (let i = 0; i < count; i++) {
        const type = traders[Math.floor(Math.random() * traders.length)];
        const ship = this.createShip(type);
        // Place ships evenly along the route
        const t = (i / count) + (Math.random() * 0.1 - 0.05);
        this.placeOnRoute(ship, route, Math.max(0.01, Math.min(0.99, t)));

        this.ships.push({
          id: `traffic_${route.id}_${i}`,
          ship,
          shipType: type,
          route,
          currentWaypoint: 0,
          direction: 1,
          systemSeed,
          lastAttackTime: 0,
          stoppedAtBase: false,
          stopTimer: 0,
          lodSkipCounter: Math.floor(Math.random() * LOD_SIM_EVERY_N_TICKS),
        });
      }
    }

    console.log(`[Traffic] Spawned ${this.ships.length} trade ships on ${this.routes.length} routes`);
  }

  private routeLength(route: Route): number {
    let len = 0;
    for (let i = 0; i < route.waypoints.length - 1; i++) {
      len += route.waypoints[i].pos.distanceTo(route.waypoints[i + 1].pos);
    }
    return len;
  }

  private placeOnRoute(ship: ShipEntity, route: Route, t: number): void {
    const totalLen = this.routeLength(route);
    let targetDist = t * totalLen;
    let accumulated = 0;

    for (let i = 0; i < route.waypoints.length - 1; i++) {
      const segLen = route.waypoints[i].pos.distanceTo(route.waypoints[i + 1].pos);
      if (accumulated + segLen >= targetDist) {
        const segT = (targetDist - accumulated) / segLen;
        const wp0 = route.waypoints[i];
        const wp1 = route.waypoints[i + 1];
        ship.state.position.set(
          wp0.pos.x + (wp1.pos.x - wp0.pos.x) * segT,
          wp0.pos.y + (wp1.pos.y - wp0.pos.y) * segT,
          wp0.pos.z + (wp1.pos.z - wp0.pos.z) * segT,
        );
        return;
      }
      accumulated += segLen;
    }
  }

  private createShip(type: ShipTypeDef): ShipEntity {
    return new ShipEntity({
      mass: type.mass,
      thrust: type.thrust * 100,
      rotationalSpeed: type.rotationalSpeed,
      maxSpeedAssist: type.maxSpeedAssist,
      boostMultiplier: 1,
      boostCapacity: 0,
      boostRecharge: 0,
    });
  }

  update(dt: number, pirates: Array<{ id: string; ship: ShipEntity; aiState: string }>, playerPositions?: Vector3[]): void {
    this.tickCounter++;

    // Determine which ships are near players (for LOD)
    const LOD_RANGE = 30000; // ships within 30k of a player get full simulation
    const hasPlayers = playerPositions && playerPositions.length > 0;

    for (const cs of this.ships) {
      // LOD: skip simulation for distant ships most ticks
      const nearPlayer = hasPlayers && playerPositions!.some(p =>
        cs.ship.state.position.distanceToSquared(p) < LOD_RANGE * LOD_RANGE
      );

      if (!nearPlayer && hasPlayers) {
        cs.lodSkipCounter++;
        if (cs.lodSkipCounter < LOD_SIM_EVERY_N_TICKS) {
          // Move along route (cheap) but skip physics simulation
          this.moveAlongRoute(cs, dt);
          continue;
        }
        cs.lodSkipCounter = 0;
      }

      this.moveAlongRoute(cs, dt);
      this.checkPirateAttack(cs, pirates);
      cs.ship.simulate(dt);
    }
  }

  private moveAlongRoute(cs: CivilianShip, dt: number): void {
    // Check if at a base — stop for a while
    const currentWp = cs.route.waypoints[cs.currentWaypoint];

    if (currentWp.isBase && cs.stopTimer > 0) {
      cs.stopTimer -= dt;
      cs.ship.applyInput(0, false, new Vector3(0, 0, 0), 'flight_assist', false);
      return;
    }

    const toWp = currentWp.pos.clone().sub(cs.ship.state.position);
    const dist = toWp.length();

    // Reached waypoint
    if (dist < 300) {
      if (currentWp.isBase && !cs.stoppedAtBase) {
        // Start base stop (5-15 seconds)
        cs.stoppedAtBase = true;
        cs.stopTimer = 5 + Math.random() * 10;
        return;
      }
      cs.stoppedAtBase = false;

      // Advance to next waypoint
      const next = cs.currentWaypoint + cs.direction;
      if (next >= cs.route.waypoints.length) {
        cs.direction = -1;
        cs.currentWaypoint--;
      } else if (next < 0) {
        cs.direction = 1;
        cs.currentWaypoint++;
      } else {
        cs.currentWaypoint = next;
      }
      return;
    }

    cs.stoppedAtBase = false;

    // Steer toward waypoint
    const targetDir = toWp.normalize();
    const fwd = new Vector3(0, 0, 1).applyQuaternion(cs.ship.state.orientation);
    const upVec = new Vector3(0, 1, 0).applyQuaternion(cs.ship.state.orientation);
    const rightVec = new Vector3(1, 0, 0).applyQuaternion(cs.ship.state.orientation);

    const pitchErr = targetDir.dot(upVec);
    const yawErr = targetDir.dot(rightVec);

    // Speed based on distance to next ship ahead
    let throttle = 0.3;
    const ahead = this.findShipAhead(cs);
    if (ahead && ahead.dist < 3000) {
      throttle = Math.max(0.05, ahead.dist / 3000 * 0.3);
    }

    cs.ship.applyInput(
      throttle,
      false,
      new Vector3(
        Math.max(-1, Math.min(1, pitchErr * 1.5)),
        Math.max(-1, Math.min(1, yawErr * 1.5)),
        0,
      ),
      'flight_assist',
      false,
    );
  }

  private findShipAhead(cs: CivilianShip): { dist: number } | null {
    let best = null;
    const fwd = new Vector3(0, 0, 1).applyQuaternion(cs.ship.state.orientation);
    const pos = cs.ship.state.position;

    for (const other of this.ships) {
      if (other === cs || other.route.id !== cs.route.id) continue;
      const rel = other.ship.state.position.clone().sub(pos);
      const dot = rel.normalize().dot(fwd);
      if (dot > 0.95) { // within ~18° cone ahead
        const d = rel.length();
        if (!best || d < best.dist) best = { dist: d };
      }
    }
    return best;
  }

  private checkPirateAttack(cs: CivilianShip, pirates: Array<{ id: string; ship: ShipEntity; aiState: string }>): void {
    const now = Date.now();
    if (now - cs.lastAttackTime < 5000) return;

    for (const pirate of pirates) {
      const dist = cs.ship.state.position.distanceTo(pirate.ship.state.position);
      if (dist < 1000 && pirate.aiState === 'attack') {
        cs.ship.state.health -= 2;
        cs.lastAttackTime = now;
        cs.ship.applyInput(0.6, false, new Vector3(0, 0, 0), 'flight_assist', false);
        break;
      }
    }
  }

  /** Get base positions for broadcasting (planet trading posts) */
  getBases(): Array<{ id: string; pos: {x:number;y:number;z:number} }> {
    const bases: Array<{ id: string; pos: {x:number;y:number;z:number} }> = [];
    const seen = new Set<string>();
    for (const route of this.routes) {
      for (const wp of route.waypoints) {
        if (wp.isBase && !seen.has(wp.label)) {
          seen.add(wp.label);
          bases.push({ id: `base_${wp.label}`, pos: { x: wp.pos.x, y: wp.pos.y, z: wp.pos.z } });
        }
      }
    }
    return bases;
  }

  getRoutesData(): Array<{ id: string; type: string; waypoints: Array<{x:number;y:number;z:number; isBase?:boolean}> }> {
    return this.routes.map(r => ({
      id: r.id,
      type: r.type,
      waypoints: r.waypoints.map(w => ({ x: w.pos.x, y: w.pos.y, z: w.pos.z, isBase: w.isBase })),
    }));
  }

  dispose(): void {
    this.ships.length = 0;
    this.routes.length = 0;
  }
}
