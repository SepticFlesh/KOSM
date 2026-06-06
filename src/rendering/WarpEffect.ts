import * as THREE from 'three';

export class WarpEffect {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private container: THREE.Group;
  private rings: THREE.Points[] = [];
  private flash: THREE.PointLight;
  private age = 0;
  private onComplete: () => void;
  private active = true;
  private ringTimer = 0;

  constructor(scene: THREE.Scene, camera: THREE.Camera, _duration: number, onComplete: () => void) {
    this.scene = scene; this.onComplete = onComplete; this.camera = camera;
    this.container = new THREE.Group();
    this.scene.add(this.container);
    this.flash = new THREE.PointLight(0x88aaff, 40, 600); this.container.add(this.flash);
    for (let i = 0; i < 60; i++) this.spawnRing(i * 10, i % 4);
  }

  private spinAngle = 0;
  private basePos = new THREE.Vector3();

  /** Set position directly (called each frame) */
  setAtCamera(): void {
    this.basePos.copy(this.camera.position);
    this.container.position.copy(this.camera.position);
    // Camera looks along -Z local, container uses +Z as forward — flip 180
    const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.spinAngle);
    this.container.quaternion.copy(this.camera.quaternion).multiply(flip).multiply(spin);
  }

  private spawnRing(z: number, colorSet: number): void {
    const N=80, S=256, cv=document.createElement('canvas');
    cv.width=S; cv.height=S;
    const ctx=cv.getContext('2d')!;
    const g=ctx.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2);
    g.addColorStop(0,'rgba(255,255,255,1)');
    g.addColorStop(0.15,'rgba(180,220,255,0.8)');
    g.addColorStop(0.5,'rgba(60,120,255,0.3)');
    g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g; ctx.fillRect(0,0,S,S);
    const tex=new THREE.CanvasTexture(cv);
    const pArr=new Float32Array(N*3), cArr=new Float32Array(N*3);

    // Color sets: 0=blue, 1=purple, 2=cyan, 3=white-blue
    const palettes = [
      { h:0.58, s:0.9, lMin:0.3, lMax:0.8 },
      { h:0.72, s:0.8, lMin:0.3, lMax:0.7 },
      { h:0.52, s:0.7, lMin:0.4, lMax:0.9 },
      { h:0.60, s:0.5, lMin:0.6, lMax:1.0 },
    ];
    const pal = palettes[colorSet % palettes.length];

    for(let i=0;i<N;i++){
      const a=(i/N)*Math.PI*2, r=80+Math.random()*300;
      pArr[i*3]=Math.cos(a)*r; pArr[i*3+1]=Math.sin(a)*r; pArr[i*3+2]=z+(Math.random()-.5)*5;
      const col=new THREE.Color().setHSL(pal.h+(Math.random()-.5)*.05, pal.s, pal.lMin+Math.random()*(pal.lMax-pal.lMin));
      cArr[i*3]=col.r; cArr[i*3+1]=col.g; cArr[i*3+2]=col.b;
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(pArr,3));
    geo.setAttribute('color',new THREE.BufferAttribute(cArr,3));
    const mat=new THREE.PointsMaterial({size:6,map:tex,blending:THREE.AdditiveBlending,depthWrite:false,vertexColors:true,transparent:true});
    const ring=new THREE.Points(geo,mat); ring.position.set(0,0,z);
    this.container.add(ring); this.rings.push(ring);
  }

  update(dt: number): void {
    if(!this.active)return;
    this.age+=dt; this.ringTimer+=dt;

    // Accumulate clockwise spin
    this.spinAngle -= dt * 1.5;

    let colorIdx = Math.floor(this.age * 3);
    if (this.age < 4.0) {
      while(this.ringTimer>=.05){this.ringTimer-=.05;this.spawnRing(250,colorIdx);colorIdx++;}
    }
    this.flash.intensity = this.age < 4.0 ? 25+Math.sin(this.age*8)*10 : Math.max(0, 25 - (this.age-4.0)*25);
    for(const r of this.rings){
      r.position.z-=dt*150;
      (r.material as THREE.PointsMaterial).opacity=r.position.z>5?1:Math.max(0,r.position.z/5);
    }
    while(this.rings.length>0&&this.rings[0].position.z<-80){
      const o=this.rings.shift()!; this.container.remove(o);
      (o.material as THREE.PointsMaterial).map?.dispose();
      (o.material as THREE.PointsMaterial).dispose(); o.geometry.dispose();
    }
    // End when all rings gone or 6s max
    if(this.rings.length===0 && this.age>4.0 || this.age>=6.0){this.active=false;this.dispose();this.onComplete();}
  }

  private dispose():void{
    this.scene.remove(this.container);
    for(const r of this.rings){
      (r.material as THREE.PointsMaterial).map?.dispose();
      (r.material as THREE.PointsMaterial).dispose(); r.geometry.dispose();
    }
  }
}
