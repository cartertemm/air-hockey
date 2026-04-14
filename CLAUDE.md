# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## Prerequisites

- Write clear, succinct commit messages - one or two sentences max
- Use conventional commit format when applicable

## Project notes

- **Tabs only; never indent blank lines** (they must be zero-width). No blank lines inside function bodies.
- **Vitest: no globals.** Always `import { describe, test, expect } from 'vitest'`. `tests/setup.js` preloads `speechSynthesis` and `localStorage` mocks and resets state between tests — read it before writing client tests.
- **Server test isolation.** `server/player.js` and `server/room.js` hold module-level state; call `_resetPlayers()` / `_resetRooms()` in `beforeEach`.
- **Real `WebSocket.close()` fires `close` asynchronously.** Synchronous fake clients hide teardown races. When testing connection teardown, use `makeAsyncFakeClient` in `tests/client-session.test.js`.
- **`screenConnecting` in `src/session.js` captures `myClient` as a closure** so stale close handlers from abandoned attempts can detect themselves via `client !== myClient`. Load-bearing — preserve it.
- **Pre-game screens use native HTML + browser screen reader; gameplay uses `speak()`.** Don't mix the two. iOS VoiceOver intercepts gameplay gestures — `handoffIos` warns the user before gameplay starts.
- **Shared wire code lives in `network/`** and is imported by both client and server via the `network` Vite alias.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" ? "Write tests for invalid inputs, then make them pass"
- "Fix the bug" ? "Write a test that reproduces it, then make it pass"
- "Refactor X" ? "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] ? verify: [check]
2. [Step] ? verify: [check]
3. [Step] ? verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
