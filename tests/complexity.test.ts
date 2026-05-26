import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { cyclomaticComplexity } from '../src/core/complexity.js';
import { extractFunctions } from '../src/core/functions.js';

function complexityOf(src: string): Record<string, number> {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile('test.ts', src);
  const out: Record<string, number> = {};
  for (const fn of extractFunctions(file)) {
    out[fn.name] = cyclomaticComplexity(fn.node);
  }
  return out;
}

describe('cyclomaticComplexity', () => {
  it('returns 1 for a straight-line function', () => {
    const result = complexityOf(`
      function noop() {
        return 42;
      }
    `);
    expect(result.noop).toBe(1);
  });

  it('counts if statements', () => {
    const result = complexityOf(`
      function f(x: number) {
        if (x > 0) return 1;
        if (x < 0) return -1;
        return 0;
      }
    `);
    expect(result.f).toBe(3);
  });

  it('does not double-count else (else is not a decision)', () => {
    const result = complexityOf(`
      function f(x: number) {
        if (x > 0) return 1;
        else return 0;
      }
    `);
    expect(result.f).toBe(2);
  });

  it('counts each case clause, not default', () => {
    const result = complexityOf(`
      function f(x: number) {
        switch (x) {
          case 1: return 'a';
          case 2: return 'b';
          case 3: return 'c';
          default: return 'z';
        }
      }
    `);
    expect(result.f).toBe(4); // 1 + 3 case clauses
  });

  it('counts ternaries, &&, ||, ??', () => {
    const result = complexityOf(`
      function f(a: any, b: any, c: any) {
        return (a && b) || (c ? 1 : 2) ?? 0;
      }
    `);
    // 1 + (&&) + (||) + (?:) + (??) = 5
    expect(result.f).toBe(5);
  });

  it('does not count optional chaining `?.`', () => {
    const result = complexityOf(`
      function f(a: { b?: { c?: number } }) {
        return a?.b?.c;
      }
    `);
    expect(result.f).toBe(1);
  });

  it('counts all loop kinds', () => {
    const result = complexityOf(`
      function f(xs: number[]) {
        for (let i = 0; i < xs.length; i++) {}
        for (const x of xs) {}
        for (const k in xs) {}
        while (xs.length > 0) xs.pop();
        do { xs.pop(); } while (xs.length > 0);
      }
    `);
    expect(result.f).toBe(6); // 1 + 5 loops
  });

  it('counts catch clauses', () => {
    const result = complexityOf(`
      function f() {
        try { doIt(); } catch (e) { handle(e); }
      }
    `);
    expect(result.f).toBe(2);
  });

  it('does NOT attribute nested-function decisions to the outer function', () => {
    const result = complexityOf(`
      function outer(xs: number[]) {
        if (xs.length === 0) return [];
        return xs.map((x) => {
          if (x > 0) return x * 2;
          if (x < 0) return -x;
          return 0;
        });
      }
    `);
    expect(result.outer).toBe(2); // only its own `if`
    expect(result['<anonymous>']).toBe(3); // the inner arrow has 2 ifs
  });

  it('recovers names from variable declarations for arrows', () => {
    const result = complexityOf(`
      const handler = (x: number) => (x > 0 ? 'pos' : 'neg');
    `);
    expect(result.handler).toBe(2);
  });

  it('handles class methods, accessors, and constructors', () => {
    const result = complexityOf(`
      class Foo {
        constructor(private value: number) {
          if (value < 0) throw new Error('nope');
        }
        get doubled() {
          return this.value * 2;
        }
        set doubled(v: number) {
          if (v % 2 !== 0) throw new Error('must be even');
          this.value = v / 2;
        }
        compute(x: number): number {
          return x > 0 && this.value > 0 ? x * this.value : 0;
        }
      }
    `);
    expect(result.constructor).toBe(2);
    expect(result['get doubled']).toBe(1);
    expect(result['set doubled']).toBe(2);
    expect(result.compute).toBe(3); // 1 + && + ?:
  });

  it('ignores ambient / overload signatures without bodies', () => {
    const result = complexityOf(`
      declare function fetcher(url: string): Promise<string>;
      function over(x: number): string;
      function over(x: string): number;
      function over(x: any): any {
        if (typeof x === 'number') return String(x);
        return Number(x);
      }
    `);
    expect(Object.keys(result)).toEqual(['over']);
    expect(result.over).toBe(2);
  });
});
