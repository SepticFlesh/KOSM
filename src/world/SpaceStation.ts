import * as THREE from 'three';
import { generateStationName } from '../utils/nameGen';

/**
 * Procedural space station: central hub + ring + docking arms.
 */
export class SpaceStation {
  public mesh: THREE.Group;
  public position: THREE.Vector3;
  public name: string;

  constructor(scene: THREE.Scene, position: THREE.Vector3, seed: number = 0) {
    this.position = position.clone();
    this.name = generateStationName(seed);
    this.mesh = new THREE.Group();
    const rng = this.mulberry32(seed);

    // Materials
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x8899aa, roughness: 0.4, metalness: 0.8,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x445566, roughness: 0.5, metalness: 0.9,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x2244aa, roughness: 0.3, metalness: 0.5, emissive: 0x001122, emissiveIntensity: 0.5,
    });

    // ── Central hub ──
    const hubGeo = new THREE.CylinderGeometry(1.0, 1.2, 4.0, 16);
    const hub = new THREE.Mesh(hubGeo, hullMat);
    hub.position.y = 0;
    this.mesh.add(hub);

    // Hub end caps (domes)
    const domeGeo = new THREE.SphereGeometry(1.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const topDome = new THREE.Mesh(domeGeo, hullMat);
    topDome.position.y = 2.0;
    this.mesh.add(topDome);
    const botDome = new THREE.Mesh(domeGeo, hullMat);
    botDome.position.y = -2.0;
    botDome.rotation.x = Math.PI;
    this.mesh.add(botDome);

    // ── Rotating ring ──
    const ringGeo = new THREE.TorusGeometry(2.5, 0.3, 12, 32);
    const ring = new THREE.Mesh(ringGeo, darkMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0;
    ring.name = 'StationRing';
    this.mesh.add(ring);

    // Ring spokes
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const spokeGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.5, 8);
      const spoke = new THREE.Mesh(spokeGeo, darkMat);
      spoke.position.x = Math.cos(angle) * 1.25;
      spoke.position.z = Math.sin(angle) * 1.25;
      spoke.rotation.z = Math.PI / 2;
      spoke.rotation.y = -angle;
      this.mesh.add(spoke);
    }

    // ── Docking arms ──
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + rng() * 0.5;
      const armLen = 2.0 + rng() * 1.5;
      const armGeo = new THREE.CylinderGeometry(0.15, 0.15, armLen, 8);
      const arm = new THREE.Mesh(armGeo, accentMat);
      arm.position.x = Math.cos(angle) * (1.2 + armLen / 2);
      arm.position.z = Math.sin(angle) * (1.2 + armLen / 2);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = -angle;
      arm.position.y = 1.5 - i * 1.5;
      this.mesh.add(arm);

      // Docking pad at end
      const padGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 8);
      const pad = new THREE.Mesh(padGeo, darkMat);
      pad.position.x = Math.cos(angle) * (1.2 + armLen);
      pad.position.z = Math.sin(angle) * (1.2 + armLen);
      pad.position.y = 1.5 - i * 1.5;
      this.mesh.add(pad);
    }

    // ── Solar panels ──
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const panelGeo = new THREE.BoxGeometry(0.05, 1.5, 0.8);
      const panel = new THREE.Mesh(panelGeo, new THREE.MeshStandardMaterial({
        color: 0x112244, roughness: 0.2, metalness: 0.3,
        emissive: 0x001122, emissiveIntensity: 0.3,
      }));
      panel.position.x = Math.cos(angle) * 2.8;
      panel.position.z = Math.sin(angle) * 2.8;
      panel.position.y = 0;
      panel.rotation.y = -angle;
      this.mesh.add(panel);
    }

    // ── Nav lights ──
    const lightGeo = new THREE.SphereGeometry(0.08, 6, 6);
    const redLight = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    redLight.position.set(0, 2.5, 0);
    this.mesh.add(redLight);
    const greenLight = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
    greenLight.position.set(0, -2.5, 0);
    this.mesh.add(greenLight);

    // Beacon
    const beacon = new THREE.PointLight(0x4488ff, 5, 30);
    beacon.position.set(0, 0, 0);
    this.mesh.add(beacon);

    this.mesh.position.copy(position);
    scene.add(this.mesh);
  }

  /** Simple seeded RNG */
  private mulberry32(seed: number): () => number {
    let s = seed;
    return () => {
      s |= 0; s = s + 0x6D2B79F5 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) | 0;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  update(dt: number): void {
    // Rotate the ring
    const ring = this.mesh.getObjectByName('StationRing');
    if (ring) ring.rotation.z += dt * 0.3;
  }

  dispose(): void {
    this.mesh.traverse(c => {
      if (c instanceof THREE.Mesh) { c.geometry.dispose(); (c.material as THREE.Material).dispose(); }
    });
    this.mesh.parent?.remove(this.mesh);
  }
}
