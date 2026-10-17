/**
 * Allowlisted grammar for graph expressions. Parsed only, never evaluated.
 *
 *   expr    := term (("+" | "-") term)*
 *   term    := unary (("*" | "/") unary)*
 *   unary   := ("+" | "-") unary | power
 *   power   := primary ("^" unary)?
 *   primary := number | identifier | call | "(" expr ")"
 *   call    := function "(" expr ")" | "sum(" identifier "," bound "," bound "," expr ")"
 *   bound   := integer | parameter id
 */

export const EXPRESSION_FUNCTIONS = [
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "sinh",
  "cosh",
  "tanh",
  "exp",
  "log",
  "sqrt",
  "abs",
  "floor",
  "ceil",
] as const;

export const EXPRESSION_CONSTANTS = ["pi", "e"] as const;
export const EXPRESSION_VARIABLE = "x";

export type ExpressionNode =
  | { kind: "number"; value: number }
  | { kind: "identifier"; name: string }
  | { kind: "unary"; op: "+" | "-"; operand: ExpressionNode }
  | { kind: "binary"; op: "+" | "-" | "*" | "/" | "^"; left: ExpressionNode; right: ExpressionNode }
  | { kind: "call"; name: string; arg: ExpressionNode }
  | { kind: "sum"; index: string; from: SumBound; to: SumBound; body: ExpressionNode };

export type SumBound = { kind: "number"; value: number } | { kind: "parameter"; name: string };

export type ExpressionContext = {
  /** Parameter ids that may be referenced. */
  parameters: ReadonlySet<string>;
};

export class ExpressionError extends Error {}

type Token =
  { type: "number"; value: number } | { type: "identifier"; value: string } | { type: "symbol"; value: string };

const FUNCTIONS: ReadonlySet<string> = new Set(EXPRESSION_FUNCTIONS);
const CONSTANTS: ReadonlySet<string> = new Set(EXPRESSION_CONSTANTS);
const SYMBOLS = new Set(["+", "-", "*", "/", "^", "(", ")", ","]);

const tokenize = (source: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (char === " ") {
      i++;
    } else if (/[0-9.]/.test(char)) {
      const match = /^(?:\d+\.?\d*|\.\d+)/.exec(source.slice(i));
      if (!match) throw new ExpressionError(`Invalid number at position ${i}`);
      tokens.push({ type: "number", value: Number(match[0]) });
      i += match[0].length;
    } else if (/[a-z]/.test(char)) {
      const match = /^[a-z][a-z0-9_]*/.exec(source.slice(i))!;
      tokens.push({ type: "identifier", value: match[0] });
      i += match[0].length;
    } else if (SYMBOLS.has(char)) {
      tokens.push({ type: "symbol", value: char });
      i++;
    } else {
      throw new ExpressionError(`Unexpected character "${char}" at position ${i}`);
    }
  }
  return tokens;
};

export const parseExpression = (source: string, context: ExpressionContext): ExpressionNode => {
  const tokens = tokenize(source);
  let position = 0;
  // Sum indices currently in scope.
  const indices: string[] = [];

  const peek = () => tokens[position];
  const isSymbol = (value: string) => peek()?.type === "symbol" && peek()!.value === value;

  const expectSymbol = (value: string) => {
    if (!isSymbol(value)) throw new ExpressionError(`Expected "${value}"`);
    position++;
  };

  const expectIdentifier = (): string => {
    const token = peek();
    if (token?.type !== "identifier") throw new ExpressionError("Expected an identifier");
    position++;
    return token.value;
  };

  const parseExpr = (): ExpressionNode => {
    let node = parseTerm();
    while (isSymbol("+") || isSymbol("-")) {
      const op = (tokens[position++] as { value: "+" | "-" }).value;
      node = { kind: "binary", op, left: node, right: parseTerm() };
    }
    return node;
  };

  const parseTerm = (): ExpressionNode => {
    let node = parseUnary();
    while (isSymbol("*") || isSymbol("/")) {
      const op = (tokens[position++] as { value: "*" | "/" }).value;
      node = { kind: "binary", op, left: node, right: parseUnary() };
    }
    return node;
  };

  const parseUnary = (): ExpressionNode => {
    if (isSymbol("+") || isSymbol("-")) {
      const op = (tokens[position++] as { value: "+" | "-" }).value;
      return { kind: "unary", op, operand: parseUnary() };
    }
    return parsePower();
  };

  const parsePower = (): ExpressionNode => {
    const base = parsePrimary();
    if (isSymbol("^")) {
      position++;
      return { kind: "binary", op: "^", left: base, right: parseUnary() };
    }
    return base;
  };

  const parseBound = (): SumBound => {
    const token = peek();
    if (token?.type === "number" && Number.isInteger(token.value)) {
      position++;
      return { kind: "number", value: token.value };
    }
    if (token?.type === "identifier" && context.parameters.has(token.value)) {
      position++;
      return { kind: "parameter", name: token.value };
    }
    throw new ExpressionError("sum() bounds must be integers or parameter ids");
  };

  const parseSum = (): ExpressionNode => {
    expectSymbol("(");
    const index = expectIdentifier();
    if (
      index === EXPRESSION_VARIABLE ||
      CONSTANTS.has(index) ||
      FUNCTIONS.has(index) ||
      context.parameters.has(index)
    ) {
      throw new ExpressionError(`"${index}" cannot be used as a sum index`);
    }
    expectSymbol(",");
    const from = parseBound();
    expectSymbol(",");
    const to = parseBound();
    expectSymbol(",");
    indices.push(index);
    const body = parseExpr();
    indices.pop();
    expectSymbol(")");
    return { kind: "sum", index, from, to, body };
  };

  const parsePrimary = (): ExpressionNode => {
    const token = peek();
    if (!token) throw new ExpressionError("Unexpected end of expression");

    if (token.type === "number") {
      position++;
      return { kind: "number", value: token.value };
    }

    if (token.type === "identifier") {
      position++;
      const name = token.value;
      if (name === "sum") return parseSum();
      if (FUNCTIONS.has(name)) {
        expectSymbol("(");
        const arg = parseExpr();
        expectSymbol(")");
        return { kind: "call", name, arg };
      }
      if (
        name === EXPRESSION_VARIABLE ||
        CONSTANTS.has(name) ||
        context.parameters.has(name) ||
        indices.includes(name)
      ) {
        return { kind: "identifier", name };
      }
      throw new ExpressionError(`Unknown identifier "${name}"`);
    }

    if (isSymbol("(")) {
      position++;
      const node = parseExpr();
      expectSymbol(")");
      return node;
    }

    throw new ExpressionError(`Unexpected "${token.value}"`);
  };

  const ast = parseExpr();
  if (position < tokens.length) throw new ExpressionError(`Unexpected "${tokens[position].value}"`);
  return ast;
};

/** Every `sum()` node in the expression. */
export const collectSums = (node: ExpressionNode): Extract<ExpressionNode, { kind: "sum" }>[] => {
  switch (node.kind) {
    case "number":
    case "identifier":
      return [];
    case "unary":
      return collectSums(node.operand);
    case "binary":
      return [...collectSums(node.left), ...collectSums(node.right)];
    case "call":
      return collectSums(node.arg);
    case "sum":
      return [node, ...collectSums(node.body)];
  }
};
