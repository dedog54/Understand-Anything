import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { addLibraryIndexes, listLibrarySources, loadCodeLibraries, readLibrarySource } from "../../server/codeLibraries";
import { findDefinitions, type CodeNavigationIndex } from "../codeNavigation";

const temporary: string[] = [];
afterEach(() => { for (const root of temporary.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ua-library-")); temporary.push(root);
  fs.mkdirSync(path.join(root, "scala"));
  fs.writeFileSync(path.join(root, "scala/Option.scala"), "object Option {}\n");
  return { id: "scala-test", name: "Scala", version: "test", root };
}
describe("explicitly configured dependency sources", () => {
  it("rejects a source-root registration with a missing library ID", () => {
    const lib = fixture();
    const directory = path.join(lib.root, ".ua"); fs.mkdirSync(directory);
    const graph = path.join(directory, "knowledge-graph.json"); fs.writeFileSync(graph, "{}");
    fs.writeFileSync(path.join(directory, "code-libraries.json"), JSON.stringify({ libraries: [{ name: "Scala", version: "test", root: lib.root }] }));
    expect(() => loadCodeLibraries(graph)).toThrow("Invalid code library entry");
  });
  it("indexes dependency declarations under a distinct source namespace", () => {
    const lib = fixture();
    const index: CodeNavigationIndex = { version: 1, symbols: [], files: [], skipped: [] };
    const parser = { analyzeFile: () => ({ functions: [], imports: [], exports: [], classes: [{ name: "Option", methods: [], properties: [], lineRange: [1, 1] as [number, number] }] }) };
    const combined = addLibraryIndexes(index, [lib], parser);
    const target = findDefinitions(combined, "Option", "Project.scala")[0];
    expect(target).toMatchObject({ libraryId: lib.id, libraryVersion: "test", filePath: "@library/scala-test/scala/Option.scala" });
    expect(readLibrarySource(target.filePath, [lib])?.sha256).toBe(target.sha256);
    expect(index.symbols).toHaveLength(0);
  });
  it("rejects unknown libraries, traversal, and outbound symlinks", () => {
    const lib = fixture(), other = fixture();
    fs.symlinkSync(path.join(other.root, "scala/Option.scala"), path.join(lib.root, "escape.scala"));
    expect(readLibrarySource("@library/missing/scala/Option.scala", [lib])).toBeNull();
    expect(readLibrarySource("@library/scala-test/../../secret.scala", [lib])).toBeNull();
    expect(readLibrarySource("@library/scala-test/escape.scala", [lib])).toBeNull();
    expect(listLibrarySources(lib.root)).toEqual(["scala/Option.scala"]);
  });
  it("keeps local project definitions ahead of library name collisions", () => {
    const base = { id: "local", name: "Option", kind: "class" as const, filePath: "Option.scala", startLine: 1, endLine: 2, sha256: "hash" };
    const index: CodeNavigationIndex = { version: 1, files: [], skipped: [], symbols: [base, { ...base, id: "lib", libraryId: "scala", filePath: "@library/scala/Option.scala" }] };
    expect(findDefinitions(index, "Option", "Current.scala")).toEqual([base]);
  });
});
