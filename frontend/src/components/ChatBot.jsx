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

function CopyButton({ text, absolute = false }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy to clipboard"
      style={{
        position: absolute ? 'absolute' : 'static',
        top: absolute ? '4px' : undefined,
        right: absolute ? '4px' : undefined,
        width: '22px',
        height: '22px',
        padding: '3px',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        opacity: copied ? 1 : 0.4,
        transition: 'opacity 0.15s',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { if (!copied) e.currentTarget.style.opacity = '0.9' }}
      onMouseLeave={(e) => { if (!copied) e.currentTarget.style.opacity = '0.4' }}
    >
      {copied ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--accent-primary)' }}>
          <path d="M3 8.5L6 11.5L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--text-dim)' }}>
          <rect x="5" y="5" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3 11V3C3 2.45 3.45 2 4 2H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
    </button>
  )
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

/** Color for a selection-divider line, based on verdict bucket. */
function selectionDividerColor(verdict) {
  if (verdict === 'STANDALONE' || verdict === 'WORKING') return '#00ff41'
  if (verdict === 'BROKEN') return '#ff4444'
  return '#ffaa00'
}

export default function ChatBot({ design, testbench, autoMessage, simResult, selectedSymbols = [], logicIssues = [], selectionVerdict = null }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef(null)
  const processedAutoRef = useRef(null)
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  // Sync a single "selection" divider line with the current verdict. Replace
  // any previous selection-divider message rather than appending a new one.
  // This is a pure local UI message — no /chat call, no LLM cost.
  useEffect(() => {
    setMessages((prev) => {
      const filtered = prev.filter((m) => m.role !== 'selection')
      if (!selectionVerdict) return filtered
      const names = (selectedSymbols || []).map((s) => s.name).join(' + ')
      const summary = selectionVerdict.shortSummary || selectionVerdict.verdict
      const content = `— Selection: ${names || '(none)'} — ${summary}`
      return [...filtered, {
        role: 'selection',
        content,
        verdict: selectionVerdict.verdict,
      }]
    })
  }, [selectionVerdict, selectedSymbols])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  // Handle auto-message when a new design is generated — clear history first
  useEffect(() => {
    if (!autoMessage || autoMessage === processedAutoRef.current) return
    processedAutoRef.current = autoMessage
    // Clear old messages and add divider
    setMessages([{ role: 'divider', content: '— New design generated —' }])
    // Send auto-explain after a tick so the cleared state is committed
    setTimeout(() => {
      sendMessage('Explain what we just built in detail', true)
    }, 50)
  }, [autoMessage])

  const sendMessage = async (text, isAuto = false) => {
    const userMsg = { role: 'user', content: text }
    // Use ref to get latest messages (avoids stale closure after clear)
    const latestMessages = messagesRef.current
    const currentMessages = [...latestMessages, userMsg]
    setMessages(currentMessages)
    if (!isAuto) setInput('')
    setLoading(true)

    // Filter out divider / selection messages for history sent to backend —
    // these are local UI markers, not part of the conversation.
    const historyForBackend = latestMessages.filter(
      (m) => m.role !== 'divider' && m.role !== 'selection'
    )

    try {
      const resp = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          design: design || '',
          testbench: testbench || '',
          history: historyForBackend,
          simulation: simResult ? {
            signals: (simResult.signals || []).map(s => ({
              name: s.name,
              width: s.width,
              values: s.values,
            })),
            stdout: simResult.stdout || '',
            stderr: simResult.stderr || '',
          } : null,
          selectedSymbols: (selectedSymbols || []).map((s) => ({
            name: s.name,
            promptText: s.promptText || '',
            truthTable: s.truthTable || null,
          })),
          logicIssues: (logicIssues || []).map((it) => ({
            line: it.line,
            severity: it.severity,
            code: it.code,
            message: it.message,
            snippet: it.snippet || '',
          })),
        }),
      })
      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({}))
        throw new Error(detail.detail || `HTTP ${resp.status}`)
      }
      const data = await resp.json()
      console.log('[Volta Chat] Raw response:', JSON.stringify(data.response))
      setMessages([...currentMessages, { role: 'assistant', content: data.response }])
    } catch (e) {
      setMessages([...currentMessages, {
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

  const handleWheel = (e) => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop += e.deltaY
    }
  }

  return (
    <div
      onWheel={handleWheel}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-primary)',
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {/* Header */}
      <div style={{
        padding: '3px 12px',
        fontSize: '11px',
        color: 'var(--accent-primary)',
        fontWeight: 500,
        background: 'var(--toolbar-bg)',
        borderBottom: '1px solid var(--border-primary)',
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
            color: 'var(--text-dim)',
            fontSize: '11px',
            textAlign: 'center',
            padding: '20px 10px',
            lineHeight: '1.6',
          }}>
            Generate a design to start chatting, or ask any hardware design question.
          </div>
        )}

        {messages.map((msg, i) => (
          msg.role === 'divider' ? (
            <div key={i} style={{
              textAlign: 'center',
              color: 'var(--text-dim)',
              fontSize: '9px',
              fontStyle: 'italic',
              padding: '8px 0',
              userSelect: 'none',
            }}>
              {msg.content}
            </div>
          ) : msg.role === 'selection' ? (
            <div key={i} style={{
              textAlign: 'center',
              color: selectionDividerColor(msg.verdict),
              fontSize: '10px',
              fontStyle: 'italic',
              padding: '6px 4px',
              opacity: 0.85,
              userSelect: 'none',
              wordBreak: 'break-word',
            }}>
              {msg.content}
            </div>
          ) : (
          <div
            key={i}
            style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
            }}
          >
            <div style={{
              padding: '6px 10px',
              borderRadius: '4px',
              border: `1px solid ${msg.role === 'user' ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
              background: msg.role === 'user' ? 'var(--chat-user-bg)' : 'var(--chat-assistant-bg)',
              color: msg.role === 'user' ? 'var(--chat-user-text)' : 'var(--chat-assistant-text)',
              fontSize: '11px',
              lineHeight: '1.5',
              wordBreak: 'break-word',
            }}>
            {msg.role === 'user' ? (
              msg.content
            ) : (
              <ReactMarkdown
                children={fixInlineCode(msg.content)}
                components={{
                  strong: ({ children }) => (
                    <strong style={{ color: 'var(--accent)', fontWeight: 600 }}>{children}</strong>
                  ),
                  pre: ({ children }) => {
                    // Extract text content from children for copy
                    const extractText = (node) => {
                      if (typeof node === 'string') return node
                      if (Array.isArray(node)) return node.map(extractText).join('')
                      if (node?.props?.children) return extractText(node.props.children)
                      return ''
                    }
                    const codeText = extractText(children).trim()

                    return (
                      <div style={{ position: 'relative', margin: '4px 0' }}>
                        <CopyButton text={codeText} absolute />
                        <pre style={{
                          background: 'var(--code-bg)',
                          border: '1px solid var(--code-border)',
                          borderRadius: '3px',
                          padding: '6px 28px 6px 8px',
                          overflow: 'auto',
                          fontSize: '10px',
                          color: 'var(--text-primary)',
                          margin: 0,
                        }}>{children}</pre>
                      </div>
                    )
                  },
                  code: ({ node, inline, className, children, ...props }) => {
                    // If inside a <pre> (block code), render as-is
                    const isBlock = !inline && className
                    if (isBlock) {
                      return <code style={{ color: 'var(--text-primary)' }} {...props}>{children}</code>
                    }
                    // Everything else: compact inline code
                    return (
                      <code style={{
                        background: 'var(--code-bg)',
                        padding: '2px 6px',
                        borderRadius: '2px',
                        fontSize: '0.85em',
                        border: '1px solid var(--code-border)',
                        color: 'var(--accent-primary)',
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
            {msg.role === 'assistant' && (
              <div style={{
                padding: '2px 0',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                <CopyButton text={msg.content} />
              </div>
            )}
          </div>
          )
        ))}

        {loading && (
          <div style={{
            alignSelf: 'flex-start',
            padding: '8px 12px',
            borderRadius: '4px',
            border: '1px solid var(--border-primary)',
            background: 'var(--bg-surface)',
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
        borderTop: '1px solid var(--border-primary)',
        background: 'var(--toolbar-bg)',
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
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: '3px',
            padding: '4px 8px',
            color: 'var(--text-primary)',
            fontSize: '11px',
            fontFamily: "'JetBrains Mono', monospace",
            outline: 'none',
            caretColor: 'var(--accent-primary)',
          }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{
            padding: '4px 10px',
            border: '1px solid var(--accent-primary)',
            borderRadius: '3px',
            background: 'transparent',
            color: 'var(--accent-primary)',
            fontSize: '11px',
            fontWeight: 600,
            fontFamily: "'JetBrains Mono', monospace",
            cursor: loading || !input.trim() ? 'default' : 'pointer',
            opacity: loading || !input.trim() ? 0.4 : 1,
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            if (!loading && input.trim()) {
              e.target.style.background = 'var(--accent-primary)'
              e.target.style.color = 'var(--bg-primary)'
            }
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'transparent'
            e.target.style.color = 'var(--accent-primary)'
          }}
        >
          SEND
        </button>
      </div>
    </div>
  )
}
