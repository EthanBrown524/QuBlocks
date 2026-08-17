import type { Operation, QuantumProgram, QubitRef, Subroutine } from "@qublocks/ast-schema";
import { assertValidProgram, resolveQubitRef } from "@qublocks/ast-schema";
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
  qubitCount: number;
  classicalBitCount: number;
  rng: () => number;
}

/**
 * Runs a QuantumProgram to completion and returns the final state.
 *
 * Validates the program first (assertValidProgram) — e.g. a multi-qubit
 * gate with duplicate operands, like CNOT(0, 0), doesn't throw or crash
 * anywhere in the gate-application math (applyControlledUnitary's control
 * and target masks end up mutually exclusive, so every basis state gets
 * skipped and the "gate" silently becomes a no-op). Left unvalidated,
 * that would animate a plausible-looking but physically meaningless
 * result once visualization consumes this output.
 */
export function run(
  program: QuantumProgram,
  rng: () => number = Math.random
): SimulationResult {
  assertValidProgram(program);
  const amps = createZeroState(program.qubitCount);
  const classicalBits: (0 | 1)[] = new Array(program.classicalBitCount).fill(0);
  const subroutines = new Map(program.subroutines.map((s) => [s.name, s]));

  const ctx: ExecContext = {
    amps,
    classicalBits,
    subroutines,
    bindings: {},
    qubitCount: program.qubitCount,
    classicalBitCount: program.classicalBitCount,
    rng,
  };

  executeOperations(program.body, ctx);

  return { amplitudes: amps, classicalBits };
}

/**
 * Resolves a QubitRef to a qubit index and validates it against the
 * program's qubit count. Throws rather than letting an out-of-range index
 * reach the state-vector math, where it would silently corrupt amplitudes
 * (or index out of bounds) instead of failing clearly at the source.
 */
function resolveQubit(ref: QubitRef, ctx: ExecContext): number {
  const index = resolveQubitRef(ref, ctx.bindings);
  if (!Number.isInteger(index) || index < 0 || index >= ctx.qubitCount) {
    throw new Error(
      `qubit index ${index} is out of range: program has ${ctx.qubitCount} qubit(s), valid indices are 0..${ctx.qubitCount - 1}`
    );
  }
  return index;
}

/** Same as {@link resolveQubit}, but validates against the program's classical bit count. */
function resolveClassicalBit(ref: QubitRef, ctx: ExecContext): number {
  const index = resolveQubitRef(ref, ctx.bindings);
  if (!Number.isInteger(index) || index < 0 || index >= ctx.classicalBitCount) {
    throw new Error(
      `classical bit index ${index} is out of range: program has ${ctx.classicalBitCount} classical bit(s), valid indices are 0..${ctx.classicalBitCount - 1}`
    );
  }
  return index;
}

function executeOperations(ops: Operation[], ctx: ExecContext): void {
  for (const op of ops) {
    executeOperation(op, ctx);
  }
}

function executeOperation(op: Operation, ctx: ExecContext): void {
  switch (op.kind) {
    case "gate": {
      const qubits = op.qubits.map((q) => resolveQubit(q, ctx));
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
      const qubit = resolveQubit(op.qubit, ctx);
      const classicalBit = resolveClassicalBit(op.classicalBit, ctx);
      const outcome = collapse(ctx.amps, qubit, ctx.rng);
      ctx.classicalBits[classicalBit] = outcome;
      return;
    }
    case "conditional": {
      const classicalBit = resolveClassicalBit(op.classicalBit, ctx);
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
