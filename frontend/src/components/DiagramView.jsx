import { useRef, useEffect } from 'react'
import rough from 'roughjs'

/**
 * Parse module name and ports from Verilog source.
 * Returns { name, inputs: [{name, width}], outputs: [{name, width}] }
 */
function parseDesign(verilog) {
  if (!verilog) return null

  const modMatch = verilog.match(/module\s+(\w+)\s*\((.*?)\)\s*;/s)
  if (!modMatch) return null

  const name = modMatch[1]
  const portText = modMatch[2]
  const inputs = []
  const outputs = []

  for (const decl of portText.split(',')) {
    const m = decl.trim().match(/^(input|output)\s+(?:reg\s+)?(?:wire\s+)?(\[(\d+):(\d+)\]\s+)?(\w+)/)
    if (!m) continue
    const dir = m[1]
    const width = m[3] ? parseInt(m[3]) - parseInt(m[4]) + 1 : 1
    const pName = m[5]
    const label = width > 1 ? `${pName} [${width - 1}:0]` : pName
    ;(dir === 'input' ? inputs : outputs).push({ name: pName, width, label })
  }

  return { name, inputs, outputs }
}

export default function DiagramView({ design, theme = 'dark' }) {
  const svgRef = useRef(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    // Read theme-specific colors from CSS variables so the diagram re-skins
    // cleanly when the user toggles light/dark mode.
    const cs = getComputedStyle(document.documentElement)
    const accent = (cs.getPropertyValue('--accent') || '#00ff41').trim() || '#00ff41'
    const accentSecondary = (cs.getPropertyValue('--accent-secondary') || '#00cc33').trim() || '#00cc33'
    const textDim = (cs.getPropertyValue('--text-dim') || '#333').trim() || '#333'
    const accentFill = theme === 'light' ? `${accent}12` : `${accent}08`

    // Clear previous
    while (svg.firstChild) svg.removeChild(svg.firstChild)

    const parsed = parseDesign(design)
    if (!parsed) {
      // Show placeholder
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      t.setAttribute('x', '50%')
      t.setAttribute('y', '50%')
      t.setAttribute('text-anchor', 'middle')
      t.setAttribute('fill', textDim)
      t.setAttribute('font-family', "'JetBrains Mono', monospace")
      t.setAttribute('font-size', '12')
      t.textContent = 'Generate a design to see its block diagram'
      svg.appendChild(t)
      return
    }

    const rc = rough.svg(svg)
    const { name, inputs, outputs } = parsed

    const portSpacing = 28
    const maxPorts = Math.max(inputs.length, outputs.length, 1)
    const boxH = Math.max(maxPorts * portSpacing + 40, 100)
    const boxW = 180
    const boxX = 220
    const boxY = 30

    const svgW = boxX + boxW + 220
    const svgH = boxY + boxH + 40
    svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`)

    // Module box
    const box = rc.rectangle(boxX, boxY, boxW, boxH, {
      roughness: 1.5,
      stroke: accent,
      strokeWidth: 1.8,
      fillStyle: 'hachure',
      fill: accentFill,
      hachureGap: 8,
    })
    svg.appendChild(box)

    // Module name label
    const nameText = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    nameText.setAttribute('x', boxX + boxW / 2)
    nameText.setAttribute('y', boxY + 18)
    nameText.setAttribute('text-anchor', 'middle')
    nameText.setAttribute('fill', accent)
    nameText.setAttribute('font-family', "'JetBrains Mono', monospace")
    nameText.setAttribute('font-size', '13')
    nameText.setAttribute('font-weight', '600')
    nameText.textContent = name
    svg.appendChild(nameText)

    // Input ports (left side)
    inputs.forEach((port, i) => {
      const y = boxY + 40 + i * portSpacing
      const lineX1 = boxX - 60
      const lineX2 = boxX

      // Wire line
      const line = rc.line(lineX1, y, lineX2, y, {
        roughness: 1,
        stroke: accentSecondary,
        strokeWidth: 1.5,
      })
      svg.appendChild(line)

      // Arrow head
      const arrow = rc.line(lineX2 - 8, y - 4, lineX2, y, { roughness: 0.5, stroke: accentSecondary, strokeWidth: 1.5 })
      svg.appendChild(arrow)
      const arrow2 = rc.line(lineX2 - 8, y + 4, lineX2, y, { roughness: 0.5, stroke: accentSecondary, strokeWidth: 1.5 })
      svg.appendChild(arrow2)

      // Label
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      label.setAttribute('x', lineX1 - 4)
      label.setAttribute('y', y + 4)
      label.setAttribute('text-anchor', 'end')
      label.setAttribute('fill', accentSecondary)
      label.setAttribute('font-family', "'JetBrains Mono', monospace")
      label.setAttribute('font-size', '10')
      label.textContent = port.label
      svg.appendChild(label)
    })

    // Output ports (right side)
    outputs.forEach((port, i) => {
      const y = boxY + 40 + i * portSpacing
      const lineX1 = boxX + boxW
      const lineX2 = boxX + boxW + 60

      // Wire line
      const line = rc.line(lineX1, y, lineX2, y, {
        roughness: 1,
        stroke: accentSecondary,
        strokeWidth: 1.5,
      })
      svg.appendChild(line)

      // Arrow head
      const arrow = rc.line(lineX2 - 8, y - 4, lineX2, y, { roughness: 0.5, stroke: accentSecondary, strokeWidth: 1.5 })
      svg.appendChild(arrow)
      const arrow2 = rc.line(lineX2 - 8, y + 4, lineX2, y, { roughness: 0.5, stroke: accentSecondary, strokeWidth: 1.5 })
      svg.appendChild(arrow2)

      // Label
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      label.setAttribute('x', lineX2 + 4)
      label.setAttribute('y', y + 4)
      label.setAttribute('text-anchor', 'start')
      label.setAttribute('fill', accentSecondary)
      label.setAttribute('font-family', "'JetBrains Mono', monospace")
      label.setAttribute('font-size', '10')
      label.textContent = port.label
      svg.appendChild(label)
    })
  }, [design, theme])

  return (
    <div style={{
      height: '100%',
      overflow: 'auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary)',
    }}>
      <svg
        ref={svgRef}
        style={{ width: '100%', maxHeight: '100%' }}
      />
    </div>
  )
}
