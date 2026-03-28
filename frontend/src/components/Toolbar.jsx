export default function Toolbar({ onSimulate, simulating, error, hasResult }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '8px 16px',
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border)',
      minHeight: '48px',
    }}>
      <div style={{
        fontWeight: 600,
        fontSize: '15px',
        color: 'var(--accent)',
        letterSpacing: '0.5px',
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        VOLTA
      </div>

      <div style={{
        width: '1px',
        height: '24px',
        background: 'var(--border)',
      }} />

      <button
        onClick={onSimulate}
        disabled={simulating}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 16px',
          border: 'none',
          borderRadius: '6px',
          background: simulating ? 'var(--border)' : 'var(--accent)',
          color: simulating ? 'var(--text-dim)' : 'var(--bg-surface)',
          fontSize: '13px',
          fontWeight: 600,
          fontFamily: "'Inter', sans-serif",
          cursor: simulating ? 'wait' : 'pointer',
          transition: 'all 0.15s',
        }}
      >
        {simulating ? (
          <>
            <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>&#8635;</span>
            Simulating...
          </>
        ) : (
          <>
            <span style={{ fontSize: '16px' }}>&#9654;</span>
            Simulate
          </>
        )}
      </button>

      {error && (
        <div style={{
          fontSize: '12px',
          color: 'var(--red)',
          fontFamily: "'JetBrains Mono', monospace",
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '400px',
        }}>
          {error}
        </div>
      )}

      {!error && hasResult && (
        <div style={{
          fontSize: '12px',
          color: 'var(--green)',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          Simulation complete
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
