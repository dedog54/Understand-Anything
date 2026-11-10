import type { GraphNode, KnowledgeGraph } from "@understand-anything/core";
import type { ReadingNotesResult } from "../readingNotes";

interface Props {
  node: GraphNode;
  graph: KnowledgeGraph | null;
  notes?: ReadingNotesResult;
  chinese: boolean;
  onJump: (start: number, end: number, id?: string) => void;
  onNavigate: (id: string) => void;
}

export default function CodeReadingGuide({ node, graph, notes, chinese: zh, onJump, onNavigate }: Props) {
  const fileNode = graph?.nodes.find(n => n.filePath === node.filePath && n.type === "file") ?? node;
  const fileIds = new Set(graph?.nodes.filter(n => n.filePath === node.filePath).map(n => n.id));
  const related = (graph?.edges ?? []).filter(e => fileIds.has(e.source) !== fileIds.has(e.target))
    .map(e => ({ edge: e, incoming: fileIds.has(e.target), node: graph?.nodes.find(n => n.id === (fileIds.has(e.source) ? e.target : e.source)) }))
    .filter((x, i, all) => x.node && all.findIndex(y => y.node?.filePath === x.node?.filePath && y.incoming === x.incoming) === i);
  const tour = graph?.tour.filter(step => step.nodeIds.some(id => fileIds.has(id))) ?? [];
  return (
    <aside aria-label={zh ? "代码阅读助手" : "Code reading guide"} className="w-full md:w-80 shrink-0 border-b md:border-b-0 md:border-r border-border-subtle bg-surface overflow-auto max-h-[40%] md:max-h-none p-4 text-xs leading-relaxed space-y-5">
      <section>
        <h3 className="text-accent font-semibold mb-2">{zh ? "文件职责" : "File responsibility"}</h3>
        <p className="text-text-primary">{fileNode.summary || (zh ? "该文件还没有图谱摘要。" : "No graph summary yet.")}</p>
        {node.id !== fileNode.id && node.summary !== fileNode.summary && <p className="text-text-secondary mt-2">{node.summary}</p>}
      </section>
      <section>
        <h3 className="text-accent font-semibold mb-2">{zh ? "逐段阅读" : "Reading notes"}</h3>
        {notes?.status === "stale" ? <p className="text-amber-400">{zh ? "源码已变化，已隐藏旧注释，需重新核对。" : "Source changed. Old notes are hidden until reviewed."}</p>
          : notes?.status === "invalid" ? <p className="text-amber-400">{zh ? "注释文件格式有误，暂不显示。" : "The notes file is invalid."}</p>
          : !notes?.notes.length ? <p className="text-text-muted">{zh ? "该文件尚未添加逐段注释，可先结合下方导览和关联文件阅读。" : "No passage notes yet. Use the context and related files below."}</p> : null}
        <div className="space-y-2">{notes?.notes.map(note => (
          <button key={note.id} type="button" onClick={() => onJump(note.startLine, note.endLine, note.id)} className="w-full text-left rounded border border-border-subtle hover:border-accent/60 p-2.5 bg-elevated/40">
            <span className="text-accent font-mono text-[10px]">L{note.startLine}–{note.endLine}</span>
            <span className="block font-medium text-text-primary">{note.title}</span>
          </button>
        ))}</div>
      </section>
      {tour.length > 0 && <section>
        <h3 className="text-accent font-semibold mb-2">{zh ? "放到调用流程里看" : "Flow context"}</h3>
        {tour.map(step => <div key={step.order} className="mb-3"><p className="text-text-primary font-medium">{step.title}</p><p className="text-text-secondary mt-1">{step.description}</p></div>)}
      </section>}
      {related.length > 0 && <section>
        <h3 className="text-accent font-semibold mb-2">{zh ? "关联文件 · 点击继续读" : "Related files · continue reading"}</h3>
        {related.map(({ node: next, edge, incoming }) => next && <button key={`${next.id}-${incoming}`} type="button" disabled={!next.filePath} onClick={() => onNavigate(next.id)} className="block text-left w-full rounded p-2 mb-1 hover:bg-elevated disabled:opacity-60">
          <span className="text-text-muted text-[10px]">{incoming ? (zh ? "上游 → 本文件" : "Upstream → this file") : (zh ? "本文件 → 下游" : "This file → downstream")} · {edge.type}</span>
          <span className="block text-text-primary font-mono break-all">{next.name}</span>
          <span className="block text-text-secondary mt-1">{edge.description || next.summary}</span>
        </button>)}
      </section>}
      {node.languageNotes && <section><h3 className="text-accent font-semibold mb-2">{zh ? "语法提示" : "Language notes"}</h3><p className="text-text-secondary whitespace-pre-wrap">{node.languageNotes}</p></section>}
    </aside>
  );
}
