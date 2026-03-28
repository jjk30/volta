import { useRef, useEffect } from 'react'

const COLORS = [
  '#89b4fa', '#a6e3a1', '#f9e2af', '#f38ba8',
  '#cba6f7', '#74c7ec', '#fab387', '#94e2d5',
]

const LABEL_WIDTH = 120
const ROW_HEIGHT = 36
const PADDING_TOP = 30
const PADDING_RIGHT = 20
const BIT_HEIGHT = 22
const BUS_HEIGHT = 22

export default function WaveformViewer({ signals, endTime }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !signals?.length) return

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
    ctx.fillStyle = '#11111b'
    ctx.fillRect(0, 0, width, height)

    const traceWidth = width - LABEL_WIDTH - PADDING_RIGHT
    const tMax = endTime || 1

    // Time axis
    ctx.strokeStyle = '#313244'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(LABEL_WIDTH, PADDING_TOP - 5)
    ctx.lineTo(width - PADDING_RIGHT, PADDING_TOP - 5)
    ctx.stroke()

    // Time labels
    ctx.fillStyle = '#6c7086'
    ctx.font = '10px "JetBrains Mono", monospace'
    ctx.textAlign = 'center'
    const nTicks = Math.min(10, Math.max(4, Math.floor(traceWidth / 80)))
    for (let i = 0; i <= nTicks; i++) {
      const t = Math.round((i / nTicks) * tMax)
      const x = LABEL_WIDTH + (i / nTicks) * traceWidth
      ctx.fillText(`${t}`, x, PADDING_TOP - 10)

      ctx.strokeStyle = '#1e1e2e'
      ctx.beginPath()
      ctx.moveTo(x, PADDING_TOP)
      ctx.lineTo(x, height)
      ctx.stroke()
    }

    // Draw each signal
    signals.forEach((sig, idx) => {
      const y = PADDING_TOP + idx * ROW_HEIGHT
      const color = COLORS[idx % COLORS.length]
      const midY = y + ROW_HEIGHT / 2

      // Label
      ctx.fillStyle = '#a6adc8'
      ctx.font = '11px "JetBrains Mono", monospace'
      ctx.textAlign = 'right'
      ctx.fillText(sig.name, LABEL_WIDTH - 10, midY + 4)

      // Separator line
      ctx.strokeStyle = '#1e1e2e'
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
            // Draw from start
            const startY = lowY
            ctx.moveTo(LABEL_WIDTH, startY)
            ctx.lineTo(x, startY)
          }

          // Transition
          if (i > 0) {
            ctx.lineTo(x, yPos)
          } else {
            ctx.moveTo(x, yPos)
          }

          // Hold
          ctx.lineTo(nextX, yPos)
        }
        ctx.stroke()
      } else {
        // Multi-bit bus: draw as filled boxes with hex values
        for (let i = 0; i < sig.values.length; i++) {
          const [t, val] = sig.values[i]
          const x = timeToX(t)
          const nextT = i + 1 < sig.values.length ? sig.values[i + 1][0] : tMax
          const nextX = timeToX(nextT)
          const boxW = nextX - x

          const topY = midY - BUS_HEIGHT / 2
          const botY = midY + BUS_HEIGHT / 2

          // Bus diamond transitions
          ctx.fillStyle = color + '15'
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
  }, [signals, endTime])

  return (
    <div style={{
      height: '100%',
      overflow: 'auto',
      background: 'var(--bg-surface)',
    }}>
      <div style={{
        padding: '6px 12px 0',
        fontSize: '12px',
        color: 'var(--text-secondary)',
        fontWeight: 500,
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
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
