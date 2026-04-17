import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react'
import { EditorState, Compartment } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { bracketMatching, indentOnInput, StreamLanguage } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap, autocompletion } from '@codemirror/autocomplete'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { linter } from '@codemirror/lint'
import { verilog } from '@codemirror/legacy-modes/mode/verilog'
import { themeFor } from './oneDarkTheme.js'
import { verilogLint } from './verilogLinter.js'
import { verilogCompletion } from './verilogComplete.js'

// Read the current theme off the root <html> element so a fresh editor
// picks up the user's persisted choice before React wires up props.
function readCurrentTheme() {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

const EditorPane = forwardRef(function EditorPane({ value, onChange }, ref) {
  const containerRef = useRef(null)
  const viewRef = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Compartment for the syntax-highlighting theme so we can swap it without
  // tearing down the editor (which would clobber cursor/undo state).
  const themeCompartment = useRef(new Compartment()).current

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

    const initialTheme = readCurrentTheme()

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
        themeCompartment.of(themeFor(initialTheme)),
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
          // All theme-specific colors come from index.css via CSS variables
          // (on .cm-tooltip, .cm-gutters, etc.) and the syntax theme extension
          // above — this theme object only sets layout-related rules.
        }),
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    // Watch for data-theme changes on <html> and swap the syntax theme
    // via the compartment so it takes effect without remounting.
    const observer = new MutationObserver(() => {
      const next = readCurrentTheme()
      view.dispatch({
        effects: themeCompartment.reconfigure(themeFor(next)),
      })
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    return () => {
      observer.disconnect()
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
