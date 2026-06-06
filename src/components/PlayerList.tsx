/**
 * Shows players in the current system (MP mode).
 * Updated via world_snapshot data.
 */
export interface PlayerInfo {
  id: string;
  name: string;
  distance: number;
  health: number;
  shield: number;
}

interface PlayerListProps {
  players: PlayerInfo[];
  visible: boolean;
}

export function PlayerList({ players, visible }: PlayerListProps) {
  if (!visible || players.length <= 1) return null;

  return (
    <div style={{
      position: 'absolute', top: 40, right: 8, zIndex: 200,
      background: 'rgba(0,5,20,0.85)', border: '1px solid rgba(68,170,255,0.3)',
      borderRadius: 6, padding: '6px 10px', minWidth: 160,
      fontFamily: '"Courier New", monospace', fontSize: 10, color: '#6cf',
    }}>
      <div style={{ color: '#4af', fontSize: 10, marginBottom: 4, letterSpacing: 1 }}>
        PLAYERS ({players.length})
      </div>
      {players.map(p => (
        <div key={p.id} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '2px 0', borderBottom: '1px solid rgba(68,170,255,0.1)',
        }}>
          <span style={{ color: '#fff' }}>{p.name}</span>
          <span style={{ color: '#6cf', fontSize: 9 }}>
            {p.distance < 1000 ? `${Math.round(p.distance)} M` : `${(p.distance / 1000).toFixed(1)} KM`}
          </span>
        </div>
      ))}
    </div>
  );
}
