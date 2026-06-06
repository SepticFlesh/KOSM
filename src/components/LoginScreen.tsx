interface LoginScreenProps {
  onLogin: () => void;
  loading: boolean;
  error?: string;
}

export function LoginScreen({ onLogin, loading, error }: LoginScreenProps) {
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at center, #001133 0%, #000011 70%)',
      color: '#fa4', fontFamily: '"Courier New", monospace', zIndex: 50, gap: 16,
    }}>
      <div style={{ fontSize: 36, letterSpacing: 8, color: '#4af', textShadow: '0 0 30px rgba(68,170,255,0.4)' }}>
        AIATOR
      </div>
      <div style={{ fontSize: 14, color: '#6cf', letterSpacing: 4 }}>MULTIPLAYER</div>

      {loading ? (
        <div style={{ color: '#f84' }}>
          <div style={{ fontSize: 16, marginBottom: 8 }}>Connecting...</div>
          <div style={{ fontSize: 11, opacity: 0.6 }}>Complete GitHub authorization in the popup window</div>
        </div>
      ) : (
        <button
          onClick={onLogin}
          style={{
            background: '#24292e', color: '#fff', border: '1px solid #444',
            borderRadius: 6, padding: '12px 28px', fontSize: 15, cursor: 'pointer',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10,
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = '#333'; }}
          onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = '#24292e'; }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          Sign in with GitHub
        </button>
      )}

      {error && (
        <div style={{ color: '#f44', fontSize: 12, maxWidth: 300, textAlign: 'center' }}>
          {error}
        </div>
      )}

      <div style={{ color: 'rgba(100,170,255,0.3)', fontSize: 10, marginTop: 32 }}>
        Your progress is saved on the server
      </div>
    </div>
  );
}
