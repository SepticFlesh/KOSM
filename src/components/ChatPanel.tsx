import { useState, useEffect, useRef } from 'react';

interface ChatMessage {
  playerName: string;
  text: string;
  timestamp: number;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  visible: boolean;
}

export function ChatPanel({ messages, onSend, visible }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  if (!visible) return null;

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSend();
    if (e.key === 'Escape') setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'absolute', bottom: 8, left: 8, zIndex: 200,
          background: 'rgba(0,10,30,0.8)', color: '#fa4',
          border: '1px solid rgba(255,170,68,0.4)', borderRadius: 4,
          padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
        }}
      >💬 Chat</button>
    );
  }

  return (
    <div style={{
      position: 'absolute', bottom: 8, left: 8, width: 280, maxHeight: 300,
      zIndex: 200, background: 'rgba(0,5,20,0.95)',
      border: '1px solid rgba(255,170,68,0.3)', borderRadius: 6,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: '"Courier New", monospace', fontSize: 11,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '4px 8px', borderBottom: '1px solid rgba(255,170,68,0.2)',
        color: '#fa4', fontSize: 10,
      }}>
        <span>Chat</span>
        <button onClick={() => setOpen(false)} style={{
          background: 'none', border: 'none', color: '#f84', cursor: 'pointer', fontSize: 14,
        }}>✕</button>
      </div>
      <div ref={listRef} style={{
        flex: 1, overflow: 'auto', padding: '4px 8px', maxHeight: 200,
        display: 'flex', flexDirection: 'column', gap: 2,
      }}>
        {messages.length === 0 && (
          <div style={{ color: 'rgba(255,170,68,0.4)', fontStyle: 'italic', padding: '8px 0' }}>
            No messages yet
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ color: '#ccc', lineHeight: 1.4 }}>
            <span style={{ color: '#fa4' }}>{m.playerName}:</span>{' '}
            <span style={{ color: '#ddd' }}>{m.text}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', borderTop: '1px solid rgba(255,170,68,0.2)' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message..."
          maxLength={200}
          style={{
            flex: 1, background: 'rgba(0,10,30,0.9)', border: 'none', color: '#fff',
            padding: '6px 8px', fontFamily: 'inherit', fontSize: 11, outline: 'none',
          }}
          autoFocus
        />
        <button onClick={handleSend} style={{
          background: '#441', color: '#fa4', border: 'none',
          padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
        }}>▶</button>
      </div>
    </div>
  );
}
