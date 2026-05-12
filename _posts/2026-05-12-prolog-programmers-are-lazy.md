---
layout: post
title: "Prolog Programmers are Lazy"
date: 2026-05-12
---

<img src="{{ site.baseurl }}/assets/img/lazy-trinity.png" alt="Lazy Trinity" width="650">

A good programmer is often someone who would rather spend five hours automating a task
than spend five minutes repeating it every day for years. But "laziness" here does not mean
unwillingness to work. Quite the opposite. It means a strong aversion to repetitive,
unnecessary, error-prone manual effort.

The canonical framing comes from Larry Wall, creator of Perl, who listed laziness as one
of the three great virtues of a programmer, alongside impatience and hubris. His point was
that productive laziness — the refusal to do repetitive work by hand — drives programmers
to write tools, scripts, and abstractions that pay off over time. A programmer who automates
a tedious task is being "lazy" in the most constructive sense. It is what drives open-source
libraries, code generators, and the entire culture of "don't repeat yourself" (DRY). Spend
a day writing a script that saves a week of manual work every month, and you have made a
rational investment.

Other ecosystems show that this strategy works at scale. In the Prolog world, Jan
Wielemaker's Cliopatria demonstrated how a substantial web application could be delivered
as a ready-to-run system: users provided their data, made modest extensions, and obtained
a full Semantic Web portal. In the Elixir world, Phoenix goes even further by generating
complete, fault-tolerant applications with supervision, telemetry, routing, and deployment
already in place. Developers simply add the behaviour that makes the system theirs. These
examples illustrate how a language ecosystem can supply standardised, reproducible scaffolds
that capture the best practices of a community.

This is precisely the motivation behind the Prolog agent model and its turn-key nodes —
ready-made, nearly complete applications that become operational as soon as domain logic and
configuration are supplied. Turn-key nodes lower the threshold for participation by capturing
proven patterns for supervision, communication, persistence, and deployment, sparing
developers from boilerplate concerns and letting them focus on domain-specific reasoning and
interaction.

To make this concrete: suppose the owner of a node wants to make the contents of a file
`mortal.pl` available to clients. A single command should (when this is implemented) be able to do the job:

```
$ prolog-node --port=80 --src=mortal.pl --settings=settings.pl
```

A new node is created, the file is loaded into its shared Prolog database, and the node
is configured according to `settings.pl`. After the usual deployment steps, the node is
reachable through a set of standard API endpoints: a browsable database, an interactive
shell, a stateless HTTP API, a semi-stateful HTTP API, and a stateful WebSocket API.
An authorised user can browse the program, query it through the shell, or build an
end-user application on top of any of its web APIs. None of that infrastructure needed to
be written from scratch.

Because turn-key nodes act as agents in their own right, they can be queried, extended,
and orchestrated alongside user-defined agents, keeping the environment uniform and easy
to understand. Such simplicity and accessibility are essential if the Prolog Web is to grow
into a living shared environment rather than remain a conceptual construct. In that sense,
the laziness baked into the Trinity design is not a shortcut — it is a commitment to the
idea that friction is the enemy of participation.

Prolog programmers are lazy. And that is exactly as it should be.
