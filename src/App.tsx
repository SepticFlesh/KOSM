import { useState, useEffect } from 'react';
import { MainMenu } from './components/MainMenu';
import { GameCanvas } from './components/GameCanvas';
import { MPGameView } from './components/MPGameView';
import { HUD } from './components/HUD';
import { TargetMarkers } from './components/TargetMarkers';
import { SidePanel } from './components/SidePanel';
import './App.css';

type AppMode = 'menu' | 'single-player' | 'multiplayer';

function App() {
  const [mode, setMode] = useState<AppMode>('menu');
  const [mobile, setMobile] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Main menu
  if (mode === 'menu') {
    return (
      <MainMenu
        onSelectSinglePlayer={() => setMode('single-player')}
        onSelectMultiplayer={() => setMode('multiplayer')}
      />
    );
  }

  // Back button (top-left corner, returns to menu)
  const backButton = (
    <button
      onClick={() => setMode('menu')}
      style={{
        position: 'absolute', top: 8, left: 8, zIndex: 300,
        background: 'rgba(0,10,30,0.8)', color: '#6cf', border: '1px solid rgba(100,170,255,0.4)',
        borderRadius: 4, padding: '4px 8px', fontSize: 12, cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >← Меню</button>
  );

  const isMP = mode === 'multiplayer';

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <div style={{ width: mobile ? '100%' : undefined, flex: mobile ? undefined : 1, position: 'relative' }}>
        {isMP ? <MPGameView mobile={mobile} /> : <GameCanvas mobile={mobile} />}
        <HUD />
        <TargetMarkers />
        {backButton}
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
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          zIndex: 150, background: 'rgba(0,5,20,0.98)',
        }}>
          <SidePanel mobile={mobile} onClose={() => setPanelOpen(false)} />
        </div>
      )}
    </div>
  );
}

export default App;
