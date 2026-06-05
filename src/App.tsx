import { GameCanvas } from './components/GameCanvas';
import { HUD } from './components/HUD';
import { TradePanel } from './components/TradePanel';
import './App.css';

function App() {
  return (
    <>
      <GameCanvas />
      <HUD />
      <TradePanel />
    </>
  );
}

export default App;
