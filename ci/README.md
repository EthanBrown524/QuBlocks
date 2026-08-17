# ci/

`cross_validate.py` installs Qiskit/Aer in Python, executes OpenQASM 3
actually emitted by `@qublocks/compiler-openqasm` (via the
`generate-*.ts` scripts, run with `npx tsx`), and diffs the resulting
statevector against `@qublocks/simulator`'s TypeScript output for the
same AST.

This is CI-only — it never ships and never runs in the browser. It's what
proves the compiler backends are correct rather than merely
plausible-looking.

## Known toolchain gap

`qiskit_qasm3_import` 0.6.0 (the parser behind `qiskit.qasm3.loads`, and
the latest version available as of writing) cannot execute two of the
constructs our compiler emits natively:

- `def` subroutine definitions — rejected outright
  (`SubroutineDefinition is not supported`)
- Any loop-variable-indexed qubit reference — fails even on the simplest
  case, `for i in [0:2] { x q[i]; }` (`TypeError: index must be int,
  slice or list`), not just the arithmetic (`2*i+1`) our compiler emits

Both were confirmed by actually running them, not inferred from docs. A
native `for` loop that doesn't index qubits by the loop variable *does*
parse and execute correctly — `cross_validate.py`'s first test exploits
exactly that to give real execution-based proof of the compiler's
end-exclusive-range-to-OpenQASM-inclusive-range translation
(`[start, end)` → `[start:end-1]`).

The loop+subroutine Bell-pair-factory preset, which does use both `def`
and variable-indexed qubits, is instead cross-validated against a
manually unrolled equivalent circuit — see the docstring on
`test_bell_pair_factory_semantics_via_manual_unroll` in
`cross_validate.py` for exactly what that does and doesn't prove. The
native `def`/`for` OpenQASM this compiler emits for programs that use
subroutines remains unverified against any real toolchain; that gap
should be revisited once a more complete OpenQASM 3 parser is available
(candidates worth investigating: Amazon Braket's local simulator, or a
future qiskit-qasm3-import release).

## Running locally

```bash
pip install -r ci/requirements.txt
python ci/cross_validate.py
```

Requires `npx` (Node/npm) on `PATH` — the generator scripts run via `npx
tsx`.
