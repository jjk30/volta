import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'

const API_URL = 'http://localhost:8000'

/** Normalize fenced short identifiers to single-backtick inline code.
 *  Handles ```clk```, ````clk````, ```verilog\nclk```, etc.
 *  Only converts if content is short (<30 chars) with no newlines in the identifier. */
function fixInlineCode(text) {
  // Convert ``` or ```` fenced short identifiers to single backtick
  // Match: 3+ backticks, optional language tag + newline, short content, 3+ backticks
  let result = text.replace(/`{3,}(?:\w*\n)?([^`\n]{1,30})\n?`{3,}/g, '`$1`')
  // Also catch cases where backticks are separated by spaces: ``` clk ```
  result = result.replace(/`{3,}\s*([^`\n]{1,30})\s*`{3,}/g, '`$1`')
  return result
}

function ThinkingDots() {
  return (
    <span style={{ display: 'inline-flex', gap: '3px', alignItems: 'center' }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: '5px',
            height: '5px',
            borderRadius: '50%',
            background: 'var(--accent)',
            animation: `pulse-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </span>
  )
}

export default function ChatBot({ design, testbench, autoMessage, simResult }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef(null)
  const processedAutoRef = useRef(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  // Handle auto-message when a new design is generated
  useEffect(() => {
    if (!autoMessage || autoMessage === processedAutoRef.current) return
    processedAutoRef.current = autoMessage
    sendMessage('Explain what we just built in detail', true)
  }, [autoMessage])

  const sendMessage = async (text, isAuto = false) => {
    const userMsg = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    if (!isAuto) setInput('')
    setLoading(true)

    try {
      const resp = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          design: design || '',
          testbench: testbench || '',
          history: messages,
          simulation: simResult ? {
            signals: (simResult.signals || []).map(s => ({
              name: s.name,
              width: s.width,
              values: s.values,
            })),
            stdout: simResult.stdout || '',
            stderr: simResult.stderr || '',
          } : null,
        }),
      })
      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({}))
        throw new Error(detail.detail || `HTTP ${resp.status}`)
      }
      const data = await resp.json()
      console.log('[Volta Chat] Raw response:', JSON.stringify(data.response))
      setMessages([...newMessages, { role: 'assistant', content: data.response }])
    } catch (e) {
      setMessages([...newMessages, {
        role: 'assistant',
        content: `Error: ${e.message}`,
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleSend = () => {
    if (!input.trim() || loading) return
    sendMessage(input.trim())
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#000',
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      {/* Header */}
      <div style={{
        padding: '3px 12px',
        fontSize: '11px',
        color: 'var(--accent)',
        fontWeight: 500,
        background: 'var(--toolbar-bg)',
        borderBottom: '1px solid var(--border)',
        letterSpacing: '1px',
        flexShrink: 0,
      }}>
        VOLTA ASSISTANT
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        {messages.length === 0 && !loading && (
          <div style={{
            color: '#333',
            fontSize: '11px',
            textAlign: 'center',
            padding: '20px 10px',
            lineHeight: '1.6',
          }}>
            Generate a design to start chatting, or ask any hardware design question.
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              padding: '6px 10px',
              borderRadius: '4px',
              border: `1px solid ${msg.role === 'user' ? 'var(--accent)' : '#222'}`,
              background: msg.role === 'user' ? '#001a00' : '#0a0a0a',
              color: msg.role === 'user' ? 'var(--accent)' : '#aaa',
              fontSize: '11px',
              lineHeight: '1.5',
              wordBreak: 'break-word',
            }}
          >
            {msg.role === 'user' ? (
              msg.content
            ) : (
              <ReactMarkdown
                children={fixInlineCode(msg.content)}
                components={{
                  strong: ({ children }) => (
                    <strong style={{ color: 'var(--accent)', fontWeight: 600 }}>{children}</strong>
                  ),
                  pre: ({ children }) => (
                    <pre style={{
                      background: '#0a1a0a',
                      border: '1px solid #1a4a1a',
                      borderRadius: '3px',
                      padding: '6px 8px',
                      margin: '4px 0',
                      overflow: 'auto',
                      fontSize: '10px',
                      color: '#ccc',
                    }}>{children}</pre>
                  ),
                  code: ({ node, inline, className, children, ...props }) => {
                    // If inside a <pre> (block code), render as-is
                    const isBlock = !inline && className
                    if (isBlock) {
                      return <code style={{ color: '#ccc' }} {...props}>{children}</code>
                    }
                    // Everything else: compact inline code
                    return (
                      <code style={{
                        background: '#0a1a0a',
                        padding: '2px 6px',
                        borderRadius: '2px',
                        fontSize: '0.85em',
                        border: '1px solid #1a4a1a',
                        color: 'var(--accent)',
                        display: 'inline',
                        whiteSpace: 'nowrap',
                      }} {...props}>{children}</code>
                    )
                  },
                  p: ({ children }) => (
                    <p style={{ margin: '4px 0' }}>{children}</p>
                  ),
                  ul: ({ children }) => (
                    <ul style={{ margin: '4px 0', paddingLeft: '16px' }}>{children}</ul>
                  ),
                  li: ({ children }) => (
                    <li style={{ margin: '2px 0' }}>{children}</li>
                  ),
                }}
              />
            )}
          </div>
        ))}

        {loading && (
          <div style={{
            alignSelf: 'flex-start',
            padding: '8px 12px',
            borderRadius: '4px',
            border: '1px solid #222',
            background: '#0a0a0a',
          }}>
            <ThinkingDots />
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{
        display: 'flex',
        gap: '6px',
        padding: '6px 8px',
        borderTop: '1px solid var(--border)',
        background: '#050505',
        flexShrink: 0,
      }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about the design..."
          disabled={loading}
          style={{
            flex: 1,
            background: '#000',
            border: '1px solid var(--border)',
            borderRadius: '3px',
            padding: '4px 8px',
            color: 'var(--text-primary)',
            fontSize: '11px',
            fontFamily: "'JetBrains Mono', monospace",
            outline: 'none',
            caretColor: 'var(--accent)',
          }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{
            padding: '4px 10px',
            border: '1px solid var(--accent)',
            borderRadius: '3px',
            background: 'transparent',
            color: 'var(--accent)',
            fontSize: '11px',
            fontWeight: 600,
            fontFamily: "'JetBrains Mono', monospace",
            cursor: loading || !input.trim() ? 'default' : 'pointer',
            opacity: loading || !input.trim() ? 0.4 : 1,
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            if (!loading && input.trim()) {
              e.target.style.background = 'var(--accent)'
              e.target.style.color = '#000'
            }
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'transparent'
            e.target.style.color = 'var(--accent)'
          }}
        >
          SEND
        </button>
      </div>
    </div>
  )
}
