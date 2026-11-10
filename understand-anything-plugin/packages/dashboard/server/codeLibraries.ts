import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { buildCodeNavigationIndex } from "./codeNavigation";
import type { CodeNavigationIndex } from "../src/codeNavigation";

export interface CodeLibrary { id: string; name: string; version: string; root: string }

/** Only host-configured source roots are exposed; requests cannot register roots. */
export function loadCodeLibraries(graphFile: string, externalDirectory?: string): CodeLibrary[] {
  const projectRoot = path.dirname(path.dirname(graphFile));
  const key = crypto.createHash("sha256").update(fs.realpathSync(projectRoot)).digest("hex").slice(0, 16);
  const file = [path.join(path.dirname(graphFile), "code-libraries.json"),
    ...(externalDirectory ? [path.join(externalDirectory, `${key}.libraries.json`)] : [])].find(p => fs.existsSync(p));
  if (!file) return [];
  const value: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  const libraries = (value as { libraries?: unknown[] })?.libraries;
  if (!Array.isArray(libraries) || libraries.length > 8) throw new Error("Invalid code library manifest");
  const ids = new Set<string>();
  return libraries.map(raw => {
    const lib = raw as CodeLibrary;
    if (!lib || typeof lib.id !== "string" || !/^[a-zA-Z0-9._-]+$/.test(lib.id) || ids.has(lib.id) ||
        typeof lib.name !== "string" || typeof lib.version !== "string" || typeof lib.root !== "string") throw new Error("Invalid code library entry");
    ids.add(lib.id);
    const root = fs.realpathSync(path.resolve(path.dirname(file), lib.root));
    if (!fs.statSync(root).isDirectory()) throw new Error("Code library root is not a directory");
    return { id: lib.id, name: lib.name, version: lib.version, root };
  });
}

export function listLibrarySources(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string, depth: number) => {
    if (depth > 20 || files.length >= 1000) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (files.length >= 1000) break;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) visit(absolute, depth + 1);
      else if (entry.isFile() && /\.(scala|java|kt|ts|tsx|js|jsx|py|cpp|cc|c|h|hpp|rs|go)$/.test(entry.name)) files.push(path.relative(root, absolute).split(path.sep).join("/"));
    }
  };
  visit(root, 0);
  return files;
}

export function addLibraryIndexes(index: CodeNavigationIndex, libraries: CodeLibrary[], parser: Parameters<typeof buildCodeNavigationIndex>[2]): CodeNavigationIndex {
  const result: CodeNavigationIndex = { ...index, symbols: [...index.symbols], files: [...index.files], skipped: [...index.skipped], libraries: [] };
  for (const lib of libraries) {
    const extra = buildCodeNavigationIndex(lib.root, { nodes: listLibrarySources(lib.root).map(filePath => ({ filePath })) }, parser);
    const virtualPath = (p: string) => `@library/${lib.id}/${p}`;
    result.symbols.push(...extra.symbols.map(s => ({ ...s, id: `${lib.id}:${s.id}`, filePath: virtualPath(s.filePath), libraryId: lib.id, libraryName: lib.name, libraryVersion: lib.version })));
    result.files.push(...extra.files.map(f => ({ ...f, path: virtualPath(f.path), libraryId: lib.id })));
    result.skipped.push(...extra.skipped.map(f => ({ ...f, path: virtualPath(f.path) })));
    result.libraries!.push({ id: lib.id, name: lib.name, version: lib.version });
  }
  return result;
}

export function readLibrarySource(virtualPath: string, libraries: CodeLibrary[]) {
  const match = /^@library\/([a-zA-Z0-9._-]+)\/(.+)$/.exec(virtualPath);
  if (!match || match[2].includes("\0")) return null;
  const lib = libraries.find(l => l.id === match[1]);
  if (!lib || !/\.(scala|java|kt|ts|tsx|js|jsx|py|cpp|cc|c|h|hpp|rs|go)$/.test(match[2])) return null;
  try {
    const absolute = fs.realpathSync(path.resolve(lib.root, match[2]));
    const relative = path.relative(lib.root, absolute);
    if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) return null;
    if (!fs.statSync(absolute).isFile() || fs.statSync(absolute).size > 1024 * 1024) return null;
    const bytes = fs.readFileSync(absolute);
    if (bytes.includes(0)) return null;
    const content = bytes.toString("utf8");
    return { path: virtualPath, content, sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: bytes.length, lineCount: content.split(/\r\n|\r|\n/).length,
      library: { id: lib.id, name: lib.name, version: lib.version }, readingNotes: { status: "missing" as const, notes: [] } };
  } catch { return null; }
}
