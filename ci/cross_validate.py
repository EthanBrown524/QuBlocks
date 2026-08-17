"""
Execution-based cross-validation: runs OpenQASM 3 source actually emitted
by @qublocks/compiler-openqasm through a real toolchain (qiskit.qasm3 +
Aer) and diffs the resulting statevector against @qublocks/simulator's
TypeScript output for the same AST.

This is what proves the compiler backend is correct, not just
plausible-looking golden-string output — see the two tests below for what
each one actually proves, and where the currently-available toolchain
falls short of proving the whole thing.

Toolchain gap (confirmed by running it, not assumed): qiskit_qasm3_import
0.6.0 — the parser behind `qiskit.qasm3.loads`, and the latest version
available as of writing — rejects `def` subroutine definitions outright
(`SubroutineDefinition is not supported`), and separately cannot resolve
*any* loop-variable-indexed qubit reference, not just arithmetic ones:
even the bare case `for i in [0:2] { x q[i]; }` fails inside its
expression resolver with `TypeError: index must be int, slice or list`.
A native `for` loop with no variable-indexed qubit access *does* parse
and execute correctly, which is what test 1 exploits.

Run: pip install -r ci/requirements.txt && python ci/cross_validate.py
"""

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import qiskit.qasm3 as qasm3
from qiskit_aer import AerSimulator

REPO_ROOT = Path(__file__).resolve().parent.parent
TOLERANCE = 1e-6


def run_ts_generator(script: str) -> dict:
    """Runs a `ci/generate-*.ts` script via tsx and parses its JSON stdout.

    These scripts call the real @qublocks/compiler-openqasm and
    @qublocks/simulator packages directly — the QASM string and
    amplitudes below are genuine compiler/simulator output, not
    hand-copied fixtures.
    """
    result = subprocess.run(
        ["npx", "--yes", "tsx", script],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
        shell=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"{script} failed:\n{result.stderr}")
    return json.loads(result.stdout)


def statevector_from_qasm(qasm_source: str) -> np.ndarray:
    circuit = qasm3.loads(qasm_source)
    circuit.save_statevector()
    sim = AerSimulator(method="statevector")
    result = sim.run(circuit).result()
    return np.array(result.get_statevector(circuit))


def amplitudes_to_array(amplitudes: list) -> np.ndarray:
    return np.array([complex(re, im) for re, im in amplitudes])


def assert_statevectors_close(actual: np.ndarray, expected: np.ndarray, label: str) -> None:
    assert actual.shape == expected.shape, (
        f"{label}: shape mismatch, qiskit={actual.shape} simulator={expected.shape}"
    )
    diff = np.max(np.abs(actual - expected))
    assert diff < TOLERANCE, (
        f"{label}: statevectors differ by {diff} (tolerance {TOLERANCE})\n"
        f"  qiskit/Aer:  {actual}\n"
        f"  simulator:   {expected}"
    )
    print(f"PASS  {label}  (max diff {diff:.2e})")


def test_loop_range_translation_native() -> None:
    """
    Proves, via real execution, that the compiler's native `for` loop
    emission — specifically the [start, end) -> [start:end-1] compensation
    for OpenQASM 3's inclusive range syntax — is correct.

    The AST loops RX(pi/3) on a *fixed* qubit exactly 3 times
    (range: [0, 3)); this is a real discriminating check, not just "does
    it run": 3 applications drives P(measure 1) to exactly 1.0, while the
    off-by-one failure modes (2 or 4 applications) both land at 0.75
    instead, clearly distinguishable from a correct result.

    The emitted OpenQASM (native `for int i in [0:2] { ... }`) is fed to
    qiskit.qasm3.loads + Aer as-is — this exercises the actual compiler
    output, not a hand-written stand-in.
    """
    data = run_ts_generator("ci/generate-loop-only.ts")
    qiskit_sv = statevector_from_qasm(data["qasm"])
    simulator_amps = amplitudes_to_array(data["amplitudes"])
    assert_statevectors_close(
        qiskit_sv,
        simulator_amps,
        "loop-only preset (native for-loop, executed as emitted)",
    )


def test_bell_pair_factory_semantics_via_manual_unroll() -> None:
    """
    Proves the *meaning* of the loop+subroutine Bell-pair-factory preset —
    the QubitRef coefficient/offset qubit-arg mapping and the subroutine
    call semantics — matches real quantum mechanics.

    IMPORTANT CAVEAT: this does NOT validate that Qiskit can execute the
    native `def`/`for` OpenQASM the compiler actually emits for this
    program. qiskit_qasm3_import 0.6.0 cannot parse `def` at all, and
    cannot resolve a loop-variable-indexed qubit reference either — both
    confirmed by direct testing (see module docstring), not assumed. So
    this test instead hand-unrolls an equivalent circuit (3 independent
    Bell pairs on qubits (0,1), (2,3), (4,5), with literal indices, no
    for/def) and diffs *that* against the simulator's real output for the
    unmodified AST. A passing result here does not mean the native
    for/def syntax is toolchain-verified — that remains an open gap until
    a parser that supports OpenQASM 3 subroutines/dynamic qubit indexing
    is available.
    """
    data = run_ts_generator("ci/generate-bell-pair-factory.ts")
    simulator_amps = amplitudes_to_array(data["amplitudes"])

    manually_unrolled_qasm = """OPENQASM 3;
include "stdgates.inc";

qubit[6] q;

h q[0];
cx q[0], q[1];
h q[2];
cx q[2], q[3];
h q[4];
cx q[4], q[5];
"""
    qiskit_sv = statevector_from_qasm(manually_unrolled_qasm)
    assert_statevectors_close(
        qiskit_sv,
        simulator_amps,
        "Bell-pair-factory preset (AST semantics only, via manual unroll -- "
        "native def/for emission is NOT toolchain-verified by this test)",
    )


if __name__ == "__main__":
    tests = [test_loop_range_translation_native, test_bell_pair_factory_semantics_via_manual_unroll]
    failures = 0
    for test in tests:
        try:
            test()
        except Exception as exc:  # noqa: BLE001 - report and continue to run remaining tests
            failures += 1
            print(f"FAIL  {test.__name__}: {exc}")
    if failures:
        sys.exit(1)
