import ChipIcon from './ChipIcon.jsx'

// The select dropdown arrow is a small SVG baked into a data URL.
// To keep it in sync with the theme, we embed both arrow colors and
// flip between them based on the theme prop.
function makeSelectStyle(theme) {
  // Dark = bright green, Light = dark green
  const stroke = theme === 'light' ? '%23006622' : '%2300ff41'
  return {
    padding: '2px 14px 2px 4px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border-primary)',
    borderRadius: '2px',
    color: 'var(--accent-primary)',
    fontSize: '0.75rem',
    fontFamily: "'JetBrains Mono', monospace",
    cursor: 'pointer',
    width: '80px',
    flexShrink: 0,
    appearance: 'none',
    WebkitAppearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='8' height='5' viewBox='0 0 8 5' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L4 4L7 1' stroke='${stroke}' stroke-width='1' stroke-linecap='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 3px center',
  }
}

export default function Toolbar({
  onSimulate, onCancelSimulate, simulating,
  onSynthesize, onCancelSynthesize, synthesizing,
  error, hasResult,
  onGenerate, onCancelGenerate, generating,
  onVerify, onCancelVerify, verifying,
  prompt, setPrompt,
  cancelled,
  canSimulate = true,
  canSynthesize = true,
  canVerify = false,
  projectName = 'untitled',
  projectStatus = '',
  projectSearch = '',
  setProjectSearch = () => {},
  theme = 'dark',
  onToggleTheme = () => {},
  target = 'Icarus',
  setTarget = () => {},
  selectionVerdict = null,
  language = 'verilog',
  setLanguage = () => {},
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

  const selectStyle = makeSelectStyle(theme)

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '5px 10px',
      background: 'var(--toolbar-bg)',
      borderBottom: '1px solid var(--border-primary)',
      minHeight: '38px',
    }}>
      {/* VOLTA logo */}
      <div style={{
        fontWeight: 700,
        fontSize: '13px',
        color: 'var(--accent-primary)',
        letterSpacing: '2px',
        fontFamily: "'JetBrains Mono', monospace",
        flexShrink: 0,
        textShadow: 'var(--accent-glow)',
      }}>
        VOLTA
      </div>

      {/* Project label + status */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        flexShrink: 0,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>Project:</span>
        <span style={{ color: 'var(--accent-primary)', fontSize: '11px', fontWeight: 600 }}>
          {projectName}
        </span>
        {projectStatus && (
          <span style={{
            color: projectStatus === 'Modified' ? 'var(--warning)' : 'var(--accent-secondary)',
            fontSize: '9px',
            letterSpacing: '0.5px',
            border: `1px solid ${projectStatus === 'Modified' ? 'var(--status-modified-border)' : 'var(--status-saved-border)'}`,
            borderRadius: '2px',
            padding: '1px 6px',
            background: projectStatus === 'Modified' ? 'var(--status-modified-bg)' : 'var(--status-saved-bg)',
          }}>
            {projectStatus === 'Modified' ? 'Modified' : 'Saved: Just now'}
          </span>
        )}
      </div>

      {/* Project Search Input (placeholder) */}
      <input
        type="text"
        value={projectSearch}
        onChange={(e) => setProjectSearch(e.target.value)}
        placeholder="Project Search Input"
        aria-label="Project Search Input"
        style={{
          width: '140px',
          flexShrink: 0,
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: '2px',
          padding: '3px 8px',
          color: 'var(--text-primary)',
          fontSize: '10px',
          fontFamily: "'JetBrains Mono', monospace",
          outline: 'none',
          caretColor: 'var(--accent-primary)',
        }}
      />

      <div style={{ width: '1px', height: '18px', background: 'var(--border-primary)', flexShrink: 0 }} />

      {/* Compact inline dropdowns */}
      <select
        value={
          language === 'python' ? 'Python'
          : language === 'systemverilog' ? 'SystemVerilog'
          : 'Verilog'
        }
        onChange={(e) => {
          const v = e.target.value
          setLanguage(
            v === 'Python' ? 'python'
            : v === 'SystemVerilog' ? 'systemverilog'
            : 'verilog'
          )
        }}
        disabled={generating}
        style={{
          ...selectStyle,
          width: '210px',
          opacity: generating ? 0.5 : 1,
          cursor: generating ? 'not-allowed' : 'pointer',
        }}
        title={
          generating
            ? 'Generation in progress — switching language is disabled'
            : 'Source language for the design and testbench (auto-converts the current code on change)'
        }
      >
        <option value="Verilog">Verilog</option>
        <option value="SystemVerilog">SystemVerilog</option>
        <option value="Python">Python (Amaranth + Cocotb)</option>
        <option disabled>VHDL</option>
        <option disabled>C++ (SystemC)</option>
      </select>

      {/* Target dropdown — drives whether SIM runs simulation or FPGA synthesis */}
      <select
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        style={{ ...selectStyle, width: '110px' }}
        title="Target (simulator or synthesis target)"
      >
        <option value="Icarus">Icarus</option>
        <option value="iCE40 FPGA">iCE40 FPGA</option>
        <option value="ECP5 FPGA">ECP5 FPGA</option>
        <option disabled>Verilator (soon)</option>
      </select>

      <select defaultValue="None" style={selectStyle}>
        <option value="None">None</option>
        <option disabled>UVM 1.2</option>
        <option disabled>UVM 1800.2</option>
        <option disabled>OVM 2.1.2</option>
      </select>

      <div style={{ width: '1px', height: '18px', background: 'var(--border-primary)', flexShrink: 0 }} />

      {/* Prompt input */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: '3px',
        padding: '2px 8px',
        minWidth: 0,
      }}>
        <ChipIcon size={16} />
        <span style={{
          color: 'var(--accent-primary)',
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
            caretColor: 'var(--accent-primary)',
          }}
        />
      </div>

      {/* Selection verdict badge — shown only when symbols are selected */}
      <VerdictBadge verdict={selectionVerdict} />

      {/* GENERATE button (moved to right end) */}
      {generating ? (
        <CancelButton onClick={onCancelGenerate} />
      ) : (
        <ActionButton
          onClick={handleGenerate}
          disabled={!prompt.trim()}
          label="GENERATE"
        />
      )}

      {/* Simulate / Synthesize button — switches based on target */}
      {target === 'Icarus' ? (
        simulating ? (
          <CancelButton onClick={onCancelSimulate} />
        ) : (
          <ActionButton
            onClick={onSimulate}
            disabled={!canSimulate}
            label="SIM"
            prefix={<span style={{ fontSize: '10px' }}>&#9654;</span>}
          />
        )
      ) : (
        synthesizing ? (
          <CancelButton onClick={onCancelSynthesize} />
        ) : (
          <ActionButton
            onClick={onSynthesize}
            disabled={!canSynthesize}
            label="SYNTH"
            prefix={<span style={{ fontSize: '10px' }}>&#9881;</span>}
          />
        )
      )}

      {/* Verify button */}
      {verifying ? (
        <CancelButton onClick={onCancelVerify} />
      ) : (
        <ActionButton
          onClick={onVerify}
          disabled={!canVerify}
          label="VERIFY"
        />
      )}

      {/* Theme toggle (dark/light pill) */}
      <ThemeToggle theme={theme} onToggle={onToggleTheme} />

      {/* Status */}
      {cancelled && (
        <span style={{ fontSize: '10px', color: 'var(--error)', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
          Cancelled
        </span>
      )}
      {error && !cancelled && (
        <span style={{ fontSize: '10px', color: 'var(--error)', fontFamily: "'JetBrains Mono', monospace", maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {error}
        </span>
      )}
      {!error && !cancelled && hasResult && (
        <span style={{ fontSize: '10px', color: 'var(--accent-primary)', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
          &#10003;
        </span>
      )}
    </div>
  )
}

/** Red CANCEL button used by all three in-flight states. */
function CancelButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 10px',
        border: '1px solid var(--error)',
        borderRadius: '3px',
        background: 'transparent',
        color: 'var(--error)',
        fontSize: '11px',
        fontWeight: 600,
        fontFamily: "'JetBrains Mono', monospace",
        cursor: 'pointer',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.target.style.background = 'var(--error)'
        e.target.style.color = 'var(--bg-primary)'
      }}
      onMouseLeave={(e) => {
        e.target.style.background = 'transparent'
        e.target.style.color = 'var(--error)'
      }}
    >
      CANCEL
    </button>
  )
}

/** Green primary-action button (GENERATE/SIM/VERIFY) that dims when disabled. */
function ActionButton({ onClick, disabled, label, prefix }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 10px',
        border: `1px solid ${disabled ? 'var(--border-primary)' : 'var(--accent-primary)'}`,
        borderRadius: '3px',
        background: 'transparent',
        color: disabled ? 'var(--text-dim)' : 'var(--accent-primary)',
        fontSize: '11px',
        fontWeight: 600,
        fontFamily: "'JetBrains Mono', monospace",
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = 'var(--accent-primary)'
          e.currentTarget.style.color = 'var(--bg-primary)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = disabled ? 'var(--text-dim)' : 'var(--accent-primary)'
      }}
    >
      {prefix}
      {label}
    </button>
  )
}

/**
 * Pill-shaped dark/light theme toggle. 40×20 track with a sliding 18px
 * circular thumb that holds the active icon (crescent moon in dark mode,
 * sun in light mode). Icons use `currentColor` so they inherit the theme
 * palette automatically.
 */
function ThemeToggle({ theme, onToggle }) {
  const isLight = theme === 'light'
  return (
    <button
      onClick={onToggle}
      aria-label={`Switch to ${isLight ? 'dark' : 'light'} mode`}
      title={`Switch to ${isLight ? 'dark' : 'light'} mode`}
      style={{
        position: 'relative',
        width: '40px',
        height: '20px',
        border: '1px solid var(--accent-primary)',
        borderRadius: '10px',
        background: 'var(--accent-bg)',
        padding: 0,
        cursor: 'pointer',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        fontFamily: "'JetBrains Mono', monospace",
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      {/* Sliding thumb — holds the active icon */}
      <span style={{
        position: 'absolute',
        top: '1px',
        left: isLight ? '21px' : '1px',
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        background: 'var(--accent-primary)',
        color: 'var(--bg-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'left 0.2s ease, background 0.15s',
        boxShadow: 'var(--accent-glow)',
      }}>
        {isLight ? <SunIcon /> : <MoonIcon />}
      </span>
    </button>
  )
}

/**
 * Compact pill badge that surfaces the live selection verdict next to the
 * GENERATE button. Green for STANDALONE/WORKING, amber for INCOMPLETE/RISKY,
 * red for BROKEN. Hidden when there is no verdict.
 */
function VerdictBadge({ verdict }) {
  if (!verdict || !verdict.shortSummary) return null
  const v = verdict.verdict
  let fg, bg, border
  if (v === 'STANDALONE' || v === 'WORKING') {
    fg = '#00ff41'; bg = 'rgba(0, 255, 65, 0.10)'; border = 'rgba(0, 255, 65, 0.45)'
  } else if (v === 'BROKEN') {
    fg = '#ff4444'; bg = 'rgba(255, 68, 68, 0.12)'; border = 'rgba(255, 68, 68, 0.50)'
  } else {
    fg = '#ffaa00'; bg = 'rgba(255, 170, 0, 0.12)'; border = 'rgba(255, 170, 0, 0.50)'
  }
  const tooltipLines = [
    `Verdict: ${v}`,
    ...(verdict.reasons || []),
  ].join('\n')
  return (
    <div
      title={tooltipLines}
      style={{
        maxWidth: '280px',
        padding: '3px 10px',
        border: `1px solid ${border}`,
        borderRadius: '10px',
        background: bg,
        color: fg,
        fontSize: '10px',
        fontWeight: 600,
        fontFamily: "'JetBrains Mono', monospace",
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        flexShrink: 0,
        letterSpacing: '0.3px',
      }}
    >
      {verdict.shortSummary}
    </div>
  )
}

function MoonIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transition: 'opacity 0.2s' }}
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transition: 'opacity 0.2s' }}
    >
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
      <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
      <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
    </svg>
  )
}
