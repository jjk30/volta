import ChipIcon from './ChipIcon.jsx'

export default function Toolbar({ onSimulate, simulating, error, hasResult, onGenerate, generating, prompt, setPrompt }) {

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
      gap: '10px',
      padding: '6px 12px',
      background: 'var(--toolbar-bg)',
      borderBottom: '1px solid var(--border)',
      minHeight: '40px',
    }}>
      {/* VOLTA logo with green glow */}
      <div style={{
        fontWeight: 700,
        fontSize: '14px',
        color: 'var(--accent)',
        letterSpacing: '2px',
        fontFamily: "'JetBrains Mono', monospace",
        flexShrink: 0,
        textShadow: 'var(--accent-glow)',
      }}>
        VOLTA
      </div>

      <div style={{
        width: '1px',
        height: '20px',
        background: 'var(--border)',
        flexShrink: 0,
      }} />

      {/* Terminal-style prompt input */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: '3px',
        padding: '3px 8px',
        minWidth: 0,
      }}>
        <ChipIcon size={18} />
        <span style={{
          color: 'var(--accent)',
          fontSize: '13px',
          fontFamily: "'JetBrains Mono', monospace",
          animation: 'blink-cursor 1s step-end infinite',
          flexShrink: 0,
        }}>
          &gt;
        </span>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe a hardware design..."
          disabled={generating}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: '12px',
            fontFamily: "'JetBrains Mono', monospace",
            minWidth: 0,
            caretColor: 'var(--accent)',
          }}
        />
        <button
          onClick={handleGenerate}
          disabled={generating || !prompt.trim()}
          style={{
            padding: '3px 10px',
            border: '1px solid var(--accent)',
            borderRadius: '3px',
            background: 'transparent',
            color: 'var(--accent)',
            fontSize: '11px',
            fontWeight: 600,
            fontFamily: "'JetBrains Mono', monospace",
            cursor: generating ? 'wait' : (!prompt.trim() ? 'default' : 'pointer'),
            opacity: !prompt.trim() && !generating ? 0.4 : 1,
            transition: 'all 0.15s',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            if (!generating && prompt.trim()) {
              e.target.style.background = 'var(--accent)'
              e.target.style.color = '#000'
            }
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'transparent'
            e.target.style.color = 'var(--accent)'
          }}
        >
          {generating ? 'GENERATING...' : 'GENERATE'}
        </button>
      </div>

      <div style={{
        width: '1px',
        height: '20px',
        background: 'var(--border)',
        flexShrink: 0,
      }} />

      <button
        onClick={onSimulate}
        disabled={simulating}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '4px 12px',
          border: '1px solid var(--accent)',
          borderRadius: '3px',
          background: 'transparent',
          color: 'var(--accent)',
          fontSize: '12px',
          fontWeight: 600,
          fontFamily: "'JetBrains Mono', monospace",
          cursor: simulating ? 'wait' : 'pointer',
          transition: 'all 0.15s',
          flexShrink: 0,
          opacity: simulating ? 0.6 : 1,
        }}
        onMouseEnter={(e) => {
          if (!simulating) {
            e.target.style.background = 'var(--accent)'
            e.target.style.color = '#000'
          }
        }}
        onMouseLeave={(e) => {
          e.target.style.background = 'transparent'
          e.target.style.color = 'var(--accent)'
        }}
      >
        {simulating ? (
          <>
            <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>&#8635;</span>
            SIM...
          </>
        ) : (
          <>
            <span style={{ fontSize: '11px' }}>&#9654;</span>
            SIMULATE
          </>
        )}
      </button>

      {error && (
        <div style={{
          fontSize: '11px',
          color: 'var(--red)',
          fontFamily: "'JetBrains Mono', monospace",
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '250px',
          flexShrink: 0,
        }}>
          {error}
        </div>
      )}

      {!error && hasResult && (
        <div style={{
          fontSize: '11px',
          color: 'var(--accent)',
          fontFamily: "'JetBrains Mono', monospace",
          flexShrink: 0,
        }}>
          &#10003; done
        </div>
      )}
    </div>
  )
}
