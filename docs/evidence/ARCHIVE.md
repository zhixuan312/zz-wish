# Evidence storage

Full captures, videos, native renders, large reports and binary certificates live in git-ignored `artifacts/` or `art/build/`. Git contains delivered app assets, source code and text evidence of at most128KiB per file.

The [archive index](archive-index.json) records every removed original path, byte count, SHA256 and preserved local path. The previous complete evidence tree is at `artifacts/archive/evidence-8df1301/docs/evidence`. Large JSON/HTML paths retain small archive pointers. These pointers are not substitutes for the original verifier inputs: use the indexed original file and verify its recorded hash.

This removes bulky evidence from the current tree and bounds future rounds. Existing Git history is retained; no history rewrite or remote change was performed. Run `npm run check:evidence` before each round commit.
