# @qublocks/compiler-cirq

Compiles a `QuantumProgram` AST (from `@qublocks/ast-schema`) to Cirq
(Python) source.

Status: not yet implemented. Second cross-validation partner (after
Qiskit) — Cirq's API is different enough from Qiskit's to stress-test the
AST's generality, particularly around loop/subroutine lowering.
