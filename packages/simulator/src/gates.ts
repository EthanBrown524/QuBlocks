import type { GateName } from "@qublocks/ast-schema";
import { complex, type Complex } from "./complex.js";

/** Row-major 2x2 unitary: [[m00, m01], [m10, m11]]. */
export type Matrix2 = [Complex, Complex, Complex, Complex];

const SQRT1_2 = Math.SQRT1_2;

/**
 * Single-qubit gate matrices for the MVP gate set. CNOT/CZ/SWAP/CCX are
 * expressed as X/Z applied under control rather than as standalone matrices.
 */
export function singleQubitMatrix(gate: GateName, params?: number[]): Matrix2 {
  switch (gate) {
    case "H":
      return [
        complex(SQRT1_2),
        complex(SQRT1_2),
        complex(SQRT1_2),
        complex(-SQRT1_2),
      ];
    case "X":
      return [complex(0), complex(1), complex(1), complex(0)];
    case "Y":
      return [complex(0), complex(0, -1), complex(0, 1), complex(0)];
    case "Z":
      return [complex(1), complex(0), complex(0), complex(-1)];
    case "S":
      return [complex(1), complex(0), complex(0), complex(0, 1)];
    case "T":
      return [
        complex(1),
        complex(0),
        complex(0),
        complex(Math.cos(Math.PI / 4), Math.sin(Math.PI / 4)),
      ];
    case "RX": {
      const theta = params?.[0] ?? 0;
      const c = Math.cos(theta / 2);
      const s = Math.sin(theta / 2);
      return [complex(c), complex(0, -s), complex(0, -s), complex(c)];
    }
    case "RY": {
      const theta = params?.[0] ?? 0;
      const c = Math.cos(theta / 2);
      const s = Math.sin(theta / 2);
      return [complex(c), complex(-s), complex(s), complex(c)];
    }
    case "RZ": {
      const theta = params?.[0] ?? 0;
      return [
        complex(Math.cos(-theta / 2), Math.sin(-theta / 2)),
        complex(0),
        complex(0),
        complex(Math.cos(theta / 2), Math.sin(theta / 2)),
      ];
    }
    default:
      throw new Error(`${gate} is not a single-qubit gate`);
  }
}

/** Conjugate transpose of a 2x2 matrix, used to build inverse gates for round-trip tests. */
export function adjoint2(m: Matrix2): Matrix2 {
  const conj = (c: Complex): Complex => complex(c.re, -c.im);
  return [conj(m[0]), conj(m[2]), conj(m[1]), conj(m[3])];
}

export const CONTROLLED_GATES = new Set<GateName>(["CNOT", "CZ", "SWAP", "CCX"]);
