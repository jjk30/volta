/**
 * Animated IC chip icon with flowing pin signals.
 * 20x20px SVG of a chip outline with pins that light up sequentially.
 */
export default function ChipIcon({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
    >
      {/* Chip body */}
      <rect
        x="5" y="5" width="10" height="10" rx="1"
        stroke="#00ff41" strokeWidth="1" fill="none" opacity="0.6"
      />

      {/* Center dot */}
      <circle cx="10" cy="10" r="1" fill="#00ff41" opacity="0.3" />

      {/* Top pins */}
      <line x1="7" y1="2" x2="7" y2="5" strokeWidth="1" opacity="0.8">
        <animate attributeName="stroke" values="#00ff4120;#00ff41;#00ff4120" dur="2s" begin="0s" repeatCount="indefinite" />
      </line>
      <line x1="10" y1="2" x2="10" y2="5" strokeWidth="1" opacity="0.8">
        <animate attributeName="stroke" values="#00ff4120;#00ff41;#00ff4120" dur="2s" begin="0.25s" repeatCount="indefinite" />
      </line>
      <line x1="13" y1="2" x2="13" y2="5" strokeWidth="1" opacity="0.8">
        <animate attributeName="stroke" values="#00ff4120;#00ff41;#00ff4120" dur="2s" begin="0.5s" repeatCount="indefinite" />
      </line>

      {/* Bottom pins */}
      <line x1="7" y1="15" x2="7" y2="18" strokeWidth="1" opacity="0.8">
        <animate attributeName="stroke" values="#00ff4120;#00ff41;#00ff4120" dur="2s" begin="1s" repeatCount="indefinite" />
      </line>
      <line x1="10" y1="15" x2="10" y2="18" strokeWidth="1" opacity="0.8">
        <animate attributeName="stroke" values="#00ff4120;#00ff41;#00ff4120" dur="2s" begin="1.25s" repeatCount="indefinite" />
      </line>
      <line x1="13" y1="15" x2="13" y2="18" strokeWidth="1" opacity="0.8">
        <animate attributeName="stroke" values="#00ff4120;#00ff41;#00ff4120" dur="2s" begin="1.5s" repeatCount="indefinite" />
      </line>

      {/* Left pins */}
      <line x1="2" y1="7" x2="5" y2="7" strokeWidth="1" opacity="0.8">
        <animate attributeName="stroke" values="#00ff4120;#00ff41;#00ff4120" dur="2s" begin="0.5s" repeatCount="indefinite" />
      </line>
      <line x1="2" y1="10" x2="5" y2="10" strokeWidth="1" opacity="0.8">
        <animate attributeName="stroke" values="#00ff4120;#00ff41;#00ff4120" dur="2s" begin="0.75s" repeatCount="indefinite" />
      </line>
      <line x1="2" y1="13" x2="5" y2="13" strokeWidth="1" opacity="0.8">
        <animate attributeName="stroke" values="#00ff4120;#00ff41;#00ff4120" dur="2s" begin="1s" repeatCount="indefinite" />
      </line>

      {/* Right pins */}
      <line x1="15" y1="7" x2="18" y2="7" strokeWidth="1" opacity="0.8">
        <animate attributeName="stroke" values="#00ff4120;#00ff41;#00ff4120" dur="2s" begin="1.5s" repeatCount="indefinite" />
      </line>
      <line x1="15" y1="10" x2="18" y2="10" strokeWidth="1" opacity="0.8">
        <animate attributeName="stroke" values="#00ff4120;#00ff41;#00ff4120" dur="2s" begin="1.75s" repeatCount="indefinite" />
      </line>
      <line x1="15" y1="13" x2="18" y2="13" strokeWidth="1" opacity="0.8">
        <animate attributeName="stroke" values="#00ff4120;#00ff41;#00ff4120" dur="2s" begin="0s" repeatCount="indefinite" />
      </line>
    </svg>
  )
}
