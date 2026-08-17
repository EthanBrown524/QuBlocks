# @qublocks/compiler-openqasm

Compiles a `QuantumProgram` AST (from `@qublocks/ast-schema`) to OpenQASM 3.

`compileToOpenQasm3(program: QuantumProgram): string` — a pure function,
no I/O. Gates map onto `stdgates.inc` names (`H`→`h`, `CNOT`→`cx`, …);
loops emit a native end-exclusive `for int i in [start:end-1] { ... }`;
subroutines emit `def name(qubit a, qubit b) { ... }` with qubit-typed
parameters (referenced by name inside the body, not by index — a
`QubitRef` coefficient/offset applied to a subroutine parameter is a
compile error, since OpenQASM qubit variables aren't integers).

Golden-tested against the five preset programs (Bell state, GHZ state,
teleportation, Deutsch-Jozsa, and the loop+subroutine Bell-pair factory).

Real cross-validation — executing the generated OpenQASM through an actual
OpenQASM 3 toolchain and diffing against `@qublocks/simulator`'s
statevector — happens in the CI job (`ci/`), not here; these tests only
confirm the compiler is self-consistent, not that a real OpenQASM
interpreter agrees with it. See `ci/README.md` for a confirmed gap in the
current toolchain: `qiskit.qasm3.loads` can't execute `def` subroutines or
loop-variable-indexed qubits at all, so the native emission for programs
using either isn't yet toolchain-verified, only AST-semantics-verified via
a manually unrolled equivalent.
