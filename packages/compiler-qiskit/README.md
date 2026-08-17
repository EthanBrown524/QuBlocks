# @qublocks/compiler-qiskit

Compiles a `QuantumProgram` AST (from `@qublocks/ast-schema`) to Qiskit
(Python) source.

`compileToQiskit(program: QuantumProgram): string` — a pure function, no
I/O. Unlike the OpenQASM 3 backend, this emits plain Python: loops become
real `for i in range(start, end):` statements (Python's `range()` is
already end-exclusive, so no `[start, end)` → `[start:end-1]` compensation
is needed — that translation is specific to OpenQASM's inclusive range
syntax) and subroutines become plain Python functions taking the circuit
and qubit indices as arguments. Because qubit references are just Python
integers passed as function arguments, not a qubit-typed language
construct the way OpenQASM 3's `qubit` parameters are, a `QubitRef`
coefficient/offset on a subroutine parameter is perfectly fine here —
unlike the OpenQASM backend, where it's a compile error.

Golden-tested against the five preset programs, plus gate-set and
edge-case coverage.

This backend's execution-based cross-validation (`ci/cross_validate.py`)
is real, not partial: because the generated Python never goes through
`qiskit.qasm3.loads`, it isn't subject to that parser's gaps around `def`
subroutines or loop-variable-indexed qubits (see `ci/README.md`). The
Bell-pair-factory preset — loop AND subroutine together — is exec()'d
directly and diffed against `@qublocks/simulator`'s statevector, with no
manual-unroll fallback needed.
