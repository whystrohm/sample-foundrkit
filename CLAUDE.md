# CLAUDE.md — Foundrkit operating instructions

This file is read by Claude Code (and any AI writing assistant pointed at this repo) before drafting copy for Linear. It's the bridge between the static rule files (`brand.config.ts`, `foundrkit.rules.json`, `forbidden.json`) and a real writing session.

If you're a human reading this, the file is doing what a brand style guide tries to do — but as instructions a machine actually follows on every output, not as a PDF nobody opens.

## Load order

1. Read [`brand.config.ts`](./brand.config.ts) for the voice paragraph, the seven language axes, the register constraints, and the approved structural patterns.
2. Read [`foundrkit.rules.json`](./foundrkit.rules.json) for the six structural rules the linter enforces. The two `block` rules (no em-dashes, no forbidden words) are non-negotiable. The four `warn` rules are guidance — break them only when the alternative is worse.
3. Read [`forbidden.json`](./forbidden.json) for the explicit word and phrase blocklist. No item in any of the five categories may appear in published output.
4. Skim [`examples/good-post.md`](./examples/good-post.md) as a target tone reference and [`examples/bad-post.md`](./examples/bad-post.md) as the slop pattern to avoid.

## Writing pass

Every draft goes through the same loop:

1. **Lead with the concrete.** First sentence names a feature, a decision, or a number — not an abstract claim about how the industry is changing.
2. **Cut the throat-clearing.** No "in today's", no "AI is reshaping", no "we're thrilled". Read the opening sentence aloud. If it could be the opening of any SaaS post, rewrite it.
3. **Check the register.** Median sentence length under 20 words. Adjectives single-file, not stacked. Subjects concrete.
4. **Run the linter.** `node foundrkit-lint.mjs <file>` against any post before merging. If the linter blocks, fix the violations and re-run. The blocker is the rule, not the linter.

## When to break a rule

The `block` rules don't bend. No em-dashes, no forbidden words. Ever.

The `warn` rules bend when:

- A sentence over 25 words carries technical density that splitting would lose (e.g. a single nested clause about how Linear Agent reads the same queue as Linear teams).
- A short final adjective stack is a deliberate echo of Linear's product copy (rare).
- An abstract subject reads as a callback, not as a hedge.

If you bend a `warn` rule, the linter still passes. The reader should still notice nothing.

## What this repo is not

- Not the WhyStrohm engine. The engine that generates this Foundrkit for a brand is a separate service. This repo is the *output format*.
- Not a static style guide. Style guides are documents. This is rules a machine reads on every output. The distinction is operational, not editorial.
- Not a complete Foundrkit. A real Foundrkit includes the brand's example library, channel-specific templates, and a tunable rule set. This repo is the minimum viable shape — what a founder gets in the first 30-day Foundrkit Build engagement.

## See it work

The repo includes a permanent open PR (`bad-post-demo` → `main`) that demonstrates the linter catching a deliberately-slop draft. The PR fails CI. The README screenshots the failure. The fix lives on `main` as [`examples/good-post.md`](./examples/good-post.md).

If you want a Foundrkit like this for your own brand, the engine lives at [whystrohm.com](https://whystrohm.com).
