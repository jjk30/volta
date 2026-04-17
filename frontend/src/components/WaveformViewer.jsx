import { useRef, useEffect } from 'react'

const COLORS_DARK = [
  '#00ff41', '#00cc33', '#4ec9b0', '#d4a017',
  '#9d7cd8', '#6a9955', '#c75050', '#888888',
]
const COLORS_LIGHT = [
  '#006622', '#008833', '#2a8c7a', '#a07509',
  '#5a3a8a', '#3a6a2a', '#a03030', '#444444',
]

const LABEL_WIDTH = 120
const ROW_HEIGHT = 36
const PADDING_TOP = 30
const PADDING_RIGHT = 20
const BIT_HEIGHT = 22
const BUS_HEIGHT = 22

// Grid spacing for oscilloscope-style background
const GRID_MAJOR = 80
const GRID_MINOR = 20

export default function WaveformViewer({ signals, endTime, theme = 'dark' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !signals?.length) return

    const cs = getComputedStyle(document.documentElement)
    const get = (name, fallback) => (cs.getPropertyValue(name) || fallback).trim() || fallback
    const bg = get('--waveform-bg', '#000000')
    const minorGrid = get('--waveform-grid-minor', '#0a1a0a')
    const majorGrid = get('--waveform-grid-major', '#0d2a0d')
    const axisColor = get('--waveform-axis', '#1a3a1a')
    const labelColor = get('--waveform-label', '#00ff4160')
    const separator = get('--waveform-trace-separator', '#0d1a0d')
    const COLORS = theme === 'light' ? COLORS_LIGHT : COLORS_DARK

    const container = canvas.parentElement
    const dpr = window.devicePixelRatio || 1
    const width = container.clientWidth
    const height = Math.max(signals.length * ROW_HEIGHT + PADDING_TOP + 10, 120)

    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'

    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    // Background
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, width, height)

    // Oscilloscope grid — subtle lines
    ctx.strokeStyle = minorGrid
    ctx.lineWidth = 0.5
    for (let x = LABEL_WIDTH; x < width; x += GRID_MINOR) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
    for (let y = PADDING_TOP; y < height; y += GRID_MINOR) {
      ctx.beginPath()
      ctx.moveTo(LABEL_WIDTH, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }

    // Major grid
    ctx.strokeStyle = majorGrid
    ctx.lineWidth = 0.5
    for (let x = LABEL_WIDTH; x < width; x += GRID_MAJOR) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
    for (let y = PADDING_TOP; y < height; y += GRID_MAJOR) {
      ctx.beginPath()
      ctx.moveTo(LABEL_WIDTH, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }

    const traceWidth = width - LABEL_WIDTH - PADDING_RIGHT
    const tMax = endTime || 1

    // Time axis
    ctx.strokeStyle = axisColor
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(LABEL_WIDTH, PADDING_TOP - 5)
    ctx.lineTo(width - PADDING_RIGHT, PADDING_TOP - 5)
    ctx.stroke()

    // Time labels
    ctx.fillStyle = labelColor
    ctx.font = '10px "JetBrains Mono", monospace'
    ctx.textAlign = 'center'
    const nTicks = Math.min(10, Math.max(4, Math.floor(traceWidth / 80)))
    for (let i = 0; i <= nTicks; i++) {
      const t = Math.round((i / nTicks) * tMax)
      const x = LABEL_WIDTH + (i / nTicks) * traceWidth
      ctx.fillText(`${t}`, x, PADDING_TOP - 10)
    }

    // Draw each signal
    signals.forEach((sig, idx) => {
      const y = PADDING_TOP + idx * ROW_HEIGHT
      const color = COLORS[idx % COLORS.length]
      const midY = y + ROW_HEIGHT / 2

      // Label
      ctx.fillStyle = labelColor
      ctx.font = '11px "JetBrains Mono", monospace'
      ctx.textAlign = 'right'
      ctx.fillText(sig.name, LABEL_WIDTH - 10, midY + 4)

      // Separator line
      ctx.strokeStyle = separator
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(LABEL_WIDTH, y + ROW_HEIGHT)
      ctx.lineTo(width - PADDING_RIGHT, y + ROW_HEIGHT)
      ctx.stroke()

      if (!sig.values.length) return

      const timeToX = (t) => LABEL_WIDTH + (t / tMax) * traceWidth

      ctx.strokeStyle = color
      ctx.lineWidth = 1.5

      if (sig.width === 1) {
        // Single-bit: standard digital waveform
        ctx.beginPath()
        const highY = midY - BIT_HEIGHT / 2
        const lowY = midY + BIT_HEIGHT / 2

        for (let i = 0; i < sig.values.length; i++) {
          const [t, val] = sig.values[i]
          const x = timeToX(t)
          const yPos = val ? highY : lowY
          const nextT = i + 1 < sig.values.length ? sig.values[i + 1][0] : tMax
          const nextX = timeToX(nextT)

          if (i === 0 && t > 0) {
            const startY = lowY
            ctx.moveTo(LABEL_WIDTH, startY)
            ctx.lineTo(x, startY)
          }

          if (i > 0) {
            ctx.lineTo(x, yPos)
          } else {
            ctx.moveTo(x, yPos)
          }

          ctx.lineTo(nextX, yPos)
        }
        ctx.stroke()
      } else {
        // Multi-bit bus: diamond boxes with hex values
        for (let i = 0; i < sig.values.length; i++) {
          const [t, val] = sig.values[i]
          const x = timeToX(t)
          const nextT = i + 1 < sig.values.length ? sig.values[i + 1][0] : tMax
          const nextX = timeToX(nextT)
          const boxW = nextX - x

          const topY = midY - BUS_HEIGHT / 2
          const botY = midY + BUS_HEIGHT / 2

          // Bus diamond shape with green-tinted fill
          ctx.fillStyle = color + '10'
          ctx.beginPath()
          ctx.moveTo(x + 3, midY)
          ctx.lineTo(x + 6, topY)
          ctx.lineTo(nextX - 3, topY)
          ctx.lineTo(nextX, midY)
          ctx.lineTo(nextX - 3, botY)
          ctx.lineTo(x + 6, botY)
          ctx.closePath()
          ctx.fill()

          ctx.strokeStyle = color
          ctx.lineWidth = 1.2
          ctx.stroke()

          // Value label
          if (boxW > 20) {
            const hexVal = val.toString(16).toUpperCase()
            const label = sig.width <= 4 ? `${val}` : `0x${hexVal}`
            ctx.fillStyle = color
            ctx.font = '10px "JetBrains Mono", monospace'
            ctx.textAlign = 'center'
            ctx.fillText(label, (x + nextX) / 2, midY + 3)
          }
        }
      }
    })
  }, [signals, endTime, theme])

  return (
    <div style={{
      height: '100%',
      overflow: 'auto',
      background: 'var(--waveform-bg)',
    }}>
      <div style={{
        padding: '4px 12px',
        fontSize: '11px',
        color: 'var(--accent)',
        fontWeight: 500,
        fontFamily: "'JetBrains Mono', monospace",
        background: 'var(--toolbar-bg)',
        borderBottom: '1px solid var(--border)',
        letterSpacing: '1px',
      }}>
        WAVEFORM
      </div>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%' }}
      />
    </div>
  )
}
