export interface CodeSymbol {
  id: string;
  name: string;
  kind: "function" | "class" | "package";
  filePath: string;
  startLine: number;
  endLine: number;
  sha256: string;
  owner?: string;
  signature?: string;
  libraryId?: string;
  libraryName?: string;
  libraryVersion?: string;
}

export interface CodeNavigationIndex {
  version: 1;
  symbols: CodeSymbol[];
  files: { path: string; sha256: string; libraryId?: string }[];
  skipped: { path: string; reason: string }[];
  libraries?: { id: string; name: string; version: string }[];
  dependencyWarnings?: string[];
  capabilities?: string[];
}

export function lookupIntent(beforeWord: string): "package" | "symbol" {
  return /\b(?:private|protected)\s*\[[\w.$]*$/.test(beforeWord) || /^\s*package\s+[\w.$]*$/.test(beforeWord) ? "package" : "symbol";
}

/** A Scala visibility qualifier points at a package scope, not a callable symbol. */
export function findPackageScopes(index: CodeNavigationIndex, name: string, filePath: string): CodeSymbol[] {
  const declarations = index.symbols.filter(s => s.kind === "package");
  const current = declarations.find(s => s.filePath === filePath && s.name.split(".").includes(name));
  if (!current) return [];
  const parts = current.name.split(".");
  const scope = parts.slice(0, parts.lastIndexOf(name) + 1).join(".");
  return declarations.filter(s => s.libraryId === current.libraryId && (s.name === scope || s.name.startsWith(scope + ".")))
    .sort((a, b) => Number(b.filePath === filePath) - Number(a.filePath === filePath) || a.filePath.localeCompare(b.filePath));
}

/** Ranked candidates, not a claim of compiler-level name resolution. */
export function findDefinitions(index: CodeNavigationIndex, name: string, filePath: string, receiver?: string): CodeSymbol[] {
  const all = index.symbols.filter(s => s.kind !== "package" && (s.name === name || s.name.split('.').pop() === name));
  // Existing project definitions take precedence over library name matches.
  const project = all.filter(s => !s.libraryId);
  const matches = project.length ? project : all;
  const score = (s: CodeSymbol) => (s.filePath === filePath ? 2 : 0) + (receiver && s.owner === receiver ? 4 : 0);
  return matches.sort((a, b) => score(b) - score(a) || a.filePath.localeCompare(b.filePath) || a.startLine - b.startLine);
}

export function isCodeNavigationIndex(value: unknown): value is CodeNavigationIndex {
  if (!value || typeof value !== "object") return false;
  const data = value as CodeNavigationIndex;
  return data.version === 1 && Array.isArray(data.files) && Array.isArray(data.skipped) &&
    Array.isArray(data.symbols) && data.symbols.every(s => s && typeof s.id === "string" &&
      typeof s.name === "string" && typeof s.filePath === "string" && typeof s.sha256 === "string" &&
      (s.kind === "function" || s.kind === "class" || s.kind === "package") && Number.isInteger(s.startLine) &&
      Number.isInteger(s.endLine) && s.startLine >= 1 && s.endLine >= s.startLine);
}
