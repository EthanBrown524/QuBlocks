import type { Operation, QuantumProgram, QubitRef, Subroutine } from "./index.js";

/**
 * Compile targets with known per-construct compatibility differences.
 * Extend this as new compiler backends are added (e.g. "cirq").
 */
export type CompileTarget = "openqasm3" | "qiskit";

export const ALL_COMPILE_TARGETS: readonly CompileTarget[] = ["openqasm3", "qiskit"];

/**
 * AST constructs whose support varies by target. This is the single
 * source of truth for cross-backend compatibility — compiler backends
 * consult it instead of hard-coding their own compile-error behavior, and
 * consumers (like the block editor) can query it directly to gray out or
 * warn on an incompatible export target, without needing to attempt a
 * compile and catch the error.
 */
export type Construct = "subroutine-param-arithmetic";

interface ConstructInfo {
  /** Human-readable explanation, suitable for a UI tooltip or warning. */
  description: string;
  supportedTargets: Record<CompileTarget, boolean>;
}

const CONSTRUCTS: Record<Construct, ConstructInfo> = {
  "subroutine-param-arithmetic": {
    description:
      'A QubitRef coefficient/offset (e.g. { var: "a", offset: 1 }) applied to one of a ' +
      "subroutine's own qubit parameters.",
    supportedTargets: {
      // OpenQASM 3 `qubit` parameters are a qubit-typed language
      // construct, not integers — arithmetic on them isn't expressible.
      // See packages/compiler-openqasm/src/index.ts's qubitRefToQasm.
      openqasm3: false,
      // Qiskit subroutine params are plain Python function arguments
      // (integers), so arithmetic on them is unrestricted. See
      // packages/compiler-qiskit/src/index.ts.
      qiskit: true,
    },
  },
};

/** Whether `target` supports `construct`, per the compatibility matrix above. */
export function supportsConstruct(target: CompileTarget, construct: Construct): boolean {
  return CONSTRUCTS[construct].supportedTargets[target];
}

/** Human-readable description of a construct, e.g. for a UI warning. */
export function describeConstruct(construct: Construct): string {
  return CONSTRUCTS[construct].description;
}

export interface CompatibilityIssue {
  construct: Construct;
  description: string;
}

/**
 * Checks whether `program` uses any construct unsupported by `target`.
 * Returns an empty array if fully compatible. This is what the block
 * editor should call to gray out or warn on an export target — it
 * inspects the AST directly rather than attempting a compile and parsing
 * the resulting error.
 */
export function checkProgramCompatibility(
  program: QuantumProgram,
  target: CompileTarget
): CompatibilityIssue[] {
  const issues: CompatibilityIssue[] = [];
  if (usesSubroutineParamArithmetic(program) && !supportsConstruct(target, "subroutine-param-arithmetic")) {
    issues.push({
      construct: "subroutine-param-arithmetic",
      description: describeConstruct("subroutine-param-arithmetic"),
    });
  }
  return issues;
}

function usesSubroutineParamArithmetic(program: QuantumProgram): boolean {
  return program.subroutines.some(subroutineUsesOwnParamArithmetic);
}

function subroutineUsesOwnParamArithmetic(sub: Subroutine): boolean {
  const paramNames = new Set(sub.qubitParams);
  for (const ref of collectQubitRefs(sub.body)) {
    if (typeof ref === "number") continue;
    if (!paramNames.has(ref.var)) continue;
    const coefficient = ref.coefficient ?? 1;
    const offset = ref.offset ?? 0;
    if (coefficient !== 1 || offset !== 0) return true;
  }
  return false;
}

/** Recursively collects every QubitRef appearing anywhere in a list of operations. */
function collectQubitRefs(ops: Operation[]): QubitRef[] {
  const refs: QubitRef[] = [];
  const visit = (op: Operation): void => {
    switch (op.kind) {
      case "gate":
        refs.push(...op.qubits);
        return;
      case "loop":
        op.body.forEach(visit);
        return;
      case "call":
        refs.push(...op.qubitArgs);
        return;
      case "measure":
        refs.push(op.qubit, op.classicalBit);
        return;
      case "conditional":
        refs.push(op.classicalBit);
        op.body.forEach(visit);
        return;
    }
  };
  ops.forEach(visit);
  return refs;
}
