/**
 * Step-by-step generation progress display.
 * Shows pulsing green dot for current step, checkmarks for completed steps.
 */

const STEPS = [
  'Interpreting design...',
  'Generating Verilog...',
  'Verifying with Yosys...',
  'Building testbench...',
  'Compiling...',
]

// Estimate which step we're on based on elapsed time
// Real backend doesn't stream progress, so we simulate based on typical timing
function useProgressStep(active) {
  const [step, setStep] = useState(0)
  const startRef = useRef(null)

  useEffect(() => {
    if (!active) {
      setStep(0)
      startRef.current = null
      return
    }

    startRef.current = Date.now()
    setStep(0)

    // Advance steps on a schedule that matches typical backend timing
    const timings = [0, 3000, 8000, 14000, 18000]
    const timers = timings.map((delay, i) =>
      setTimeout(() => setStep(i), delay)
    )

    return () => timers.forEach(clearTimeout)
  }, [active])

  return step
}

import { useState, useEffect, useRef } from 'react'

export default function ProgressIndicator({ active, done }) {
  const currentStep = useProgressStep(active)

  if (!active && !done) return null

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      padding: '6px 16px',
      background: 'var(--toolbar-bg)',
      borderBottom: '1px solid var(--border-primary)',
      fontSize: '11px',
      fontFamily: "'JetBrains Mono', monospace",
      overflow: 'hidden',
    }}>
      {STEPS.map((label, i) => {
        const isCompleted = done || (!active && i < currentStep) || (active && i < currentStep)
        const isCurrent = active && i === currentStep
        const isPending = active && i > currentStep

        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: isCompleted
                ? 'var(--accent-secondary)'
                : isCurrent ? 'var(--accent-primary)' : 'var(--text-dim)',
              transition: 'color 0.3s',
              whiteSpace: 'nowrap',
            }}
          >
            {isCompleted ? (
              <span style={{ fontSize: '12px' }}>&#10003;</span>
            ) : isCurrent ? (
              <span style={{
                display: 'inline-block',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--accent-primary)',
                boxShadow: 'var(--accent-glow)',
                animation: 'pulse-dot 1.2s ease-in-out infinite',
              }} />
            ) : (
              <span style={{
                display: 'inline-block',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--border-primary)',
              }} />
            )}
            <span>{label}</span>
          </div>
        )
      })}
    </div>
  )
}
