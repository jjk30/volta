/**
 * Animated IC chip icon with flowing pin signals.
 * 20x20px SVG of a chip outline with pins that pulse opacity sequentially.
 * Uses `currentColor` so the icon re-skins with the active theme palette.
 */
export default function ChipIcon({ size = 20 }) {
  const pinStyle = { stroke: 'currentColor', strokeWidth: 1, opacity: 0.8 }
  const pulseTimings = [0, 0.25, 0.5, 1, 1.25, 1.5, 0.5, 0.75, 1, 1.5, 1.75, 0]

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, color: 'var(--accent-primary)' }}
    >
      {/* Chip body */}
      <rect
        x="5" y="5" width="10" height="10" rx="1"
        stroke="currentColor" strokeWidth="1" fill="none" opacity="0.6"
      />

      {/* Center dot */}
      <circle cx="10" cy="10" r="1" fill="currentColor" opacity="0.3" />

      {/* Top pins */}
      <line x1="7" y1="2" x2="7" y2="5" {...pinStyle}>
        <animate attributeName="opacity" values="0.2;1;0.2" dur="2s" begin="0s" repeatCount="indefinite" />
      </line>
      <line x1="10" y1="2" x2="10" y2="5" {...pinStyle}>
        <animate attributeName="opacity" values="0.2;1;0.2" dur="2s" begin="0.25s" repeatCount="indefinite" />
      </line>
      <line x1="13" y1="2" x2="13" y2="5" {...pinStyle}>
        <animate attributeName="opacity" values="0.2;1;0.2" dur="2s" begin="0.5s" repeatCount="indefinite" />
      </line>

      {/* Bottom pins */}
      <line x1="7" y1="15" x2="7" y2="18" {...pinStyle}>
        <animate attributeName="opacity" values="0.2;1;0.2" dur="2s" begin="1s" repeatCount="indefinite" />
      </line>
      <line x1="10" y1="15" x2="10" y2="18" {...pinStyle}>
        <animate attributeName="opacity" values="0.2;1;0.2" dur="2s" begin="1.25s" repeatCount="indefinite" />
      </line>
      <line x1="13" y1="15" x2="13" y2="18" {...pinStyle}>
        <animate attributeName="opacity" values="0.2;1;0.2" dur="2s" begin="1.5s" repeatCount="indefinite" />
      </line>

      {/* Left pins */}
      <line x1="2" y1="7" x2="5" y2="7" {...pinStyle}>
        <animate attributeName="opacity" values="0.2;1;0.2" dur="2s" begin="0.5s" repeatCount="indefinite" />
      </line>
      <line x1="2" y1="10" x2="5" y2="10" {...pinStyle}>
        <animate attributeName="opacity" values="0.2;1;0.2" dur="2s" begin="0.75s" repeatCount="indefinite" />
      </line>
      <line x1="2" y1="13" x2="5" y2="13" {...pinStyle}>
        <animate attributeName="opacity" values="0.2;1;0.2" dur="2s" begin="1s" repeatCount="indefinite" />
      </line>

      {/* Right pins */}
      <line x1="15" y1="7" x2="18" y2="7" {...pinStyle}>
        <animate attributeName="opacity" values="0.2;1;0.2" dur="2s" begin="1.5s" repeatCount="indefinite" />
      </line>
      <line x1="15" y1="10" x2="18" y2="10" {...pinStyle}>
        <animate attributeName="opacity" values="0.2;1;0.2" dur="2s" begin="1.75s" repeatCount="indefinite" />
      </line>
      <line x1="15" y1="13" x2="18" y2="13" {...pinStyle}>
        <animate attributeName="opacity" values="0.2;1;0.2" dur="2s" begin="0s" repeatCount="indefinite" />
      </line>
    </svg>
  )
}
