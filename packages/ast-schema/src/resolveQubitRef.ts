import type { QubitRef } from "./index.js";

/**
 * Resolves a QubitRef to a concrete index against the current binding
 * context (the current loop iteration values and/or subroutine qubit
 * params, keyed by name). Throws if a variable reference is unbound.
 */
export function resolveQubitRef(
  ref: QubitRef,
  bindings: Readonly<Record<string, number>>
): number {
  if (typeof ref === "number") {
    return ref;
  }
  const value = bindings[ref.var];
  if (value === undefined) {
    throw new Error(`unbound variable in QubitRef: ${ref.var}`);
  }
  const coefficient = ref.coefficient ?? 1;
  const offset = ref.offset ?? 0;
  return value * coefficient + offset;
}
