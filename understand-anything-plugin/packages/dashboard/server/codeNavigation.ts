import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { StructuralAnalysis } from "@understand-anything/core";
import type { CodeNavigationIndex, CodeSymbol } from "../src/codeNavigation";

interface Analyzer { analyzeFile(filePath: string, source: string): StructuralAnalysis | null }
const parsedFiles = new Map<string, { sha256: string; symbols: CodeSymbol[] }>();

/** Builds an index of actual declarations, using the same parsers as /understand. */
export function buildCodeNavigationIndex(projectRoot: string, graph: { nodes: { filePath?: string }[] }, parser: Analyzer): CodeNavigationIndex {
  const result: CodeNavigationIndex = { version: 1, symbols: [], files: [], skipped: [] };
  const root = fs.realpathSync(projectRoot);
  let totalBytes = 0;
  const paths = [...new Set(graph.nodes.map(n => n.filePath).filter((p): p is string => Boolean(p)))].sort();
  for (const [i, relative] of paths.entries()) {
    try {
      if (i >= 1000) { result.skipped.push({ path: relative, reason: "file-limit" }); continue; }
      const absolute = fs.realpathSync(path.resolve(root, relative));
      const inside = path.relative(root, absolute);
      if (path.isAbsolute(relative) || inside === ".." || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) {
        result.skipped.push({ path: relative, reason: "outside-project" }); continue;
      }
      const size = fs.statSync(absolute).size;
      if (size > 1024 * 1024 || totalBytes + size > 16 * 1024 * 1024) {
        result.skipped.push({ path: relative, reason: "size-limit" }); continue;
      }
      totalBytes += size;
      const bytes = fs.readFileSync(absolute);
      if (bytes.includes(0)) { result.skipped.push({ path: relative, reason: "binary" }); continue; }
      const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
      const key = `${root}\0${relative}`;
      const cached = parsedFiles.get(key);
      let symbols = cached?.sha256 === sha256 ? cached.symbols : undefined;
      if (!symbols) {
        const source = bytes.toString("utf8");
        const analysis = parser.analyzeFile(relative, source);
        if (!analysis) { result.skipped.push({ path: relative, reason: "unsupported-language" }); continue; }
        symbols = [];
        const sourceLines = source.split(/\r?\n/);
        for (const [kind, declarations] of [["function", analysis.functions], ["class", analysis.classes]] as const) {
          for (const declaration of declarations) {
            const [startLine, endLine] = declaration.lineRange;
            if (startLine < 1 || endLine < startLine) continue;
            const owner = kind === "function" ? analysis.classes.filter(c => c.lineRange[0] <= startLine && c.lineRange[1] >= endLine)
              .sort((a, b) => (a.lineRange[1] - a.lineRange[0]) - (b.lineRange[1] - b.lineRange[0]))[0]?.name : undefined;
            const signature = sourceLines[startLine - 1]?.trim().slice(0, 200);
            symbols.push({ id: `${kind}:${relative}:${declaration.name}:${startLine}`, name: declaration.name, signature,
              kind, filePath: relative, startLine, endLine, sha256, ...(owner ? { owner } : {}) });
          }
        }
        if (parsedFiles.size > 2000) parsedFiles.clear();
        parsedFiles.set(key, { sha256, symbols });
      }
      result.files.push({ path: relative, sha256 });
      result.symbols.push(...symbols);
    } catch { result.skipped.push({ path: relative, reason: "unreadable-or-parse-failed" }); }
  }
  return result;
}
