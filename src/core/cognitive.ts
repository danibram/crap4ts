import { type IfStatement, Node, SyntaxKind } from 'ts-morph';
import type { FunctionLike } from './functions.js';

/**
 * Cognitive Complexity (Campbell / SonarSource, 2017).
 *
 * Where cyclomatic complexity counts independent paths, cognitive complexity
 * estimates how hard code is for a human to *follow*. The rules that matter:
 *
 *   - **Nesting is penalised.** A branch inside two loops costs more than a
 *     top-level branch: each flow-control structure adds `1 + nesting`, and
 *     deepens the nesting level for everything inside it.
 *   - **Boolean sequences count once.** `a && b && c` is +1; `a && b || c` is
 *     +2 — each switch of operator opens a new sequence.
 *   - **`else` / `else if` are flat.** +1 each, no nesting penalty — they're
 *     alternatives at the same mental level, not deeper structure.
 *   - **`switch` is +1 total**, not once-per-case — a jump table reads as one
 *     decision.
 *
 * Reference: https://www.sonarsource.com/docs/CognitiveComplexity.pdf
 *
 * Not modelled (yet): the +1 for recursive self-calls. It needs name
 * resolution and is low-signal next to the nesting rules. Noted in the README.
 *
 * Fed into the CRAP formula when `--complexity cognitive` is set. That's a
 * crap4ts extension — canonical C.R.A.P. is defined over cyclomatic — but
 * cognitive tracks human-perceived risk better for deeply nested code.
 */
export function cognitiveComplexity(fn: FunctionLike): number {
  const body = getBody(fn);
  if (!body) return 0;

  let score = 0;

  // Process a node *including itself*, then descend.
  const handle = (node: Node, nesting: number): void => {
    if (isFunctionNode(node)) {
      // A nested function adds no increment of its own, but its contents are
      // one level deeper (closures read as nested structure).
      visitChildren(node, nesting + 1);
      return;
    }

    if (Node.isIfStatement(node)) {
      handleIfChain(node, nesting);
      return;
    }

    const kind = node.getKind();
    if (NESTING_STRUCTURES.has(kind)) {
      score += 1 + nesting;
      visitChildren(node, nesting + 1);
      return;
    }

    if (Node.isBinaryExpression(node)) {
      score += booleanSequenceCost(node);
      visitChildren(node, nesting);
      return;
    }

    visitChildren(node, nesting);
  };

  const visitChildren = (node: Node, nesting: number): void => {
    node.forEachChild((child) => handle(child, nesting));
  };

  // if / else if / else is one chain at a single nesting level: the leading
  // `if` charges `1 + nesting`, every `else`/`else if` charges a flat +1, and
  // each branch body descends one level.
  const handleIfChain = (ifNode: IfStatement, nesting: number): void => {
    score += 1 + nesting;
    handle(ifNode.getExpression(), nesting); // condition's boolean operators
    handle(ifNode.getThenStatement(), nesting + 1);

    let elseStmt = ifNode.getElseStatement();
    while (elseStmt) {
      if (Node.isIfStatement(elseStmt)) {
        score += 1; // `else if` — flat, no nesting penalty
        handle(elseStmt.getExpression(), nesting);
        handle(elseStmt.getThenStatement(), nesting + 1);
        elseStmt = elseStmt.getElseStatement();
      } else {
        score += 1; // `else` — flat
        handle(elseStmt, nesting + 1);
        elseStmt = undefined;
      }
    }
  };

  visitChildren(body, 0);
  return score;
}

// `if` is handled separately (else-chain logic), so it's NOT in this set.
const NESTING_STRUCTURES = new Set<SyntaxKind>([
  SyntaxKind.ForStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.WhileStatement,
  SyntaxKind.DoStatement,
  SyntaxKind.CatchClause,
  SyntaxKind.ConditionalExpression,
  SyntaxKind.SwitchStatement,
]);

/**
 * Cost of a boolean-operator chain, counted at the chain's root only.
 * `a && b && c` → 1; `a && b || c` → 2 (one extra per operator alternation).
 * Returns 0 for inner nodes of a chain so the root accounts for the whole run.
 */
function booleanSequenceCost(node: Node): number {
  if (!Node.isBinaryExpression(node)) return 0;
  const op = node.getOperatorToken().getKind();
  if (!isLogicalOp(op)) return 0;

  const parent = node.getParent();
  if (
    parent &&
    Node.isBinaryExpression(parent) &&
    isLogicalOp(parent.getOperatorToken().getKind())
  ) {
    return 0; // inner node — the root will account for this chain
  }

  let cost = 1;
  let lastOp: SyntaxKind | undefined;
  const stack: Node[] = [node];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (!Node.isBinaryExpression(cur)) continue;
    const curOp = cur.getOperatorToken().getKind();
    if (!isLogicalOp(curOp)) continue;
    if (lastOp !== undefined && curOp !== lastOp) cost += 1;
    lastOp = curOp;
    stack.push(cur.getLeft(), cur.getRight());
  }
  return cost;
}

function isLogicalOp(op: SyntaxKind): boolean {
  return (
    op === SyntaxKind.AmpersandAmpersandToken ||
    op === SyntaxKind.BarBarToken ||
    op === SyntaxKind.QuestionQuestionToken
  );
}

function isFunctionNode(node: Node): boolean {
  const kind = node.getKind();
  return (
    kind === SyntaxKind.FunctionDeclaration ||
    kind === SyntaxKind.FunctionExpression ||
    kind === SyntaxKind.ArrowFunction ||
    kind === SyntaxKind.MethodDeclaration ||
    kind === SyntaxKind.Constructor ||
    kind === SyntaxKind.GetAccessor ||
    kind === SyntaxKind.SetAccessor
  );
}

function getBody(fn: FunctionLike): Node | undefined {
  if (
    Node.isArrowFunction(fn) ||
    Node.isFunctionExpression(fn) ||
    Node.isFunctionDeclaration(fn) ||
    Node.isMethodDeclaration(fn) ||
    Node.isConstructorDeclaration(fn) ||
    Node.isGetAccessorDeclaration(fn) ||
    Node.isSetAccessorDeclaration(fn)
  ) {
    return fn.getBody();
  }
  return undefined;
}
