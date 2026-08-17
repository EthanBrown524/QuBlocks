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

/** QuantumCircuit method name and whether it takes a leading angle parameter. */
const GATE_TO_QISKIT: Record<GateName, string> = {
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

const INDENT_UNIT = "    ";

/**
 * Compiles a QuantumProgram AST to Qiskit (Python) source. Pure function,
 * AST -> string — no I/O, no execution.
 *
 * Unlike the OpenQASM 3 backend, this emits plain Python: loops become
 * real `for i in range(start, end):` statements (Python's range() is
 * already end-exclusive, so no [start, end) -> [start:end-1] compensation
 * is needed here — that translation is specific to OpenQASM's inclusive
 * range syntax), and subroutines become plain Python functions taking the
 * circuit and qubit indices as arguments. Because qubit references are
 * just Python integers/expressions passed as function arguments — not a
 * qubit-typed language construct the way OpenQASM 3's `qubit` parameters
 * are — there's no restriction on applying a QubitRef coefficient/offset
 * to a subroutine parameter here, unlike the OpenQASM backend. This
 * backend therefore has nothing to reject for the
 * "subroutine-param-arithmetic" construct (see
 * `supportsConstruct("qiskit", "subroutine-param-arithmetic")` in
 * @qublocks/ast-schema's compatibility matrix, which returns true) — no
 * runtime check is needed here, unlike compiler-openqasm.
 */
export function compileToQiskit(program: QuantumProgram): string {
  const sections: string[][] = [];

  sections.push(["from qiskit import QuantumCircuit"]);

  if (program.subroutines.length > 0) {
    const subLines: string[] = [];
    program.subroutines.forEach((sub, i) => {
      if (i > 0) subLines.push("");
      subLines.push(...formatSubroutine(sub));
    });
    sections.push(subLines);
  }

  const ctorArgs =
    program.classicalBitCount > 0
      ? `${program.qubitCount}, ${program.classicalBitCount}`
      : `${program.qubitCount}`;
  sections.push([`qc = QuantumCircuit(${ctorArgs})`]);

  const bodyLines = formatOperations(program.body, "");
  if (bodyLines.length > 0) {
    sections.push(bodyLines);
  }

  return sections.map((s) => s.join("\n")).join("\n\n") + "\n";
}

function formatSubroutine(sub: Subroutine): string[] {
  const params = ["qc", ...sub.qubitParams].join(", ");
  return [`def ${sub.name}(${params}):`, ...formatIndentedBlock(sub.body, INDENT_UNIT)];
}

/** Formats an indented block, inserting `pass` if it would otherwise be empty (a syntax error in Python). */
function formatIndentedBlock(ops: Operation[], indent: string): string[] {
  const lines = formatOperations(ops, indent);
  return lines.length > 0 ? lines : [`${indent}pass`];
}

function formatOperations(ops: Operation[], indent: string): string[] {
  const lines: string[] = [];
  for (const op of ops) {
    lines.push(...formatOperation(op, indent));
  }
  return lines;
}

function formatOperation(op: Operation, indent: string): string[] {
  switch (op.kind) {
    case "gate":
      return [`${indent}${formatGate(op)}`];
    case "loop":
      return formatLoop(op, indent);
    case "call":
      return [`${indent}${formatCall(op)}`];
    case "measure":
      return [`${indent}${formatMeasure(op)}`];
    case "conditional":
      return formatConditional(op, indent);
  }
}

function formatGate(op: GateOp): string {
  const method = GATE_TO_QISKIT[op.gate];
  const qubitArgs = op.qubits.map(qubitRefToPython);
  const args = op.params && op.params.length > 0
    ? [...op.params.map(formatAngle), ...qubitArgs]
    : qubitArgs;
  return `qc.${method}(${args.join(", ")})`;
}

function formatLoop(op: LoopOp, indent: string): string[] {
  const [start, end] = op.range;
  return [
    `${indent}for ${op.loopVar} in range(${start}, ${end}):`,
    ...formatIndentedBlock(op.body, indent + INDENT_UNIT),
  ];
}

function formatCall(op: CallOp): string {
  const args = ["qc", ...op.qubitArgs.map(qubitRefToPython)];
  return `${op.subroutine}(${args.join(", ")})`;
}

function formatMeasure(op: MeasureOp): string {
  return `qc.measure(${qubitRefToPython(op.qubit)}, ${qubitRefToPython(op.classicalBit)})`;
}

function formatConditional(op: ConditionalOp, indent: string): string[] {
  return [
    `${indent}with qc.if_test((qc.clbits[${qubitRefToPython(op.classicalBit)}], ${op.equals})):`,
    ...formatIndentedBlock(op.body, indent + INDENT_UNIT),
  ];
}

/** Formats the integer-valued Python expression a QubitRef denotes. */
function qubitRefToPython(ref: QubitRef): string {
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

function formatAngle(theta: number): string {
  return String(theta);
}
