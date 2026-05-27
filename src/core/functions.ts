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
  // `/* crap4ts-disable-file */` (or `// crap4ts-disable`) anywhere in the
  // first ~10 lines suppresses the whole file — the in-source equivalent of
  // adding the file to --ignore.
  if (isFileDisabled(source)) return [];

  const out: ExtractedFunction[] = [];

  source.forEachDescendant((node) => {
    if (!FUNCTION_KINDS.has(node.getKind())) return;

    const fn = node as FunctionLike;

    // Skip type-only signatures (no body). ts-morph returns `undefined` for
    // ambient declarations like `declare function foo(): void` and overload
    // signatures that have no implementation.
    if (!hasBody(fn)) return;

    // `/* crap4ts-disable-next-function */` (or -next-line) on the line(s)
    // immediately above suppresses just this function — surgical opt-out
    // without touching config or --allow.
    if (hasDisableComment(fn)) return;

    const name = resolveName(fn);
    const start = fn.getStartLineNumber();
    const end = fn.getEndLineNumber();
    out.push({ node: fn, name, startLine: start, endLine: end });
  });

  return out;
}

const DISABLE_NEXT = /crap4ts-disable-(next-function|next-line)/;
// Matches `crap4ts-disable` or `crap4ts-disable-file` but NOT
// `crap4ts-disable-next-*` (negative lookahead on a trailing hyphen/word char).
const DISABLE_FILE = /crap4ts-disable(-file)?(?![-\w])/;

function hasDisableComment(fn: FunctionLike): boolean {
  // Leading comments attach to the outermost declaration. For arrow/function
  // expressions assigned to a variable, the comment sits on the variable
  // statement, so we check the nearest statement ancestor too.
  const targets = [fn, fn.getParent(), fn.getParent()?.getParent()];
  for (const t of targets) {
    if (!t) continue;
    for (const range of t.getLeadingCommentRanges()) {
      if (DISABLE_NEXT.test(range.getText())) return true;
    }
  }
  return false;
}

function isFileDisabled(source: SourceFile): boolean {
  // Cheap scan of the first 400 chars — disable-file pragmas live at the top.
  return DISABLE_FILE.test(source.getFullText().slice(0, 400));
}

function hasBody(fn: FunctionLike): boolean {
  // GetAccessor / SetAccessor / Constructor always have bodies when present
  // in source (overload signatures are SignatureDeclarations, a different
  // kind, so we never see them here). FunctionDeclaration / MethodDeclaration
  // can be ambient — those return undefined from getBody().
  if (Node.isFunctionDeclaration(fn) || Node.isMethodDeclaration(fn)) {
    return fn.getBody() !== undefined;
  }
  return true;
}

function resolveName(fn: FunctionLike): string {
  const scope = enclosingClassName(fn);
  const prefix = scope ? `${scope}.` : '';

  if (Node.isConstructorDeclaration(fn)) return `${prefix}constructor`;

  // Named functions / methods / accessors expose getName().
  if (
    Node.isFunctionDeclaration(fn) ||
    Node.isMethodDeclaration(fn) ||
    Node.isGetAccessorDeclaration(fn) ||
    Node.isSetAccessorDeclaration(fn)
  ) {
    const name = fn.getName();
    // Only methods/accessors get the class prefix; a plain function
    // declaration nested in a class body (rare) keeps its bare name.
    if (name) {
      const decorated = decorateAccessor(fn, name);
      return Node.isFunctionDeclaration(fn)
        ? decorated
        : `${prefix}${decorated}`;
    }
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

/**
 * Walk up to the nearest class declaration/expression and return its name.
 * Qualifying `render` as `UserCard.render` makes reports readable and keeps
 * two same-named methods in one file distinct in the --baseline diff (they
 * used to collide on the `file::name` key). Anonymous classes fall back to
 * the variable they're assigned to; failing that, no prefix.
 */
function enclosingClassName(fn: FunctionLike): string | undefined {
  // Methods/accessors are direct children of a class body, so the nearest
  // class ancestor is unambiguously theirs (true for nested classes too).
  let node: Node | undefined = fn.getParent();
  while (node) {
    if (Node.isClassDeclaration(node) || Node.isClassExpression(node)) {
      const name = node.getName();
      if (name) return name;
      // `const Foo = class { ... }` — recover the binding name.
      const parent = node.getParent();
      if (parent && Node.isVariableDeclaration(parent)) return parent.getName();
      return undefined;
    }
    node = node.getParent();
  }
  return undefined;
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
