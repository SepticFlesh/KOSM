import { useRef, useEffect, useState } from 'react';
import { useGameStore, gameState } from '../ui/store/gameStore';
import { UPGRADES } from '../data/upgrades';

function MapMini({ data }: any) {
  const [mapState, setMapState] = useState<{ents:any[];routes:any[];ship:{x:number;z:number;angle:number}}>({ents:[],routes:[],ship:{x:600,z:-800,angle:0}});

  useEffect(() => {
    const iv = setInterval(() => {
      const hud = (window as any).__kosmHUD;
      setMapState({
        ents: (window as any).__kosmMPEntities || [],
        routes: (window as any).__kosmRoutes || (data?.routes || []),
        ship: { x: hud?._shipX||600, z: hud?._shipZ||-800, angle: hud?._shipYaw||0 },
      });
    }, 500);
    return () => clearInterval(iv);
  }, [data]);

  const size = 280, range = 200000;
  const scale = (size/2)/range;
  const cx = size/2, cy = size/2;
  const {ship, ents, routes} = mapState;
  const cosA = Math.cos(-ship.angle), sinA = Math.sin(-ship.angle);
  const proj = (wx:number,wz:number) => {
    const dx=wx-ship.x, dz=wz-ship.z;
    return {x:cx-(dx*cosA-dz*sinA)*scale, y:cy-(dx*sinA+dz*cosA)*scale};
  };

  return (
    <div style={{width:size,height:size,background:'rgba(0,5,15,0.95)',position:'relative',overflow:'hidden',borderRadius:4,border:'1px solid rgba(68,170,255,0.2)'}}>
      {/* Grid lines via SVG */}
      <svg width={size} height={size} style={{position:'absolute',top:0,left:0}}>
        {[-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,7,8].map(i => {
          const gx = ship.x + i*(range/8), gz = ship.z + i*(range/8);
          const s1=proj(gx, ship.z-range), e1=proj(gx, ship.z+range);
          const s2=proj(ship.x-range, gz), e2=proj(ship.x+range, gz);
          return (<g key={i}>
            <line x1={s1.x} y1={s1.y} x2={e1.x} y2={e1.y} stroke="rgba(68,170,255,0.08)" strokeWidth={0.5}/>
            <line x1={s2.x} y1={s2.y} x2={e2.x} y2={e2.y} stroke="rgba(68,170,255,0.08)" strokeWidth={0.5}/>
          </g>);
        })}
        {/* Route lines */}
        {routes.map((r:any,ri:number) =>
          r.waypoints?.slice(0,-1).map((wp:any,wi:number) => {
            const wp2 = r.waypoints[wi+1];
            const p1=proj(wp.x,wp.z), p2=proj(wp2.x,wp2.z);
            return <line key={`${ri}_${wi}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={r.type==='trade'?'rgba(255,170,0,0.35)':'rgba(0,170,255,0.25)'} strokeWidth={0.6}/>;
          })
        )}
      </svg>
      {/* Entity dots */}
      {ents.map((e:any,i:number) => {
        const p = proj(e.px, e.pz);
        if (p.x<0||p.x>size||p.y<0||p.y>size) return null;
        const c = e.npcType==='base'?'#4f4':(e.npcType==='trader'||e.npcType==='shuttle')?'#fa0':e.isPlayer?'#48f':'#f44';
        const s = e.npcType==='base'||e.isPlayer?3:1;
        return <div key={i} style={{position:'absolute',left:p.x-s/2,top:p.y-s/2,width:s,height:s,background:c,borderRadius:s>1?1:0}}/>;
      })}
      {/* Player */}
      <div style={{position:'absolute',left:cx-5,top:cy-8,width:0,height:0,borderLeft:'5px solid transparent',borderRight:'5px solid transparent',borderBottom:'10px solid #fff'}}/>
      <div style={{position:'absolute',bottom:2,left:4,fontSize:8,color:'rgba(68,170,255,0.4)',fontFamily:'monospace'}}>200K</div>
    </div>
  );
}

export function SidePanel({ mobile, onClose }: { mobile?: boolean; onClose?: () => void }) {
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
      width: mobile ? '100%' : 300, height: '100vh', background: 'rgba(0,5,20,0.95)',
      borderLeft: mobile ? 'none' : '1px solid rgba(68,170,255,0.3)', color: '#adf',
      fontFamily: '"Courier New", monospace', fontSize: mobile ? 13 : 11,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {mobile && (
        <div style={{ textAlign: 'right', padding: '4px 8px' }}>
          <button onClick={onClose} style={{ background: '#333', color: '#f44', border: '1px solid #f44', cursor: 'pointer', fontFamily: 'inherit', fontSize: 16, padding: '4px 12px' }}>✕</button>
        </div>
      )}
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
                <div style={{ color: m.completed?'#4f4':'#fa4' }}>{m.completed ? '✓' : `${m.progress}/${m.target}`} — {m.reward} Cr</div>
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
