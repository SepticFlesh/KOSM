import { useEffect, useRef } from 'react';

export function SystemMapOverlay() {
  const dotsRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    const size = 220, range = 200000;
    const scale = (size / 2) / range;
    const cx = size / 2, cy = size / 2;

    const tick = () => {
      if (!runningRef.current) return;
      try {
        const hud = (window as any).__kosmHUD;
        let ents: any[] = (window as any).__kosmMPEntities || [];
        if (ents.length === 0 && (window as any).__kosmMapData) {
          const md = (window as any).__kosmMapData;
          ents = (md.objects || []).map((o: any) => ({ px: o.x, py: 0, pz: o.z, npcType: o.color === '#f44' ? 'pirate' : o.color === '#4f4' ? 'base' : 'trader', isPlayer: o.isPlayer || false }));
        }
        const routes: any[] = (window as any).__kosmRoutes || [];
        const shipX = hud?._shipX || 600;
        const shipZ = hud?._shipZ || -800;
        const shipY = hud?._shipY || 250;
        const shipAngle = hud?._shipYaw || 0;
        const shipPitch = hud?._shipPitch || 0;

        // Stable top-down projection: forward = right on map
        const mapAngle = shipAngle + Math.PI / 2;
        const cosA = Math.cos(-mapAngle), sinA = Math.sin(-mapAngle);
        const proj = (wx: number, wz: number) => {
          const dx = wx - shipX, dz = wz - shipZ;
          const rx = (dx * cosA - dz * sinA) * scale;
          const ry = (dx * sinA + dz * cosA) * scale;
          return { x: cx + ry, y: cy - rx };
        };

        if (svgRef.current) {
          let html = '';
          for (const pct of [0.25, 0.5, 0.75, 1]) {
            html += `<circle cx="${cx}" cy="${cy}" r="${cx * pct}" fill="none" stroke="rgba(68,170,255,0.1)" stroke-width="0.5"/>`;
          }
          html += `<line x1="0" y1="${cy}" x2="${size}" y2="${cy}" stroke="rgba(68,170,255,0.08)" stroke-width="0.5"/>`;
          html += `<line x1="${cx}" y1="0" x2="${cx}" y2="${size}" stroke="rgba(68,170,255,0.08)" stroke-width="0.5"/>`;
          for (const r of routes) {
            for (let i = 0; i < r.waypoints.length - 1; i++) {
              const p1 = proj(r.waypoints[i].x, r.waypoints[i].z);
              const p2 = proj(r.waypoints[i + 1].x, r.waypoints[i + 1].z);
              html += `<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="${r.type === 'trade' ? 'rgba(255,170,0,0.3)' : 'rgba(0,170,255,0.2)'}" stroke-width="0.5"/>`;
            }
          }
          svgRef.current.innerHTML = html;
        }

        if (dotsRef.current) {
          let html = '';
          for (const e of ents) {
            const p = proj(e.px, e.pz);
            if (p.x < -2 || p.x > size + 2 || p.y < -2 || p.y > size + 2) continue;
            const isBase = e.npcType === 'base';
            const isTrader = e.npcType === 'trader' || e.npcType === 'shuttle' || e.npcType === 'transport' || e.npcType === 'liner';
            const c = isBase ? '#4f4' : isTrader ? '#fa0' : e.isPlayer ? '#48f' : '#f44';
            const s = isBase || e.isPlayer ? 3 : 1;
            const dy = (e.py || 0) - shipY;
            html += `<div style="position:absolute;left:${p.x - s / 2}px;top:${p.y - s / 2}px;width:${s}px;height:${s}px;background:${c};"></div>`;
          }

          html += `<div style="position:absolute;left:${cx - 5}px;top:${cy - 7}px;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:9px solid #fff;"></div>`;
          html += `<div style="position:absolute;bottom:6px;left:50%;transform:translateX(-50%);font-size:8px;color:rgba(68,170,255,0.4);font-family:monospace;">200K</div>`;
          dotsRef.current.innerHTML = html;
        }
      } catch (_) {}

      requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const size = 220, cx = size / 2;

  return (
    <div style={{
      position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      width: size, height: size, background: 'rgba(0,5,15,0.85)',
      border: '1px solid rgba(68,170,255,0.25)', borderRadius: '50%',
      overflow: 'hidden', zIndex: 15, pointerEvents: 'none',
    }}>
      <svg ref={svgRef} width={size} height={size} style={{ position: 'absolute', top: 0, left: 0 }} />
      <div ref={dotsRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
    </div>
  );
}
