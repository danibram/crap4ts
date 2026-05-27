/* crap4ts-disable-next-function */
export function generatedParser(input: string): unknown {
  if (input.startsWith('{')) {
    if (input.endsWith('}')) {
      if (input.length > 2) return JSON.parse(input);
      return {};
    }
  } else if (input.startsWith('[')) {
    if (input.endsWith(']')) return JSON.parse(input);
  }
  return null;
}

export function handWritten(x: number): number {
  return x > 0 ? x : -x;
}
