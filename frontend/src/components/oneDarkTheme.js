import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

// ---------------------------------------------------------------------------
// Dark theme — terminal-inspired (black bg, bright green accents)
// ---------------------------------------------------------------------------
const darkPalette = {
  green: '#00ff41',
  greenDim: '#00cc33',
  textPrimary: '#e0e0e0',
  gray: '#555555',
  amber: '#d4a017',
  cyan: '#4ec9b0',
  violet: '#9d7cd8',
  coral: '#c75050',
  sage: '#6a9955',
  background: '#000000',
  gutterBg: '#050505',
  gutterFg: '#00ff4150',
  border: '#1a1a1a',
  tooltipBg: '#0a0a0a',
  selectionBg: '#00ff4115',
  activeLineBg: 'rgba(0, 255, 65, 0.03)',
  matchBg: '#00ff4130',
  matchOutline: '#00ff4160',
  invalidText: '#ffffff',
}

// ---------------------------------------------------------------------------
// Light theme — clean white bg, dark green accents
// ---------------------------------------------------------------------------
const lightPalette = {
  green: '#006622',
  greenDim: '#008833',
  textPrimary: '#1a1a1a',
  gray: '#888888',
  amber: '#996600',
  cyan: '#2a8c7a',
  violet: '#5a3a8a',
  coral: '#cc2222',
  sage: '#3a6a2a',
  background: '#ffffff',
  gutterBg: '#f0f0ec',
  gutterFg: '#00662280',
  border: '#d0d0d0',
  tooltipBg: '#ffffff',
  selectionBg: 'rgba(0, 102, 34, 0.15)',
  activeLineBg: 'rgba(0, 102, 34, 0.06)',
  matchBg: 'rgba(0, 102, 34, 0.2)',
  matchOutline: 'rgba(0, 102, 34, 0.5)',
  invalidText: '#ffffff',
}

function buildTheme(p, isDark) {
  const theme = EditorView.theme({
    '&': {
      color: p.textPrimary,
      backgroundColor: p.background,
    },
    '.cm-content': {
      caretColor: p.green,
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: p.green,
      borderLeftWidth: '2px',
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: p.selectionBg,
    },
    '.cm-panels': {
      backgroundColor: p.background,
      color: p.textPrimary,
    },
    '.cm-panels.cm-panels-top': {
      borderBottom: `1px solid ${p.border}`,
    },
    '.cm-panels.cm-panels-bottom': {
      borderTop: `1px solid ${p.border}`,
    },
    '.cm-searchMatch': {
      backgroundColor: p.matchBg,
      outline: `1px solid ${p.matchOutline}`,
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: p.matchBg,
    },
    '.cm-activeLine': {
      backgroundColor: p.activeLineBg,
    },
    '.cm-selectionMatch': {
      backgroundColor: p.selectionBg,
    },
    '&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket': {
      backgroundColor: p.selectionBg,
      outline: `1px solid ${p.matchOutline}`,
    },
    '.cm-gutters': {
      backgroundColor: p.gutterBg,
      color: p.gutterFg,
      border: 'none',
      borderRight: `1px solid ${p.border}`,
    },
    '.cm-activeLineGutter': {
      backgroundColor: p.activeLineBg,
      color: p.green,
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'transparent',
      border: 'none',
      color: p.gray,
    },
    '.cm-tooltip': {
      border: `1px solid ${p.border}`,
      backgroundColor: p.tooltipBg,
      color: p.textPrimary,
    },
    '.cm-tooltip .cm-tooltip-arrow:before': {
      borderTopColor: 'transparent',
      borderBottomColor: 'transparent',
    },
    '.cm-tooltip .cm-tooltip-arrow:after': {
      borderTopColor: p.tooltipBg,
      borderBottomColor: p.tooltipBg,
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li[aria-selected]': {
        backgroundColor: p.selectionBg,
        color: p.textPrimary,
      },
    },
  }, { dark: isDark })

  const highlight = HighlightStyle.define([
    { tag: tags.keyword, color: p.green },
    { tag: [tags.name, tags.deleted, tags.character, tags.propertyName, tags.macroName], color: p.textPrimary },
    { tag: [tags.function(tags.variableName), tags.labelName], color: p.cyan },
    { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: p.amber },
    { tag: [tags.typeName, tags.className, tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: p.amber },
    { tag: [tags.definition(tags.name), tags.separator], color: p.textPrimary },
    { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.link, tags.special(tags.string)], color: p.violet },
    { tag: [tags.meta, tags.comment], color: p.gray, fontStyle: 'italic' },
    { tag: tags.strong, fontWeight: 'bold' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strikethrough, textDecoration: 'line-through' },
    { tag: tags.link, color: p.gray, textDecoration: 'underline' },
    { tag: tags.heading, fontWeight: 'bold', color: p.green },
    { tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: p.amber },
    { tag: [tags.processingInstruction, tags.string, tags.inserted], color: p.sage },
    { tag: tags.invalid, color: p.invalidText, backgroundColor: p.coral },
  ])

  return [theme, syntaxHighlighting(highlight)]
}

export const oneDark = buildTheme(darkPalette, true)
export const oneLight = buildTheme(lightPalette, false)

export function themeFor(name) {
  return name === 'light' ? oneLight : oneDark
}
