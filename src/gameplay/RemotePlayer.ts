import * as THREE from 'three';

export type ShipVisualType = 'default' | 'trader' | 'pirate';

/**
 * Renders another player's or NPC's ship in the world.
 */
export class RemotePlayer {
  public mesh: THREE.Group;
  public label: THREE.Sprite;
  public playerId: string;
  public username: string;
  public health = 100;
  public shield = 100;
  public isNPC = false;

  private scene: THREE.Scene;

  constructor(scene: THREE.Scene, playerId: string, username: string, visualType: ShipVisualType = 'default') {
    this.scene = scene;
    this.playerId = playerId;
    this.username = username;
    this.mesh = this.createMesh(visualType);
    this.label = this.createLabel(username);
    this.mesh.add(this.label);
    scene.add(this.mesh);
  }

  private createMesh(vtype: ShipVisualType): THREE.Group {
    const g = new THREE.Group();

    if (vtype === 'trader') {
      // Large tanker shape
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xcc8800, roughness: 0.5, metalness: 0.5 });
      const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.4, metalness: 0.4 });

      // Main hull — long cylinder
      const hullGeo = new THREE.CylinderGeometry(0.8, 1.0, 8.0, 12);
      const hull = new THREE.Mesh(hullGeo, bodyMat);
      hull.rotation.x = Math.PI / 2;
      g.add(hull);

      // Cargo pods (4x along sides)
      for (let side = -1; side <= 1; side += 2) {
        for (let z = -2; z <= 2; z += 2) {
          const podGeo = new THREE.SphereGeometry(0.6, 8, 8);
          const pod = new THREE.Mesh(podGeo, stripeMat);
          pod.position.set(side * 1.5, 0, z);
          pod.scale.set(0.7, 0.7, 1.0);
          g.add(pod);
        }
      }

      // Bridge tower
      const bridgeGeo = new THREE.BoxGeometry(0.8, 0.6, 1.2);
      const bridge = new THREE.Mesh(bridgeGeo, stripeMat);
      bridge.position.set(0, 1.0, -1);
      g.add(bridge);

      // Engine block
      const engGeo = new THREE.CylinderGeometry(0.5, 0.7, 1.5, 8);
      const eng = new THREE.Mesh(engGeo, bodyMat);
      eng.rotation.x = Math.PI / 2;
      eng.position.z = -4.5;
      g.add(eng);

      // Light
      g.add(new THREE.PointLight(0xffaa00, 2, 15));
    } else if (vtype === 'pirate') {
      // Pirate — red, aggressive shape (already handled by npcType in attachMultiplayer)
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xaa2222, roughness: 0.5, metalness: 0.6 });
      const bodyGeo = new THREE.CylinderGeometry(0.15, 0.25, 2.0, 8);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.rotation.x = Math.PI / 2;
      g.add(body);
      const wingGeo = new THREE.BoxGeometry(2.0, 0.05, 0.5);
      g.add(new THREE.Mesh(wingGeo, bodyMat));
      const noseGeo = new THREE.ConeGeometry(0.15, 0.6, 8);
      const nose = new THREE.Mesh(noseGeo, bodyMat);
      nose.rotation.x = Math.PI / 2;
      nose.position.z = 1.2;
      g.add(nose);
      g.add(new THREE.PointLight(0xff2222, 1, 5));
    } else {
      // Default/player — blue arrow
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2255aa, roughness: 0.3, metalness: 0.7 });
      const accentMat = new THREE.MeshStandardMaterial({ color: 0x4488ff, roughness: 0.2, metalness: 0.5, emissive: 0x112244, emissiveIntensity: 0.4 });
      const bodyGeo = new THREE.CylinderGeometry(0.15, 0.25, 2.0, 8);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.rotation.x = Math.PI / 2;
      g.add(body);
      const wingGeo = new THREE.BoxGeometry(2.0, 0.05, 0.5);
      g.add(new THREE.Mesh(wingGeo, accentMat));
      const noseGeo = new THREE.ConeGeometry(0.15, 0.6, 8);
      const nose = new THREE.Mesh(noseGeo, bodyMat);
      nose.rotation.x = Math.PI / 2;
      nose.position.z = 1.2;
      g.add(nose);
      g.add(new THREE.PointLight(0x4488ff, 1, 5));
    }

    return g;
  }

  private createLabel(name: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#4488ff';
    ctx.font = '24px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(name, 128, 40);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({
      map: tex,
      blending: THREE.NormalBlending,
      depthWrite: false,
      transparent: true,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.y = 2.0;
    sprite.scale.set(4, 1, 1);
    return sprite;
  }

  setTarget(pos: THREE.Vector3, quat: THREE.Quaternion, health: number, shield: number): void {
    this.mesh.position.copy(pos);
    this.mesh.quaternion.copy(quat);
    this.health = health;
    this.shield = shield;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
  }
}
