# @qublocks/editor

Blockly-based drag-and-drop block editor UI. First pass, scoped narrowly
per the project's phased build order: **gates and measurement only** — no
loops or subroutines in the editor yet. Representing "this block
references a loop variable" visually is its own real UI design problem,
deliberately deferred so the block-to-AST wiring gets proven correct on
the simpler case first.

## What's here

- `src/blocks.ts` — JSON block definitions for the MVP gate set (H, X, Y,
  Z, S, T, RX, RY, RZ, CNOT, CZ, SWAP, CCX) plus a measure block. Each
  gate block's semantic mapping (block type → `GateName` → field order)
  lives in `GATE_BLOCK_SPECS`, the single source of truth the translator
  reads from — the visual JSON definitions are a separate, cosmetic
  concern.
- `src/blockToOperation.ts` / `src/workspaceToProgram.ts` — the
  block-to-AST translator. This is the new correctness-critical surface
  in this package (same rationale as the simulator and each compiler
  backend), so it has its own unit tests, run against a **headless**
  `Blockly.Workspace` (no SVG/DOM needed — Blockly's core model layer
  runs fine in plain Node, which is what `workspaceToProgram.test.ts`
  exercises: 10 tests covering every gate, param/no-param handling,
  multi-chain concatenation, and a full teleportation-preset block chain
  reproduced exactly).
- `src/main.ts` — the live vertical slice: wires the workspace to
  `@qublocks/compiler-openqasm` and `@qublocks/compiler-qiskit` (both
  already fully tested elsewhere in this repo) so dragging gates onto the
  canvas immediately shows real generated code in both languages, not
  just an internal AST. Also consults
  `checkProgramCompatibility` (`@qublocks/ast-schema`) per target, so an
  incompatible construct shows a specific warning instead of a raw
  compile-error stack.

## Verification status

- The translator itself: unit-tested, headless, no caveats.
- The full pipeline (block chain → AST → both compiler backends → DOM):
  manually verified correct — building a Bell-state block chain
  (`H(0)` → `CNOT(0,1)`) and invoking the render pipeline produces byte-
  exact `h q[0]; cx q[0], q[1];` (OpenQASM) and `qc.h(0)` / `qc.cx(0, 1)`
  (Qiskit), matching the same backends' own golden tests.
- **Not independently re-verified in this session**: that
  `workspace.addChangeListener` fires automatically on a real drag, in an
  actual visible browser tab. Confirmed instead that Blockly's compiled
  bundle uses `requestAnimationFrame` to batch its event-flush, and that
  rAF genuinely never fires in a non-composited/hidden browser pane (this
  session's `computer` screenshot tool reported the pane wasn't
  displayed) — so the automated re-render couldn't be observed here, only
  triggered manually. This is a well-established, heavily-relied-upon
  Blockly API (the canonical live-codegen pattern in Blockly's own
  official demos), not something this project is doing unusually — but
  it's still an assumption, not a first-party observation, and is worth a
  quick manual click-test in a real browser before treating the live
  preview as fully proven.

## Not yet done

- Loops, subroutines, and their AST-to-target translation decisions
  (tracked in the root README's phased build order).
- Live simulator visualization (Bloch spheres, probability bars) — a
  separate phase.
- No qubit-count/classical-bit-count validation against what's actually
  used in the block chain (e.g. a measure block targeting a
  classical bit beyond the configured count) — the simulator/compilers
  will surface that as a runtime error, but the editor doesn't pre-flight
  it yet.
