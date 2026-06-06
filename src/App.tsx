import { useState, useEffect } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { HUD } from './components/HUD';
import { SidePanel } from './components/SidePanel';
import './App.css';

function App() {
  const [mobile, setMobile] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <div style={{ width: mobile ? '100%' : undefined, flex: mobile ? undefined : 1, position: 'relative' }}>
        <GameCanvas mobile={mobile} />
        <HUD />
        {mobile && (
          <button
            onClick={() => setPanelOpen(!panelOpen)}
            style={{
              position: 'absolute', top: 8, right: 8, zIndex: 200,
              background: 'rgba(0,10,30,0.8)', color: '#4af', border: '1px solid #4af',
              borderRadius: 4, padding: '6px 10px', fontSize: 16, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >☰</button>
        )}
      </div>
      {!mobile && <SidePanel />}
      {mobile && panelOpen && (
        <div style={mobile ? {
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          zIndex: 150, background: 'rgba(0,5,20,0.98)',
        } : {}}>
          <SidePanel mobile={mobile} onClose={() => setPanelOpen(false)} />
        </div>
      )}
    </div>
  );
}

export default App;
