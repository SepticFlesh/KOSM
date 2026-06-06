import { GameCanvas } from './components/GameCanvas';
import { HUD } from './components/HUD';
import { SidePanel } from './components/SidePanel';
import './App.css';

function App() {
  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        <GameCanvas />
        <HUD />
      </div>
      <SidePanel />
    </div>
  );
}

export default App;
