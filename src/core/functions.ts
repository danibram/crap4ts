import {
  type ArrowFunction,
  type ConstructorDeclaration,
  type FunctionDeclaration,
  type FunctionExpression,
  type GetAccessorDeclaration,
  type MethodDeclaration,
  Node,
  type SetAccessorDeclaration,
  type SourceFile,
  SyntaxKind,
} from 'ts-morph';

export type FunctionLike =
  | FunctionDeclaration
  | MethodDeclaration
  | ArrowFunction
  | FunctionExpression
  | ConstructorDeclaration
  | GetAccessorDeclaration
  | SetAccessorDeclaration;

export type ExtractedFunction = {
  node: FunctionLike;
  name: string;
  startLine: number;
  endLine: number;
};

const FUNCTION_KINDS = new Set<SyntaxKind>([
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.ArrowFunction,
  SyntaxKind.FunctionExpression,
  SyntaxKind.Constructor,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
]);

export function extractFunctions(source: SourceFile): ExtractedFunction[] {
  const out: ExtractedFunction[] = [];

  source.forEachDescendant((node) => {
    if (!FUNCTION_KINDS.has(node.getKind())) return;

    const fn = node as FunctionLike;

    // Skip type-only signatures (no body). ts-morph returns `undefined` for
    // ambient declarations like `declare function foo(): void` and overload
    // signatures that have no implementation.
    if (!hasBody(fn)) return;

    const name = resolveName(fn);
    const start = fn.getStartLineNumber();
    const end = fn.getEndLineNumber();
    out.push({ node: fn, name, startLine: start, endLine: end });
  });

  return out;
}

function hasBody(fn: FunctionLike): boolean {
  // GetAccessor / SetAccessor / Constructor always have bodies when present
  // in source (overload signatures are SignatureDeclarations, a different
  // kind, so we never see them here). FunctionDeclaration / MethodDeclaration
  // can be ambient — those return undefined from getBody().
  if (
    Node.isFunctionDeclaration(fn) ||
    Node.isMethodDeclaration(fn)
  ) {
    return fn.getBody() !== undefined;
  }
  return true;
}

function resolveName(fn: FunctionLike): string {
  if (Node.isConstructorDeclaration(fn)) return 'constructor';

  // Named functions / methods / accessors expose getName().
  if (
    Node.isFunctionDeclaration(fn) ||
    Node.isMethodDeclaration(fn) ||
    Node.isGetAccessorDeclaration(fn) ||
    Node.isSetAccessorDeclaration(fn)
  ) {
    const name = fn.getName();
    if (name) return decorateAccessor(fn, name);
  }

  // FunctionExpression may be named: `const x = function foo() {}` → "foo".
  if (Node.isFunctionExpression(fn)) {
    const named = fn.getName();
    if (named) return named;
  }

  // Anonymous arrow / function expression — try to recover a useful name from
  // the parent (variable declaration, property assignment, etc).
  return nameFromContext(fn);
}

function decorateAccessor(fn: FunctionLike, name: string): string {
  if (Node.isGetAccessorDeclaration(fn)) return `get ${name}`;
  if (Node.isSetAccessorDeclaration(fn)) return `set ${name}`;
  return name;
}

function nameFromContext(fn: FunctionLike): string {
  const parent = fn.getParent();
  if (!parent) return '<anonymous>';

  // const foo = () => {}  /  const foo = function () {}
  if (Node.isVariableDeclaration(parent)) {
    return parent.getName();
  }

  // { foo: () => {} }  /  { foo() {} }
  if (Node.isPropertyAssignment(parent) || Node.isPropertyDeclaration(parent)) {
    return parent.getName();
  }

  // foo: () => {} inside a JSX attribute or shorthand — fall through to the
  // grandparent identifier when possible.
  if (Node.isShorthandPropertyAssignment(parent)) {
    return parent.getName();
  }

  // export default () => {}
  if (Node.isExportAssignment(parent)) return 'default';

  // someCall(() => {}) — give it a hint about where it lives.
  return '<anonymous>';
}
