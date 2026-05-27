export interface Rule { kind: string; value: number; nested?: Rule[]; }

export function evaluate(rules: Rule[], ctx: Record<string, number>): number {
  let score = 0;
  for (const rule of rules) {
    if (rule.kind === 'add') {
      if (ctx[rule.kind] !== undefined) {
        if (ctx[rule.kind]! > rule.value) {
          score += rule.value;
        } else {
          score += ctx[rule.kind]!;
        }
      }
    } else if (rule.kind === 'mul') {
      if (rule.nested) {
        for (const child of rule.nested) {
          if (child.value > 0 && child.value < 100) score *= child.value;
        }
      }
    }
  }
  return score;
}
