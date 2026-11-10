import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, keymap, lineNumbers, type DecorationSet } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { StreamLanguage, HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { scala, java, cpp } from "@codemirror/legacy-modes/mode/clike";
import { javascript, typescript, json } from "@codemirror/legacy-modes/mode/javascript";
import { python } from "@codemirror/legacy-modes/mode/python";
import { tags } from "@lezer/highlight";
import type { ReadingNote } from "../readingNotes";
import { animateReaderScroll, readerPrefersReducedMotion } from "../utils/readerMotion";

export interface EditorLocation { line: number; scrollTop: number }
export interface SourceEditorHandle { getLocation(): EditorLocation }
interface Props {
  filePath: string;
  content: string;
  language: string;
  notes: ReadingNote[];
  range: { start: number; end: number; scrollTop?: number } | null;
  onNote: (start: number, end: number, id?: string) => void;
  onDefinition: (word: string, receiver?: string) => void;
  onBack: () => void;
}

class NoteWidget extends WidgetType {
  constructor(readonly note: ReadingNote, readonly onNote: Props["onNote"]) { super(); }
  eq(other: NoteWidget) { return other.note === this.note; }
  toDOM() {
    const div = document.createElement("div");
    div.className = "cm-reading-note";
    div.dataset.readingNote = this.note.id;
    const button = div.appendChild(document.createElement("button"));
    button.type = "button";
    button.textContent = `L${this.note.startLine}–${this.note.endLine} · ${this.note.title}`;
    button.onclick = () => this.onNote(this.note.startLine, this.note.endLine, this.note.id);
    div.appendChild(document.createElement("p")).textContent = this.note.explanation;
    return div;
  }
  ignoreEvent() { return false; }
}

function readingDecorations(state: EditorState, notes: ReadingNote[], range: Props["range"], onNote: Props["onNote"]): DecorationSet {
  const decorations = notes.filter(n => n.startLine <= state.doc.lines)
    .map(note => Decoration.widget({ widget: new NoteWidget(note, onNote), block: true, side: -1 }).range(state.doc.line(note.startLine).from));
  if (range) for (let line = Math.max(1, range.start); line <= Math.min(range.end, state.doc.lines); line++) {
    decorations.push(Decoration.line({ class: "cm-reading-highlight" }).range(state.doc.line(line).from));
  }
  return Decoration.set(decorations, true);
}

const theme = EditorView.theme({
  "&": { height: "100%", color: "var(--color-text-primary, #ddd)", backgroundColor: "var(--color-root, #111)", fontSize: "12px" },
  ".cm-scroller": { overflow: "auto", fontFamily: "ui-monospace, monospace", lineHeight: "1.8" },
  ".cm-content": { padding: "12px 0" },
  ".cm-gutters": { backgroundColor: "var(--color-surface, #181818)", color: "var(--color-text-muted, #888)", borderRight: "1px solid var(--color-border-subtle, #333)" },
  ".cm-reading-highlight": { backgroundColor: "color-mix(in srgb, var(--color-accent, #a5b4fc) 14%, transparent)", transition: "background-color 180ms ease-out" },
  "@media (prefers-reduced-motion: reduce)": { ".cm-reading-highlight": { transition: "none" } },
  ".cm-reading-note": { fontFamily: "system-ui, sans-serif", whiteSpace: "normal", lineHeight: "1.7", maxWidth: "720px", margin: "12px", padding: "12px 16px", borderLeft: "2px solid var(--color-accent, #a5b4fc)", backgroundColor: "color-mix(in srgb, var(--color-accent, #a5b4fc) 8%, transparent)" },
  ".cm-reading-note button": { color: "var(--color-accent, #a5b4fc)", fontWeight: "600", textAlign: "left", cursor: "pointer" },
  ".cm-reading-note p": { marginTop: "4px", whiteSpace: "pre-wrap" },
  "&.cm-focused": { outline: "none" },
  ".cm-panels": { backgroundColor: "var(--color-surface, #181818)", color: "var(--color-text-primary, #ddd)" },
  ".cm-textfield": { backgroundColor: "var(--color-root, #111)", border: "1px solid #555" },
}, { dark: true });
const highlight = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.keyword, color: "#c792ea" }, { tag: tags.string, color: "#a3be8c" },
  { tag: tags.comment, color: "#8295a6", fontStyle: "italic" }, { tag: tags.number, color: "#f0b27a" },
  { tag: tags.typeName, color: "#82aaff" }, { tag: tags.operator, color: "#89ddff" },
]));

const SourceEditor = forwardRef<SourceEditorHandle, Props>(function SourceEditor(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const annotations = useRef(new Compartment());
  const firstPlacement = useRef(true);
  const revealAnimation = useRef<Animation | null>(null);
  useImperativeHandle(ref, () => ({ getLocation() {
    const view = editor.current;
    return { line: view ? view.state.doc.lineAt(view.state.selection.main.head).number : 1, scrollTop: view?.scrollDOM.scrollTop ?? 0 };
  } }), []);
  useEffect(() => {
    if (!host.current) return;
    firstPlacement.current = true;
    if (!readerPrefersReducedMotion()) host.current.style.opacity = "0";
    const lookup = (view: EditorView, position = view.state.selection.main.head) => {
      const token = syntaxTree(view.state).resolveInner(position, -1);
      if (/comment|string/i.test(token.name)) return false;
      const word = view.state.wordAt(position);
      if (!word) return false;
      const name = view.state.sliceDoc(word.from, word.to);
      const before = view.state.sliceDoc(Math.max(0, word.from - 120), word.from);
      const receiver = before.match(/([\w$]+)\s*\.\s*$/)?.[1];
      latest.current.onDefinition(name, receiver);
      return true;
    };
    const languages: Record<string, Extension> = { scala: StreamLanguage.define(scala), java: StreamLanguage.define(java), cpp: StreamLanguage.define(cpp), c: StreamLanguage.define(cpp), javascript: StreamLanguage.define(javascript), typescript: StreamLanguage.define(typescript), json: StreamLanguage.define(json), python: StreamLanguage.define(python) };
    const view = new EditorView({ parent: host.current, state: EditorState.create({ doc: props.content, extensions: [
      EditorState.readOnly.of(true), EditorView.editable.of(false),
      EditorView.contentAttributes.of({ tabindex: "0", "aria-label": "Source code", "data-source-file": props.filePath }),
      lineNumbers(), theme, highlight, languages[props.language] ?? [], highlightSelectionMatches(),
      keymap.of([{ key: "F12", run: view => { lookup(view); return true; } }, { key: "Alt-ArrowLeft", run: () => { latest.current.onBack(); return true; } }, ...searchKeymap, ...defaultKeymap]),
      EditorView.domEventHandlers({ mousedown(event, view) {
        if (!event.ctrlKey && !event.metaKey) return false;
        const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (position === null) return false;
        event.preventDefault();
        view.dispatch({ selection: { anchor: position } });
        return lookup(view, position);
      } }),
      annotations.current.of(EditorView.decorations.of(Decoration.none)),
    ] }) });
    editor.current = view;
    return () => { revealAnimation.current?.cancel(); editor.current = null; view.destroy(); };
  }, [props.content, props.filePath, props.language]);
  useEffect(() => {
    const view = editor.current;
    if (!view) return;
    view.dispatch({ effects: annotations.current.reconfigure(EditorView.decorations.of(readingDecorations(view.state, props.notes, props.range, (...args) => latest.current.onNote(...args)))) });
  }, [props.notes, props.range, props.content]);
  useEffect(() => {
    const view = editor.current;
    const element = host.current;
    if (!view || !element) return;
    const initial = firstPlacement.current;
    firstPlacement.current = false;
    const range = props.range && props.range.start <= view.state.doc.lines ? props.range : null;
    const position = range ? view.state.doc.line(Math.max(1, range.start)).from : null;
    const reduced = readerPrefersReducedMotion();
    let cancelled = false;
    let stopScroll: () => void = () => {};
    let highlightFrame = 0;
    let targetAnimation: Animation | undefined;
    const fadeIn = () => {
      if (!reduced && element.animate) {
        revealAnimation.current?.cancel();
        revealAnimation.current = element.animate([{ opacity: 0, transform: "translateY(3px)" }, { opacity: 1, transform: "translateY(0)" }],
          { duration: 180, easing: "cubic-bezier(.16, 1, .3, 1)" });
      }
      element.style.opacity = "1";
    };
    const markArrival = () => {
      if (cancelled || reduced || position === null) return;
      highlightFrame = requestAnimationFrame(() => {
        if (cancelled) return;
        const dom = view.domAtPos(position).node;
        const line = (dom.nodeType === 3 ? dom.parentElement : dom as Element)?.closest?.(".cm-line");
        targetAnimation = line?.animate?.([
          { backgroundColor: "color-mix(in srgb, var(--color-accent, #a5b4fc) 28%, transparent)" },
          { backgroundColor: "color-mix(in srgb, var(--color-accent, #a5b4fc) 14%, transparent)" },
        ], { duration: 650, easing: "ease-out" });
      });
    };
    if (position !== null) view.dispatch({ selection: { anchor: position },
      ...(initial ? { effects: EditorView.scrollIntoView(position, { y: "center" }) } : {}) });
    view.requestMeasure({
      read: () => position === null ? 0 : props.range?.scrollTop ??
        view.lineBlockAt(position).top - Math.max(0, (view.scrollDOM.clientHeight - view.lineBlockAt(position).height) * 0.4),
      write: top => {
        if (cancelled) return;
        if (initial) {
          if (range) view.scrollDOM.scrollTop = top;
          fadeIn(); markArrival();
        } else if (position !== null) {
          const farAway = Math.abs(top - view.scrollDOM.scrollTop) > view.scrollDOM.clientHeight * 3;
          if (farAway) { view.scrollDOM.scrollTop = top; fadeIn(); markArrival(); }
          else stopScroll = animateReaderScroll(view.scrollDOM, () => props.range?.scrollTop ??
            view.lineBlockAt(position).top - Math.max(0, (view.scrollDOM.clientHeight - view.lineBlockAt(position).height) * 0.4),
            { reducedMotion: reduced, onFinish: markArrival });
        }
      },
    });
    return () => { cancelled = true; stopScroll(); cancelAnimationFrame(highlightFrame); targetAnimation?.cancel(); revealAnimation.current?.cancel(); element.style.opacity = "1"; };
  }, [props.range, props.content, props.filePath]);
  return <div ref={host} className="flex-1 min-h-0 overflow-hidden" />;
});
export default SourceEditor;
