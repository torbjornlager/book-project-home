:- use_module('../runtime/wasm/statechart_wasm').
:- begin_tests(live_datamodel).
:- dynamic captured/1.
record(Event) :- assertz(captured(Event)).
setup_trace :-
    statechart_wasm_runtime:clean,
    retractall(captured(_)),
    statechart_wasm:set_trace_enabled(true),
    statechart_wasm:set_trace_hook(plunit_live_datamodel:record).
cleanup_trace :- statechart_wasm:clear_trace_hook, statechart_wasm_runtime:clean.

test(gcd_updates, [setup(setup_trace), cleanup(cleanup_trace)]) :-
    read_file_to_string('examples/09 gcd.xml', XML, []),
    with_output_to(string(_),
                   (statechart_start(text(XML)), statechart_send(integers([25,10,15,30])))),
    findall(Data, captured(datamodel_snapshot([init,run,stop], Data)), Snapshots),
    Snapshots = [[data('#root', [], false)]|_],
    length(Snapshots, Count), assertion(Count > 5),
    last(Snapshots, [data('#root', Facts, false)]),
    assertion(Facts == ['int(5).','int(5).','int(5).','int(5).']).

test(owners_and_no_rule_execution, [setup(setup_trace), cleanup(cleanup_trace)]) :-
    XML = '<statechart version="0.2" initial="a"><datamodel>value(root). danger :- throw(rule_was_called).</datamodel><state id="a"><datamodel>other(child).</datamodel></state></statechart>',
    statechart_start(text(XML)),
    captured(datamodel_snapshot([a], Data)),
    member(data('#root', RootClauses, false), Data),
    assertion(member('value(root).', RootClauses)),
    assertion(member('danger :-\n    throw(rule_was_called).', RootClauses)),
    assertion(member(data(a, ['other(child).'], false), Data)).

test(bounded_snapshot, [setup(setup_trace), cleanup(cleanup_trace)]) :-
    XML = '<statechart version="0.2" initial="a"><datamodel>:- forall(between(1,55,N), assertz(value(N))).</datamodel><state id="a"/></statechart>',
    statechart_start(text(XML)),
    captured(datamodel_snapshot([a], [data('#root', Facts, true)])),
    assertion(length(Facts, 40)),
    assertion(\+ member('value(41).', Facts)).

test(disabled_trace, [setup(setup_trace), cleanup(cleanup_trace)]) :-
    statechart_wasm:set_trace_enabled(false),
    statechart_start(text('<statechart version="0.2" initial="a"><datamodel>value(1).</datamodel><state id="a"/></statechart>'), ''),
    assertion(\+ captured(datamodel_snapshot(_, _))).
:- end_tests(live_datamodel).
