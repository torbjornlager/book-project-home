# Book Project Home

Landing page and blog for the overall book project.

Live site: https://trinity.elfenbenstornet.se/


## Hosted Genealogist experiment

The browser-only example is published at
https://trinity.elfenbenstornet.se/genealogist/ and linked from `pocs.html`.
GitHub Pages serves the committed `genealogist/` files, including a complete,
pinned SWI-WASM runtime. No external node, SSO deployment or third-party asset
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
