"""
Execution-based cross-validation: runs code actually emitted by the
compiler backends through a real toolchain (Qiskit + Aer) and diffs the
resulting statevector against @qublocks/simulator's TypeScript output for
the same AST. This is what proves a compiler backend is correct, not just
plausible-looking golden-string output.

Two backends are covered, with very different levels of confidence:

OpenQASM 3 backend (tests 1-2) — goes through qiskit.qasm3.loads, whose
underlying parser (qiskit_qasm3_import 0.6.0, the latest version
available as of writing) has real, confirmed gaps: it rejects `def`
subroutine definitions outright (`SubroutineDefinition is not
supported`), and separately cannot resolve *any* loop-variable-indexed
qubit reference, not just arithmetic ones — even the bare case
`for i in [0:2] { x q[i]; }` fails inside its expression resolver with
`TypeError: index must be int, slice or list`. A native `for` loop with
no variable-indexed qubit access *does* parse and execute correctly,
which is what test 1 exploits; test 2 falls back to a manually unrolled
equivalent since the importer can't run the compiler's actual `def`/`for`
output for that preset. See each test's docstring for exactly what it
does and doesn't prove.

Qiskit (Python) backend (tests 3-4) — emits plain Python (real `for`
statements, real functions for subroutines, real `with qc.if_test(...)`
conditionals), so it never goes through qiskit_qasm3_import at all and
isn't subject to either gap above. Test 3 executes the compiler's actual
output — loop AND subroutine together, in one program — via exec() + Aer,
with no fallback/unroll needed. Test 4 does the same for the
classically-controlled conditional construct (measure, then branch),
exercised by the teleportation preset: since the measurement outcome is
genuinely random per execution, it forces the TypeScript simulator to
reproduce whichever branch Aer actually measured (rather than comparing
two independently-random branches that would only agree by chance), and
checks all 4 possible branches so a correction bug specific to one branch
can't hide.

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


def run_ts_generator(script: str, *args: str) -> dict:
    """Runs a `ci/generate-*.ts` script via tsx and parses its JSON stdout.

    These scripts call the real @qublocks/compiler-openqasm,
    @qublocks/compiler-qiskit, and @qublocks/simulator packages directly —
    the source strings and amplitudes below are genuine compiler/simulator
    output, not hand-copied fixtures.
    """
    result = subprocess.run(
        ["npx", "--yes", "tsx", script, *args],
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


def statevector_from_qiskit_python_source(source: str) -> np.ndarray:
    """Executes Qiskit (Python) source emitted by @qublocks/compiler-qiskit
    and returns the resulting statevector. The source is expected to
    define a module-level `qc` QuantumCircuit variable (which is exactly
    what compileToQiskit emits)."""
    namespace: dict = {}
    exec(source, namespace)  # noqa: S102 - executing our own compiler's output, not untrusted input
    circuit = namespace["qc"]
    circuit.save_statevector()
    sim = AerSimulator(method="statevector")
    result = sim.run(circuit).result()
    return np.array(result.get_statevector(circuit))


def amplitudes_to_array(amplitudes: list) -> np.ndarray:
    return np.array([complex(re, im) for re, im in amplitudes])


def run_qiskit_python_source_once(source: str) -> tuple[np.ndarray, list]:
    """Executes Qiskit (Python) source for exactly one shot and returns
    (statevector, classical_bits), where classical_bits[i] is the outcome
    of classical bit i for that single run. shots=1 is essential here:
    with the default (1024), get_statevector/get_counts don't correspond
    to the same single measurement branch, which would make the branch
    the statevector reflects ambiguous."""
    namespace: dict = {}
    exec(source, namespace)  # noqa: S102 - executing our own compiler's output, not untrusted input
    circuit = namespace["qc"]
    circuit.save_statevector()
    sim = AerSimulator(method="statevector")
    result = sim.run(circuit, shots=1).result()
    sv = np.array(result.get_statevector(circuit))
    bitstring = next(iter(result.get_counts(circuit)))
    num_bits = circuit.num_clbits
    classical_bits = [int(bitstring[num_bits - 1 - i]) for i in range(num_bits)]
    return sv, classical_bits


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

    CAVEAT: the loop body here deliberately applies its gate to a *fixed*
    qubit (not indexed by the loop variable), specifically to sidestep the
    qiskit_qasm3_import limitation documented on the test below — it can't
    resolve ANY loop-variable-indexed qubit reference, regardless of
    whether the index is correct. So this test proves the for-loop
    range/bound translation via real execution, but proves nothing about
    variable-indexed qubit emission (the `q[2*i+1]`-style expressions the
    compiler emits for the Bell-pair-factory preset below). That construct
    is currently golden-string-verified only (see
    packages/compiler-openqasm/src/index.test.ts) — not execution-verified
    against any real toolchain.
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


def test_qiskit_backend_loop_and_subroutine_native() -> None:
    """
    Proves, via real execution, that @qublocks/compiler-qiskit's native
    loop AND subroutine emission are BOTH correct together, for the same
    Bell-pair-factory preset that the OpenQASM backend could only
    partially validate above.

    This backend emits plain Python — a real `for i in range(start, end):`
    statement (Python's range() is already end-exclusive, so unlike the
    OpenQASM backend there's no [start, end) -> [start:end-1] translation
    to get wrong) and a real Python function for the subroutine. Neither
    goes through qiskit_qasm3_import, so neither of that parser's gaps
    (no `def` support, no loop-variable-indexed qubits) applies here. The
    compiler's actual generated source is exec()'d directly and run
    through Aer — no manual unroll, no fallback.
    """
    data = run_ts_generator("ci/generate-qiskit-bell-pair-factory.ts")
    qiskit_sv = statevector_from_qiskit_python_source(data["source"])
    simulator_amps = amplitudes_to_array(data["amplitudes"])
    assert_statevectors_close(
        qiskit_sv,
        simulator_amps,
        "Qiskit backend: Bell-pair-factory preset (native loop + subroutine, executed as emitted)",
    )


def test_teleportation_conditional_native() -> None:
    """
    Proves, via real execution, that @qublocks/compiler-qiskit's
    classically-controlled conditional emission (`with qc.if_test(...)`)
    is correct — the same rigor just applied to loop+subroutine above,
    now for the construct the teleportation preset exercises: measure,
    then branch on the classical result.

    Teleportation's measurement outcomes are genuinely random per
    execution, so a single Aer run can't be diffed against a single
    simulator run the way the deterministic Bell-pair-factory case could
    — two independent random branches would only match by chance. Instead:
    for each of several Aer seeds (shots=1, so exactly one classical
    outcome per run), the actual (m0, m1) branch Aer measured is read back
    from qc's classical bits, and @qublocks/simulator is forced (via
    ci/generate-qiskit-teleportation.ts's CLI args) to reproduce that same
    branch deterministically. That gives an exact, same-branch statevector
    diff, not just a physical-plausibility check — real toolchain proof,
    not a coincidence of matching seeds.

    Runs enough attempts to observe all 4 branches (m0, m1) in
    {0, 1} x {0, 1} — teleportation's whole point is that the classical
    correction fixes the state on every branch, so a bug that only
    corrupts one branch (e.g. only the X correction, or only the Z
    correction) would otherwise go unnoticed. Each branch should occur
    with ~25% probability (coupon collector's problem puts the expected
    number of attempts to see all 4 at ~8-10), so MAX_ATTEMPTS gives a
    wide safety margin — P(missing a specific branch after MAX_ATTEMPTS
    independent draws at p=0.25) is astronomically small — while still
    bounding worst-case runtime: an unreachable branch (a real bug this
    test exists to catch — e.g. a conditional whose classicalBit index
    got swapped, making one branch impossible) fails with a specific
    message naming it, rather than hanging CI until the job timeout.

    NOT checked: that the 4 branches occur with roughly equal frequency.
    The loop above exits as soon as all 4 have been seen once (typically
    ~10-15 attempts) to keep the test fast; that sample is far too small
    to distinguish "uniform" from "skewed" without either a much larger
    fixed sample (adding real CI time for a property the coverage check
    above already mostly protects against) or a tolerance loose enough to
    be nearly meaningless. Left out to avoid trading a flaky assertion
    for marginal extra coverage.
    """
    # The compiled source doesn't depend on the branch — fetch it once,
    # then run it repeatedly through Aer (each run samples its own random
    # branch) rather than re-invoking the TS generator per attempt.
    source = run_ts_generator("ci/generate-qiskit-teleportation.ts", "0", "0")["source"]

    branches_needed = {(0, 0), (0, 1), (1, 0), (1, 1)}
    seen_branches: dict = {}
    attempts = 0
    MAX_ATTEMPTS = 300
    while branches_needed - seen_branches.keys() and attempts < MAX_ATTEMPTS:
        sv, classical_bits = run_qiskit_python_source_once(source)
        branch = (classical_bits[0], classical_bits[1])
        if branch not in seen_branches:
            seen_branches[branch] = sv
        attempts += 1

    missing = branches_needed - seen_branches.keys()
    if missing:
        missing_desc = ", ".join(f"(m0={m0}, m1={m1})" for m0, m1 in sorted(missing))
        raise AssertionError(
            f"branch(es) {missing_desc} never observed across {attempts} Aer runs "
            f"(saw only {sorted(seen_branches.keys())}) — teleportation's classical "
            f"correction should reach all 4 branches with ~25% probability each, so "
            f"this points to a real bug (e.g. a swapped classicalBit index making a "
            f"branch unreachable), not bad luck"
        )

    for (m0, m1), qiskit_sv in seen_branches.items():
        data = run_ts_generator("ci/generate-qiskit-teleportation.ts", str(m0), str(m1))
        assert data["classicalBits"] == [m0, m1], (
            f"forced simulator branch mismatch: asked for {(m0, m1)}, got {data['classicalBits']}"
        )
        simulator_amps = amplitudes_to_array(data["amplitudes"])
        assert_statevectors_close(
            qiskit_sv,
            simulator_amps,
            f"Qiskit backend: teleportation preset, branch (m0={m0}, m1={m1}) (native conditional, executed as emitted)",
        )


if __name__ == "__main__":
    tests = [
        test_loop_range_translation_native,
        test_bell_pair_factory_semantics_via_manual_unroll,
        test_qiskit_backend_loop_and_subroutine_native,
        test_teleportation_conditional_native,
    ]
    failures = 0
    for test in tests:
        try:
            test()
        except Exception as exc:  # noqa: BLE001 - report and continue to run remaining tests
            failures += 1
            print(f"FAIL  {test.__name__}: {exc}")
    if failures:
        sys.exit(1)
