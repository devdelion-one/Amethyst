import { cppLanguage } from '@codemirror/lang-cpp';
import { css } from '@codemirror/lang-css';
import { go } from '@codemirror/lang-go';
import { html } from '@codemirror/lang-html';
import { java } from '@codemirror/lang-java';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { php } from '@codemirror/lang-php';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { yaml } from '@codemirror/lang-yaml';
import { bracketMatching, codeFolding, defaultHighlightStyle, foldKeymap, indentOnInput, LanguageSupport, StreamLanguage, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import type { StreamParser } from '@codemirror/language';
import type { Extension, Range } from '@codemirror/state';
import type { EditorView, ViewUpdate } from '@codemirror/view';
import { csharp, kotlin } from '@codemirror/legacy-modes/mode/clike';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import { powerShell } from '@codemirror/legacy-modes/mode/powershell';
import { properties } from '@codemirror/legacy-modes/mode/properties';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { lintKeymap } from '@codemirror/lint';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import { crosshairCursor, Decoration, drawSelection, dropCursor, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap, rectangularSelection, ViewPlugin } from '@codemirror/view';
import { styleTags, tags } from '@lezer/highlight';

export { EditorView, minimalSetup } from 'codemirror';
export { ChangeSet, Compartment, EditorState, Prec, RangeSet, StateEffect, StateField } from '@codemirror/state';
export { acceptCompletion, completionStatus, moveCompletionSelection } from '@codemirror/autocomplete';
export { Decoration, gutter, GutterMarker, hoverTooltip, keymap, MatchDecorator, runScopeHandlers, placeholder, showPanel, showTooltip, ViewPlugin, WidgetType } from '@codemirror/view';
export { historyField, indentLess, insertTab } from '@codemirror/commands';
export { closeSearchPanel, findNext, findPrevious, getSearchQuery, gotoLine, openSearchPanel, replaceAll, replaceNext, search, SearchQuery, selectMatches, setSearchQuery } from '@codemirror/search';
export { diagnosticCount, forEachDiagnostic, forceLinting, lintGutter, linter, nextDiagnostic, previousDiagnostic } from '@codemirror/lint';
export { foldable, foldedRanges, foldEffect, HighlightStyle, language, syntaxHighlighting, syntaxTree, unfoldEffect } from '@codemirror/language';
export { acceptChunk, getChunks, getOriginalDoc, originalDocChangeEffect, rejectChunk, unifiedMergeView, updateOriginalDoc } from '@codemirror/merge';
export { tags };

export const codeSetup: Extension = [
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  codeFolding(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...completionKeymap, ...lintKeymap]),
];

const legacy = (mode: StreamParser<any>) => () => StreamLanguage.define(mode);
const cppFns = cppLanguage.configure({ props: [styleTags({ 'FunctionDeclarator/FieldIdentifier': tags.function(tags.propertyName), 'FunctionDeclarator/ScopedIdentifier/Identifier FunctionDeclarator/ScopedIdentifier/DestructorName': tags.function(tags.definition(tags.variableName)), 'Macro/ArgumentList/Identifier Macro/ArgumentList/*/Identifier Macro/ArgumentList/*/*/Identifier Macro/ArgumentList/*/*/*/Identifier': tags.modifier })] });
const MACRO = /^[A-Z][A-Z0-9_]+$|^[A-Z][A-Z0-9]+_\w*$/;
const UE_ASSERT = new Set(['check', 'checkf', 'checkSlow', 'checkfSlow', 'checkCode', 'checkNoEntry', 'checkNoReentry', 'checkNoRecursion', 'verify', 'verifyf', 'verifySlow', 'verifyfSlow', 'ensure', 'ensureMsgf', 'ensureAlways', 'ensureAlwaysMsgf', 'unimplemented']);
const BUILTIN = new Set(['int8', 'int16', 'int32', 'int64', 'uint8', 'uint16', 'uint32', 'uint64', 'TCHAR', 'ANSICHAR', 'WIDECHAR', 'UTF8CHAR']);
const asMacro = Decoration.mark({ class: 'cm-macro' }), asBuiltin = Decoration.mark({ class: 'cm-builtin' });
function cppMarks(view: EditorView) {
  const out: Range<Decoration>[] = [], doc = view.state.doc;
  for (const { from, to } of view.visibleRanges)
    syntaxTree(view.state).iterate({ from, to, enter(n) {
      if (n.name === 'TypeIdentifier') { if (BUILTIN.has(doc.sliceString(n.from, n.to))) out.push(asBuiltin.range(n.from, n.to)); return; }
      if (n.name !== 'Identifier' || n.node.prevSibling) return;
      const up = n.node.parent?.name;
      const name = doc.sliceString(n.from, n.to);
      if ((up === 'CallExpression' || up === 'FunctionDeclarator') && MACRO.test(name) || up === 'CallExpression' && UE_ASSERT.has(name)) out.push(asMacro.range(n.from, n.to));
    } });
  return Decoration.set(out, true);
}
const cppPlugin = ViewPlugin.fromClass(class {
  constructor(view: EditorView) { (this as any).decorations = cppMarks(view); }
  update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) (this as any).decorations = cppMarks(u.view); }
}, { decorations: (p: any) => p.decorations });
const cpp = () => new LanguageSupport(cppFns, [cppPlugin]);
const LANGS = {
  js: () => javascript(), mjs: () => javascript(), cjs: () => javascript(), jsx: () => javascript({ jsx: true }),
  ts: () => javascript({ typescript: true }), mts: () => javascript({ typescript: true }), cts: () => javascript({ typescript: true }), tsx: () => javascript({ jsx: true, typescript: true }),
  json: json, jsonc: json, uproject: json, uplugin: json, css: css, scss: css, less: css, html: html, htm: html, vue: html, svelte: html,
  md: () => markdown({ base: markdownLanguage }), markdown: () => markdown({ base: markdownLanguage }), py: python, xml: xml, svg: xml, xaml: xml, csproj: xml, yaml: yaml, yml: yaml,
  sql: sql, rs: rust, c: cpp, h: cpp, cc: cpp, cpp: cpp, cxx: cpp, hpp: cpp, hh: cpp, inl: cpp, java: java, go: go, php: php,
  cs: legacy(csharp), kt: legacy(kotlin), kts: legacy(kotlin), sh: legacy(shell), bash: legacy(shell), zsh: legacy(shell),
  ps1: legacy(powerShell), psm1: legacy(powerShell), toml: legacy(toml), lua: legacy(lua), ini: legacy(properties), cfg: legacy(properties), properties: legacy(properties),
};

export function languageFor(name: string) {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  return LANGS[ext as keyof typeof LANGS]?.() ?? [];
}
