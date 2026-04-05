import { useState } from 'react'

const EXAMPLES = [
  'Design a 4-bit ALU with add, sub, and, or',
  'Design a 4-bit counter with reset and enable',
  'Design an 8-bit shift register',
  'Design a D flip-flop with async reset',
  'Design a 2-to-1 multiplexer',
  'Design a 4-bit comparator',
  'Design a UART transmitter',
  'Design a priority encoder',
]

function SidebarDropdown({ value, options }) {
  return (
    <select
      value={value}
      disabled
      style={{
        width: '100%',
        padding: '5px 8px',
        background: '#000',
        border: '1px solid var(--border)',
        borderRadius: '3px',
        color: 'var(--accent)',
        fontSize: '11px',
        fontFamily: "'JetBrains Mono', monospace",
        cursor: 'default',
        appearance: 'none',
        WebkitAppearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%2300ff41' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
        paddingRight: '24px',
      }}
    >
      {options.map((opt) => (
        <option
          key={opt.label}
          value={opt.label}
          disabled={opt.disabled}
          style={{
            color: opt.disabled ? '#444' : 'var(--accent)',
            background: '#000',
          }}
        >
          {opt.label}{opt.disabled ? ' — Coming Soon' : ''}
        </option>
      ))}
    </select>
  )
}

function SectionHeader({ children }) {
  return (
    <div style={{
      fontSize: '10px',
      fontWeight: 600,
      color: '#555',
      letterSpacing: '1.5px',
      marginBottom: '6px',
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      {children}
    </div>
  )
}

export default function Sidebar({ collapsed, onToggle, onSelectExample }) {
  const [hoveredExample, setHoveredExample] = useState(null)

  if (collapsed) {
    return (
      <div style={{
        width: '32px',
        background: '#050505',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <button
          onClick={onToggle}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent)',
            fontSize: '14px',
            cursor: 'pointer',
            padding: '8px 0',
            fontFamily: "'JetBrains Mono', monospace",
            opacity: 0.6,
          }}
          title="Expand sidebar"
        >
          &#9654;
        </button>
      </div>
    )
  }

  return (
    <div style={{
      width: '260px',
      background: '#050505',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      {/* Header with collapse toggle */}
      <div style={{
        padding: '6px 10px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{
          fontSize: '10px',
          fontWeight: 600,
          color: 'var(--accent)',
          letterSpacing: '1.5px',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          SETTINGS
        </span>
        <button
          onClick={onToggle}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent)',
            fontSize: '12px',
            cursor: 'pointer',
            padding: '2px 4px',
            fontFamily: "'JetBrains Mono', monospace",
            opacity: 0.6,
          }}
          title="Collapse sidebar"
        >
          &#9664;
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '12px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}>
        {/* Language & Design */}
        <div>
          <SectionHeader>LANGUAGE &amp; DESIGN</SectionHeader>
          <SidebarDropdown
            value="Verilog"
            options={[
              { label: 'Verilog', disabled: false },
              { label: 'SystemVerilog', disabled: true },
              { label: 'VHDL', disabled: true },
              { label: 'Python (Cocotb)', disabled: true },
              { label: 'C++ (SystemC)', disabled: true },
            ]}
          />
        </div>

        {/* Verification */}
        <div>
          <SectionHeader>VERIFICATION</SectionHeader>
          <SidebarDropdown
            value="None"
            options={[
              { label: 'None', disabled: false },
              { label: 'UVM 1.2', disabled: true },
              { label: 'UVM 1800.2', disabled: true },
              { label: 'OVM 2.1.2', disabled: true },
            ]}
          />
        </div>

        {/* Simulator */}
        <div>
          <SectionHeader>SIMULATOR</SectionHeader>
          <SidebarDropdown
            value="Icarus Verilog"
            options={[
              { label: 'Icarus Verilog', disabled: false },
              { label: 'Verilator', disabled: true },
              { label: 'Yosys', disabled: true },
            ]}
          />
        </div>

        {/* Divider */}
        <div style={{ height: '1px', background: 'var(--border)' }} />

        {/* Examples */}
        <div>
          <SectionHeader>EXAMPLES</SectionHeader>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1px',
          }}>
            {EXAMPLES.map((example, i) => (
              <div
                key={i}
                onClick={() => onSelectExample(example)}
                onMouseEnter={() => setHoveredExample(i)}
                onMouseLeave={() => setHoveredExample(null)}
                style={{
                  padding: '6px 8px',
                  fontSize: '11px',
                  fontFamily: "'JetBrains Mono', monospace",
                  color: hoveredExample === i ? '#000' : '#888',
                  background: hoveredExample === i ? 'var(--accent)' : 'transparent',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  transition: 'all 0.1s',
                  lineHeight: '1.4',
                }}
              >
                {example}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
