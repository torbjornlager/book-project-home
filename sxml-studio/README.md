# Trinity SXML Studio

A browser-only visualiser, graphical editor and live runner for SXML 0.2
statecharts (book chapter "The statechart behavior", Appendix C).

## Run it

Web Workers need HTTP, so serve this folder with any static server:

    python3 -m http.server 8080      # then open http://localhost:8080/

`index.html#03` opens example 03 directly.

## What it does

- Draws the chart in the book's notation: nested states, dashed lines between
  parallel regions, initial dots, H / H* history, bullseye finals. Entry/exit
  actions, deferrals, spawns and targetless transitions are listed inside
  their state; `<datamodel>` appears as a note.
- Diagram and source stay in step both ways. Selecting in one highlights the
  other. A graphical edit rewrites only the lines it concerns: every
  untouched element, comment and blank line keeps its source text exactly.
  Undo/Redo covers both.
- Editing: add state / parallel / final / history inside the selection, drag
  the blue handle (or use the Transition tool, key T) from one state to
  another, edit everything in the Inspector, reorder transitions (document
  order is priority), rename a state (references follow), Delete removes a
  state together with transitions that target it.
- Retargeting: drag the arrowhead end of a transition onto another state to
  change its target, or the tail end to move it to another source state
  (select the transition to see the two end handles). A drag on the middle
  of a line does nothing.
- Arrangement: drag a state to move it among its siblings. The drop position
  is a hint (which layer, which order) for the layout engine, not an exact
  pixel position, so edges are always re-routed tidily. Hints are saved in a
  trailing `<!-- <layout> ... -->` comment, which the interpreter ignores;
  the Auto button removes it. A `<datamodel>` note of the root sits beside
  the chart by default and can be dragged anywhere; it stays exactly where it
  is dropped. The layout direction is saved in the same comment; switching
  direction drops the arrangement, which does not carry over.
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

- Dragging sets order and layer, not exact coordinates, and a state cannot
  be dragged into another parent (cut and paste in the source).
- Changing an action or datamodel in the Inspector re-indents that one block;
  changing a state's type re-prints that state's start and end tags.
- Inside the parent's diagram a nested chart is read-only; open it to edit.
  Only one level of nesting is drawn, and a chart loaded with `src_uri` is
  not. Nested and outer trace events are told apart by their state names, so
  the two charts should not share state ids.
- When a state has several transitions with the same target, the one
  highlighted as fired is inferred from the triggering event.
