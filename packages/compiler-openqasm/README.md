# @qublocks/compiler-openqasm

Compiles a `QuantumProgram` AST (from `@qublocks/ast-schema`) to OpenQASM 3.

Status: not yet implemented. Planned first, per the phased build order in
the project design doc, since OpenQASM 3 has native support for loops and
classical control and is the simplest text target — a good place to
establish the `AST -> string` compiler-backend pattern before Qiskit/Cirq.

Each backend is a pure function `AST -> string`, unit-testable with golden
tests against the preset programs (Bell state, GHZ state, teleportation,
Deutsch-Jozsa, and the loop+subroutine Bell-pair-factory program).
