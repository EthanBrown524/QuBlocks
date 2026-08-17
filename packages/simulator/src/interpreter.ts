import type { Operation, QuantumProgram, Subroutine } from "@qublocks/ast-schema";
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
  /** Maps a qubit index as referenced in the current body to the global qubit index. */
  translateQubit: (localIndex: number) => number;
  rng: () => number;
}

/**
 * Runs a QuantumProgram to completion and returns the final state.
 *
 * Note on loops: the current AST's LoopOp carries no per-iteration bound
 * variable (Operation qubit refs are plain numbers, not expressions), so a
 * loop is executed as "repeat this body N times" rather than iterating a
 * qubit index — see the design doc's note that loop/subroutine lowering
 * deserves its own follow-up design pass.
 */
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
    translateQubit: (i) => i,
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
      const qubits = op.qubits.map(ctx.translateQubit);
      applyGate(ctx.amps, op.gate, qubits, op.params);
      return;
    }
    case "loop": {
      const iterations = Math.max(0, op.range[1] - op.range[0]);
      for (let i = 0; i < iterations; i++) {
        executeOperations(op.body, ctx);
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
      const outerTranslate = ctx.translateQubit;
      const args = op.qubitArgs;
      const innerCtx: ExecContext = {
        ...ctx,
        translateQubit: (localIndex) => outerTranslate(args[localIndex]),
      };
      executeOperations(sub.body, innerCtx);
      return;
    }
    case "measure": {
      const qubit = ctx.translateQubit(op.qubit);
      const outcome = collapse(ctx.amps, qubit, ctx.rng);
      ctx.classicalBits[op.classicalBit] = outcome;
      return;
    }
    case "conditional": {
      if (ctx.classicalBits[op.classicalBit] === op.equals) {
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
