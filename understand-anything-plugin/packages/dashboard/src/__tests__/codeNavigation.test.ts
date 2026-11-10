import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { buildCodeNavigationIndex } from "../../server/codeNavigation";
import { findDefinitions, isCodeNavigationIndex, type CodeNavigationIndex, type CodeSymbol } from "../codeNavigation";

const symbol = (filePath: string, startLine = 1, owner = "Example"): CodeSymbol => ({
  id: `${filePath}:${startLine}`, name: "run", kind: "function", filePath, startLine, endLine: startLine + 1, owner, sha256: "hash",
});
describe("indexed definition candidates", () => {
  const index: CodeNavigationIndex = { version: 1, files: [], skipped: [], symbols: [symbol("other.scala"), symbol("current.scala", 2), symbol("current.scala", 8, "Other")] };
  it("keeps ambiguous and overloaded definitions instead of guessing", () => {
    expect(findDefinitions(index, "run", "current.scala")).toHaveLength(3);
    expect(findDefinitions(index, "run", "current.scala")[0].filePath).toBe("current.scala");
  });
  it("ranks an explicit owner above same-file candidates, without hiding alternatives", () => {
    expect(findDefinitions(index, "run", "current.scala", "Other")[0].owner).toBe("Other");
  });
  it("does not guess unresolved external symbols", () => {
    expect(findDefinitions(index, "externalLibrary", "current.scala")).toEqual([]);
  });
  it("rejects malformed symbol locations from the endpoint", () => {
    expect(isCodeNavigationIndex(index)).toBe(true);
    expect(isCodeNavigationIndex({ ...index, symbols: [{ ...symbol("a"), startLine: 0 }] })).toBe(false);
    expect(isCodeNavigationIndex({ ...index, symbols: [null] })).toBe(false);
  });
});

const temporary: string[] = [];
afterEach(() => { for (const dir of temporary.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
describe("source declaration preprocessing", () => {
  function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ua-code-index-")); temporary.push(root);
    fs.writeFileSync(path.join(root, "Example.scala"), "object Example {\n def run() = 1\n}\n");
    return root;
  }
  const parser = { analyzeFile: () => ({ functions: [{ name: "run", lineRange: [2, 2] as [number, number], params: [] }],
    classes: [{ name: "Example", lineRange: [1, 3] as [number, number], methods: ["run"], properties: [] }], imports: [], exports: [] }) };
  it("derives declaration locations and owners and binds them to source bytes", () => {
    const root = fixture();
    const result = buildCodeNavigationIndex(root, { nodes: [{ filePath: "Example.scala" }] }, parser);
    expect(result.symbols.find(s => s.name === "run")).toMatchObject({ startLine: 2, endLine: 2, owner: "Example" });
    expect(result.files[0].sha256).toBe(crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "Example.scala"))).digest("hex"));
    fs.appendFileSync(path.join(root, "Example.scala"), "// changed\n");
    expect(buildCodeNavigationIndex(root, { nodes: [{ filePath: "Example.scala" }] }, parser).files[0].sha256).not.toBe(result.files[0].sha256);
  });
  it("rejects symlinks pointing outside the project and missing files", () => {
    const root = fixture();
    const outside = fixture();
    fs.symlinkSync(path.join(outside, "Example.scala"), path.join(root, "linked.scala"));
    const result = buildCodeNavigationIndex(root, { nodes: [{ filePath: "linked.scala" }, { filePath: "missing.scala" }] }, parser);
    expect(result.symbols).toHaveLength(0);
    expect(result.skipped).toEqual([{ path: "linked.scala", reason: "outside-project" }, { path: "missing.scala", reason: "unreadable-or-parse-failed" }]);
  });
});
