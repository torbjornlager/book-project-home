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

Light mode is the default. **Settings → Colour mode** switches between light and
dark, and remembers the choice. **Settings → UI typography** adjusts interface
font size (90–150%) and weight (Light through Bold), including the source editor
and trace output. **Reset fonts** restores 100% and Medium (the default). These preferences
are remembered across reloads; diagram text has its own **Appearance → Style** controls.

The toolbar’s **Appearance ▾** button opens a panel with **Layout** and **Style** tabs.
It opens on Layout each time, with **Direction** at the top. **Style** adjusts transition thickness and colour,
arrowhead size, state border thickness, transition label size, and label background
opacity. **Use theme colour** follows the light/dark theme; **Reset appearance**
restores the original styling. These preferences are remembered in this browser
and included in **Save diagram** SVG downloads. Style remains available while
a chart runs, with selection and execution highlights kept distinct. Label size
and transition thickness recalculate the layout; use **Fit** if needed.
**Label background** defaults to transparent (0%) and controls the backing behind transition text, from fully
transparent to solid, including highlighted labels; the text itself stays opaque.
Active compound and parallel states highlight their headers with the same green
background as active atomic states, while keeping their child areas neutral.

The canvas toolbar has **Auto layout** (wand icon) and **Horizontal spacing** /
**Vertical spacing** buttons (arrows between bars); each spacing button opens a
slider (0–100%, default 50%) with **Reset to 50%**. Spacing tunes the automatic
layout, so it is disabled while positions are saved: use Auto layout first.
**Reset** returns to
50%; 100% uses the original gaps. At 0%, the adjustable
gaps are removed; node sizes, label sizes, padding and label clearance still apply. They recompute the ELK
layout without scaling text or label boxes, and keep the current zoom
for comparison. Use **Fit** if needed. The dropdown closes with Escape or a click outside it. Preferences are stored
in this browser; spacing controls are disabled while a chart is running. Nested
states, routing and label clearance can limit compaction or change the arrangement,
so a smaller spacing value does not guarantee a proportionally smaller chart.

The Layout tab also contains **Layout experiments**: post-compaction to shorten
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
  parallel regions, dashed arrows for eventless transitions (no `on` or `after`), initial dots, H / H* history, bullseye finals. Entry/exit
  actions, deferrals, spawns and targetless transitions are listed inside
  their state; `<datamodel>` appears as a note.
- Diagram and source stay in step both ways. Selecting in one highlights the
  other. Diagram selections mark the source with a green gutter bar; the source
  scrolls only when the entire selected element is outside the visible area.
  A graphical edit rewrites only the lines it concerns: every
  untouched element, comment and blank line keeps its source text exactly.
  Undo/Redo covers both.
- Editing: add state / parallel / final / history inside the selection, use the
  Transition tool (key T) to connect states, and edit in the Inspector. Transition
  order determines priority. Renaming a state updates references; Delete removes
  it together with transitions that target it.
- On-canvas editing: double-click a state's name to rename it in place (references
  are updated, as in the Inspector). Double-click a transition label, or an
  internal transition listed inside a state, to edit its trigger and guard in the
  label's own notation: `event [guard]`, `after 2 [guard]`, or `[guard]` alone for
  an eventless transition. Actions stay in the Inspector. Double-click empty canvas,
  or the body of an expanded compound or parallel state, to add a state there and
  name it at once. Enter saves, Escape cancels; every edit is undoable. While a
  chart runs, double-click opens the Inspector instead.
- A selected state shows a handle on each side and a small floating toolbar
  (rename, add child, new transition, zoom to, Inspector, delete). Click a handle
  to add a sibling state with a transition to it (placeholder event
  `new_event_N`), then name the event on the canvas. Drag a handle onto a state
  to connect to it, or onto empty space to place the new state there. The new
  state is placed exactly beside its source, or where it was dropped.
- Layout: a chart without saved positions is laid out automatically by ELK
  (layered), and re-laid out after every change. Dragging a state freezes the
  current drawing and puts the state exactly where it is dropped; from then on
  all positions are exact and saved in a trailing `<layout>` comment as each
  child's offset in its parent, `{"parent": {"child": [x, y]}}`. A parent always
  wraps its children with its padding and header, so moving a child never moves
  its siblings. The regions of a parallel state stay in a row or column, in the
  order of their positions, so dragging a region past another reorders them. Transitions
  between moved states are redrawn as straight (or, for parallel transitions,
  bent) arrows with the label beside them; untouched ones keep ELK's routes.
  Drag a transition label to move it; it keeps its offset from its default
  place beside the arrow (saved with the transition's source state), so it
  follows when states move, and a faint leader line joins a label dragged far
  from its arrow. The first drag reproduces ELK's drawing exactly: parents grow
  but never shrink below ELK's size, and regions only move apart if one grows.
  New states from handles or double-clicks go where they were asked for; others
  are placed beside their placed siblings. **Auto layout** (wand icon in the toolbar) drops
  the saved positions and returns to automatic layout; **Direction** does the
  same in the other direction. Undo covers both. Root datamodel notes can be
  freely positioned in either mode. To create a new transition, use a handle or
  the Transition tool. Drag empty canvas to pan; scrolling and zooming remain
  available. The layout direction is saved in the same comment.
- Parallel states have a **Region arrangement** selector in the Inspector:
  Stacked (the default), Side by side, or Follow chart. Each parallel state can be set
  independently; separators follow the arrangement. The choice is saved in the
  layout comment and survives Auto, direction changes, renaming and reloads.
  Transitions that cross region boundaries require the shared chart direction,
  so independent arrangements are unavailable for those parallel states.
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
  Datamodel notes update in place with current facts and rules during a run.
  Snapshots follow chart actions in the trace playback, with new clauses briefly
  highlighted; source XML is unchanged. Rules retain line breaks and indentation.
  Up to eight lines are shown in the note, with up to forty clauses in its hover
  text. Rule bodies are never executed for inspection.
  Halt or restart clears the live display. Try example 09 and send its integers
  query to watch the GCD calculation update `int/1`.
  The queries from the document's trailing `<examples>` comment become
  buttons; `$Pid` stands for the running chart. Clicking a transition while
  the chart runs sends its event.

## Navigation, debugging and scenarios

The workspace opens in **Diagram** view. The canvas toolbar uses SVG icons with
tooltips and accessible names; **Split** and **Source** remain available beside
the filename. **Files** and **Structure** are separate tabs in the left panel.
The Inspector groups data, actions, descriptions and advanced tools into
expandable sections. Tests lead with saved scenarios and results; JSON editing,
path suggestions and import/export are available in expandable sections.
In Run, event inputs come first, followed by the timeline. Raw traces and query
shortcuts are under **Trace & queries**, which opens automatically on errors.

On narrower screens, the folder button opens Files/Structure; in portrait tablet
layouts the inspector button opens the right-hand panels. Tap outside a panel
or press Escape to close it. Touch devices use larger tool targets. The
**Focus canvas** icon, or Command/Ctrl + period, hides both side panels.

The **Chart structure** tree above the Explorer lists states and inline spawned
charts. Search matches state IDs, event patterns and Prolog source; selecting a
result reveals it in both source and diagram. Compound states can be collapsed
from the tree or Inspector. Boundary transitions connect to the collapsed box;
internal transitions are hidden. An active descendant highlights the collapsed
box and adds “active inside”. Collapse is a view choice, reset on file changes,
and never changes the XML or execution semantics.

Transition labels show their source-order number when a state has multiple
handlers. The Inspector explains priority; identical event patterns following
an unconditional handler receive a warning. Arbitrary Prolog pattern overlap
is not inferred. Each state or transition can have a description, stored as an
XML comment inside that element, so it follows renaming, movement and copying.
Chart-level plain-text notes appear at the lower left of the canvas and are
stored in a trailing `<studio>` comment. They are currently fixed-position
overlays rather than draggable diagram nodes.

**Duplicate subtree** creates fresh IDs and rewrites internal `initial` and
`to` references; references outside the copied subtree stay external. Prolog
code is copied verbatim: state IDs embedded in goals are not rewritten.
**Move to another parent** previews containment and initial-state changes,
plus validation results, before Apply move. Existing target IDs stay the same;
ancestor event handlers and entry/exit behavior may change. Moving a subtree
clears positional layout hints while retaining region arrangements.

The root Inspector provides up to 30 named **Checkpoints** per file, including
source comparison, restore, open as a copy, and JSON export/import. Restoring
is undoable. Checkpoints live in browser storage and retain their identity
when a file is renamed; use export to keep an independent copy.

The **Run** tab includes an execution timeline with pause, previous/next,
speed, and follow-live controls. Selecting an observation displays its recorded
configuration, transition highlights and datamodel clauses. **These controls
pause playback only: the interpreter, timers and spawned actors keep running.**
History is limited to the latest 1,000 observations and is cleared when source
changes. A restart should be used to begin a new execution, rather than treating
historical inspection as runtime rollback.

The event palette discovers handlers in active states and their ancestors.
Enter concrete Prolog terms, for example `integers([25,10,15,30])`. Patterns
containing variables must be instantiated. Handlers are candidates, not promises
that a guard will succeed. Guard outcomes come from actual runtime evaluation;
inspection never evaluates them again. Trace records identify the compiled
handler and originating actor, including inline charts with shared state IDs.

The **Tests** tab records events sent through the palette or diagram and lets
you review and save the resulting scenario. Recording starts a fresh chart;
finish recording to edit its name and expectations. A scenario is JSON:

```json
{
  "name": "GCD",
  "steps": [
    {
      "event": "integers([25,10,15,30])",
      "states": ["stop"],
      "facts": [{"owner": "#root", "clause": "int(5)."}]
    }
  ]
}
```

State assertions require the listed states to be active after the event. Fact
assertions compare stored clause text exactly, without executing rules; the
owner is `#root` or a state ID. Snapshots retain the existing 40-clause limit.
Each replay starts a fresh browser engine and waits for the chart to acknowledge
completion of each submitted event before checking assertions. A failed assertion
stops that scenario and reports the step. Run all continues with the next saved
scenario. Cancel tests disposes the engine. Scenarios (up to 200 steps each)
travel with the XML and can also be exported/imported as JSON.

Coverage marks observed states and transitions in purple. This is observed
execution coverage, not proof that every behavior has been tested. Candidate
path generation offers up to 40 structural paths of at most six events, starting
at the root initial state. It does not solve Prolog guards, expand parallel or
nested configurations, or synthesize delayed/eventless behavior. Substitute
concrete event values and add assertions before using suggestions as tests.
Timers use real time, and asynchronous actors are not made deterministic by
scenario replay. Recording captures palette/diagram sends, not arbitrary shell
queries or independently arriving actor messages.

For regression checks, run each `tests/*.cjs` file with Node, and:

```sh
swipl -q -g "load_files(['tests/live-datamodel.pl','tests/studio-runtime.pl']),run_tests,halt"
```

## Parts

- `js/sxml-model.js`   parse, validate, edit, serialise
- `js/sxml-diagram.js` layout (ELK layered, hierarchical) and SVG drawing
- `js/app.js`          explorer, editor, inspector, run panel
- `js/studio-model.js` metadata, subtree edits, scenarios and structural paths
- `js/studio-tools.js` structure tree, timeline, event palette, tests, checkpoints
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
  not. Only traces for the displayed inline level are mapped to the diagram;
  deeper or external charts remain visible as unmapped actor records in the log.

Clicking **Split** opens a small menu: **Stacked** puts the source above the chart,
**Side by side** puts it to its left. The choice is independent of the diagram's
layout direction and is remembered in this browser. Drag the
divider to resize either arrangement. Each arrangement’s split size is remembered
separately across reloads in this browser, as a proportion of the available space.
Settings is available in the side-panel tab.

The Explorer and right-hand panel widths are also remembered across reloads in
this browser. Smaller windows temporarily constrain the panels to leave room for
the chart; their preferred widths return when the window is enlarged.
