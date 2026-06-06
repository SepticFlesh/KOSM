import * as THREE from 'three';

export interface MineableAsteroid {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  health: number;
  maxHealth: number;
  oreType: string;
  oreAmount: number;
}

/**
 * Mineable asteroids scattered around the system.
 */
export class MiningSystem {
  private scene: THREE.Scene;
  public asteroids: MineableAsteroid[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  spawn(count: number, aroundPos: THREE.Vector3, spread: number): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 50000 + Math.random() * spread;
      const pos = new THREE.Vector3(
        aroundPos.x + Math.cos(angle) * dist,
        aroundPos.y + (Math.random() - 0.5) * 100,
        aroundPos.z + Math.sin(angle) * dist
      );

      const size = 0.5 + Math.random() * 2;
      const geo = new THREE.IcosahedronGeometry(size, 1);
      // Randomize vertices for rocky look
      const posAttr = geo.attributes.position;
      for (let j = 0; j < posAttr.count; j++) {
        const x = posAttr.getX(j) * (0.7 + Math.random() * 0.6);
        const y = posAttr.getY(j) * (0.7 + Math.random() * 0.6);
        const z = posAttr.getZ(j) * (0.7 + Math.random() * 0.6);
        posAttr.setXYZ(j, x, y, z);
      }
      geo.computeVertexNormals();

      const hue = 0.08 + Math.random() * 0.1;
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(hue, 0.3, 0.3 + Math.random() * 0.3),
        roughness: 0.9, metalness: 0.2,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      this.scene.add(mesh);

      const oreTypes = ['Железо', 'Титан', 'Золото', 'Уран'];
      this.asteroids.push({
        mesh,
        position: pos,
        health: 30 + Math.random() * 50,
        maxHealth: 80,
        oreType: oreTypes[Math.floor(Math.random() * oreTypes.length)],
        oreAmount: 1 + Math.floor(Math.random() * 4),
      });
    }
    console.log(`[Mining] Spawned ${count} asteroids`);
  }

  update(dt: number): void {
    // Slow rotation
    for (const a of this.asteroids) {
      a.mesh.rotation.y += dt * 0.2;
      a.mesh.rotation.x += dt * 0.1;
    }
  }

  /** Find nearest asteroid within range from position */
  findNearest(pos: THREE.Vector3, range: number): MineableAsteroid | null {
    let best: MineableAsteroid | null = null;
    let bestDist = range;
    for (const a of this.asteroids) {
      const d = pos.distanceTo(a.position);
      if (d < bestDist) { bestDist = d; best = a; }
    }
    return best;
  }

  dispose(): void {
    for (const a of this.asteroids) {
      this.scene.remove(a.mesh);
      a.mesh.geometry.dispose();
      (a.mesh.material as THREE.Material).dispose();
    }
    this.asteroids.length = 0;
  }
}
