export interface CodeSymbol {
  id: string;
  name: string;
  kind: "function" | "class";
  filePath: string;
  startLine: number;
  endLine: number;
  sha256: string;
  owner?: string;
}

export interface CodeNavigationIndex {
  version: 1;
  symbols: CodeSymbol[];
  files: { path: string; sha256: string }[];
  skipped: { path: string; reason: string }[];
}

/** Ranked candidates, not a claim of compiler-level name resolution. */
export function findDefinitions(index: CodeNavigationIndex, name: string, filePath: string, receiver?: string): CodeSymbol[] {
  const matches = index.symbols.filter(s => s.name === name || s.name.split('.').pop() === name);
  const score = (s: CodeSymbol) => (s.filePath === filePath ? 2 : 0) + (receiver && s.owner === receiver ? 4 : 0);
  return matches.sort((a, b) => score(b) - score(a) || a.filePath.localeCompare(b.filePath) || a.startLine - b.startLine);
}

export function isCodeNavigationIndex(value: unknown): value is CodeNavigationIndex {
  if (!value || typeof value !== "object") return false;
  const data = value as CodeNavigationIndex;
  return data.version === 1 && Array.isArray(data.files) && Array.isArray(data.skipped) &&
    Array.isArray(data.symbols) && data.symbols.every(s => s && typeof s.id === "string" &&
      typeof s.name === "string" && typeof s.filePath === "string" && typeof s.sha256 === "string" &&
      (s.kind === "function" || s.kind === "class") && Number.isInteger(s.startLine) &&
      Number.isInteger(s.endLine) && s.startLine >= 1 && s.endLine >= s.startLine);
}
