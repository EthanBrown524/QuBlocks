# @qublocks/compiler-qiskit

Compiles a `QuantumProgram` AST (from `@qublocks/ast-schema`) to Qiskit
(Python) source.

Status: not yet implemented. Planned after the OpenQASM backend. Directly
executable, which makes it a cross-validation partner: the CI job in `ci/`
runs the generated script through real Qiskit and diffs the resulting
statevector against `@qublocks/simulator`'s output for the same AST.
