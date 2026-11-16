% Shared database for SXML Studio: read-only knowledge copied into each
% SWI-WASM actor.  Mirrors the part of the demonstrator's shared database
% that example "10 shared-database" relies on.

shared_fact(browser_shared_db).

% The statechart datamodel defines local_label/1 too.  Its local definition
% shadows this shared one while the chart is running.
local_label(browser_shared_db).

shared_transition_enabled.
