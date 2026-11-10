# Annotated code reading

This fork adds a reading guide to the local Dashboard source viewer. Business source files stay unchanged: explanations live in a separate JSON file.

## Features

- File responsibilities, flow context, and related files from the knowledge graph.
- Passage explanations displayed inline, with clickable line ranges that scroll and highlight the corresponding code.
- Navigation to related files while keeping the reader open.
- A toggle to hide explanations, Scala/Java highlighting, and a larger reading panel.
- Source-hash validation: outdated notes are hidden until reviewed.

Navigation covers graph-backed files and annotated passages. It does not provide IDE-style go-to-definition for arbitrary identifiers. Notes are authored separately; installing this extension does not automatically explain every file.

## Add notes

Analyze your project with the `understand` skill. Put `code-notes.json` beside `knowledge-graph.json`, normally in `<project>/.ua/` (or the existing legacy `.understand-anything/` directory).

```json
{
  "files": {
    "src/example.ts": {
      "sha256": "REPLACE_WITH_SHA256_OF_EXACT_SOURCE_BYTES",
      "notes": [
        {
          "id": "return-value",
          "title": "Return the computed result",
          "explanation": "Explain this passage, its conditions, and what to follow next.",
          "startLine": 2,
          "endLine": 3
        }
      ]
    }
  }
}
```

Paths are relative to the project root and must already appear in the graph. Line numbers are one-based and inclusive; IDs must be unique within each file. Compute its source hash without modifying it:

```bash
node -e 'const fs=require("node:fs"),c=require("node:crypto");console.log(c.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"))' src/example.ts
```

After source changes, review explanations and line ranges before updating the hash. A mismatching hash or invalid note hides that file's notes and displays a message in the reading guide.

## Notes outside read-only source trees

Set `UNDERSTAND_READING_NOTES_DIR` to an external directory. Store one JSON file per project there, in the format above. Its filename is the first 16 hexadecimal characters of SHA-256 of the canonical absolute project path, followed by `.json`:

```bash
node -e 'const fs=require("node:fs"),c=require("node:crypto");console.log(c.createHash("sha256").update(fs.realpathSync(process.argv[1])).digest("hex").slice(0,16)+".json")' /path/to/project
```

A project-local `code-notes.json` takes priority. No external directory is read unless configured. Notes use the existing token-protected source endpoint and are not uploaded by this feature.

## Launch this fork's Dashboard

Install dependencies and build core following the repository README, then run from the repository root:

```bash
GRAPH_DIR=/path/to/project \
UNDERSTAND_READING_NOTES_DIR=/path/to/reading-notes \
  pnpm --filter @understand-anything/dashboard dev --host 127.0.0.1
```

Omit `UNDERSTAND_READING_NOTES_DIR` when using project-local notes. Open the token-bearing URL printed by the server, open a source file, and use **Reading guide** / **辅助阅读**.

The upstream prebuilt viewer does not contain this fork's customizations; use this Dashboard development server. Keep proprietary sources, graph data, credentials, and project-specific explanations out of a public fork. This change includes only reusable viewer code, documentation, and synthetic tests.
