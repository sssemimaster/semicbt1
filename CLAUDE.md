## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. When the answer is under a Markdown heading, `graphify section "<heading>"` prints that section's text, so the .md need not be opened. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `python scripts/graphify_sync.py` (not bare `graphify update .`) to keep the graph current (AST-only, no API cost). It first mirrors the inline `<script>` of root *.html into `.graphify-src/*.inline.js`; graph nodes with `src=.graphify-src/index.inline.js loc=L123` are `index.html:123` (line numbers are identical), so Read/Edit index.html at that line.
- The app's main script lives in `site.js` (it was split out of index.html so each page stays well under 1 MB for crawlers/AI readers such as Glean). Graph nodes in `site.js` are read/edited there directly. Keep index.html small: do not put large scripts or data back inline; Tailwind scans `site.js` too (see `tailwind_config.js` and `build_pages.yml`).
- graphify-out/ and .graphify-src/ are git-ignored on purpose: the graph is local to this PC and is not committed. Rebuild it locally with the sync script above; do not add these folders to git.
