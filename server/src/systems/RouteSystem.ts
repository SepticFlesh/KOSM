import { Vector3 } from 'three';

export interface Waypoint {
  pos: Vector3;
  label: string;
  isBase?: boolean;
}

export interface Route {
  id: string;
  type: 'trade' | 'transport';
  waypoints: Waypoint[];
  systemSeed: number;
}

/**
 * Generates planet bases and trade/transport routes between them.
 */
export function generateRoutes(systemSeed: number): Route[] {
  const routes: Route[] = [];

  // Planet bases at orbital distances (matching client StarSystem planets)
  const planets: Array<{ pos: Vector3; name: string }> = [
    { pos: new Vector3(80000, 200, 0), name: 'P1' },
    { pos: new Vector3(-40000, -100, 60000), name: 'P2' },
    { pos: new Vector3(20000, 300, -100000), name: 'P3' },
    { pos: new Vector3(-120000, -50, -30000), name: 'P4' },
    { pos: new Vector3(50000, 150, 120000), name: 'P5' },
    { pos: new Vector3(-80000, 400, -80000), name: 'P6' },
    { pos: new Vector3(150000, -200, 50000), name: 'P7' },
    { pos: new Vector3(-60000, 100, -150000), name: 'P8' },
  ];

  // Use deterministic planet selection based on seed
  const selectedPlanets = [];
  for (let i = 0; i < 3 + (systemSeed % 3); i++) {
    selectedPlanets.push(planets[(systemSeed + i * 7) % planets.length]);
  }

  // Trade routes: planet base → planet base (long distance)
  for (let i = 0; i < selectedPlanets.length; i++) {
    const p1 = selectedPlanets[i];
    const p2 = selectedPlanets[(i + 1) % selectedPlanets.length];

    // Midpoints with offset for variety
    const mid = p1.pos.clone().add(p2.pos).multiplyScalar(0.5);
    mid.x += (Math.random() - 0.5) * 10000;
    mid.y += (Math.random() - 0.5) * 5000;
    mid.z += (Math.random() - 0.5) * 10000;

    routes.push({
      id: `trade_${systemSeed}_${i}`,
      type: 'trade',
      waypoints: [
        { pos: p1.pos.clone(), label: p1.name, isBase: true },
        { pos: mid, label: 'Mid' },
        { pos: p2.pos.clone(), label: p2.name, isBase: true },
      ],
      systemSeed,
    });
  }

  return routes;
}
