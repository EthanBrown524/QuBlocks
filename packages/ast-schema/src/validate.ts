import type { GateOp, Operation, QuantumProgram, QubitRef, Subroutine } from "./index.js";

/**
 * Structural/physical validity of a QuantumProgram — a different class of
 * check from the compatibility matrix (compatibility.ts). That module
 * asks "does this target support this construct"; this one asks "is this
 * program physically valid at all," independent of any compile target.
 * Runs before simulation and before every compile.
 *
 * Scope: this is a *static* check over the AST, so it can only reason
 * about QubitRefs it can evaluate without a binding context:
 *   - Literal number refs are checked for in-range bounds.
 *   - Two refs are flagged as a duplicate only when they're structurally
 *     identical (same literal number, or the same { var, coefficient,
 *     offset }) — provably the same index on every evaluation. A gate
 *     using two different variables (e.g. { var: "i" } and { var: "j" })
 *     is NOT flagged even though they could coincidentally resolve to
 *     the same index at runtime; that can only be caught once bindings
 *     are known, which @qublocks/simulator's interpreter already does
 *     dynamically (resolveQubit/resolveClassicalBit throw on an
 *     out-of-range *resolved* index). This module doesn't duplicate that
 *     — it catches what's wrong regardless of how the AST is bound.
 *
 * Not covered here (out of scope for this pass): subroutine call arity
 * mismatches, unbound loop/subroutine variables, or LoopOp range
 * sanity — those are either already handled elsewhere (arity, unbound
 * vars — both throw in the interpreter) or not yet a validated concern.
 */
export interface ValidationIssue {
  message: string;
  /** Where in the program this was found, e.g. "body[2]" or "subroutine(bellPair).body[1]". */
  location: string;
}

export function validateProgram(program: QuantumProgram): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const checkBounds = (ref: QubitRef, kind: "qubit" | "classical bit", location: string): void => {
    if (typeof ref !== "number") return; // can't statically resolve a variable reference
    const count = kind === "qubit" ? program.qubitCount : program.classicalBitCount;
    if (!Number.isInteger(ref) || ref < 0 || ref >= count) {
      issues.push({
        location,
        message: `${kind} index ${ref} is out of range: program has ${count} ${kind}(s), valid indices are 0..${count - 1}`,
      });
    }
  };

  const checkDistinctGateQubits = (op: GateOp, location: string): void => {
    const seen = new Map<string, QubitRef>();
    for (const ref of op.qubits) {
      const key = qubitRefKey(ref);
      if (seen.has(key)) {
        issues.push({
          location,
          message: `${op.gate} uses the same qubit (${describeRef(ref)}) more than once — a multi-qubit gate's operands must all be distinct`,
        });
      }
      seen.set(key, ref);
    }
  };

  const visitOps = (ops: Operation[], pathPrefix: string): void => {
    ops.forEach((op, i) => {
      const location = `${pathPrefix}[${i}]`;
      switch (op.kind) {
        case "gate":
          op.qubits.forEach((ref) => checkBounds(ref, "qubit", location));
          checkDistinctGateQubits(op, location);
          return;
        case "loop":
          visitOps(op.body, `${location}.body`);
          return;
        case "call":
          op.qubitArgs.forEach((ref) => checkBounds(ref, "qubit", location));
          return;
        case "measure":
          checkBounds(op.qubit, "qubit", location);
          checkBounds(op.classicalBit, "classical bit", location);
          return;
        case "conditional":
          checkBounds(op.classicalBit, "classical bit", location);
          visitOps(op.body, `${location}.body`);
          return;
      }
    });
  };

  visitOps(program.body, "body");
  program.subroutines.forEach((sub: Subroutine) => {
    visitOps(sub.body, `subroutine(${sub.name}).body`);
  });

  return issues;
}

/** Throws with every issue listed if `program` is invalid; a no-op otherwise. */
export function assertValidProgram(program: QuantumProgram): void {
  const issues = validateProgram(program);
  if (issues.length > 0) {
    const lines = issues.map((issue) => `- [${issue.location}] ${issue.message}`);
    throw new Error(`invalid QuantumProgram:\n${lines.join("\n")}`);
  }
}

/** Canonical key for structural-equality comparison of two QubitRefs. */
function qubitRefKey(ref: QubitRef): string {
  if (typeof ref === "number") return `#${ref}`;
  return `$${ref.var}:${ref.coefficient ?? 1}:${ref.offset ?? 0}`;
}

function describeRef(ref: QubitRef): string {
  return typeof ref === "number" ? String(ref) : qubitRefKey(ref).slice(1);
}
