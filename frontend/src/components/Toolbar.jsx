import { useState } from 'react'

export default function Toolbar({ onSimulate, simulating, error, hasResult, onGenerate, generating }) {
  const [prompt, setPrompt] = useState('')

  const handleGenerate = () => {
    if (!prompt.trim() || generating) return
    onGenerate(prompt.trim())
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleGenerate()
    }
  }

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
        flexShrink: 0,
      }}>
        VOLTA
      </div>

      <div style={{
        width: '1px',
        height: '24px',
        background: 'var(--border)',
        flexShrink: 0,
      }} />

      {/* AI Prompt Input */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        padding: '4px 8px',
        minWidth: 0,
      }}>
        <span style={{
          fontSize: '13px',
          color: 'var(--text-dim)',
          flexShrink: 0,
        }}>
          &#9889;
        </span>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe a hardware design... (e.g. 4-bit counter with reset and enable)"
          disabled={generating}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: '13px',
            fontFamily: "'Inter', sans-serif",
            minWidth: 0,
          }}
        />
        <button
          onClick={handleGenerate}
          disabled={generating || !prompt.trim()}
          style={{
            padding: '4px 12px',
            border: 'none',
            borderRadius: '4px',
            background: generating ? 'var(--border)' : 'var(--accent)',
            color: generating ? 'var(--text-dim)' : 'var(--bg-surface)',
            fontSize: '12px',
            fontWeight: 600,
            fontFamily: "'Inter', sans-serif",
            cursor: generating ? 'wait' : (!prompt.trim() ? 'default' : 'pointer'),
            opacity: !prompt.trim() && !generating ? 0.5 : 1,
            transition: 'all 0.15s',
            flexShrink: 0,
          }}
        >
          {generating ? 'Generating...' : 'Generate'}
        </button>
      </div>

      <div style={{
        width: '1px',
        height: '24px',
        background: 'var(--border)',
        flexShrink: 0,
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
          flexShrink: 0,
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
          maxWidth: '300px',
          flexShrink: 0,
        }}>
          {error}
        </div>
      )}

      {!error && hasResult && (
        <div style={{
          fontSize: '12px',
          color: 'var(--green)',
          fontFamily: "'JetBrains Mono', monospace",
          flexShrink: 0,
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
