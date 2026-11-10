import { create } from "zustand";
import type { CodeNavigationIndex } from "./codeNavigation";

export interface ReadingPassage {
  start: number;
  end: number;
  id?: string;
  filePath?: string;
  sha256?: string;
  scrollTop?: number;
}
export interface ReadingHistoryEntry {
  nodeId: string;
  filePath: string;
  location: { line: number; scrollTop: number };
  sha256?: string;
}
type Update<T> = T | ((previous: T) => T);
interface ReadingState {
  graphIdentity: unknown;
  passage: ReadingPassage | null;
  history: ReadingHistoryEntry[];
  index: CodeNavigationIndex | null;
  prepareForGraph: (graph: unknown) => void;
  setPassage: (update: Update<ReadingPassage | null>) => void;
  setHistory: (update: Update<ReadingHistoryEntry[]>) => void;
  setIndex: (index: CodeNavigationIndex | null) => void;
}

// Sidebar and expanded reader mount independently. Keep their navigation state shared.
export const useCodeReadingState = create<ReadingState>((set, get) => ({
  graphIdentity: undefined,
  passage: null,
  history: [],
  index: null,
  prepareForGraph: graph => {
    if (get().graphIdentity !== graph) set({ graphIdentity: graph, passage: null, history: [], index: null });
  },
  setPassage: update => set(state => ({ passage: typeof update === "function" ? update(state.passage) : update })),
  setHistory: update => set(state => ({ history: (typeof update === "function" ? update(state.history) : update).slice(-50) })),
  setIndex: index => set({ index }),
}));
