/**
 * Emits, for the quantum teleportation preset program:
 *   - the Qiskit (Python) source produced by @qublocks/compiler-qiskit
 *   - the simulator's statevector for one specific measurement branch
 * as JSON on stdout.
 *
 * The teleportation preset measures two qubits mid-circuit and branches
 * on the results (ConditionalOp) — genuinely random per execution. To
 * cross-validate against a real Aer run of the SAME branch (rather than
 * two independent random branches that happen not to match), this script
 * takes the two measurement outcomes as CLI args and forces the
 * simulator's RNG to reproduce that exact branch. The compiled Qiskit
 * source itself doesn't depend on the branch — only which classical
 * outcome occurs at runtime does — so `source` is unaffected by the args.
 *
 * Run via `npx tsx ci/generate-qiskit-teleportation.ts <m0> <m1>`, where
 * m0/m1 are the desired 0/1 outcomes for the two measurements, in the
 * order they appear in the program (qubit 0's measurement, then qubit 1's).
 */
import type { QuantumProgram } from "@qublocks/ast-schema";
import { compileToQiskit } from "@qublocks/compiler-qiskit";
import { run } from "@qublocks/simulator";

const [m0Arg, m1Arg] = process.argv.slice(2);
const forcedOutcomes = [Number(m0Arg), Number(m1Arg)];
if (forcedOutcomes.some((v) => v !== 0 && v !== 1)) {
  throw new Error("usage: generate-qiskit-teleportation.ts <m0:0|1> <m1:0|1>");
}

const program: QuantumProgram = {
  qubitCount: 3,
  classicalBitCount: 2,
  parameters: [],
  subroutines: [],
  body: [
    { kind: "gate", gate: "H", qubits: [0] },
    { kind: "gate", gate: "H", qubits: [1] },
    { kind: "gate", gate: "CNOT", qubits: [1, 2] },
    { kind: "gate", gate: "CNOT", qubits: [0, 1] },
    { kind: "gate", gate: "H", qubits: [0] },
    { kind: "measure", qubit: 0, classicalBit: 0 },
    { kind: "measure", qubit: 1, classicalBit: 1 },
    {
      kind: "conditional",
      classicalBit: 1,
      equals: 1,
      body: [{ kind: "gate", gate: "X", qubits: [2] }],
    },
    {
      kind: "conditional",
      classicalBit: 0,
      equals: 1,
      body: [{ kind: "gate", gate: "Z", qubits: [2] }],
    },
  ],
};

const source = compileToQiskit(program);

// Forces collapse()'s outcome deterministically: since outcome is chosen
// via `rng() < p1`, returning 0 forces outcome=1 (true for any p1 > 0)
// and returning a value > 1 forces outcome=0. Only valid for branches
// that are actually reachable (nonzero probability) for this program,
// which is guaranteed here since the (m0, m1) args come from real Aer
// executions of the same circuit.
let callIndex = 0;
function forcedRng(): number {
  const desired = forcedOutcomes[callIndex++];
  return desired === 1 ? 0 : 1.1;
}

const { amplitudes, classicalBits } = run(program, forcedRng);

process.stdout.write(
  JSON.stringify({
    source,
    qubitCount: program.qubitCount,
    amplitudes: amplitudes.map((c) => [c.re, c.im]),
    classicalBits,
  })
);
