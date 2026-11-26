# SXML Studio vs. Stately Studio: features worth adding

*Proposal, 23 November 2026. Based on the SXML Studio source and README at commit
7140a57, and on the Stately docs (stately.ai/docs: Studio, design mode, simulate
mode, states and transitions, actions and actors, descriptions, colors, notes,
assets, canvas controls, keyboard shortcuts, autolayout, version history, test
paths, export/import, embed, generate flow, Inspector, VS Code extension).*

## Summary

SXML Studio already matches or exceeds Stately in several places that matter
for the book: a real interpreter (SWI-Prolog in WASM) instead of a
guard-blind simulator, a source-preserving two-way XML editor, an execution
timeline, live datamodel snapshots, collapsible
compound states and a structure tree with search.

The biggest gaps are in **authoring speed on the canvas** (copy/paste, quick
add, editing labels in place, retargeting arrows), **static feedback**
(unreachable states, dead transitions), **design-time simulation** without
running Prolog, and **getting charts out** (shareable links, embeds, Mermaid
and image export). Stately's commercial and team features (projects, roles,
AI generation, hosted inspector) are a poor fit for a static, book-oriented tool
and are ranked low or excluded.

## What SXML Studio already covers

| Stately feature | SXML Studio today |
|---|---|
| Design mode: add states, child states, parallel, final, history | Add toolbar, Inspector, Transition tool (T) |
| Details panel | Inspector |
| Structure panel | Chart structure tree, with search over IDs, events and Prolog |
| Simulate mode, event log | Run tab with the real interpreter, trace, clickable transitions, event palette |
| Jump back in the event log | Execution timeline (inspection only, by design) |
| Guard ordering (if / else-if) | Source order = priority, numbered labels, Inspector explanation, shadowing warning |
| Delayed / eventless transitions | `after` and eventless `<go>` |
| Descriptions | Per-element description comments |
| Notes | Chart-level notes (fixed position) |
| Version history | Checkpoints (browser storage, compare, restore, export) |
| Generate test paths | Not included |
| Autolayout | ELK layout, Auto, direction, spacing and layout experiments |
| Light/dark, zoom, fit, pan | Settings, toolbar, drag-to-pan |
| Code panel, import from code | Split view; the XML *is* the code |

## Proposed features, by priority

### P1: high value, fits the tool, modest effort

1. **Static reachability and dead-transition warnings.**
   Stately flags states not reachable from the initial state. Add to the
   existing Appendix C checks: states unreachable via `initial`, history
   defaults and `to` targets; transitions that can never fire because an earlier
   unconditional handler with the same pattern exists (already partly detected);
   final states with no way in. *Why:* cheap (pure JS over the model), catches
   real modelling errors, and complements the existing problems panel.

2. **Copy, cut and paste of states (Cmd/Ctrl+C/X/V), plus Cmd/Ctrl+D to duplicate.**
   Stately supports copy/paste of state groups. Studio has *Duplicate subtree*
   and *Move to another parent*, which already do the hard part (fresh IDs,
   reference rewriting, previews); bind them to the clipboard and keys, and allow
   paste into the selected parent and across files. *Why:* the single most
   expected editor gesture that is missing; the logic exists.

3. **Direct manipulation of transitions: retarget, change source, make self-loop.**
   Stately lets you drag an arrow's end to a new state and switch source and
   target. Studio's README says dragging existing transitions has no effect.
   Start with Inspector controls (Source / Target dropdowns, "Make self
   transition", Reverse), then dragging endpoints. *Why:* today a mistaken
   target means delete and redraw, losing the guard and actions.

4. **In-place label editing and quick add.**
   Double-click a state name to rename it on the canvas; double-click a
   transition label to edit `on` / `if` / `after`; double-click empty canvas (or
   inside a compound state) to add a state there. *Why:* Stately's core speed
   comes from this; Studio routes every change through the Inspector.

5. **Transition kind switcher.**
   Stately's event-type menu converts a transition between Event, After,
   Always and State Done. Studio has separate `on` and `after` fields that clear
   each other. Add a single "Trigger" selector (Event / Delay / Eventless /
   Done event) that shows the right field, and a shortcut to create the
   `done.state.<id>` handler from a compound state with a final child.
   *Why:* makes SXML's transition kinds discoverable to readers of the book.

6. **Keyboard shortcuts sheet and canvas navigation keys.**
   Stately documents + / − zoom, Shift+0 (100%), Shift+1 (fit), arrows to pan,
   Space+drag to pan, Esc to close. Studio has T, 0, Delete, Escape, undo/redo
   and Cmd+. Add the missing ones, arrow keys to move selection between
   sibling/child/parent states, and a "?" overlay listing all shortcuts.
   *Why:* low effort, improves accessibility and keyboard-only use.

### P2: valuable, more effort or narrower audience

7. **Design-time simulation ("Simulate without Prolog").**
   Stately's simulate mode lets you click through a chart without running any
   code: available events are highlighted, guards are resolved by the user, the
   log supports real time-travel. Studio's Run mode is more faithful but needs
   concrete terms, cannot rewind and is slowed by real timers. Offer a second,
   JS-only mode over the structural model: show enabled transitions, ask the
   user to pick a guard outcome, fire `after` transitions on demand, skip
   actions, and allow true rewind and branching. Clearly label it as structural,
   not semantic. *Why:* great for teaching and for exploring a chart before its
   Prolog is written; reuses the path-generation logic. *Risk:* must never be
   confused with the real interpreter; keep it visually distinct.

8. **Shareable links and embed mode.**
   Stately publishes view-only, zoomable embeds with theme and start-mode
   options. Studio is static, so a link can carry the chart itself: encode
   compressed XML in the URL fragment (`#src=…`), plus `?embed=1&mode=run&theme=dark`
   to hide the chrome. *Why:* lets the book, the Trinity homepage and readers
   share and embed live, runnable charts with no server. Size limits apply to
   very large charts; fall back to linking bundled examples by number (already
   supported via `#03`).

9. **More export formats.**
   Stately exports JSON, JS/TS, Markdown, Mermaid and images. For SXML: PNG
   (in addition to SVG), Mermaid `stateDiagram-v2` (useful for docs and GitHub
   READMEs), and a Markdown "chart report" (states, transitions with triggers,
   guards and descriptions, and saved scenarios). *Why:* documentation and
   teaching material; each exporter is a small pure function of the model.

10. **Movable, richer notes.**
    Stately notes are markdown, placed anywhere and edited in place. Studio's
    notes are fixed overlays (the README calls this out). Make notes draggable
    ELK-ignored nodes, optionally attached to a state, with light markdown.
    Store positions in the existing `<studio>` comment.

11. **State colours and tags (view-only metadata).**
    Stately offers a small colour palette per state/event, and XState tags.
    Add an optional colour from a fixed, theme-aware palette, stored in the
    layout/studio comment so SXML semantics are untouched, and include it in
    SVG export. Respect Stately's own advice: colour must not be the only
    signal. *Why:* helps readers group related states in larger charts such as
    the box-shop examples.

12. **Test path improvements borrowed from Stately.**
    Stately offers "shortest" and "simple (no repeated states)" strategies,
    "prefer transition coverage", de-duplication and highlighting a path on
    hover. Add these options to the existing candidate paths, plus "export as
    scenario skeleton". *Why:* incremental improvement on an existing feature.

### P3: consider later

13. **Inline assets/images on states.** Stately lets states show an image or
    Figma frame. Could help when charts model UIs, but SXML charts are mostly
    agent behaviour; low priority.
14. **Inspect an external running node.** Stately Inspector visualises live
    apps. The analogue would be attaching Studio to a native swi-wasm-node or
    SWI-Prolog node over WebSocket and mapping its trace onto the diagram.
    Powerful but needs a protocol and a server component; out of scope for the
    static app for now.
15. **Sequence-diagram view of actor messages.** Stately's Inspector shows
    sequence diagrams. Studio already records originating actors in the trace;
    a lane-per-actor view would help the spawn examples (13–17).
16. **Deeper nested charts and `src_uri` charts** (current known limit). Not a
    Stately feature, but the comparison shows Stately treats invoked machines as
    first-class; worth revisiting when examples need it.

### Not recommended

- **Projects, teams, roles, Discover, live multi-user simulation.** Require a
  backend and accounts; conflicts with the static, browser-local design.
- **AI "generate flow".** Would need an external model API and keys; uncertain
  value for a book tool. Revisit only if there is a concrete use.
- **TypeScript typegen / VS Code extension.** XState-specific; SXML's source is
  already the editable artefact.

## Suggested order of work

P1 items 1, 2 and 6 are quick wins and could ship together. Items 3, 4 and 5
form one "canvas editing" pass. Item 8 (share/embed) is the most visible
addition for the Trinity homepage and the book. Item 7 is the largest and
deserves its own design note before implementation.
