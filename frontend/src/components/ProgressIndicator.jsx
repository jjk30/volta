/**
 * Step-by-step progress display used during long-running tasks.
 * Defaults to the generation pipeline; pass a custom `steps` array (e.g. for
 * FPGA synthesis) plus matching `timings` (ms from start at which each step
 * becomes the current one) to repurpose it.
 */

import { useState, useEffect, useRef } from 'react'

const DEFAULT_STEPS = [
  'Interpreting design...',
  'Generating Verilog...',
  'Verifying with Yosys...',
  'Building testbench...',
  'Compiling...',
]
const DEFAULT_TIMINGS = [0, 3000, 8000, 14000, 18000]

// Estimate which step we're on based on elapsed time
// Real backend doesn't stream progress, so we simulate based on typical timing
function useProgressStep(active, timings) {
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

    const t = timings && timings.length ? timings : DEFAULT_TIMINGS
    const timers = t.map((delay, i) =>
      setTimeout(() => setStep(i), delay)
    )

    return () => timers.forEach(clearTimeout)
  }, [active, timings])

  return step
}

export default function ProgressIndicator({ active, done, steps, timings }) {
  const stepLabels = steps && steps.length ? steps : DEFAULT_STEPS
  const stepTimings = timings && timings.length ? timings : DEFAULT_TIMINGS
  const currentStep = useProgressStep(active, stepTimings)

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
      {stepLabels.map((label, i) => {
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
