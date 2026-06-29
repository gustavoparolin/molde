# Field Notes — Molde Template Feedback Log

> **Append-only log.** Any AI agent working on a Molde-derived app should add entries here when
> it discovers something worth preserving: bugs, gotchas, patterns, infra surprises.
>
> **Two-layer system:**
> - **This file** = raw discoveries (agents write here freely).
> - **`molde-brain.md`** = curated knowledge (Gustavo or an agent promotes HIGH/CRITICAL entries).
>
> After adding an entry, set `status: noted`. Gustavo will mark it `promoted` or `fixed-in-template`
> when it's incorporated into the template.

---

## Entry format

```
## [YYYY-MM-DD] [app-slug] — [category]: one-line summary
**Severity:** CRITICAL | HIGH | LOW
**Status:** `noted` | `promoted` | `fixed-in-template`

What happened, what the root cause was, and what the fix/pattern is.

**Template impact:** what (if anything) should change in Molde's code or docs.
```

**Categories:** `bug` · `pattern` · `gotcha` · `infra` · `performance` · `dx`

---

## [2026-06-15] recibos — bug: sharp `.metadata()` invalidates pipeline silently
**Severity:** CRITICAL
**Status:** `promoted`

Calling `.metadata()` on the same `sharp(buf)` instance used for image processing consumes the
lazy stream internally. Subsequent `.jpeg().toBuffer()` calls return empty or corrupt output with
no error thrown. The OCR received a blank image — took 6h to diagnose.

**Fix:** Always use a **separate** `sharp(buf)` instance for metadata reads:
```typescript
const meta = await sharp(buf).metadata();   // read-only, throw-away instance
let pipeline = sharp(buf).rotate();         // fresh pipeline for output
```

**Template impact:** Documented in `molde-brain.md`. Any new service using `sharp` must follow
this pattern. Consider adding a lint comment to the AI integration example.

---

## [2026-06-15] recibos — gotcha: `AI_MAX_TOKENS` too low for thinking models
**Severity:** HIGH
**Status:** `promoted`

`qwen3-vl:30b` (and other reasoning/thinking models) consume tokens internally for chain-of-thought
before producing output. With the default `AI_MAX_TOKENS=4096`, the model exhausted the budget on
reasoning and returned an empty response — no error, just silence.

**Fix:** Set `AI_MAX_TOKENS=16384` (or higher) for any thinking model.

**Template impact:** Documented in `molde-brain.md`. The `.env.example` comment should warn about this.

---

## [2026-06-15] recibos — gotcha: GitHub Issues / tests / PR were all skipped
**Severity:** HIGH
**Status:** `promoted`

During the first Molde app build, the AI skipped creating GitHub Issues, writing tests, and opening
a PR. The resulting app had no traceability, silent regressions went undetected, and there was no
audit trail.

**Fix:** `AGENTS.md` §2.1 and §9 document these as mandatory non-skippable phases.

**Template impact:** Already addressed in AGENTS.md. Monitor future apps — if an agent skips these
again, add a harder gate (e.g., a pre-commit hook that checks for open issues).
