import { useRef, useEffect, useState } from 'react';
import { useGameStore, gameState } from '../ui/store/gameStore';
import { UPGRADES } from '../data/upgrades';

function MapMini({ data }: any) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = cvRef.current; if (!cv || !data) return;
    const size = 280, dpr = 2;
    cv.width = size * dpr; cv.height = size * dpr;
    cv.style.width = size + 'px'; cv.style.height = size + 'px';
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'rgba(0,5,15,0.9)'; ctx.fillRect(0, 0, size, size);
    const cx = size / 2, cy = size / 2, range = data.range || 150000;
    ctx.strokeStyle = 'rgba(68,170,255,0.15)'; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 8; i++) {
      const x = (i / 8) * size; const y = (i / 8) * size;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
    }
    for (const obj of data.objects || []) {
      const px = cx + (obj.x / range) * (size / 2);
      const py = cy - (obj.z / range) * (size / 2);
      ctx.fillStyle = obj.color; ctx.beginPath(); ctx.arc(px, py, Math.max(2, obj.r), 0, Math.PI*2); ctx.fill();
      if (obj.isPlayer) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(px, py);
        ctx.lineTo(px + Math.sin(obj.angle||0)*10, py - Math.cos(obj.angle||0)*10);
        ctx.stroke();
      }
    }
  }, [data]);
  return <canvas ref={cvRef} />;
}

export function SidePanel() {
  const credits = useGameStore(s => s.playerCredits);
  const cargoU = useGameStore(s => s.cargoUsed);
  const cargoM = useGameStore(s => s.cargoMax);
  const missions = useGameStore(s => s.missions);
  const upgrades = useGameStore(s => s.upgrades);
  const tradeGoods = useGameStore(s => s.tradeGoods);
  const mapData = useGameStore(s => s.mapData);
  const rep = useGameStore(s => s.reputation);
  const [tab, setTab] = useState('market');

  return (
    <div style={{
      width: 300, height: '100vh', background: 'rgba(0,5,20,0.95)',
      borderLeft: '1px solid rgba(68,170,255,0.3)', color: '#adf',
      fontFamily: '"Courier New", monospace', fontSize: 11,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Reputation */}
      <div style={{ padding: '6px 10px', borderBottom: '1px solid rgba(68,170,255,0.2)', fontSize: 10 }}>
        {['federation','miners','traders','pirates'].map(id => {
          const r = rep[id] || 0;
          const names: Record<string,string> = { federation: 'Фед', miners: 'Шахт', traders: 'Торг', pirates: 'Пират' };
          const colors: Record<string,string> = { federation: '#48f', miners: '#f80', traders: '#fc0', pirates: '#f22' };
          return <span key={id} style={{ color: colors[id], marginRight: 10 }}>{names[id]}: {r>=0?'+':''}{r}</span>;
        })}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(68,170,255,0.2)' }}>
        {[
          { id: 'market', label: 'Рынок' },
          { id: 'missions', label: 'Миссии' },
          { id: 'upgrades', label: 'Модули' },
          { id: 'map', label: 'Карта' },
          { id: 'help', label: 'Упр.' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, background: tab === t.id ? '#112244' : 'transparent',
            color: tab === t.id ? '#4af' : '#6cf', border: 'none',
            cursor: 'pointer', padding: '4px 0', fontSize: 10, fontFamily: 'inherit',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 10px' }}>
        <div style={{ color: '#fa4', marginBottom: 4 }}>Cr: {credits.toLocaleString()} | Груз: {cargoU}/{cargoM}T</div>
        {tab === 'market' && (
          <div>
            {tradeGoods.length === 0 && <div style={{ color: '#6cf' }}>Подлетите к станции и нажмите T</div>}
            {tradeGoods.map((g: any) => (
              <div key={g.id} style={{ display: 'flex', gap: 4, marginBottom: 2, fontSize: 10 }}>
                <span style={{ flex: 1, color: '#fff' }}>{g.name}</span>
                <span style={{ color: '#fa4', width: 35, textAlign: 'right' }}>{g.price}</span>
                <span style={{ color: '#6cf', width: 25, textAlign: 'center' }}>{g.playerQty}</span>
                <button onClick={() => gameState.buyItem(g.id, 1)} disabled={g.stationQty<1||credits<g.price||cargoU>=cargoM}
                  style={{ background:'#252',color:'#4f4',border:'1px solid #4f4',cursor:'pointer',fontFamily:'inherit',fontSize:9,padding:'0 3px' }}>+</button>
                <button onClick={() => gameState.sellItem(g.id, 1)} disabled={g.playerQty<1}
                  style={{ background:'#522',color:'#f44',border:'1px solid #f44',cursor:'pointer',fontFamily:'inherit',fontSize:9,padding:'0 3px' }}>-</button>
              </div>
            ))}
          </div>
        )}
        {tab === 'missions' && (
          <div>
            {missions.map((m: any) => (
              <div key={m.id} style={{ marginBottom: 3, opacity: m.completed?0.4:1, fontSize: 10 }}>
                <div style={{ color: '#fff' }}>{m.title}</div>
                <div style={{ color: '#6cf' }}>{m.description}</div>
                <div style={{ color: m.completed?'#4f4':'#fa4' }}>{m.completed?'✓':'${m.progress}/${m.target}'} — {m.reward} Cr</div>
              </div>
            ))}
          </div>
        )}
        {tab === 'upgrades' && (
          <div>
            {UPGRADES.map(def => {
              const lvl = upgrades[def.id] || 1;
              const next = def.levels.find(l => l.level === lvl + 1);
              return (
                <div key={def.id} style={{ marginBottom: 3, fontSize: 10 }}>
                  <div style={{ color: '#fff' }}>{def.name} Lv.{lvl}</div>
                  {next && <button onClick={() => gameState.buyUpgrade(def.id)} disabled={credits < next.cost}
                    style={{ background:'#225',color:'#4af',border:'1px solid #4af',cursor:'pointer',fontFamily:'inherit',fontSize:9,padding:'1px 6px',marginTop:1 }}>
                    {next.description} — {next.cost} Cr</button>}
                </div>
              );
            })}
          </div>
        )}
        {tab === 'map' && <MapMini data={mapData} />}
        {tab === 'help' && (
          <div style={{ color: '#6cf', lineHeight: 1.8, fontSize: 10 }}>
            <b>W/S/R/F</b> Pitch<br />
            <b>A/D</b> Yaw · <b>Q/E</b> Roll<br />
            <b>,/.</b> Throttle · <b>Tab</b> 100%<br />
            <b>Space</b> Boost · <b>X</b> Target<br />
            <b>Z/Alt</b> Fire · <b>M</b> Mine<br />
            <b>1-3</b> Mode · <b>J</b> Jump<br />
            <b>N</b> Music · <b>B</b> Dust<br />
            <b>O</b> Map · <b>T</b> Station<br />
          </div>
        )}
      </div>
    </div>
  );
}
