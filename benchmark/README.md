# Benchmark: answering questions about an app, with and without Screenify

One small test, on one app, run on 2026-11-14. It measures a narrow thing: how well and how
cheaply a coding agent can say what an app looks like on screen when it has only the code,
compared with when the repository also holds a Screenify library. Everything needed to check or
repeat it is in this folder.

## Result

| | Code only | Code + Screenify library |
| --- | --- | --- |
| Correct answers (3 runs × 20 questions) | 55 / 60 (92%) | 60 / 60 (100%) |
| Per run | 19, 18, 18 | 20, 20, 20 |
| Time per run | 110 s (102–125) | 30 s (28–32) |
| Tool calls per run | 27 (25–30) | 9 (8–9) |
| Tokens per run | 185k (178k–191k) | 125k (121k–128k) |

With the library the agent was right every time, in about a quarter of the time, with a third of
the tool calls and about a third fewer tokens.

The questions the code-only runs got wrong were about what is actually rendered, not what exists
in the code: the label a selector shows on one page versus another (two runs), an empty-state
message, a block missing from a settings page, and a control that only appears on hover described
as always visible. The answers and the reason for each lost point are in [`grades.json`](grades.json).

## Method

- **App.** [Memos](https://github.com/usememos/memos) v26.11.0 (MIT), an open-source notes app,
  started with one command in its demo mode:
  `docker run -d -p 5231:5230 -e MEMOS_DEMO=true neosmemo/memos:26.11.0`.
- **Library.** Built by the normal Screenify flow on a checkout of the same tag: discovery by a
  Claude Sonnet agent (33 screens and 14 flows planned; 4 minutes, 174k tokens), then capture by a
  Claude Haiku agent (10 minutes, 237k tokens), which signed up one test account, added five
  memos and filed 18 reviewed images covering 17 screens and one flow. A sample is in
  [`library-sample/`](library-sample/).
- **Questions.** [`questions.md`](questions.md): 20 questions about what a newly signed-up member
  sees at desktop width: labels, the order of sections, default switch positions, layout. None
  depends on the sample data, so every answer can in principle be worked out from the code.
- **Answer key.** [`answer-key.md`](answer-key.md), written before any run from the running app,
  and kept where the test agents could not read it.
- **Runs.** Six runs of Claude Sonnet with the same prompt: answer the questions using only the
  files in the checkout; do not run the app, a browser or the network. Three runs got a clean
  checkout (code only). Three got the checkout with `screenify-out/` and the one-line pointer
  `screenify init` adds to `AGENTS.md`. Raw answers are in [`answers/`](answers/).
- **Grading.** A separate agent graded the six answer sets under shuffled neutral names, without
  knowing which was which: one point per question, no half points, every required element of the
  key needed. Time, tool calls and tokens are the figures the agent harness reported for each run.

## What this does not show

- **One app, three runs per side.** Memos is a small, tidy codebase with all its text in locale
  files, which is the easy case for reading code; the code-only runs still scored 92%. A larger
  or messier app may widen the gap or not; this test cannot say.
- **Only screens that were captured.** The questions cover the 17 captured screens. For a screen
  that is not in the library, the agent is back to reading code.
- **The library is not free.** Building it took about 14 minutes and 411k tokens on cheaper
  models. It pays back when agents ask about the app repeatedly, and a refresh replays stored
  recipes without a model.
- **"Code only" is not the only alternative.** An agent can also start the app and take its own
  screenshots each time. That was not measured here.
- **Factual questions only.** The test does not measure whether designs or feature suggestions
  come out better with screenshots; that needs a different, human-judged test.
- **The machine was busy** during the runs, so the absolute times are slow for both sides.

## Repeating it

1. Start Memos with the command above and check out the tag `26.11.0` of its repository.
2. In the checkout, run `screenify init`, then ask your agent to use the `screenify` skill.
3. Give a fresh agent `questions.md` with a clean checkout, and another the checkout with the
   library; grade both against `answer-key.md`.

Screens can differ slightly between Memos versions, so use the same tag when comparing with the
key.
