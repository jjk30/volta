import { Component } from 'react'

/**
 * ErrorBoundary — catches render-time exceptions in a single panel so the rest
 * of the app stays alive. Error boundaries must be class components (the
 * lifecycle hooks `getDerivedStateFromError` and `componentDidCatch` are not
 * available on function components as of React 19).
 *
 * Usage:
 *   <ErrorBoundary fallbackTitle="SCHEMATIC ERROR" onReset={() => clearState()}>
 *     <SchematicView ... />
 *   </ErrorBoundary>
 *
 * Props:
 *   children      — the panel to guard
 *   fallbackTitle — short uppercase tag shown in the fallback (e.g. "CHAT ERROR")
 *   onReset       — optional callback invoked when the user clicks RETRY.
 *                   If omitted, RETRY just clears the boundary's hasError flag.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
    this.handleReset = this.handleReset.bind(this)
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // Prefix with the panel name so it's obvious which boundary caught it
    // when triaging in the browser console.
    const tag = this.props.fallbackTitle || 'ErrorBoundary'
    // eslint-disable-next-line no-console
    console.error(`[${tag}]`, error, info)
  }

  handleReset() {
    this.setState({ hasError: false, error: null })
    if (typeof this.props.onReset === 'function') {
      try { this.props.onReset() } catch {}
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const message = (this.state.error && this.state.error.message) || String(this.state.error || 'Unknown error')

    return (
      <div
        role="alert"
        style={{
          height: '100%',
          width: '100%',
          background: '#000',
          color: '#00ff41',
          border: '1px solid #1a4a1a',
          fontFamily: "'JetBrains Mono', monospace",
          padding: '16px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          overflow: 'auto',
        }}
      >
        <div style={{
          fontSize: '12px',
          fontWeight: 700,
          letterSpacing: '1.5px',
          color: '#00ff41',
        }}>
          {this.props.fallbackTitle || 'PANEL ERROR'}
        </div>
        <div style={{ fontSize: '11px', color: '#00ff41', opacity: 0.85 }}>
          Something broke in this panel. Check console for details.
        </div>
        {message && (
          <pre style={{
            margin: 0,
            padding: '6px 8px',
            fontSize: '10px',
            color: '#6a8a6a',
            background: 'rgba(0, 255, 65, 0.04)',
            border: '1px solid #1a4a1a',
            borderRadius: '2px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: '160px',
            overflow: 'auto',
          }}>
            {message}
          </pre>
        )}
        <button
          onClick={this.handleReset}
          style={{
            alignSelf: 'flex-start',
            padding: '4px 12px',
            background: '#000',
            color: '#00ff41',
            border: '1px solid #1a4a1a',
            borderRadius: '2px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '1px',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#00ff41'
            e.currentTarget.style.background = 'rgba(0, 255, 65, 0.10)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#1a4a1a'
            e.currentTarget.style.background = '#000'
          }}
        >
          RETRY
        </button>
      </div>
    )
  }
}
