import { useEffect, useRef } from 'react';
import { useGameStore } from '../ui/store/gameStore';

/**
 * Elite-style holographic radar — canvas rendering.
 * Disc grid + blips with vertical stems.
 */
export function Radar() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { showRadar, radarBlips } = useGameStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !showRadar) return;

    const size = 150;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';

    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = size / 2;
    const cy = size / 2;
    const maxR = size / 2 - 10;

    // Clear
    ctx.clearRect(0, 0, size, size);

    // Background disc
    ctx.fillStyle = 'rgba(0, 10, 30, 0.75)';
    ctx.beginPath();
    ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
    ctx.fill();

    // Grid — concentric rings
    for (let r = maxR * 0.25; r <= maxR; r += maxR * 0.25) {
      ctx.strokeStyle = 'rgba(68, 170, 255, 0.2)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Cross lines — perspective grid (like Elite's radar plane)
    ctx.strokeStyle = 'rgba(68, 170, 255, 0.3)';
    ctx.lineWidth = 0.5;
    // Horizontal
    ctx.beginPath();
    ctx.moveTo(cx - maxR, cy);
    ctx.lineTo(cx + maxR, cy);
    ctx.stroke();
    // Vertical
    ctx.beginPath();
    ctx.moveTo(cx, cy - maxR);
    ctx.lineTo(cx, cy + maxR);
    ctx.stroke();
    // Diagonal lines (perspective)
    ctx.strokeStyle = 'rgba(68, 170, 255, 0.15)';
    const diagR = maxR * 0.85;
    ctx.beginPath(); ctx.moveTo(cx - diagR, cy - diagR); ctx.lineTo(cx + diagR, cy + diagR); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + diagR, cy - diagR); ctx.lineTo(cx - diagR, cy + diagR); ctx.stroke();

    // Draw enemy blips
    for (const blip of radarBlips) {
      // Blip position on radar plane (x = left/right, y = forward/back with perspective)
      const bx = cx + blip.x * maxR * 0.9;
      const by = cy - blip.y * maxR * 0.7; // compressed Y for perspective

      // Height stem — vertical line from blip to its "shadow" on the plane
      // In Elite, the stem shows relative height
      const height = blip.height || 0; // -1..1, negative = below
      const stemLen = height * maxR * 0.4;
      const shadowY = by + stemLen; // positive = below (down on screen)

      // Stem line
      ctx.strokeStyle = `rgba(${Math.round(200*blip.health+55)},${Math.round(40*blip.health)},0,0.5)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx, shadowY);
      ctx.stroke();

      // Shadow dot on the plane (small, dim)
      ctx.fillStyle = `rgba(${Math.round(200*blip.health+55)},${Math.round(40*blip.health)},0,0.4)`;
      ctx.beginPath();
      ctx.arc(bx, shadowY, 2, 0, Math.PI * 2);
      ctx.fill();

      // Main blip — square (enemy) or triangle (player)
      const blipSize = 5;
      ctx.fillStyle = `rgb(${Math.round(200*blip.health+55)},${Math.round(40*blip.health)},0)`;
      ctx.save();
      ctx.translate(bx, by);
      // Square blip for enemies
      ctx.fillRect(-blipSize/2, -blipSize/2, blipSize, blipSize);
      // Glow
      ctx.shadowColor = `rgba(255,${Math.round(80*blip.health)},0,0.8)`;
      ctx.shadowBlur = 6;
      ctx.fillRect(-blipSize/2, -blipSize/2, blipSize, blipSize);
      ctx.restore();
    }

    // Center dot (player)
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(100,200,255,1)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Border ring
    ctx.strokeStyle = 'rgba(68, 170, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
    ctx.stroke();

  }, [radarBlips, showRadar]);

  if (!showRadar) return null;

  return (
    <div style={{
      position: 'absolute', bottom: 25, left: 25,
      pointerEvents: 'none', zIndex: 10,
    }}>
      <div style={{
        color: '#6cf', fontSize: 9, letterSpacing: 2,
        textAlign: 'center', marginBottom: 2,
        fontFamily: '"Courier New", monospace',
      }}>SCANNER</div>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  );
}
