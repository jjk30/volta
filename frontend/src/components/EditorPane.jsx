import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { bracketMatching, indentOnInput, StreamLanguage } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap, autocompletion } from '@codemirror/autocomplete'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { linter } from '@codemirror/lint'
import { verilog } from '@codemirror/legacy-modes/mode/verilog'
import { oneDark } from './oneDarkTheme.js'
import { verilogLint } from './verilogLinter.js'
import { verilogCompletion } from './verilogComplete.js'

const EditorPane = forwardRef(function EditorPane({ value, onChange }, ref) {
  const containerRef = useRef(null)
  const viewRef = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Expose imperative helpers to parent via ref
  useImperativeHandle(ref, () => ({
    insertAtCursor(text) {
      const view = viewRef.current
      if (!view) return
      const pos = view.state.selection.main.head
      const insert = '\n' + text + '\n'
      view.dispatch({
        changes: { from: pos, insert },
        selection: { anchor: pos + insert.length },
      })
      view.focus()
    },
    scrollToLine(lineNumber) {
      const view = viewRef.current
      if (!view || !lineNumber) return
      const total = view.state.doc.lines
      const clamped = Math.max(1, Math.min(total, lineNumber))
      const line = view.state.doc.line(clamped)
      view.dispatch({
        selection: { anchor: line.from, head: line.to },
        effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
      })
      view.focus()
    },
  }))

  useEffect(() => {
    if (!containerRef.current) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString())
      }
    })

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        bracketMatching(),
        closeBrackets(),
        indentOnInput(),
        highlightSelectionMatches(),
        StreamLanguage.define(verilog),
        oneDark,
        updateListener,

        // Verilog linter — 500ms debounce
        linter(verilogLint, { delay: 500 }),

        // Verilog autocomplete — trigger after 2 chars or Ctrl+Space
        autocompletion({
          override: [verilogCompletion],
          activateOnTyping: true,
          maxRenderedOptions: 20,
        }),

        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...closeBracketsKeymap,
          ...searchKeymap,
        ]),
        EditorView.theme({
          '&': { height: '100%' },

          // Lint underlines: colors handled by index.css with SVG overrides

          // Lint hover tooltip
          '.cm-tooltip-hover, .cm-tooltip-lint, .cm-tooltip': {
            backgroundColor: '#0a0a0a !important',
            border: '1px solid #1a4a1a !important',
            color: '#ccc !important',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11px',
            borderRadius: '3px',
          },
          '.cm-diagnostic': {
            padding: '3px 8px',
            borderLeft: 'none',
          },
          '.cm-diagnostic-error': {
            borderLeft: '3px solid #ff4444 !important',
            paddingLeft: '8px',
          },
          '.cm-diagnostic-warning': {
            borderLeft: '3px solid #ffaa00 !important',
            paddingLeft: '8px',
          },

          // Hide the persistent inline lint panel if it appears
          '.cm-panel-lint': { display: 'none !important' },
          // Autocomplete popup
          '.cm-tooltip-autocomplete': {
            backgroundColor: '#0a0a0a !important',
            border: '1px solid #1a4a1a !important',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11px',
          },
          '.cm-tooltip-autocomplete > ul': {
            fontFamily: "'JetBrains Mono', monospace",
          },
          '.cm-tooltip-autocomplete > ul > li': {
            color: '#888',
            padding: '2px 8px',
          },
          '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
            backgroundColor: '#001a00 !important',
            color: '#00ff41 !important',
          },
          // Completion icons by type
          '.cm-completionIcon-keyword::after': { content: '"K"', color: '#00ff41' },
          '.cm-completionIcon-variable::after': { content: '"S"', color: '#4ec9b0' },
          '.cm-completionIcon-text::after': { content: '">"', color: '#d4a017' },
          '.cm-completionDetail': { color: '#444', marginLeft: '8px', fontStyle: 'italic' },
          '.cm-completionLabel': { color: '#ccc' },
        }),
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external value prop into the editor when it changes
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (value !== current) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
    }
  }, [value])

  return <div ref={containerRef} style={{ height: '100%', overflow: 'hidden' }} />
})

export default EditorPane
