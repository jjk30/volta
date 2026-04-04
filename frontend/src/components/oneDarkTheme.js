import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

// Terminal-inspired: black bg, green accents, muted syntax colors
const green = '#00ff41'
const greenDim = '#00cc33'
const white = '#e0e0e0'
const gray = '#555555'
const amber = '#d4a017'
const cyan = '#4ec9b0'
const violet = '#9d7cd8'
const coral = '#c75050'
const sage = '#6a9955'
const background = '#000000'
const selection = '#00ff4115'
const cursorColor = '#00ff41'
const gutterBg = '#050505'
const gutterFg = '#00ff4150'

const theme = EditorView.theme({
  '&': {
    color: white,
    backgroundColor: background,
  },
  '.cm-content': {
    caretColor: cursorColor,
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: cursorColor,
    borderLeftWidth: '2px',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: selection,
  },
  '.cm-panels': {
    backgroundColor: background,
    color: white,
  },
  '.cm-panels.cm-panels-top': {
    borderBottom: '1px solid #1a1a1a',
  },
  '.cm-panels.cm-panels-bottom': {
    borderTop: '1px solid #1a1a1a',
  },
  '.cm-searchMatch': {
    backgroundColor: '#00ff4130',
    outline: '1px solid #00ff4160',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: '#00ff4120',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(0, 255, 65, 0.03)',
  },
  '.cm-selectionMatch': {
    backgroundColor: '#00ff4115',
  },
  '&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket': {
    backgroundColor: '#00ff4125',
    outline: '1px solid #00ff4150',
  },
  '.cm-gutters': {
    backgroundColor: gutterBg,
    color: gutterFg,
    border: 'none',
    borderRight: '1px solid #1a1a1a',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#0a0a0a',
    color: green,
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#444',
  },
  '.cm-tooltip': {
    border: '1px solid #1a1a1a',
    backgroundColor: '#0a0a0a',
  },
  '.cm-tooltip .cm-tooltip-arrow:before': {
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  '.cm-tooltip .cm-tooltip-arrow:after': {
    borderTopColor: '#0a0a0a',
    borderBottomColor: '#0a0a0a',
  },
  '.cm-tooltip-autocomplete': {
    '& > ul > li[aria-selected]': {
      backgroundColor: selection,
      color: white,
    },
  },
}, { dark: true })

const highlightStyle = HighlightStyle.define([
  // Green for keywords (module, always, begin, end, if, else, case, etc.)
  { tag: tags.keyword, color: green },
  // White for identifiers and names
  { tag: [tags.name, tags.deleted, tags.character, tags.propertyName, tags.macroName], color: white },
  // Cyan for function names
  { tag: [tags.function(tags.variableName), tags.labelName], color: cyan },
  // Amber for numbers and literals
  { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: amber },
  { tag: [tags.typeName, tags.className, tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: amber },
  // White for definitions
  { tag: [tags.definition(tags.name), tags.separator], color: white },
  // Muted violet for operators
  { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.link, tags.special(tags.string)], color: violet },
  // Gray for comments
  { tag: [tags.meta, tags.comment], color: gray, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: gray, textDecoration: 'underline' },
  { tag: tags.heading, fontWeight: 'bold', color: green },
  // Amber for booleans and special values
  { tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: amber },
  // Sage green for strings
  { tag: [tags.processingInstruction, tags.string, tags.inserted], color: sage },
  { tag: tags.invalid, color: '#ffffff', backgroundColor: coral },
])

export const oneDark = [theme, syntaxHighlighting(highlightStyle)]
