import { describe, expect, it } from "vitest";
import { validateReadingNotes } from "../readingNotes";

const note = { id: "route", title: "HTAP route", explanation: "A separate reading note", startLine: 3, endLine: 5 };
const data = (notes: unknown[] = [note]) => ({ files: { "Test.scala": { sha256: "source-hash", notes } } });
describe("source-bound reading notes", () => {
  it("shows notes only for matching file bytes", () => {
    expect(validateReadingNotes(data(), "Test.scala", "source-hash", 10)).toEqual({ status: "available", notes: [note] });
    expect(validateReadingNotes(data(), "Test.scala", "changed", 10)).toEqual({ status: "stale", notes: [] });
  });
  it("does not borrow notes from a different file or prototype property", () => {
    expect(validateReadingNotes(data(), "Other.scala", "source-hash", 10).status).toBe("missing");
    expect(validateReadingNotes(data(), "__proto__", "source-hash", 10).status).toBe("missing");
  });
  it.each([{ ...note, startLine: 0 }, { ...note, endLine: 11 }, { ...note, endLine: 2 }, null])("rejects invalid ranges or entries: %j", entry => {
    expect(validateReadingNotes(data([entry]), "Test.scala", "source-hash", 10)).toEqual({ status: "invalid", notes: [] });
  });
  it("rejects duplicate anchors", () => {
    expect(validateReadingNotes(data([note, note]), "Test.scala", "source-hash", 10).status).toBe("invalid");
  });
});
