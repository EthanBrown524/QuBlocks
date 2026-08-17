import type {
  CallOp,
  ConditionalOp,
  GateName,
  GateOp,
  LoopOp,
  MeasureOp,
  Operation,
  QuantumProgram,
  QubitRef,
  Subroutine,
} from "@qublocks/ast-schema";

const GATE_TO_QASM: Record<GateName, string> = {
  H: "h",
  X: "x",
  Y: "y",
  Z: "z",
  S: "s",
  T: "t",
  RX: "rx",
  RY: "ry",
  RZ: "rz",
  CNOT: "cx",
  CZ: "cz",
  SWAP: "swap",
  CCX: "ccx",
};

/** Emission context: whether qubit refs resolve against the top-level `q`
 * register (integer-indexed) or a subroutine's qubit-typed parameters
 * (referenced by name, not index). */
type EmitContext = "top" | "subroutine";

const INDENT_UNIT = "  ";

/**
 * Compiles a QuantumProgram AST to OpenQASM 3 source. Pure function,
 * AST -> string — no I/O, no execution.
 */
export function compileToOpenQasm3(program: QuantumProgram): string {
  const sections: string[][] = [];

  sections.push(["OPENQASM 3;", 'include "stdgates.inc";']);

  const decls = [`qubit[${program.qubitCount}] q;`];
  if (program.classicalBitCount > 0) {
    decls.push(`bit[${program.classicalBitCount}] c;`);
  }
  sections.push(decls);

  if (program.subroutines.length > 0) {
    const subLines: string[] = [];
    program.subroutines.forEach((sub, i) => {
      if (i > 0) subLines.push("");
      subLines.push(...formatSubroutine(sub));
    });
    sections.push(subLines);
  }

  const bodyLines: string[] = [];
  for (const op of program.body) {
    bodyLines.push(...formatOperation(op, "top", ""));
  }
  sections.push(bodyLines);

  return sections.map((s) => s.join("\n")).join("\n\n") + "\n";
}

function formatSubroutine(sub: Subroutine): string[] {
  const params = sub.qubitParams.map((p) => `qubit ${p}`).join(", ");
  const lines = [`def ${sub.name}(${params}) {`];
  for (const op of sub.body) {
    lines.push(...formatOperation(op, "subroutine", INDENT_UNIT));
  }
  lines.push("}");
  return lines;
}

function formatOperation(op: Operation, ctx: EmitContext, indent: string): string[] {
  switch (op.kind) {
    case "gate":
      return [`${indent}${formatGate(op, ctx)}`];
    case "loop":
      return formatLoop(op, ctx, indent);
    case "call":
      return [`${indent}${formatCall(op, ctx)}`];
    case "measure":
      return [`${indent}${formatMeasure(op, ctx)}`];
    case "conditional":
      return formatConditional(op, ctx, indent);
  }
}

function formatGate(op: GateOp, ctx: EmitContext): string {
  const qasmName = GATE_TO_QASM[op.gate];
  const args = op.qubits.map((q) => qubitRefToQasm(q, ctx)).join(", ");
  if (op.params && op.params.length > 0) {
    const params = op.params.map(formatAngle).join(", ");
    return `${qasmName}(${params}) ${args};`;
  }
  return `${qasmName} ${args};`;
}

function formatLoop(op: LoopOp, ctx: EmitContext, indent: string): string[] {
  const [start, end] = op.range;
  if (end <= start) {
    // end-exclusive range with no iterations — nothing to emit.
    return [];
  }
  const lines = [`${indent}for int ${op.loopVar} in [${start}:${end - 1}] {`];
  for (const inner of op.body) {
    lines.push(...formatOperation(inner, ctx, indent + INDENT_UNIT));
  }
  lines.push(`${indent}}`);
  return lines;
}

function formatCall(op: CallOp, ctx: EmitContext): string {
  const args = op.qubitArgs.map((a) => qubitRefToQasm(a, ctx)).join(", ");
  return `${op.subroutine}(${args});`;
}

function formatMeasure(op: MeasureOp, ctx: EmitContext): string {
  return `${classicalBitRefToQasm(op.classicalBit)} = measure ${qubitRefToQasm(op.qubit, ctx)};`;
}

function formatConditional(op: ConditionalOp, ctx: EmitContext, indent: string): string[] {
  const lines = [`${indent}if (${classicalBitRefToQasm(op.classicalBit)} == ${op.equals}) {`];
  for (const inner of op.body) {
    lines.push(...formatOperation(inner, ctx, indent + INDENT_UNIT));
  }
  lines.push(`${indent}}`);
  return lines;
}

/** Formats the integer-valued expression a QubitRef denotes (used for both `q[...]` and `c[...]` indices). */
function refToIntExpr(ref: QubitRef): string {
  if (typeof ref === "number") {
    return String(ref);
  }
  const coefficient = ref.coefficient ?? 1;
  const offset = ref.offset ?? 0;
  let expr: string;
  if (coefficient === 1) {
    expr = ref.var;
  } else if (coefficient === -1) {
    expr = `-${ref.var}`;
  } else {
    expr = `${coefficient}*${ref.var}`;
  }
  if (offset > 0) expr = `${expr} + ${offset}`;
  else if (offset < 0) expr = `${expr} - ${-offset}`;
  return expr;
}

function qubitRefToQasm(ref: QubitRef, ctx: EmitContext): string {
  if (ctx === "top") {
    return `q[${refToIntExpr(ref)}]`;
  }
  // Inside a subroutine, a bare { var: name } refers directly to a
  // qubit-typed parameter — OpenQASM qubit variables aren't integers, so
  // arithmetic on them (coefficient/offset) isn't expressible.
  if (typeof ref === "number") {
    return `q[${ref}]`;
  }
  if ((ref.coefficient ?? 1) !== 1 || (ref.offset ?? 0) !== 0) {
    throw new Error(
      `cannot apply a coefficient/offset to qubit-typed subroutine parameter "${ref.var}" — OpenQASM qubit variables aren't integers`
    );
  }
  return ref.var;
}

function classicalBitRefToQasm(ref: QubitRef): string {
  return `c[${refToIntExpr(ref)}]`;
}

function formatAngle(theta: number): string {
  return String(theta);
}
