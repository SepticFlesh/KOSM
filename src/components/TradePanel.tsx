import { useGameStore, gameState } from '../ui/store/gameStore';
import { UPGRADES } from '../data/upgrades';

export function TradePanel() {
  const tradeOpen = useGameStore(s => s.tradeOpen);
  const tradeGoods = useGameStore(s => s.tradeGoods);
  const playerCredits = useGameStore(s => s.playerCredits);
  const cargoUsed = useGameStore(s => s.cargoUsed);
  const cargoMax = useGameStore(s => s.cargoMax);
  const missions = useGameStore(s => s.missions);
  const stationTab = useGameStore(s => s.stationTab);
  const upgrades = useGameStore(s => s.upgrades);
  if (!tradeOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 50, fontFamily: '"Courier New", monospace',
    }}>
      <div style={{
        background: 'rgba(0,5,20,0.95)', border: '1px solid #4af',
        borderRadius: 4, padding: '12px 20px', minWidth: 520, maxHeight: '80vh',
        overflow: 'auto', color: '#adf', pointerEvents: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ color: '#4af', fontSize: 16 }}>СТАНЦИЯ</span>
          <span>Cr: <span style={{ color: '#fa4' }}>{playerCredits.toLocaleString()}</span></span>
          <span>Груз: <span style={{ color: '#fa4' }}>{cargoUsed}/{cargoMax} т</span></span>
          <button onClick={() => gameState.closeTrade()} style={{
            background: '#333', color: '#f44', border: '1px solid #f44',
            cursor: 'pointer', padding: '2px 8px', fontFamily: 'inherit',
          }}>X</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8, borderBottom: '1px solid #4af' }}>
          {(['trade', 'missions', 'upgrades'] as const).map(tab => (
            <button key={tab} onClick={() => gameState.setStationTab(tab)} style={{
              background: stationTab === tab ? '#224' : 'transparent',
              color: stationTab === tab ? '#4af' : '#6cf',
              border: 'none', cursor: 'pointer', padding: '4px 12px', fontFamily: 'inherit',
            }}>{tab === 'trade' ? 'Рынок' : tab === 'missions' ? `Миссии (${missions.filter(m => !m.completed).length})` : 'Модули'}</button>
          ))}
        </div>

        {stationTab === 'upgrades' ? (
          /* Upgrades table */
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #4af', color: '#6cf', textAlign: 'left' }}>
                <th>Модуль</th><th>Уровень</th><th>Улучшение</th><th>Цена</th><th></th>
              </tr>
            </thead>
            <tbody>
              {UPGRADES.map(def => {
                const lvl = upgrades[def.id] || 1;
                const next = def.levels.find(l => l.level === lvl + 1);
                const current = def.levels.find(l => l.level === lvl);
                return (
                  <tr key={def.id} style={{ borderBottom: '1px solid rgba(68,170,255,0.15)' }}>
                    <td style={{ color: '#fff', padding: '2px 4px' }}>{def.name}</td>
                    <td style={{ color: '#fa4' }}>{lvl}/4 ({current?.description})</td>
                    <td style={{ color: '#afd' }}>{next ? next.description : 'Макс.'}</td>
                    <td style={{ color: '#fa4' }}>{next ? `${next.cost} Cr` : '-'}</td>
                    <td>
                      {next && (
                        <button onClick={() => gameState.buyUpgrade(def.id)}
                          disabled={playerCredits < next.cost}
                          style={{ background: '#225', color: '#4af', border: '1px solid #4af', cursor: 'pointer',
                            fontFamily: 'inherit', fontSize: 11, padding: '0 6px', opacity: playerCredits < next.cost ? 0.3 : 1 }}>
                          Купить
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : stationTab === 'trade' ? (
          /* Trade table */
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #4af', color: '#6cf', textAlign: 'left' }}>
                <th>Товар</th><th>Цена</th><th>У вас</th><th>Станция</th><th></th><th></th>
              </tr>
            </thead>
            <tbody>
              {tradeGoods.map(g => (
                <tr key={g.id} style={{ borderBottom: '1px solid rgba(68,170,255,0.15)' }}>
                  <td style={{ color: '#fff', padding: '2px 4px' }}>{g.name}</td>
                  <td style={{ color: '#fa4' }}>{g.price} Cr</td>
                  <td style={{ color: '#afd' }}>{g.playerQty} т</td>
                  <td style={{ color: '#afd' }}>{g.stationQty} т</td>
                  <td>
                    <button onClick={() => gameState.buyItem(g.id, 1)} disabled={g.stationQty < 1 || playerCredits < g.price || cargoUsed >= cargoMax}
                      style={{ background: '#252', color: '#4f4', border: '1px solid #4f4', cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 11, padding: '0 4px', opacity: g.stationQty < 1 ? 0.3 : 1 }}>Купить 1</button>
                  </td>
                  <td>
                    <button onClick={() => gameState.sellItem(g.id, 1)} disabled={g.playerQty < 1}
                      style={{ background: '#522', color: '#f44', border: '1px solid #f44', cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 11, padding: '0 4px', opacity: g.playerQty < 1 ? 0.3 : 1 }}>Продать 1</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          /* Missions table */
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #4af', color: '#6cf', textAlign: 'left' }}>
                <th>Миссия</th><th>Прогресс</th><th>Награда</th>
              </tr>
            </thead>
            <tbody>
              {missions.map(m => (
                <tr key={m.id} style={{
                  borderBottom: '1px solid rgba(68,170,255,0.15)',
                  opacity: m.completed ? 0.4 : 1,
                }}>
                  <td style={{ color: '#fff', padding: '2px 4px' }}>
                    <div>{m.title}</div>
                    <div style={{ fontSize: 10, color: '#6cf' }}>{m.description}</div>
                  </td>
                  <td style={{ color: m.completed ? '#4f4' : '#fa4' }}>
                    {m.completed ? '✓ Выполнено' : `${m.progress}/${m.target}`}
                  </td>
                  <td style={{ color: '#fa4' }}>{m.reward} Cr</td>
                </tr>
              ))}
              {missions.length === 0 && (
                <tr><td colSpan={3} style={{ color: '#6cf', textAlign: 'center', padding: 10 }}>Нет доступных миссий</td></tr>
              )}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 8, color: '#6cf', fontSize: 10 }}>T — закрыть</div>
      </div>
    </div>
  );
}
