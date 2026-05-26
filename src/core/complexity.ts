import { Node, SyntaxKind } from 'ts-morph';
import type { FunctionLike } from './functions.js';

/**
 * Cyclomatic complexity of a function body, McCabe-style:
 *   1 + (number of decision points)
 *
 * Decision points considered:
 *   - if statement
 *   - for / for-of / for-in / while / do-while
 *   - case clause (one per case, default does NOT count — it's the fallthrough)
 *   - catch clause
 *   - conditional expression (ternary `?:`)
 *   - binary logical operators: &&, ||, ??
 *
 * Decisions inside nested functions are NOT counted for the outer function —
 * they belong to the inner function's own complexity.
 */
export function cyclomaticComplexity(fn: FunctionLike): number {
  const body = getBody(fn);
  if (!body) return 1;

  let decisions = 0;

  body.forEachDescendant((node, traversal) => {
    // Don't descend into nested function bodies; their decisions belong to
    // them, not to us. We stop AT the nested function node itself (not before)
    // so the function expression as a value still counts as a single
    // expression to us (which adds nothing).
    if (isNestedFunction(node, fn)) {
      traversal.skip();
      return;
    }

    if (isDecisionPoint(node)) decisions++;
  });

  return 1 + decisions;
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

function isNestedFunction(node: Node, outer: FunctionLike): boolean {
  if (node === outer) return false;
  const kind = node.getKind();
  return (
    kind === SyntaxKind.FunctionDeclaration ||
    kind === SyntaxKind.MethodDeclaration ||
    kind === SyntaxKind.ArrowFunction ||
    kind === SyntaxKind.FunctionExpression ||
    kind === SyntaxKind.Constructor ||
    kind === SyntaxKind.GetAccessor ||
    kind === SyntaxKind.SetAccessor
  );
}

function isDecisionPoint(node: Node): boolean {
  switch (node.getKind()) {
    case SyntaxKind.IfStatement:
    case SyntaxKind.ForStatement:
    case SyntaxKind.ForOfStatement:
    case SyntaxKind.ForInStatement:
    case SyntaxKind.WhileStatement:
    case SyntaxKind.DoStatement:
    case SyntaxKind.CaseClause:
    case SyntaxKind.CatchClause:
    case SyntaxKind.ConditionalExpression:
      return true;
    case SyntaxKind.BinaryExpression: {
      if (!Node.isBinaryExpression(node)) return false;
      const op = node.getOperatorToken().getKind();
      return (
        op === SyntaxKind.AmpersandAmpersandToken ||
        op === SyntaxKind.BarBarToken ||
        op === SyntaxKind.QuestionQuestionToken
      );
    }
    default:
      return false;
  }
}
