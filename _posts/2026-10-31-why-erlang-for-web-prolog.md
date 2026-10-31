---
layout: post
title: "Why Erlang as an inspiration for Web Prolog?"
date: 2026-10-31
permalink: /2026/10/31/why-erlang-for-web-prolog.html
---

One objection I have encountered is that Erlang is not a particularly good source of inspiration for adding concurrency to Prolog. After all, there are other ways of doing it.

Of course there are. The Prolog world has a rich history of approaches to concurrency and parallelism: AND- and OR-parallelism, concurrent logic programming with dataflow and committed choice, threads with shared memory, and various forms of message passing. These are interesting approaches, addressing different needs. But listing alternatives is not, in itself, an argument against Erlang. The question is: *what kind of concurrency do we want, and for what purpose?*

My goal with Web Prolog, the language at the heart of [the Prolog Trinity Ecosystem]({{ site.baseurl }}/book.html), is to make Prolog a language for distributed programming on the web. That involves more than making an individual computation run faster on multiple cores. It involves independent Prolog processes with their own lifecycles, communicating with one another across machines.

This is where Erlang becomes particularly interesting.

## A model for communicating processes

Erlang offers a coherent starting point: isolated processes, asynchronous messages, selective receive, and established mechanisms and patterns for monitoring, supervision, and recovery. Distribution and failure handling are central concerns of the programming model.

For Prolog, this suggests an attractive combination: retain unification, logical variables, and backtracking within each process, while organising cooperation between processes through message passing. We can preserve ordinary Prolog execution within a process while giving processes a way to participate in a larger concurrent system.

This distinction matters. A process can search for solutions, backtrack, and produce successive answers. Other processes can ask it questions, consume those answers, or carry on with their own work. The coordination of these activities does not require us to replace Prolog's ordinary search with committed choice throughout the language.

There are boundaries to respect, of course. Backtracking within a process does not undo a message already sent to another process. Nor does a uniform messaging interface make network delays, broken connections, or partial failures disappear. Those are part of what the design must address.

None of this requires copying every detail of Erlang. Taking inspiration from a language is hardly a pledge of allegiance to all its design decisions. It means recognising a useful combination of ideas and adapting it to the language and environment we actually want to support.

## What would make an alternative better?

Other approaches deserve to be assessed on their own merits. AND- and OR-parallelism can help exploit parallelism within a computation. Dataflow and committed-choice languages offer their own ways of expressing concurrent activity. Shared-memory threads can be useful within a single runtime. These approaches can also be combined with other mechanisms; they are not mutually exclusive camps.

For Web Prolog, however, the questions I want an alternative to answer are concrete. How does it organise independently running Prolog computations across machines? How do they exchange requests and results? What happens when one terminates, becomes unreachable, or needs to be restarted? And how much of ordinary Prolog can programmers retain within each computation?

Erlang provides a substantial body of experience relevant to those questions. That is the case for taking it seriously as an inspiration.

## A couple more arrows

[Joe Armstrong's conversation with Alan Kay at Code Mesh 2016](https://www.youtube.com/watch?v=fhOHn9TClXY) provides an interesting historical perspective. The diagram below brings several of the relevant ideas together: Simula, Lisp, Planner, Smalltalk, Actors, and Prolog, with Linda and Erlang appearing at the bottom.

Notice in particular the dashed arrows from Planner to both Prolog and Actors, and the connection from Smalltalk to Actors. Erlang is present, although no arrow connects it to the rest of the diagram.

A diagram like this is a selective view of intellectual relationships, not a complete history or a proof that a particular language design is right. Nevertheless, looking at it, I cannot help wanting to draw a couple more arrows, bringing Prolog and Erlang together in Web Prolog.

That is my proposed addition to the picture. The motivation is straightforward: preserve what makes Prolog interesting within each process, and draw on Erlang to organise communication and cooperation between processes across the web.

So I am happy to discuss other models. But the interesting objection is not that alternatives exist. It is why a particular alternative would better serve this goal: *independent Prolog processes collaborating over the web.*

<figure style="margin: 2rem 0;">
  <a href="{{ site.baseurl }}/assets/img/alan-kay-language-lineage.jpeg">
    <img src="{{ site.baseurl }}/assets/img/alan-kay-language-lineage.jpeg" alt="Alan Kay's diagram connecting programming-language ideas, including Planner, Smalltalk, Actors and Prolog, with Linda and Erlang listed at the bottom." width="1536" height="1143" loading="lazy">
  </a>
  <figcaption style="font-size: 0.9rem; color: #666;">Alan Kay's slide from <a href="https://www.youtube.com/watch?v=fhOHn9TClXY">Joe Armstrong interviews Alan Kay, Code Mesh 2016</a>. Screenshot from the talk; click the image to view it at full size.</figcaption>
</figure>
