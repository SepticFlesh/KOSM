import { useEffect, useRef } from 'react';

/**
 * Draws circular markers on screen for objects in radar range —
 * enemies, other players, stations. Projects 3D world coords to 2D screen space.
 */
export function TargetMarkers() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let running = true;

    const draw = () => {
      if (!running) { requestAnimationFrame(draw); return; }
      const canvas = canvasRef.current;
      if (!canvas) { requestAnimationFrame(draw); return; }

      // Use game canvas dimensions, not full window (SidePanel takes 300px on desktop)
      const gameCanvas = document.getElementById('game-canvas');
      const rect = gameCanvas?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      const cw = rect.width, ch = rect.height;
      canvas.width = cw; canvas.height = ch;
      canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
      canvas.style.left = rect.left + 'px'; canvas.style.top = rect.top + 'px';
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, cw, ch);

      const targets = (window as any).__kosmTargets as Array<{
        screenX: number; screenY: number; distance: number; type: string; health?: number;
      }> | undefined;

      if (!targets || targets.length === 0) { requestAnimationFrame(draw); return; }

      for (const t of targets) {
        if (t.screenX < -20 || t.screenX > cw + 20 || t.screenY < -20 || t.screenY > ch + 20) continue;

        // Targeting reticle — always bright, large, with crosshair
        ctx.strokeStyle = 'rgba(255, 80, 0, 0.9)';
        ctx.lineWidth = 2;
        const r = 16;
        // Outer brackets
        const b = 8;
        ctx.beginPath(); ctx.moveTo(t.screenX - r, t.screenY - r + b); ctx.lineTo(t.screenX - r, t.screenY - r); ctx.lineTo(t.screenX - r + b, t.screenY - r); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(t.screenX + r - b, t.screenY - r); ctx.lineTo(t.screenX + r, t.screenY - r); ctx.lineTo(t.screenX + r, t.screenY - r + b); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(t.screenX - r, t.screenY + r - b); ctx.lineTo(t.screenX - r, t.screenY + r); ctx.lineTo(t.screenX - r + b, t.screenY + r); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(t.screenX + r - b, t.screenY + r); ctx.lineTo(t.screenX + r, t.screenY + r); ctx.lineTo(t.screenX + r, t.screenY + r - b); ctx.stroke();

        // Distance text
        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(Math.round(t.distance) + 'M', t.screenX, t.screenY - r - 6);
      }

      requestAnimationFrame(draw);
    };
    draw();
    return () => { running = false; };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 15,
      }}
    />
  );
}
