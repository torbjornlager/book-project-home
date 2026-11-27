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
These changes apply to this browser and site address. **Save XML** saves a source
file, and **Save SVG** saves the drawing. Both open a Save As dialog to choose a
filename and folder in supported browsers. Otherwise they use ordinary downloads;
the browser’s download settings control the destination and whether to ask each
time. Cancelling a Save As dialog leaves the document unsaved. Unchanged bundled examples are loaded
afresh so updates to them remain available.
Use **Settings → Restore missing examples** to bring removed bundled examples back.
Existing files, renamed examples and edits are preserved.

Light mode is the default. **Settings → Colour mode** switches between light and
dark, and remembers the choice. **Settings → UI typography** adjusts interface
font size (90–150%) and weight (Light through Bold), including the source editor
and trace output. **Reset fonts** restores 100% and Medium (the default). These preferences
are remembered across reloads; diagram text has its own **Appearance → Style** controls.

The toolbar’s **Appearance ▾** button opens a panel with **Layout** and **Style** tabs.
It opens on Layout each time. **Style** includes state header colours (`#f5f5f5`
by default in Light mode) and active state header colours (green by default).
Dark mode uses charcoal headers (`#2b343a`), deep green active fills (`#203f34`),
mint borders and activating transitions (`#76c7a4`), and off-white header text
(`#dce5e3`). Header colours are saved separately for each mode; changing or
resetting them in one mode keeps the other mode’s colours. Header text uses
black or white to stay readable. The selected active colour fills headers and the whole body of atomic states.
Active borders and incoming transitions share a darker shade in Light mode
and a brighter shade in Dark mode.
Incoming transitions are twice the normal thickness, with arrowheads 25% larger. **Style** also adjusts transition thickness and colour,
arrowhead size, state border thickness, transition label size, and label background
opacity. **Use theme colour** follows the light/dark theme; **Reset appearance**
restores the original styling. These preferences are remembered in this browser
and included in **Save SVG** files. Style remains available while
a chart runs, with selection and execution highlights kept distinct. Label size
and transition thickness recalculate the layout; use **Fit** if needed.
**Label background** defaults to transparent (0%) and controls the backing behind transition text, from fully
transparent to solid, including highlighted labels; the text itself stays opaque.
Active compound and parallel states highlight their headers with the same green
background as active atomic states, while keeping their child areas neutral.

Toolbar blocks have 2.5 mm gaps and wrap onto left-aligned rows when space is
limited, keeping every block visible.

The canvas toolbar starts its Layout group with **Direction**, followed by
**Horizontal spacing** /
**Vertical spacing** buttons (arrows between bars); each spacing button opens a
slider (0–100%, default 50%) with **Reset to 50%**. These sliders follow physical
horizontal and vertical gaps, including parallel regions arranged across the
chart’s overall direction, independently of nested-state padding. The **Direction** button
switches between horizontal and vertical flow;
its icon shows the direction to switch to. Spacing tunes the automatic
layout.
**Reset** returns to
50%; 100% uses the original gaps. At 0%, the adjustable
gaps are removed; node sizes, label sizes, padding and label clearance still apply. They recompute the ELK
layout without scaling text or label boxes, and keep the current zoom
for comparison. Use **Fit** if needed. The dropdown closes with Escape or a click outside it. Preferences are stored
in this browser; spacing controls are disabled while a chart is running. Nested
states, routing and label clearance can limit compaction or change the arrangement,
so a smaller spacing value does not guarantee a proportionally smaller chart.

The Layout tab contains controls for post-compaction to shorten
edges, space-efficient transition-label placement, and a preference for SXML
state/transition order. Additional controls adjust self-loop clearance (0–40 px),
straight versus balanced state placement, and layout effort (1, 7 or 20). Higher
effort can take longer and does not guarantee a better drawing. Nested-state
padding can be compact, normal or roomy, preserving the heading and action
compartments. Transition labels can use automatic side selection or a consistent
side (above/below for horizontal flow, right/left for vertical flow). Defaults retain
the existing layout behaviour. These
preferences are remembered separately, and **Reset layout** restores them
without changing spacing. They change only the drawing, not the source or
transition priority. If the bundled ELK rejects a combination of layout options,
Studio retries with the unsupported option disabled and reports the fallback
in the Advanced layout panel.
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
  Diagram hover tips appear after one second and show full text, including
  final-state entry actions.
  Undo/Redo covers both and is disabled while a chart starts or runs, including
  keyboard shortcuts. These controls undo edits; execution playback has its own
  timeline. Delete a selection through its floating toolbar, the Inspector, or
  the Delete key.
- Editing: add states on the canvas; use the Inspector’s Type field to choose
  parallel, final or history. Default labels
  are `s0`, `s1`, … for states, `p0`, `p1`, … for parallel states, `f0`, `f1`, …
  for final states, `h0`, `h1`, … for history states, and `e0`, `e1`, … for events. Use diagram handles or the
  Transition shortcut (key T) to connect states, and edit in the Inspector. Transition
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
  `e0`, `e1`, …), then name the event on the canvas. Drag a handle onto a state
  to connect to it, or onto empty space to create a new connected state.
  Automatic layout chooses the new state’s position.
- Layout: ELK arranges the diagram automatically after edits. States, transition
  labels and datamodel notes have no manual positions. Gray state headers cover transition lines and labels
  in both layout directions; the original automatic routes stay intact. Drag empty canvas to pan;
  scrolling, zooming, selection, double-click editing and connection handles remain
  available. **Fit** fits the chart to the pane; **Direction** switches the overall
  flow. Layout direction and each parallel
  state’s region arrangement are saved in a trailing `<layout>` comment.
  Loading an older diagram discards its saved state, label and note coordinates,
  including those in inline spawned charts, while preserving direction and region
  arrangements. Use the spacing and Advanced layout controls to tune the drawing.
- Parallel states have a **Region arrangement** selector under
  **Advanced layout → Selected parallel state — [name]**:
  Stacked (the default), Side by side, or Follow chart. Each parallel state can be set
  independently; separators follow the arrangement. Select a parallel state in
  the diagram to show its controls; other selections show a selection hint.
  The **Whole diagram** section keeps the browser-wide layout preferences, and
  **Reset whole-diagram layout** leaves region arrangements unchanged.
  The choice is saved in the
  layout comment and survives direction changes, renaming and reloads.
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
  Up to 24 lines are shown in the note, with blank lines between runtime clauses
  and up to forty clauses in its hover
  text. Rule bodies are never executed for inspection.
  Halt or restart clears the live display. Try example 09 and send its integers
  query to watch the GCD calculation update `int/1`.
  Events from the document's trailing `<example events>` comment become
  **Example events** buttons in the Run panel. Events end with a period; blank
  lines are optional. Button labels and sent events omit the terminating period.
  Editing XML comments, including this event list, keeps the chart running and
  preserves its execution history. Event buttons update as the comment changes. Changes to the machine itself still stop the old run.
  Clicking a button sends its event to the running chart; buttons are disabled while stopped, busy or viewing paused
  playback. Older bundled copies saved in
  this browser have their example comments updated when opened, preserving
  chart edits and layout settings. Clicking a transition while
  the chart runs sends its event.

## Navigation and debugging

The workspace defaults to side-by-side **Split** view, with 38% for source.
The selected view, split arrangement and sizes, panel widths and selected tabs,
Focus canvas, and expanded Run sections are remembered in this browser.
The canvas toolbar uses SVG icons with tooltips and accessible names; **Diagram**
and **Source** remain available beside the filename. **Files** and **Structure** are separate tabs in the left panel.
The transition Inspector puts the target beside the source state and uses one
trigger selector: Event, After (seconds), or Always. Guard and Actions are
optional; existing guards and action bodies stay visible. Multiple transition
targets remain editable as space-separated IDs. Priority ordering is available
in an expandable section.

The Inspector groups data, actions and advanced tools into
expandable sections. The right panel contains Inspector, Run and Settings.
In Run, example-event buttons come first, followed by **Send any event** and the
timeline. Enter a concrete Prolog term and click **!** or press Return to send it.
Once the interpreter accepts an event, the field clears and regains focus for
the next event immediately, while timeline playback continues. Raw traces and query
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
is not inferred. Existing descriptions and diagram notes embedded in XML remain
readable in diagram tooltips and overlays, but the Inspector no longer provides
Description, Notes or Checkpoint controls.

**Duplicate subtree** creates fresh IDs and rewrites internal `initial` and
`to` references; references outside the copied subtree stay external. Prolog
code is copied verbatim: state IDs embedded in goals are not rewritten.
**Move to another parent** previews containment and initial-state changes,
plus validation results, before Apply move. Existing target IDs stay the same;
ancestor event handlers and entry/exit behavior may change. Moving a subtree
recomputes the automatic layout while retaining region arrangements.

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

For regression checks, run each `tests/*.cjs` file with Node, and:

```sh
swipl -q -g "load_files(['tests/live-datamodel.pl','tests/studio-runtime.pl']),run_tests,halt"
```

## Parts

- `js/sxml-model.js`   parse, validate, edit, serialise
- `js/sxml-diagram.js` layout (ELK layered, hierarchical) and SVG drawing
- `js/app.js`          explorer, editor, inspector, run panel
- `js/studio-model.js` metadata and subtree edits
- `js/studio-tools.js` structure tree, timeline and event palette
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
