import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

const chalky = '#e5c07b'
const coral = '#e06c75'
const cyan = '#56b6c2'
const sage = '#98c379'
const whiskey = '#d19a66'
const violet = '#c678dd'
const malibu = '#61afef'
const ivory = '#abb2bf'
const stone = '#5c6370'
const background = '#11111b'
const selection = '#313244'
const cursor = '#89b4fa'
const gutterBg = '#181825'
const gutterFg = '#6c7086'

const theme = EditorView.theme({
  '&': {
    color: ivory,
    backgroundColor: background,
  },
  '.cm-content': {
    caretColor: cursor,
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: cursor,
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: selection,
  },
  '.cm-panels': {
    backgroundColor: background,
    color: ivory,
  },
  '.cm-panels.cm-panels-top': {
    borderBottom: '1px solid #313244',
  },
  '.cm-panels.cm-panels-bottom': {
    borderTop: '1px solid #313244',
  },
  '.cm-searchMatch': {
    backgroundColor: '#72a1ff59',
    outline: '1px solid #457dff',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: '#6199ff2f',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(137, 180, 250, 0.05)',
  },
  '.cm-selectionMatch': {
    backgroundColor: '#aafe661a',
  },
  '&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket': {
    backgroundColor: '#bad0f847',
  },
  '.cm-gutters': {
    backgroundColor: gutterBg,
    color: gutterFg,
    border: 'none',
    borderRight: '1px solid #313244',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#1e1e2e',
    color: '#a6adc8',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#6c7086',
  },
  '.cm-tooltip': {
    border: '1px solid #313244',
    backgroundColor: '#181825',
  },
  '.cm-tooltip .cm-tooltip-arrow:before': {
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  '.cm-tooltip .cm-tooltip-arrow:after': {
    borderTopColor: '#181825',
    borderBottomColor: '#181825',
  },
  '.cm-tooltip-autocomplete': {
    '& > ul > li[aria-selected]': {
      backgroundColor: selection,
      color: ivory,
    },
  },
}, { dark: true })

const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: violet },
  { tag: [tags.name, tags.deleted, tags.character, tags.propertyName, tags.macroName], color: coral },
  { tag: [tags.function(tags.variableName), tags.labelName], color: malibu },
  { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: whiskey },
  { tag: [tags.definition(tags.name), tags.separator], color: ivory },
  { tag: [tags.typeName, tags.className, tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: chalky },
  { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.link, tags.special(tags.string)], color: cyan },
  { tag: [tags.meta, tags.comment], color: stone, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: stone, textDecoration: 'underline' },
  { tag: tags.heading, fontWeight: 'bold', color: coral },
  { tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: whiskey },
  { tag: [tags.processingInstruction, tags.string, tags.inserted], color: sage },
  { tag: tags.invalid, color: '#ffffff', backgroundColor: coral },
])

export const oneDark = [theme, syntaxHighlighting(highlightStyle)]
