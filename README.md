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
