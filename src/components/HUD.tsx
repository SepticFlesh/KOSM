import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../ui/store/gameStore';
import { FACTIONS } from '../data/factions';

/** Elite-style holographic radar canvas */
function RadarCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const showRadar = useGameStore(s => s.showRadar);
  const radarBlips = useGameStore(s => s.radarBlips);

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
    const cx = size / 2, cy = size / 2, maxR = size / 2 - 10;

    ctx.clearRect(0, 0, size, size);
    // Disc
    ctx.fillStyle = 'rgba(0,10,30,0.75)';
    ctx.beginPath(); ctx.arc(cx, cy, maxR, 0, Math.PI*2); ctx.fill();
    // Rings
    for (let r = maxR*0.25; r <= maxR; r += maxR*0.25) {
      ctx.strokeStyle = 'rgba(68,170,255,0.2)'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
    }
    // Cross
    ctx.strokeStyle = 'rgba(68,170,255,0.3)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(cx-maxR,cy); ctx.lineTo(cx+maxR,cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx,cy-maxR); ctx.lineTo(cx,cy+maxR); ctx.stroke();
    // Diagonals
    ctx.strokeStyle = 'rgba(68,170,255,0.15)';
    const dR = maxR*0.85;
    ctx.beginPath(); ctx.moveTo(cx-dR,cy-dR); ctx.lineTo(cx+dR,cy+dR); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+dR,cy-dR); ctx.lineTo(cx-dR,cy+dR); ctx.stroke();

    // Blips
    for (const blip of radarBlips) {
      const bx = cx + blip.x * maxR * 0.9;
      const by = cy - blip.y * maxR * 0.7;
      const stemLen = (blip.height || 0) * maxR * 0.4;
      const sy = by + stemLen;

      const isStation = blip.type === 'station';
      const r = isStation ? 100 : Math.round(200*blip.health+55);
      const g = isStation ? 180 : Math.round(40*blip.health);
      const b = isStation ? 255 : 0;

      // Stem
      ctx.strokeStyle = `rgba(${r},${g},${b},0.5)`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, sy); ctx.stroke();
      ctx.fillStyle = `rgba(${r},${g},${b},0.4)`;
      ctx.beginPath(); ctx.arc(bx, sy, 2, 0, Math.PI*2); ctx.fill();

      // Shape
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      if (isStation) {
        // Diamond
        const s = 6;
        ctx.beginPath();
        ctx.moveTo(bx, by - s);
        ctx.lineTo(bx + s, by);
        ctx.lineTo(bx, by + s);
        ctx.lineTo(bx - s, by);
        ctx.closePath();
        ctx.fill();
      } else {
        // Square (enemy)
        const bs = 5;
        ctx.fillRect(bx-bs/2, by-bs/2, bs, bs);
      }
    }

    // Center dot
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(100,200,255,1)'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    // Border
    ctx.strokeStyle = 'rgba(68,170,255,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, maxR, 0, Math.PI*2); ctx.stroke();
  }, [radarBlips, showRadar]);

  if (!showRadar) return null;
  return <canvas ref={canvasRef} style={{ display: 'block' }} />;
}

function RepDisplay() {
  const rep = useGameStore(s => s.reputation);
  return (
    <div style={{ fontSize: 9, marginTop: 2 }}>
      {FACTIONS.map(f => {
        const r = rep[f.id] || 0;
        const sign = r >= 0 ? '+' : '';
        return (
          <div key={f.id} style={{ color: f.color, opacity: 0.8 }}>
            {f.name}: {sign}{r}
          </div>
        );
      })}
    </div>
  );
}

export function HUD() {
  const hudVisible = useGameStore(s => s.hudVisible);
  const player = useGameStore(s => s.player);
  const lastDmg = useGameStore(s => (s as any).lastDamageTime || 0);
  const lastHit = useGameStore(s => (s as any).lastHitTime || 0);
  const [flashAlpha, setFlashAlpha] = useState(0);
  const [hitAlpha, setHitAlpha] = useState(0);

  useEffect(() => {
    if (lastDmg > 0) { setFlashAlpha(0.4); const t = setTimeout(() => setFlashAlpha(0), 200); return () => clearTimeout(t); }
  }, [lastDmg]);
  useEffect(() => {
    if (lastHit > 0) { setHitAlpha(1); const t = setTimeout(() => setHitAlpha(0), 150); return () => clearTimeout(t); }
  }, [lastHit]);

  if (!hudVisible) return null;

  const modeLabel =
    player.flightMode === 'flight_assist' ? 'ASSIST' :
    player.flightMode === 'cruise' ? 'CRUISE' : 'REAL';
  const modeColor =
    player.flightMode === 'flight_assist' ? '#4af' :
    player.flightMode === 'cruise' ? '#fa4' : '#f44';

  return (
    <div id="hud-overlay">
      <div className="hud-fps">
        <div style={{ color: '#fa4', marginBottom: 2 }}>{player.starName}</div>
        <RepDisplay />
        {player.fps} FPS {player.fps < 40 ? (player.fps < 25 ? '⬇' : '⚡') : ''}
      </div>

      {player.targetDist > 0 && (
        <div style={{
          position: 'absolute', top: '40%', left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#f84', fontSize: 11, fontFamily: '"Courier New", monospace',
          pointerEvents: 'none', zIndex: 10,
          textShadow: '0 0 6px rgba(255,100,0,0.6)',
          textAlign: 'center',
        }}>
          <div>TARGET: {Math.round(player.targetDist)} M</div>
        </div>
      )}

      <div className="speed-indicator">
        <div className="speed-value">{Math.round(player.speed).toLocaleString()}</div>
        <div className="speed-label">M/S</div>
      </div>

      <div className="flight-mode" style={{ color: modeColor, borderColor: modeColor }}>
        {modeLabel}
      </div>

      <div className="throttle-bar">
        <div className="throttle-label">THR</div>
        <div className="throttle-track">
          <div className="throttle-fill" style={{ height: `${player.throttle * 100}%` }} />
        </div>
        <div className="throttle-value">{Math.round(player.throttle * 100)}%</div>
      </div>

      <div className="boost-bar">
        <div className="boost-label">BST</div>
        <div className="boost-track">
          <div className="boost-fill" style={{ height: `${player.boostEnergy}%` }} />
        </div>
        <div className="throttle-value" style={{ color: '#fa4' }}>{Math.round(player.boostEnergy)}%</div>
      </div>

      <div className="ship-status">
        <div className="status-row">
          <span className="status-label">SHIELD</span>
          <div className="status-bar"><div className="status-fill shield" style={{ width: `${player.shield}%` }} /></div>
          <span className="status-value">{Math.round(player.shield)}%</span>
        </div>
        <div className="status-row">
          <span className="status-label">HULL</span>
          <div className="status-bar"><div className="status-fill hull" style={{ width: `${player.hull}%` }} /></div>
          <span className="status-value">{Math.round(player.hull)}%</span>
        </div>
        <div className="status-distance">STAR: {Math.round(player.distanceToStar).toLocaleString()} M</div>
        <div className="status-distance" style={{ color: '#fa4' }}>CARGO: {player.cargoUsed}/{player.cargoMax} T</div>
      </div>

      <div className="radar-container">
        <div className="radar-label">SCANNER</div>
        <RadarCanvas />
      </div>

      {flashAlpha > 0 && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          background: `rgba(255,0,0,${flashAlpha})`, pointerEvents: 'none',
          zIndex: 100, transition: 'opacity 0.2s',
        }} />
      )}
      {hitAlpha > 0 && (
        <div style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          color: `rgba(255,100,0,${hitAlpha})`,
          fontSize: 28, fontWeight: 'bold',
          pointerEvents: 'none', zIndex: 101,
          textShadow: '0 0 10px rgba(255,100,0,0.8)',
        }}>✕</div>
      )}

      <div className="controls-hint">
        <span>MOUSE</span> AIM · <span>X</span> TARGET · <span>LMB/Z</span> FIRE · <span>W/S</span> PITCH ·
        <span>R/F</span> FLIP · <span>A/D</span> YAW · <span>Q/E</span> ROLL ·
        <span>TAB</span> GAS · <span>SPACE</span> BOOST · <span>B</span> DUST
      </div>
    </div>
  );
}
