export interface ReadingNote {
  id: string;
  title: string;
  explanation: string;
  startLine: number;
  endLine: number;
}

export interface ReadingNotesResult {
  status: "available" | "missing" | "stale" | "invalid";
  notes: ReadingNote[];
}

// Notes are data, never executable code. Only show locations for the exact source bytes.
export function validateReadingNotes(raw: unknown, filePath: string, sha256: string, lineCount: number): ReadingNotesResult {
  if (!raw || typeof raw !== "object") return { status: "invalid", notes: [] };
  const files = (raw as { files?: Record<string, unknown> }).files;
  if (!files || typeof files !== "object") return { status: "invalid", notes: [] };
  if (!Object.prototype.hasOwnProperty.call(files, filePath)) return { status: "missing", notes: [] };
  const entry = files[filePath] as { sha256?: string; notes?: unknown[] } | null;
  if (!entry || typeof entry.sha256 !== "string" || !Array.isArray(entry.notes)) return { status: "invalid", notes: [] };
  if (entry.sha256 !== sha256) return { status: "stale", notes: [] };
  const ids = new Set<string>();
  const notes: ReadingNote[] = [];
  for (const value of entry.notes) {
    const n = value as ReadingNote | null;
    if (!n || typeof n.id !== "string" || !n.id || ids.has(n.id) ||
        typeof n.title !== "string" || typeof n.explanation !== "string" ||
        !Number.isInteger(n.startLine) || !Number.isInteger(n.endLine) ||
        n.startLine < 1 || n.endLine < n.startLine || n.endLine > lineCount) {
      return { status: "invalid", notes: [] };
    }
    ids.add(n.id);
    notes.push(n);
  }
  return { status: "available", notes: notes.sort((a, b) => a.startLine - b.startLine) };
}
