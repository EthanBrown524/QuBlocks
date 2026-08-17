# QuBlocks

A visual programming language for quantum circuits.

## One-line pitch

A block-based visual programming language for quantum computing, in the
spirit of Scratch/Blockly. You compose gates, loops, subroutines, and
classically-controlled branches on a canvas; a live simulator animates the
result (Bloch spheres, probability amplitudes); and the same program
compiles to real, runnable Qiskit, Cirq, or OpenQASM source.

## Goals

- A genuine visual programming language, not just a circuit diagram tool —
  loops, reusable subroutines, and classical control flow, not only gates
- Runs 100% client-side — no backend, no database, deployable as a static
  site for free
- A correctness-critical core worth testing well: the simulator and each
  compiler backend
- Adding a new export target is an independently testable, shippable unit

## Non-goals (out of scope for MVP)

- Any backend service or database
- User accounts — circuits are shared via URL, not a login
- Full quantum-programming-language parity
- Real hardware execution

## Architecture

Everything runs inside the browser. There is no server at runtime.

```
[VPL block editor] -> [program AST] -> [live simulator]      (in-browser)
                                     -> [compiler backends]    (in-browser)

[compiler backends] -> [CI cross-validation]                  (CI only, not runtime)
```

- **VPL block editor** (`packages/editor`) — the drag-and-drop canvas,
  built on Blockly.
- **Program AST** (`packages/ast-schema`) — the canonical, serializable
  representation of what's on the canvas. Everything else consumes this.
- **Live simulator** (`packages/simulator`) — pure TypeScript, walks the
  AST and evolves a complex state vector gate by gate.
- **Compiler backends** (`packages/compiler-*`) — one module per target
  language, each a pure function `AST -> string`.
- **CI cross-validation** (`ci/`) — not a runtime component. A GitHub
  Actions job that installs Qiskit/Cirq in Python, executes the generated
  code, and diffs the resulting statevector against the TypeScript
  simulator's output for the same AST.

## Tech stack

- TypeScript, Vite
- Blockly for the block editor
- npm workspaces monorepo — each compiler backend and the simulator are
  separate packages with their own tests, even though they all bundle
  into one static site
- Vitest for unit tests, `fast-check` for property-based tests
- Python + Qiskit/Cirq, but only inside the CI cross-validation job —
  never shipped, never run in the browser

## Repo layout

```
qublocks/
  package.json              # workspace root
  packages/
    ast-schema/              # shared TypeScript types for the program AST
    simulator/                # state-vector engine
    compiler-openqasm/
    compiler-qiskit/
    compiler-cirq/
    editor/                    # Blockly-based block editor UI
    app/                        # Vite app that ties it all together
  ci/
    cross_validate.py          # executes generated code, diffs vs simulator
  .github/workflows/
    ci.yml
    deploy.yml
```

## MVP scope

- **Gate set**: H, X, Y, Z, S, T, RX/RY/RZ(θ), CNOT, CZ, SWAP, Toffoli (CCX)
- **Structural constructs**: loops over a qubit range, subroutines (define
  + call), measurement, classically-controlled single-gate conditionals
- **Compiler targets**, in order: OpenQASM 3, Qiskit (Python), Cirq (Python)
- **Preset programs**: Bell state, GHZ state, quantum teleportation,
  Deutsch-Jozsa, and a loop+subroutine program (a Bell-pair-preparation
  subroutine called in a loop)

## Phased build order

1. AST schema + simulator, no UI yet — get the state-vector math right
   first, with property-based tests. **(done — see `packages/ast-schema`,
   `packages/simulator`)**
2. OpenQASM backend + golden tests. **(done — see
   `packages/compiler-openqasm`)**
3. Blockly-based editor, wired to produce the AST — gates and measurement
   only, no loops/subroutines yet. **(done for this scope — see
   `packages/editor`: gate + measure blocks, a unit-tested
   block-to-AST translator, and a live preview wired to the real
   OpenQASM and Qiskit backends. Compatibility matrix also done — see
   `checkProgramCompatibility`/`supportsConstruct` in
   `packages/ast-schema/src/compatibility.ts`, which programmatically
   answers whether a construct an AST uses is supported by a given
   target, instead of that only being implicit per-backend compile-error
   behavior.)**
4. Live visualization — Bloch spheres and probability bars.
5. Qiskit + Cirq backends, with the CI cross-validation job. **(Qiskit
   backend done — see `packages/compiler-qiskit`; Cirq still pending)**
6. Loops and subroutines in the editor, plus the AST-to-target translation
   decisions that come with them.
7. Harden: PR preview deployments, bundle-size budget as a CI gate,
   accessibility checks, feature-flag experimental backends.

## Definition of done for the MVP

- All MVP gates and structural constructs are placeable in the editor and
  produce a valid AST
- The live simulator correctly animates at least the five preset programs
- All three compiler backends produce code that has been cross-validated
  (in CI) against the simulator for every preset program
- The full pipeline — lint → typecheck → unit tests → property tests →
  golden tests → Python cross-validation → build → deploy — runs green on
  a real merge, with PR preview deployments working end to end

## Development

```bash
npm install
npm test
```
