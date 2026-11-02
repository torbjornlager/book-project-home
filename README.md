# Book Project Home

Landing page and blog for the overall book project.

Live site: https://trinity.elfenbenstornet.se/


## Hosted Genealogist experiment

The browser-only example is published at
https://trinity.elfenbenstornet.se/genealogist/ and linked from `pocs.html`.
GitHub Pages serves the committed `genealogist/` files, including a complete,
pinned SWI-WASM runtime shared with the Main thread + DOM version.
No external node, SSO deployment or third-party asset
CDN is needed. The Python tools are for maintainers; visitors only open the page.

The application is maintained in `trinity-demonstrator/experiments/genealogist`.
Do not edit the deployed application/runtime copies directly. Build a fresh
snapshot from committed source and a verified runtime release package:

```sh
python3 tools/package_genealogist.py \
  --experiment-root /path/to/trinity-demonstrator/experiments/genealogist \
  --runtime-package /path/to/swi-wasm-node-package \
  --output /fresh/path/genealogist
python3 tools/package_genealogist.py --verify /fresh/path/genealogist
```

For an update, review that fresh output and replace the tracked `genealogist/`
files with it, then commit/push the homepage repository. Preview with an ordinary
static server rooted here and open `/genealogist/`, so testing includes the same
path prefix used online. Deployment records source revisions, runtime/engine
versions and file checksums in `genealogist/deployment.json`; application and
engine license notices are retained in the published directory. The complete
runtime costs approximately 6.6 MB before transfer compression.

The family database is private to the page's Worker and is not automatically
persisted. Visitors can download current Prolog facts and rules before leaving.

## Genealogist: Main thread + DOM comparison

`genealogist-main/` contains the same interface, CSS and Prolog program, with
Prolog running on the UI thread and `library(dom)` preloaded. Its runtime is
byte-for-byte identical to the Worker version's committed runtime. Both versions
use the shared high-level session API and are linked from `pocs.html` and from
each other's under-the-hood panels. The family program and CSS are identical.
The Prolog-driven version is published at
https://trinity.elfenbenstornet.se/genealogist-main/.

The maintained source is in
`trinity-demonstrator/experiments/genealogist-main`. It selects
`SwiWasmNode.create({mode:'main', ...})`; there is no custom session adapter.
`genealogist_ui.pl` renders the diagram, relationship rows and native answer
terms, and binds forms, buttons and keyboard events through `library(dom)`.
It reads family facts and calls validation predicates directly in Prolog.
`genealogist.js` handles startup, async query orchestration, input promises and
browser downloads. Snapshot translation and application-level term formatting
are gone; the runtime supplies common session answer envelopes in both modes.
Source loads once per page, so edits survive subsequent queries. Answers are
lazy; Stop unwinds the suspended search. Abort is cooperative, and a non-yielding
goal can freeze the page. The under-the-hood panel includes a direct DOM example.

The formatted Worker app spans 481 JavaScript lines. The Prolog-driven app spans
144 JavaScript and 595 Prolog UI lines (739 total), excluding shared runtime,
family rules, HTML and CSS. These physical counts include comments and blank
lines: they depend on layout and are not a complexity score. Session management
belongs to the runtime's high-level API and cross-mode browser tests, rather
than to an application-specific adapter. Source tests
cover native DOM events, layout parity,
query/input lifecycle, and cooperative Abort while a CPU query yields.

Build and verify a fresh snapshot with:

```sh
python3 tools/package_genealogist_main.py \
  --experiment-root /path/to/trinity-demonstrator/experiments/genealogist-main \
  --runtime-package /path/to/swi-wasm-node-package \
  --output /fresh/path/genealogist-main
python3 tools/package_genealogist_main.py --verify /fresh/path/genealogist-main
```

For a local preview before committing source, add `--working-tree`. This records
the base revision, explicit working-tree provenance and each source file's hash;
it does not relax runtime package verification. Published snapshots use
committed application source and clean, verified runtime packages.
Preview both paths with a static HTTP server rooted at this repository.
When previewing uncommitted runtime changes, also pass `--development-runtime`.
This verifies all runtime checksums and records `runtime.development:true` in the
deployment manifest. Default release builds still reject a dirty runtime package.


## Hosted Trinity Studio experiment

The separate IDE-style UI is published at
https://trinity.elfenbenstornet.se/studio/ and linked from `pocs.html`.
Its source lives in `trinity-demonstrator/experiments/browser-studio`.
The tracked `studio/` snapshot includes its own pinned SWI-WASM runtime,
CodeMirror 5.65.16 editor assets, license notices and a deployment manifest.
It works independently of the hosted demonstrator and the Genealogist page.

Build from clean committed application/editor source and a runtime release:

```sh
python3 tools/package_studio.py \
  --experiment-root /path/to/trinity-demonstrator/experiments/browser-studio \
  --runtime-package /path/to/swi-wasm-node-package \
  --output /fresh/path/studio
python3 tools/package_studio.py --verify /fresh/path/studio
```

The Studio packager shares the build and checksum verification implementation
with `package_genealogist.py`. Editor bytes are checked against their source
commit; runtime files are checked against the upstream release manifest.
Review and replace the deployed copy only after verifying a fresh build.
Preview `/studio/` with a static server rooted at this repository. Source,
query history and browser sessions are not automatically persisted; visitors
should save source before reloading or closing the page.
