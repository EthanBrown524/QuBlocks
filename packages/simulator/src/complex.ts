export interface Complex {
  re: number;
  im: number;
}

export const complex = (re: number, im = 0): Complex => ({ re, im });

export const cAdd = (a: Complex, b: Complex): Complex => ({
  re: a.re + b.re,
  im: a.im + b.im,
});

export const cMul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});

export const cScale = (a: Complex, k: number): Complex => ({
  re: a.re * k,
  im: a.im * k,
});

export const cAbs2 = (a: Complex): number => a.re * a.re + a.im * a.im;

export const ZERO: Complex = complex(0, 0);
export const ONE: Complex = complex(1, 0);
