# Annotated code reading

This fork adds a reading guide to the local Dashboard source viewer. Business source files stay unchanged: explanations live in a separate JSON file.

## Features

- File responsibilities, flow context, and related files from the knowledge graph.
- Passage explanations displayed inline, with clickable line ranges that scroll and highlight the corresponding code.
- A read-only CodeMirror 6 editor with Ctrl/Cmd-click and F12 to open indexed definitions.
- Same-file and cross-file navigation, an explicit candidate list for overloaded or same-named definitions, and Back / Alt-Left to return to the previous line and scroll position.
- Nearby jumps use a short, cancelable easing motion; file changes and distant jumps fade in at the destination. A subtle arrival highlight identifies the target. Manual scrolling cancels navigation motion, and reduced-motion preferences disable it.
- Navigation to related files while keeping the reader open; Ctrl/Cmd-F for in-file search.
- A toggle to hide explanations, Scala/Java highlighting, and a larger reading panel.
- Source-hash validation: outdated notes are hidden until reviewed.

The local server preprocesses declarations using the existing Tree-sitter parsers when the source viewer requests its index. It indexes actual source locations, independent of any AI-generated line numbers. The index and source preview include source hashes; a stale target is opened without applying outdated line numbers and the reader offers **Rebuild index**.

Navigation covers indexed graph files and annotated passages. It is a declaration lookup, not compiler-level receiver/type resolution: same-named definitions remain explicit candidates, and external/unindexed symbols are not guessed. The server indexes up to 1,000 graph files / 16 MiB, with the same 1 MiB per-file limit as source previews, and reports skipped files. It caches parsed declarations by source hash in memory and writes no business source files.

Notes are authored separately; installing this extension does not automatically explain every file. Version-check failures appear as compact, localized status messages with a retry action. Expired access URLs are distinguished from source changes.

## Dependency source definitions

Project graph files do not include standard-library definitions such as Scala's `Option`. To browse dependencies in the same reader, download and extract the **matching dependency version's source archive** into a separate directory. Add a `code-libraries.json` beside the project's graph:

```json
{
  "libraries": [
    {
      "id": "scala-library-2.10.7",
      "name": "Scala standard library",
      "version": "2.10.7",
      "root": "/path/to/extracted/scala-library-sources"
    }
  ]
}
```

Use the version declared by your project's build; the example version is not a universal default. For read-only projects, place the manifest at `<UNDERSTAND_READING_NOTES_DIR>/<project-key>.libraries.json`, using the project-key calculation below. No dependency download or root discovery happens automatically.

Definitions show their library version, source path, and declaration signature. Dependency files open under a separate `@library/` namespace; they do not become project graph nodes. Project declarations take precedence over same-named dependency symbols. Unknown libraries, paths outside configured roots, and outbound symlinks cannot be previewed. A missing dependency configuration does not prevent project-only navigation.

Each configured library indexes up to 1,000 source files, bounded by the source-size limits above. The view shows project and dependency coverage separately. Navigation history, dependency source identity, and the loaded symbol index survive switching between the sidebar and expanded reader. They reset when the project graph changes.

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
