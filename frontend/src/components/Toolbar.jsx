import { useState, useEffect } from 'react'
import ChipIcon from './ChipIcon.jsx'

const GEN_STAGES = [
  'Interpreting prompt...',
  'Building design spec...',
  'Generating Verilog...',
  'Verifying with Yosys...',
  'Creating testbench...',
  'Compiling...',
]

const SIM_STAGES = [
  'Compiling design...',
  'Linking testbench...',
  'Running iverilog...',
  'Parsing VCD...',
  'Rendering waveform...',
]

function LoadingIndicator({ stages }) {
  const [stageIdx, setStageIdx] = useState(0)

  useEffect(() => {
    setStageIdx(0)
    const timer = setInterval(() => {
      setStageIdx((prev) => (prev + 1) % stages.length)
    }, 800)
    return () => clearInterval(timer)
  }, [stages])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#00ff41',
              animation: `toolbar-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
      <span style={{
        fontSize: '10px',
        color: 'var(--accent)',
        fontFamily: "'JetBrains Mono', monospace",
        whiteSpace: 'nowrap',
      }}>
        {stages[stageIdx]}
      </span>
      <style>{`
        @keyframes toolbar-dot {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}

const selectStyle = {
  padding: '3px 6px',
  background: '#000',
  border: '1px solid var(--border)',
  borderRadius: '3px',
  color: 'var(--accent)',
  fontSize: '10px',
  fontFamily: "'JetBrains Mono', monospace",
  cursor: 'pointer',
  width: '110px',
  flexShrink: 0,
}

export default function Toolbar({
  onSimulate, onCancelSimulate, simulating,
  error, hasResult,
  onGenerate, onCancelGenerate, generating,
  prompt, setPrompt,
  cancelled,
  canSimulate = true,
}) {

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
      gap: '8px',
      padding: '5px 10px',
      background: 'var(--toolbar-bg)',
      borderBottom: '1px solid var(--border)',
      minHeight: '38px',
    }}>
      {/* VOLTA logo */}
      <div style={{
        fontWeight: 700,
        fontSize: '13px',
        color: 'var(--accent)',
        letterSpacing: '2px',
        fontFamily: "'JetBrains Mono', monospace",
        flexShrink: 0,
        textShadow: 'var(--accent-glow)',
      }}>
        VOLTA
      </div>

      <div style={{ width: '1px', height: '18px', background: 'var(--border)', flexShrink: 0 }} />

      {/* Compact inline dropdowns */}
      <select defaultValue="Verilog" style={selectStyle}>
        <option value="Verilog">Verilog</option>
        <option disabled>SystemVerilog</option>
        <option disabled>VHDL</option>
        <option disabled>Python (Cocotb)</option>
        <option disabled>C++ (SystemC)</option>
      </select>

      <select defaultValue="Icarus Verilog" style={selectStyle}>
        <option value="Icarus Verilog">Icarus</option>
        <option disabled>Verilator</option>
        <option disabled>Yosys</option>
      </select>

      <select defaultValue="None" style={{ ...selectStyle, width: '100px' }}>
        <option value="None">No Verif</option>
        <option disabled>UVM 1.2</option>
        <option disabled>UVM 1800.2</option>
        <option disabled>OVM 2.1.2</option>
      </select>

      <div style={{ width: '1px', height: '18px', background: 'var(--border)', flexShrink: 0 }} />

      {/* Prompt input */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: '3px',
        padding: '2px 8px',
        minWidth: 0,
      }}>
        <ChipIcon size={16} />
        <span style={{
          color: 'var(--accent)',
          fontSize: '12px',
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
            fontSize: '11px',
            fontFamily: "'JetBrains Mono', monospace",
            minWidth: 0,
            caretColor: 'var(--accent)',
          }}
        />
        {generating ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <LoadingIndicator stages={GEN_STAGES} />
            <button
              onClick={onCancelGenerate}
              style={{
                padding: '2px 8px',
                border: '1px solid #ff4444',
                borderRadius: '3px',
                background: 'transparent',
                color: '#ff4444',
                fontSize: '10px',
                fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace",
                cursor: 'pointer',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => { e.target.style.background = '#ff4444'; e.target.style.color = '#000' }}
              onMouseLeave={(e) => { e.target.style.background = 'transparent'; e.target.style.color = '#ff4444' }}
            >
              CANCEL
            </button>
          </div>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim()}
            style={{
              padding: '2px 8px',
              border: '1px solid var(--accent)',
              borderRadius: '3px',
              background: 'transparent',
              color: 'var(--accent)',
              fontSize: '10px',
              fontWeight: 600,
              fontFamily: "'JetBrains Mono', monospace",
              cursor: !prompt.trim() ? 'default' : 'pointer',
              opacity: !prompt.trim() ? 0.4 : 1,
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { if (prompt.trim()) { e.target.style.background = 'var(--accent)'; e.target.style.color = '#000' } }}
            onMouseLeave={(e) => { e.target.style.background = 'transparent'; e.target.style.color = 'var(--accent)' }}
          >
            GENERATE
          </button>
        )}
      </div>

      {/* Simulate button */}
      {simulating ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <LoadingIndicator stages={SIM_STAGES} />
          <button
            onClick={onCancelSimulate}
            style={{
              padding: '3px 10px',
              border: '1px solid #ff4444',
              borderRadius: '3px',
              background: 'transparent',
              color: '#ff4444',
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: "'JetBrains Mono', monospace",
              cursor: 'pointer',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.target.style.background = '#ff4444'; e.target.style.color = '#000' }}
            onMouseLeave={(e) => { e.target.style.background = 'transparent'; e.target.style.color = '#ff4444' }}
          >
            CANCEL
          </button>
        </div>
      ) : (
        <button
          onClick={onSimulate}
          disabled={!canSimulate}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 10px',
            border: `1px solid ${canSimulate ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: '3px',
            background: 'transparent',
            color: canSimulate ? 'var(--accent)' : '#333',
            fontSize: '11px',
            fontWeight: 600,
            fontFamily: "'JetBrains Mono', monospace",
            cursor: canSimulate ? 'pointer' : 'default',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { if (canSimulate) { e.target.style.background = 'var(--accent)'; e.target.style.color = '#000' } }}
          onMouseLeave={(e) => { e.target.style.background = 'transparent'; e.target.style.color = canSimulate ? 'var(--accent)' : '#333' }}
        >
          <span style={{ fontSize: '10px' }}>&#9654;</span>
          SIM
        </button>
      )}

      {/* Status */}
      {cancelled && (
        <span style={{ fontSize: '10px', color: '#ff4444', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
          Cancelled
        </span>
      )}
      {error && !cancelled && (
        <span style={{ fontSize: '10px', color: 'var(--red)', fontFamily: "'JetBrains Mono', monospace", maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {error}
        </span>
      )}
      {!error && !cancelled && hasResult && (
        <span style={{ fontSize: '10px', color: 'var(--accent)', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
          &#10003;
        </span>
      )}
    </div>
  )
}
