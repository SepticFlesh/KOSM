import * as THREE from 'three';

/**
 * Renders another player's ship in the world.
 * Position/orientation updated from server snapshots.
 */
export class RemotePlayer {
  public mesh: THREE.Group;
  public label: THREE.Sprite;
  public playerId: string;
  public username: string;
  public health = 100;
  public shield = 100;

  private scene: THREE.Scene;

  constructor(scene: THREE.Scene, playerId: string, username: string) {
    this.scene = scene;
    this.playerId = playerId;
    this.username = username;
    this.mesh = this.createMesh();
    this.label = this.createLabel(username);
    this.mesh.add(this.label);
    scene.add(this.mesh);
  }

  private createMesh(): THREE.Group {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x2255aa, roughness: 0.3, metalness: 0.7,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x4488ff, roughness: 0.2, metalness: 0.5, emissive: 0x112244, emissiveIntensity: 0.4,
    });

    // Simple arrow-shaped body
    const bodyGeo = new THREE.CylinderGeometry(0.15, 0.25, 2.0, 8);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.rotation.x = Math.PI / 2;
    g.add(body);

    // Wings
    const wingGeo = new THREE.BoxGeometry(2.0, 0.05, 0.5);
    const wings = new THREE.Mesh(wingGeo, accentMat);
    wings.position.z = -0.3;
    g.add(wings);

    // Nose
    const noseGeo = new THREE.ConeGeometry(0.15, 0.6, 8);
    const nose = new THREE.Mesh(noseGeo, bodyMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 1.2;
    g.add(nose);

    // Point light for visibility
    const light = new THREE.PointLight(0x4488ff, 1, 5);
    g.add(light);

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

  /** Update position/rotation from interpolated snapshot */
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
