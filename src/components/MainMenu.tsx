import './MainMenu.css';

interface MainMenuProps {
  onSelectSinglePlayer: () => void;
  onSelectMultiplayer: () => void;
}

export function MainMenu({ onSelectSinglePlayer, onSelectMultiplayer }: MainMenuProps) {
  return (
    <div className="main-menu">
      <div className="menu-stars" />
      <div className="menu-content">
        <h1 className="menu-title">AIATOR</h1>
        <p className="menu-subtitle">Космический симулятор</p>
        <div className="menu-buttons">
          <button className="menu-btn sp-btn" onClick={onSelectSinglePlayer}>
            <span className="btn-icon">🪐</span>
            Single Player
            <span className="btn-hint">Без авторизации</span>
          </button>
          <button className="menu-btn mp-btn" onClick={onSelectMultiplayer}>
            <span className="btn-icon">🌐</span>
            Multiplayer
            <span className="btn-hint">GitHub аккаунт</span>
          </button>
        </div>
        <p className="menu-footer">Phase 3 · Open Source</p>
      </div>
    </div>
  );
}
