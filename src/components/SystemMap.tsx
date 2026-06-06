import { useEffect, useRef } from 'react';

interface MapObject {
  x: number; z: number; r: number; color: string; label?: string;
  isPlayer?: boolean; angle?: number;
}

interface SystemMapProps {
  show: boolean;
  objects: MapObject[];
  range: number; // half-width of the map
}

export function SystemMap({ show, objects, range }: SystemMapProps) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!show) return;
    const cv = cvRef.current;
    if (!cv) return;
    const size = 400, dpr = window.devicePixelRatio || 1;
    cv.width = size * dpr; cv.height = size * dpr;
    cv.style.width = size + 'px'; cv.style.height = size + 'px';
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = 'rgba(0,5,20,0.9)';
    ctx.fillRect(0, 0, size, size);
    const cx = size / 2, cy = size / 2;
    const mapRange = range || 100000;

    // Grid
    ctx.strokeStyle = 'rgba(68,170,255,0.15)'; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * size;
      const y = (i / 10) * size;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
    }

    // Objects
    for (const obj of objects) {
      const px = cx + (obj.x / mapRange) * (size / 2);
      const py = cy - (obj.z / mapRange) * (size / 2);
      const r = Math.max(3, obj.r);

      // Orbit ring for planets
      if (!obj.isPlayer && obj.r > 1) {
        const orbitR = Math.sqrt(obj.x * obj.x + obj.z * obj.z) / mapRange * (size / 2);
        ctx.strokeStyle = obj.color.replace('1)', '0.2)').replace('rgb', 'rgba');
        ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.arc(cx, cy, orbitR, 0, Math.PI * 2); ctx.stroke();
      }

      // Body
      ctx.fillStyle = obj.color;
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();

      // Player direction
      if (obj.isPlayer && obj.angle !== undefined) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px, py);
        ctx.lineTo(px + Math.sin(obj.angle) * 12, py - Math.cos(obj.angle) * 12);
        ctx.stroke();
      }

      // Label
      if (obj.label) {
        ctx.fillStyle = '#adf'; ctx.font = '9px "Courier New"';
        ctx.fillText(obj.label, px + r + 3, py - 3);
      }
    }

    // Border
    ctx.strokeStyle = 'rgba(68,170,255,0.4)'; ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, size, size);
  }, [show, objects, range]);

  if (!show) return null;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 50, pointerEvents: 'none',
    }}>
      <div style={{ pointerEvents: 'auto' }}>
        <canvas ref={cvRef} />
      </div>
    </div>
  );
}
