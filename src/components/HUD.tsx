import { useEffect, useRef } from 'react';

function RadarCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let running = true;
    const draw = () => {
      if (!running) return;
      const canvas = canvasRef.current;
      if (!canvas) { requestAnimationFrame(draw); return; }
      const blips = (window as any).__kosmRadarBlips || [];
      const size = 150, dpr = 2;
      canvas.width = size * dpr; canvas.height = size * dpr;
      canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cx = size/2, cy = size/2, maxR = size/2 - 5;
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = 'rgba(0,10,30,0.75)';
      ctx.beginPath(); ctx.arc(cx, cy, maxR, 0, Math.PI*2); ctx.fill();
      for (let r = maxR*0.25; r <= maxR; r += maxR*0.25) {
        ctx.strokeStyle = 'rgba(68,170,255,0.2)'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(68,170,255,0.3)'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(cx-maxR,cy); ctx.lineTo(cx+maxR,cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx,cy-maxR); ctx.lineTo(cx,cy+maxR); ctx.stroke();
      for (const b of blips) {
        const bx = cx + b.x * maxR * 0.9, by = cy - b.y * maxR * 0.7;
        const stem = (b.height||0) * maxR * 0.4, sy = by + stem;
        const isSt = b.type === 'station';
        const cr = isSt ? 100 : Math.round(200*b.health+55);
        const cg = isSt ? 180 : Math.round(40*b.health);
        const cb = isSt ? 255 : 0;
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.5)`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, sy); ctx.stroke();
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        if (isSt) { ctx.beginPath(); ctx.moveTo(bx,by-4); ctx.lineTo(bx+4,by); ctx.lineTo(bx,by+4); ctx.lineTo(bx-4,by); ctx.closePath(); ctx.fill(); }
        else ctx.fillRect(bx-2.5, by-2.5, 5, 5);
      }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = 'rgba(68,170,255,0.4)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, maxR, 0, Math.PI*2); ctx.stroke();
      requestAnimationFrame(draw);
    };
    draw();
    return () => { running = false; };
  }, []);
  return <canvas ref={canvasRef} style={{ display: 'block' }} />;
}

export function HUD() {
  return (
    <div id="hud-overlay">
      <div id="hud-dmg" style={{ position:'absolute',top:0,left:0,width:'100%',height:'100%',background:'rgba(255,0,0,0)',pointerEvents:'none',zIndex:100,display:'none' }} />
      <div id="hud-hit" style={{ position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',color:'rgba(255,100,0,0)',fontSize:28,fontWeight:'bold',pointerEvents:'none',zIndex:101,textShadow:'0 0 10px rgba(255,100,0,0.8)',display:'none' }}>✕</div>

      <div className="hud-fps">
        <div style={{ color: '#fa4', marginBottom: 2 }} id="hud-starname">Нова</div>
        <span id="hud-fps">60 FPS</span>
      </div>

      <div id="hud-target" style={{ position:'absolute',top:'40%',left:'50%',transform:'translate(-50%,-50%)',color:'#f84',fontSize:11,fontFamily:'"Courier New",monospace',pointerEvents:'none',zIndex:10,textShadow:'0 0 6px rgba(255,100,0,0.6)',textAlign:'center',display:'none' }}>TARGET: 0 M</div>

      <div className="speed-indicator">
        <div className="speed-value" id="hud-speed">0</div>
        <div className="speed-label">M/S</div>
      </div>

      <div className="flight-mode" id="hud-mode">ASSIST</div>

      <div className="throttle-bar">
        <div className="throttle-label">THR</div>
        <div className="throttle-track"><div className="throttle-fill" id="hud-thr" style={{ height:'0%' }} /></div>
        <div className="throttle-value" id="hud-thrval">0%</div>
      </div>

      <div className="boost-bar">
        <div className="boost-label">BST</div>
        <div className="boost-track"><div className="boost-fill" id="hud-bst" style={{ height:'100%' }} /></div>
        <div className="throttle-value" id="hud-bstval" style={{ color:'#fa4' }}>100%</div>
      </div>

      <div className="ship-status">
        <div className="status-row"><span className="status-label">SHIELD</span><div className="status-bar"><div className="status-fill shield" id="hud-shield" style={{ width:'100%' }} /></div><span className="status-value" id="hud-shieldval">100%</span></div>
        <div className="status-row"><span className="status-label">HULL</span><div className="status-bar"><div className="status-fill hull" id="hud-hull" style={{ width:'100%' }} /></div><span className="status-value" id="hud-hullval">100%</span></div>
        <div className="status-distance" id="hud-dist">STAR: 0 M</div>
        <div className="status-distance" id="hud-cargo" style={{ color:'#fa4' }}>CARGO: 0/20 T</div>
      </div>

      <div className="radar-container">
        <div className="radar-label">SCANNER</div>
        <RadarCanvas />
      </div>

      <div className="controls-hint">
        <span>MOUSE</span> AIM · <span>X</span> TARGET · <span>LMB/Z</span> FIRE · <span>W/S</span> PITCH · <span>R/F</span> FLIP · <span>A/D</span> YAW · <span>Q/E</span> ROLL · <span>TAB</span> GAS · <span>SPACE</span> BOOST · <span>B</span> DUST · <span>O</span> MAP
      </div>
    </div>
  );
}
