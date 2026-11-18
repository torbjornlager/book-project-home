# Trinity SXML Studio

A browser-only visualiser, graphical editor and live runner for SXML 0.2
statecharts (book chapter "The statechart behavior", Appendix C).

## Run it

Open the [hosted SXML Studio](https://trinity.elfenbenstornet.se/sxml-studio/),
or [start with example 03](https://trinity.elfenbenstornet.se/sxml-studio/#03).
It is served by this repository’s existing GitHub Pages site. The app is entirely
static: its editor, Web Worker, bundled WebAssembly engine and Prolog sources
are loaded from this directory. No build step or Prolog server is needed.

For local use:

Web Workers need HTTP, so serve this folder with any static server:

    python3 -m http.server 8080      # then open http://localhost:8080/

`index.html#03` opens example 03 directly.

The Explorer remembers filenames, removed entries and local source edits across
reloads using this browser’s local storage. Double-click a filename to rename it;
Enter saves and Escape cancels. The trash icon removes a file from the Explorer.
These changes apply to this browser and site address. “Save source” still downloads
an XML file for keeping a separate copy. Unchanged bundled examples are loaded
afresh so updates to them remain available.
Use **Settings → Restore missing examples** to bring removed bundled examples back.
Existing files, renamed examples and edits are preserved.

Light mode is the default. The top-bar theme button switches between light and
dark, and remembers the choice. **Settings → UI typography** adjusts interface
font size (90–150%) and weight (Light through Bold), including the source editor
and trace output. **Reset fonts** restores 100% and Medium (the default). These preferences
are remembered across reloads; diagram text has its own Appearance controls.

The toolbar’s **Appearance ▾** dropdown adjusts transition thickness and colour,
arrowhead size, state border thickness, transition label size, and label background
opacity. **Use theme colour** follows the light/dark theme; **Reset appearance**
restores the original styling. These preferences are remembered in this browser
and included in **Save diagram** SVG downloads. Appearance remains available while
a chart runs, with selection and execution highlights kept distinct. Label size
and transition thickness recalculate the layout; use **Fit** if needed.
**Label background** defaults to transparent (0%) and controls the backing behind transition text, from fully
transparent to solid, including highlighted labels; the text itself stays opaque.
Active compound and parallel states highlight their headers with the same green
background as active atomic states, while keeping their child areas neutral.

The diagram toolbar’s **Spacing ▾** dropdown provides experimental horizontal and vertical spacing
sliders (0–100%, defaulting to 50% on both axes). **Reset spacing** returns to
50%; 100% uses the original gaps. At 0%, the adjustable
gaps are removed; node sizes, label sizes, padding and label clearance still apply. They recompute the ELK
layout without scaling text or label boxes, and keep the current zoom
for comparison. Use **Fit** if needed. The dropdown closes with Escape or a click outside it. Preferences are stored
in this browser; spacing controls are disabled while a chart is running. Nested
states, routing and label clearance can limit compaction or change the arrangement,
so a smaller spacing value does not guarantee a proportionally smaller chart.

The dropdown also contains **Layout experiments**: post-compaction to shorten
edges, space-efficient transition-label placement, and a preference for SXML
state/transition order. Additional controls adjust self-loop clearance (0–40 px),
straight versus balanced state placement, and layout effort (1, 7 or 20). Higher
effort can take longer and does not guarantee a better drawing. Nested-state
padding can be compact, normal or roomy, preserving the heading and action
compartments. Transition labels can use automatic side selection or a consistent
side (above/below for horizontal flow, right/left for vertical flow). Defaults retain
the existing layout behaviour. These
preferences are remembered separately, and **Reset experiments** restores them
without changing spacing. They change only the drawing, not the source or
transition priority. If the bundled ELK rejects an experimental combination,
Studio retries with the unsupported experiment disabled and reports the fallback
beside the diagram dimensions.
Run `node tests/layout-experiments.cjs` for the nested-chart regression checks.

## What it does

- Draws the chart in the book's notation: nested states, dashed lines between
  parallel regions, initial dots, H / H* history, bullseye finals. Entry/exit
  actions, deferrals, spawns and targetless transitions are listed inside
  their state; `<datamodel>` appears as a note.
- Diagram and source stay in step both ways. Selecting in one highlights the
  other. A graphical edit rewrites only the lines it concerns: every
  untouched element, comment and blank line keeps its source text exactly.
  Undo/Redo covers both.
- Editing: add state / parallel / final / history inside the selection, use the
  Transition tool (key T) to connect states, and edit in the Inspector. Transition
  order determines priority. Renaming a state updates references; Delete removes
  it together with transitions that target it.
- Dragging existing states, transitions or notes has no effect. To create a new
  transition, explicitly select the Transition tool and drag between states.
  Drag empty canvas to pan; scrolling and zooming remain available.
- Existing arrangement hints in a trailing `<layout>` comment are still read.
  **Auto** removes those hints. Layout direction is saved in the same comment.
- Nested charts: the inline chart of a `<spawn type="statechart">` is drawn
  inside the state that owns it. Double-click it (or use the button in the
  Inspector) to open it as a document of its own; edits there are stored
  back into the parent's CDATA section. During a run, a nested chart whose
  own `trace(true)` option is set shows its active states too.
- Checks the Appendix C rules that need no Prolog engine (ids, initial,
  targets, on/after, spawn operands, vocabulary). The engine validates again
  when the chart is run.
- Run chart spawns the document in the real SWI-WASM interpreter with
  tracing on, and animates the active configuration and fired transitions.
  The queries from the document's trailing `<examples>` comment become
  buttons; `$Pid` stands for the running chart. Clicking a transition while
  the chart runs sends its event.

## Parts

- `js/sxml-model.js`   parse, validate, edit, serialise
- `js/sxml-diagram.js` layout (ELK layered, hierarchical) and SVG drawing
- `js/app.js`          explorer, editor, inspector, run panel
- `runtime/`           swi-wasm-node at 82aac08 (worker, host, statechart
                       interpreter, SXML schema) with swipl-wasm 8.2.5.
                       `runtime/wasm/shared_db.pl` holds the facts that
                       example 10 expects in the node's shared database.
- `vendor/elk.bundled.js` elkjs 0.12.1 (EPL-2.0), CodeMirror 5.65.16 (MIT)
- `examples/`          examples 01–17 from trinity-demonstrator

## Known limits

- Changing an action or datamodel in the Inspector re-indents that one block;
  changing a state's type re-prints that state's start and end tags.
- Inside the parent's diagram a nested chart is read-only; open it to edit.
  Only one level of nesting is drawn, and a chart loaded with `src_uri` is
  not. Nested and outer trace events are told apart by their state names, so
  the two charts should not share state ids.
- When a state has several transitions with the same target, the one
  highlighted as fired is inferred from the triggering event.

In Split view, **Layout** also changes the pane arrangement: vertical diagrams
place the source beside the chart; horizontal diagrams place it below. Drag the
divider to resize either arrangement. Each arrangement’s split size is remembered
separately across reloads in this browser, as a proportion of the available space.
Settings is available in the side-panel tab.

The Explorer and right-hand panel widths are also remembered across reloads in
this browser. Smaller windows temporarily constrain the panels to leave room for
the chart; their preferred widths return when the window is enlarged.
