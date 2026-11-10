import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useDashboardStore } from "../store";
import { useI18n } from "../contexts/I18nContext";
import CodeReadingGuide from "./CodeReadingGuide";
import type { ReadingNotesResult } from "../readingNotes";
import SourceEditor, { type SourceEditorHandle } from "./SourceEditor";
import { findDefinitions, findPackageScopes, isCodeNavigationIndex, type CodeSymbol } from "../codeNavigation";
import type { GraphNode } from "@understand-anything/core/types";
import { useCodeReadingState } from "../codeReadingState";
const NO_NOTES: NonNullable<ReadingNotesResult["notes"]> = [];

interface CodeViewerProps {
  accessToken: string;
  presentation?: "sidebar" | "modal";
  onClose?: () => void;
  onExpand?: () => void;
}

interface SourceFile {
  path: string;
  language: string;
  content: string;
  sha256?: string;
  sizeBytes: number;
  lineCount: number;
  readingNotes?: ReadingNotesResult;
  library?: { id: string; name: string; version: string };
}

type SourceState =
  | { status: "idle" | "loading"; source: null; error: null }
  | { status: "loaded"; source: SourceFile; error: null }
  | { status: "error"; source: null; error: string };

function fileContentUrl(filePath: string, token: string): string {
  const params = new URLSearchParams({ token, path: filePath });
  return `/file-content.json?${params.toString()}`;
}

function fallbackLanguage(filePath: string | undefined): string {
  const ext = filePath?.split(".").pop()?.toLowerCase();
  const byExt: Record<string, string> = {
    css: "css",
    scala: "scala",
    java: "java",
    go: "go",
    html: "markup",
    js: "javascript",
    jsx: "jsx",
    json: "json",
    md: "markdown",
    py: "python",
    rb: "ruby",
    rs: "rust",
    sh: "bash",
    ts: "typescript",
    tsx: "tsx",
    yaml: "yaml",
    yml: "yaml",
  };
  return ext ? byExt[ext] ?? "text" : "text";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Rendered markdown view for .md files, styled for the dark theme. */
function MarkdownView({ content }: { content: string }) {
  return (
    <div className="px-6 py-5 max-w-3xl text-sm text-text-secondary leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-xl font-heading text-text-primary mt-6 mb-3 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="text-lg font-heading text-text-primary mt-5 mb-2 first:mt-0 border-b border-border-subtle pb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-base font-heading text-text-primary mt-4 mb-2 first:mt-0">{children}</h3>,
          h4: ({ children }) => <h4 className="text-sm font-heading text-text-primary mt-3 mb-1.5 first:mt-0">{children}</h4>,
          h5: ({ children }) => <h5 className="text-sm font-heading text-text-primary mt-3 mb-1.5 first:mt-0">{children}</h5>,
          h6: ({ children }) => <h6 className="text-xs font-heading text-text-primary mt-3 mb-1.5 first:mt-0 uppercase tracking-wider">{children}</h6>,
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-accent/40 pl-3 text-text-muted italic mb-3">{children}</blockquote>
          ),
          hr: () => <hr className="border-border-subtle my-4" />,
          pre: ({ children }) => (
            <pre className="bg-elevated border border-border-subtle rounded-lg p-3 mb-3 overflow-x-auto text-xs font-mono">
              {children}
            </pre>
          ),
          code: ({ className, children }) => {
            const isInline = !className && !String(children).includes("\n");
            return isInline ? (
              <code className="bg-elevated px-1.5 py-0.5 rounded text-[0.85em] font-mono text-accent">{children}</code>
            ) : (
              <code className={className}>{children}</code>
            );
          },
          table: ({ children }) => (
            <div className="overflow-x-auto mb-3">
              <table className="text-xs border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border-subtle bg-elevated px-2.5 py-1.5 text-left text-text-primary font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border border-border-subtle px-2.5 py-1.5">{children}</td>,
          img: ({ src, alt }) => (
            <img src={src} alt={alt} className="max-w-full rounded-lg border border-border-subtle my-2" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default function CodeViewer({
  accessToken,
  presentation = "sidebar",
  onClose,
  onExpand,
}: CodeViewerProps) {
  const graph = useDashboardStore((s) => s.graph);
  const domainGraph = useDashboardStore((s) => s.domainGraph);
  const viewMode = useDashboardStore((s) => s.viewMode);
  const codeViewerNodeId = useDashboardStore((s) => s.codeViewerNodeId);
  const closeCodeViewer = useDashboardStore((s) => s.closeCodeViewer);
  const dependencyPath = codeViewerNodeId?.startsWith("library-source:") ? codeViewerNodeId.slice("library-source:".length) : null;
  const dependencyNode: GraphNode | null = dependencyPath ? { id: codeViewerNodeId!, type: "file",
    name: dependencyPath.split("/").pop() ?? dependencyPath, filePath: dependencyPath,
    summary: "Dependency source · 依赖库源码", tags: [], complexity: "moderate" } : null;
  const activeGraph = viewMode === "domain" && domainGraph ? domainGraph : graph;
  // Files tab always builds its tree from the structural graph, so a node ID opened from
  // there may not exist in the active (domain) graph — fall back to the structural graph.
  const node =
    activeGraph?.nodes.find((n) => n.id === codeViewerNodeId) ??
    graph?.nodes.find((n) => n.id === codeViewerNodeId) ??
    dependencyNode ??
    null;
  const [state, setState] = useState<SourceState>({
    status: "idle",
    source: null,
    error: null,
  });
  // Markdown files default to the rendered view (#555); toggle back to
  // source for line numbers / lineRange highlighting.
  const [mdView, setMdView] = useState<"rendered" | "source">("rendered");
  const [showGuide, setShowGuide] = useState(true);
  const passage = useCodeReadingState(s => s.passage);
  const setPassage = useCodeReadingState(s => s.setPassage);
  const editorRef = useRef<SourceEditorHandle>(null);
  const index = useCodeReadingState(s => s.index);
  const setIndex = useCodeReadingState(s => s.setIndex);
  const [indexVersion, setIndexVersion] = useState(0);
  const [navigationMessage, setNavigationMessage] = useState("");
  const [candidates, setCandidates] = useState<CodeSymbol[]>([]);
  const history = useCodeReadingState(s => s.history);
  const setHistory = useCodeReadingState(s => s.setHistory);
  const prepareForGraph = useCodeReadingState(s => s.prepareForGraph);
  const { t, localeKey } = useI18n();
  const chinese = localeKey.startsWith("zh");
  const jumpTo = (start: number, end: number, id?: string) => {
    setPassage({ start, end, id, filePath: node?.filePath });
    setMdView("source");
  };
  useEffect(() => {
    if (!graph || accessToken === "__demo__") return;
    const saved = useCodeReadingState.getState();
    if (saved.graphIdentity === graph && saved.index?.capabilities?.includes("package-scopes") && indexVersion === 0) return;
    const controller = new AbortController();
    setIndex(null);
    fetch(`/code-navigation.json?${new URLSearchParams({ token: accessToken })}`, { signal: controller.signal, cache: "no-store" })
      .then(async res => {
        if (!res.ok) throw new Error();
        const data: unknown = await res.json();
        if (!isCodeNavigationIndex(data)) throw new Error();
        if (!controller.signal.aborted) { setIndex(data); setNavigationMessage(""); }
      }).catch(() => {
        if (!controller.signal.aborted) setNavigationMessage(chinese ? "符号索引暂不可用，可重新建立索引。" : "Symbol index unavailable. Rebuild to retry.");
      });
    return () => controller.abort();
  }, [accessToken, graph, indexVersion, chinese, setIndex]);
  useEffect(() => { prepareForGraph(graph); setCandidates([]); }, [graph, prepareForGraph]);

  useEffect(() => {
    if (!node?.filePath) {
      setState({ status: "error", source: null, error: "This node does not have a file path." });
      return;
    }

    if (accessToken === "__demo__") {
      setState({
        status: "error",
        source: null,
        error: "Source preview is available only when the local dashboard server is running.",
      });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading", source: null, error: null });

    fetch(fileContentUrl(node.filePath, accessToken), { signal: controller.signal })
      .then(async (res) => {
        const data = (await res.json()) as SourceFile | { error?: string };
        if (!res.ok) {
          throw new Error("error" in data && data.error ? data.error : "Source unavailable");
        }
        setState({ status: "loaded", source: data as SourceFile, error: null });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          source: null,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return () => controller.abort();
  }, [accessToken, node?.filePath]);

  const highlightedRange = useMemo(() => {
    if (passage?.filePath === node?.filePath) {
      if (passage?.sha256 && passage.sha256 !== state.source?.sha256) return null;
      return passage;
    }
    if (!node?.lineRange) return null;
    return { start: node.lineRange[0], end: node.lineRange[1] };
  }, [node?.lineRange, node?.filePath, passage, state.source?.sha256]);

  if (!node) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-surface">
        <p className="text-text-muted text-sm">{t.codeViewer.noFile}</p>
      </div>
    );
  }

  const source = state.source?.path === node.filePath ? state.source : null;
  const language = source?.language ?? fallbackLanguage(node.filePath);
  const isMarkdown = language === "markdown";
  const showRendered = isMarkdown && mdView === "rendered";
  const lineInfo = highlightedRange
    ? `${t.codeViewer.lines} ${highlightedRange.start}-${highlightedRange.end}`
    : t.codeViewer.fullFile;
  const isModal = presentation === "modal";
  const rememberPosition = () => {
    const location = editorRef.current?.getLocation();
    if (location && node.filePath) setPassage({ start: location.line, end: location.line, filePath: node.filePath,
      sha256: source?.sha256, scrollTop: location.scrollTop });
  };
  const handleClose = () => { rememberPosition(); (onClose ?? closeCodeViewer)(); };
  const navigate = (id: string, symbol?: CodeSymbol) => {
    if (node.filePath) setHistory(old => [...old, { nodeId: node.id, filePath: node.filePath!,
      location: editorRef.current?.getLocation() ?? { line: 1, scrollTop: 0 }, sha256: source?.sha256 }].slice(-50));
    setCandidates([]);
    setNavigationMessage("");
    setPassage(symbol ? { start: symbol.startLine, end: symbol.endLine, filePath: symbol.filePath, sha256: symbol.sha256 } : null);
    setMdView("source");
    useDashboardStore.getState().selectNode(id);
    useDashboardStore.setState({ codeViewerNodeId: id });
  };
  const followSymbol = (symbol: CodeSymbol) => {
    if (symbol.libraryId) {
      const id = `library-source:${symbol.filePath}`;
      navigate(id, symbol);
      return;
    }
    const target = graph?.nodes.find(n => n.filePath === symbol.filePath && n.name === symbol.name && n.type === symbol.kind)
      ?? graph?.nodes.find(n => n.filePath === symbol.filePath);
    if (target) navigate(target.id, symbol);
  };
  const lookup = (name: string, receiver?: string, intent: "package" | "symbol" = "symbol") => {
    if (!index) { setNavigationMessage(chinese ? "符号索引尚未就绪，请稍后重试。" : "The symbol index is not ready yet."); return; }
    if (intent === "package") {
      const scopes = findPackageScopes(index, name, node.filePath ?? "");
      if (scopes.length) {
        followSymbol(scopes[0]);
        setCandidates(scopes.slice(1));
        setNavigationMessage(chinese ? `“${name}” 是包访问范围限定符，已定位到当前文件的包声明。下方可继续查看该范围内已索引的文件。` : `“${name}” is a package visibility scope. Opened its package declaration; indexed files in this scope are listed below.`);
      } else { setCandidates([]); setNavigationMessage(chinese ? `“${name}” 是包访问范围限定符，当前索引没有对应的包声明。` : `“${name}” is a package scope whose declaration is not indexed.`); }
      return;
    }
    const results = findDefinitions(index, name, node.filePath ?? "", receiver);
    if (results.length === 1) followSymbol(results[0]);
    else {
      setCandidates(results);
      setNavigationMessage(results.length ? (chinese ? `“${name}” 有多个定义，请选择：` : `Choose a definition for “${name}”:`)
        : (chinese ? `“${name}” 未在当前项目或已接入的依赖源码中找到。其他源码和依赖尚未索引，不代表它没有定义。` : `“${name}” was not found in indexed project or dependency sources. Other sources have not been indexed.`));
    }
  };
  const goBack = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory(old => old.slice(0, -1));
    setCandidates([]); setNavigationMessage("");
    setPassage({ start: previous.location.line, end: previous.location.line, filePath: previous.filePath,
      sha256: previous.sha256, scrollTop: previous.location.scrollTop });
    useDashboardStore.getState().selectNode(previous.nodeId);
    useDashboardStore.setState({ codeViewerNodeId: previous.nodeId });
  };
  const staleIndex = Boolean(passage?.filePath === source?.path && passage?.sha256 && passage.sha256 !== source?.sha256);

  return (
    <div className="h-full w-full flex flex-col bg-surface overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3 bg-elevated border-b border-border-subtle shrink-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border"
              style={{
                color: "var(--color-node-file)",
                borderColor: "color-mix(in srgb, var(--color-node-file) 30%, transparent)",
                backgroundColor: "color-mix(in srgb, var(--color-node-file) 10%, transparent)",
              }}
            >
              {language}
            </span>
            <span className="text-[10px] text-text-muted">{lineInfo}</span>
          </div>
          <div className="text-sm font-heading text-text-primary truncate" title={node.name}>
            {node.name}
          </div>
          {node.filePath && (
            <div className="text-[11px] font-mono text-text-muted truncate mt-0.5" title={node.filePath}>
              {node.filePath}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={() => setShowGuide(v => !v)} aria-pressed={showGuide} className="text-xs px-2 py-1 rounded border border-border-subtle text-accent hover:bg-accent/10">
            {showGuide ? (chinese ? "收起注释" : "Hide guide") : (chinese ? "辅助阅读" : "Reading guide")}
          </button>
          {onExpand && (
            <button
              type="button"
              onClick={() => { rememberPosition(); onExpand(); }}
              className="text-text-muted hover:text-text-primary transition-colors"
              title={t.codeViewer.openLarger}
              aria-label={t.codeViewer.openLarger}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={handleClose}
            className="text-text-muted hover:text-text-primary transition-colors"
            title={isModal ? t.codeViewer.closeExpanded : t.codeViewer.closeViewer}
            aria-label={isModal ? t.codeViewer.closeExpanded : t.codeViewer.closeViewer}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="shrink-0 px-4 py-2 flex flex-wrap items-center gap-3 border-b border-border-subtle text-xs bg-surface">
        <button type="button" onClick={goBack} disabled={!history.length} className="text-accent disabled:opacity-30">← {chinese ? "返回上一处" : "Back"}</button>
        <span className="text-text-muted">Ctrl / ⌘ + {chinese ? "点击" : "click"} · F12 {chinese ? "查看索引定义" : "indexed definitions"} · Ctrl+F {chinese ? "查找" : "find"}</span>
        <button type="button" onClick={() => setIndexVersion(v => v + 1)} className="ml-auto text-accent">{chinese ? "重建索引" : "Rebuild index"}</button>
        <span className="text-text-muted">{index ? `${index.files.filter(f => !f.libraryId).length} ${chinese ? "个项目文件" : "project files"} · ${index.files.filter(f => f.libraryId).length} ${chinese ? "个依赖文件" : "dependency files"}${index.skipped.length ? ` · ${index.skipped.length} ${chinese ? "个未索引" : "not indexed"}` : ""}` : (chinese ? "索引加载中" : "Loading index")}</span>
      </div>
      {(navigationMessage || staleIndex) && <div role="status" className="shrink-0 border-b border-border-subtle p-3 text-xs bg-elevated text-text-secondary max-h-48 overflow-auto">
        <p>{staleIndex ? (chinese ? "目标源码已变化，已停止行号跳转，请重建索引。" : "Target source changed. Rebuild the index before jumping.") : navigationMessage}</p>
        {candidates.map(symbol => <button key={symbol.id} type="button" onClick={() => followSymbol(symbol)} className="block w-full text-left mt-2 rounded p-2 hover:bg-accent/10 text-accent">
          {symbol.libraryName && <span className="text-text-muted">{symbol.libraryName} {symbol.libraryVersion} · </span>}
          {symbol.owner ? `${symbol.owner}.` : ""}{symbol.name} · {symbol.filePath}:L{symbol.startLine}
          {symbol.signature && <span className="block font-mono text-text-secondary mt-1">{symbol.signature}</span>}
        </button>)}
      </div>}

      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
      {showGuide && <CodeReadingGuide node={source?.library ? { ...node, summary: `${source.library.name} ${source.library.version} · ${chinese ? "依赖库源码" : "Dependency source"}` } : node} graph={activeGraph?.nodes.some(n => n.id === node.id) ? activeGraph : graph}
        notes={state.source?.path === node.filePath ? state.source?.readingNotes : undefined} chinese={chinese} onJump={jumpTo}
        onNavigate={id => navigate(id)} />}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden bg-root">
        {state.status === "loading" && (
          <div className="p-5 text-sm text-text-muted">{t.codeViewer.loading}</div>
        )}

        {state.status === "error" && (
          <div className="p-5">
            <div className="rounded-lg border border-border-subtle bg-elevated p-4">
              <div className="text-sm font-medium text-text-primary mb-2">{t.codeViewer.sourceUnavailable}</div>
              <p className="text-sm text-text-secondary leading-relaxed">{state.error}</p>
            </div>
          </div>
        )}

        {source && (
          <>
            <div className="shrink-0 px-4 py-2 border-b border-border-subtle bg-surface text-[11px] text-text-muted flex items-center justify-between">
              <span>{source.lineCount} {t.codeViewer.linesLabel}</span>
              <div className="flex items-center gap-3">
                {isMarkdown && (
                  <div className="flex items-center rounded border border-border-subtle overflow-hidden" role="group">
                    {(["rendered", "source"] as const).map((view) => (
                      <button
                        key={view}
                        type="button"
                        onClick={() => setMdView(view)}
                        className={`px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors ${
                          mdView === view
                            ? "bg-accent/15 text-accent"
                            : "text-text-muted hover:text-text-primary"
                        }`}
                        aria-pressed={mdView === view}
                      >
                        {view === "rendered" ? t.codeViewer.rendered : t.codeViewer.source}
                      </button>
                    ))}
                  </div>
                )}
                <span>{formatBytes(source.sizeBytes)}</span>
              </div>
            </div>
            {showRendered && <div className="flex-1 overflow-auto"><MarkdownView content={source.content} /></div>}
            {!showRendered && (
            <SourceEditor ref={editorRef} filePath={source.path} content={source.content} language={language}
              notes={showGuide ? source.readingNotes?.notes ?? NO_NOTES : NO_NOTES} range={highlightedRange}
              onNote={jumpTo} onDefinition={lookup} onBack={goBack} />
            )}
          </>
        )}
      </div>
      </div>
    </div>
  );
}
