import type { Operation, QuantumProgram, Subroutine } from "@qublocks/ast-schema";
import { resolveQubitRef } from "@qublocks/ast-schema";
import { cAbs2 } from "./complex.js";
import { applyGate, createZeroState, type StateVector } from "./stateVector.js";

export interface SimulationResult {
  amplitudes: StateVector;
  classicalBits: (0 | 1)[];
}

interface ExecContext {
  amps: StateVector;
  classicalBits: (0 | 1)[];
  subroutines: Map<string, Subroutine>;
  /** Current variable bindings: loop variables in scope, or the current subroutine's qubitParams. */
  bindings: Readonly<Record<string, number>>;
  rng: () => number;
}

/** Runs a QuantumProgram to completion and returns the final state. */
export function run(
  program: QuantumProgram,
  rng: () => number = Math.random
): SimulationResult {
  const amps = createZeroState(program.qubitCount);
  const classicalBits: (0 | 1)[] = new Array(program.classicalBitCount).fill(0);
  const subroutines = new Map(program.subroutines.map((s) => [s.name, s]));

  const ctx: ExecContext = {
    amps,
    classicalBits,
    subroutines,
    bindings: {},
    rng,
  };

  executeOperations(program.body, ctx);

  return { amplitudes: amps, classicalBits };
}

function executeOperations(ops: Operation[], ctx: ExecContext): void {
  for (const op of ops) {
    executeOperation(op, ctx);
  }
}

function executeOperation(op: Operation, ctx: ExecContext): void {
  switch (op.kind) {
    case "gate": {
      const qubits = op.qubits.map((q) => resolveQubitRef(q, ctx.bindings));
      applyGate(ctx.amps, op.gate, qubits, op.params);
      return;
    }
    case "loop": {
      const iterations = Math.max(0, op.range[1] - op.range[0]);
      for (let i = op.range[0]; i < op.range[0] + iterations; i++) {
        const loopCtx: ExecContext = {
          ...ctx,
          bindings: { ...ctx.bindings, [op.loopVar]: i },
        };
        executeOperations(op.body, loopCtx);
      }
      return;
    }
    case "call": {
      const sub = ctx.subroutines.get(op.subroutine);
      if (!sub) {
        throw new Error(`unknown subroutine: ${op.subroutine}`);
      }
      if (sub.qubitParams.length !== op.qubitArgs.length) {
        throw new Error(
          `subroutine ${op.subroutine} expects ${sub.qubitParams.length} qubit arg(s), got ${op.qubitArgs.length}`
        );
      }
      // Arguments are resolved in the caller's bindings, then bound as the
      // callee's only bindings — subroutine bodies don't see the call
      // site's loop variables directly, only through qubitParams.
      const resolvedArgs = op.qubitArgs.map((a) => resolveQubitRef(a, ctx.bindings));
      const calleeBindings: Record<string, number> = {};
      sub.qubitParams.forEach((name, i) => {
        calleeBindings[name] = resolvedArgs[i];
      });
      const innerCtx: ExecContext = { ...ctx, bindings: calleeBindings };
      executeOperations(sub.body, innerCtx);
      return;
    }
    case "measure": {
      const qubit = resolveQubitRef(op.qubit, ctx.bindings);
      const classicalBit = resolveQubitRef(op.classicalBit, ctx.bindings);
      const outcome = collapse(ctx.amps, qubit, ctx.rng);
      ctx.classicalBits[classicalBit] = outcome;
      return;
    }
    case "conditional": {
      const classicalBit = resolveQubitRef(op.classicalBit, ctx.bindings);
      if (ctx.classicalBits[classicalBit] === op.equals) {
        executeOperations(op.body, ctx);
      }
      return;
    }
  }
}

/** Measures `qubit`, collapsing and renormalizing the state vector. Returns the outcome bit. */
function collapse(amps: StateVector, qubit: number, rng: () => number): 0 | 1 {
  const mask = 1 << qubit;
  let p1 = 0;
  for (let i = 0; i < amps.length; i++) {
    if ((i & mask) !== 0) p1 += cAbs2(amps[i]);
  }
  const outcome: 0 | 1 = rng() < p1 ? 1 : 0;

  let normSq = 0;
  for (let i = 0; i < amps.length; i++) {
    const bitIsSet = (i & mask) !== 0;
    if ((outcome === 1) !== bitIsSet) {
      amps[i] = { re: 0, im: 0 };
    } else {
      normSq += cAbs2(amps[i]);
    }
  }
  const norm = Math.sqrt(normSq);
  if (norm > 0) {
    for (let i = 0; i < amps.length; i++) {
      amps[i] = { re: amps[i].re / norm, im: amps[i].im / norm };
    }
  }
  return outcome;
}
