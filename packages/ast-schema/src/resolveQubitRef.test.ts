import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolveQubitRef } from "./resolveQubitRef.js";

describe("resolveQubitRef", () => {
  it("returns a literal index unchanged, regardless of bindings", () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.dictionary(fc.string(), fc.integer()),
        (n, bindings) => {
          expect(resolveQubitRef(n, bindings)).toBe(n);
        }
      )
    );
  });

  it("resolves a bare variable reference to its bound value", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.integer(), (name, value) => {
        expect(resolveQubitRef({ var: name }, { [name]: value })).toBe(value);
      })
    );
  });

  it("applies coefficient and offset as value * coefficient + offset", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: -10, max: 10 }),
        fc.integer({ min: -100, max: 100 }),
        (name, value, coefficient, offset) => {
          const ref = { var: name, coefficient, offset };
          expect(resolveQubitRef(ref, { [name]: value })).toBe(
            value * coefficient + offset
          );
        }
      )
    );
  });

  it("defaults a missing coefficient to 1 and a missing offset to 0", () => {
    expect(resolveQubitRef({ var: "i" }, { i: 5 })).toBe(5);
    expect(resolveQubitRef({ var: "i", offset: 3 }, { i: 5 })).toBe(8);
    expect(resolveQubitRef({ var: "i", coefficient: 2 }, { i: 5 })).toBe(10);
  });

  it("throws for an unbound variable", () => {
    expect(() => resolveQubitRef({ var: "missing" }, {})).toThrow();
  });

  it("reproduces the Bell-pair-loop index scheme: coefficient 2, offsets 0 and 1", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (i) => {
        const a = resolveQubitRef({ var: "i", coefficient: 2 }, { i });
        const b = resolveQubitRef({ var: "i", coefficient: 2, offset: 1 }, { i });
        expect(a).toBe(2 * i);
        expect(b).toBe(2 * i + 1);
        expect(b).toBe(a + 1);
      })
    );
  });
});
