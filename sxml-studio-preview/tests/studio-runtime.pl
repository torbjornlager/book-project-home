:- use_module('../runtime/wasm/statechart_wasm').
:- begin_tests(studio_runtime).
:- dynamic captured/1.
record(Event) :- assertz(captured(Event)).
setup_trace :-
    statechart_wasm_runtime:clean,
    retractall(captured(_)),
    statechart_wasm:set_trace_enabled(true),
    statechart_wasm:set_trace_hook(plunit_studio_runtime:record).
cleanup_trace :- statechart_wasm:clear_trace_hook, statechart_wasm_runtime:clean.

test(exact_guarded_handler_and_one_evaluation, [setup(setup_trace), cleanup(cleanup_trace)]) :-
    XML = '<statechart version="0.2" initial="a"><datamodel>:- dynamic checks/1. checks(0). check :- retract(checks(N)), M is N+1, assertz(checks(M)).</datamodel><state id="a"><go on="next" if="fail" to="b"/><go on="next" if="check" to="b"/><go on="next" to="b"/></state><state id="b"/></statechart>',
    statechart_start(text(XML)),
    statechart_send(next),
    assertion(captured(guard_result(a, 0, false))),
    assertion(captured(guard_result(a, 1, true))),
    assertion(captured(transition_fired(a, 1))),
    assertion(\+ captured(guard_result(a, 2, _))),
    assertion(statechart_wasm:checks(1)),
    captured(datamodel_snapshot(_, [data('#root', Facts, false)])),
    member('checks(1).', Facts), !.

test(mixed_delayed_and_event_indices, [setup(setup_trace), cleanup(cleanup_trace)]) :-
    XML = '<statechart version="0.2" initial="a"><state id="a"><go after="50" to="b"/><go on="next" to="b"/></state><state id="b"/></statechart>',
    statechart_wasm_model:statechart_wasm_parse_text(XML),
    assertion(statechart_wasm_exec:select_transition(next, a, t(a, [b], [], 1))),
    assertz(statechart_wasm:configuration([a])),
    statechart_wasm:after_transition(a, Key, _, _, _, _),
    assertz(statechart_wasm:after_timer(a, Key, test_timer)),
    statechart_wasm_exec:select_after_transition(a, Key, test_timer, [_]),
    assertion(captured(transition_fired(a, 0))).

test(eventless_and_targetless_ids, [setup(setup_trace), cleanup(cleanup_trace)]) :-
    XML = '<statechart version="0.2" initial="a"><state id="a"><go to="b"/></state><state id="b"><go on="tick"/></state></statechart>',
    statechart_start(text(XML)), statechart_send(tick),
    assertion(captured(transition_fired(a, 0))),
    assertion(captured(transition_fired(b, 0))),
    statechart_configuration(Config), assertion(member(b, Config)),
    findall(1, captured(macrostep_complete), Complete), assertion(length(Complete, 2)).

test(priority_and_ancestor_fallback, [setup(setup_trace), cleanup(cleanup_trace)]) :-
    XML = '<statechart version="0.2" initial="parent"><state id="parent" initial="child"><state id="child"><go on="next" if="fail" to="b"/></state><go on="next" to="b"/></state><state id="b"/></statechart>',
    statechart_start(text(XML)), statechart_send(next),
    assertion(captured(guard_result(child, 0, false))),
    assertion(captured(transition_fired(parent, 0))).

test(parallel_selection_preserved, [setup(setup_trace), cleanup(cleanup_trace)]) :-
    XML = '<statechart version="0.2" initial="p"><parallel id="p"><state id="r1" initial="a"><state id="a"><go on="next" to="b"/></state><state id="b"/></state><state id="r2" initial="c"><state id="c"><go on="next" to="d"/></state><state id="d"/></state></parallel></statechart>',
    statechart_start(text(XML)), statechart_send(next),
    assertion(captured(transition_fired(a, 0))), assertion(captured(transition_fired(c, 0))),
    statechart_configuration(Config), assertion(member(b, Config)), assertion(member(d, Config)).

test(restart_clears_debug_keys, [setup(setup_trace), cleanup(cleanup_trace)]) :-
    XML = '<statechart version="0.2" initial="a"><state id="a"><go on="tick"/></state></statechart>',
    statechart_start(text(XML)), statechart_send(tick), statechart_start(text(XML)), statechart_send(tick),
    findall(Index, statechart_wasm:transition_debug(a, Index, _), Indices), assertion(Indices == [0]).
:- end_tests(studio_runtime).
