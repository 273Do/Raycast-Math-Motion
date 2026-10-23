"""Graph expressions compiled into Python callables without eval.

Mirrors the grammar in src/schema/expression.ts:

  expr    := term (("+" | "-") term)*
  term    := unary (("*" | "/") unary)*
  unary   := ("+" | "-") unary | power
  power   := primary ("^" unary)?
  primary := number | identifier | call | "(" expr ")"
  call    := function "(" expr ")" | "sum(" identifier "," bound "," bound "," expr ")"
  bound   := integer | parameter id
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Callable, Mapping

FUNCTIONS: dict[str, Callable[[float], float]] = {
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "asin": math.asin,
    "acos": math.acos,
    "atan": math.atan,
    "sinh": math.sinh,
    "cosh": math.cosh,
    "tanh": math.tanh,
    "exp": math.exp,
    "log": math.log,
    "sqrt": math.sqrt,
    "abs": abs,
    "floor": math.floor,
    "ceil": math.ceil,
}

CONSTANTS = {"pi": math.pi, "e": math.e}
VARIABLE = "x"

# Values an expression reads: "x", parameter ids, and sum indices.
Env = Mapping[str, float]
Node = Callable[[Env], float]

_NUMBER = re.compile(r"\d+\.?\d*|\.\d+")
_IDENTIFIER = re.compile(r"[a-z][a-z0-9_]*")
_SYMBOLS = set("+-*/^(),")


class ExpressionError(ValueError):
    pass


@dataclass(frozen=True)
class _Token:
    kind: str  # "number" | "identifier" | "symbol"
    value: str


def _tokenize(source: str) -> list[_Token]:
    tokens: list[_Token] = []
    i = 0
    while i < len(source):
        char = source[i]
        if char == " ":
            i += 1
        elif char.isdigit() or char == ".":
            match = _NUMBER.match(source, i)
            if not match:
                raise ExpressionError(f"Invalid number at position {i}")
            tokens.append(_Token("number", match.group()))
            i = match.end()
        elif "a" <= char <= "z":
            match = _IDENTIFIER.match(source, i)
            assert match
            tokens.append(_Token("identifier", match.group()))
            i = match.end()
        elif char in _SYMBOLS:
            tokens.append(_Token("symbol", char))
            i += 1
        else:
            raise ExpressionError(f'Unexpected character "{char}" at position {i}')
    return tokens


def _power(base: float, exponent: float) -> float:
    try:
        result = base**exponent
    except (OverflowError, ZeroDivisionError):
        return math.nan
    # A negative base with a fractional exponent gives a complex number.
    return result if isinstance(result, (int, float)) else math.nan


def _divide(a: float, b: float) -> float:
    return a / b if b != 0 else math.nan


def _call(function: Callable[[float], float], value: float) -> float:
    try:
        return float(function(value))
    except (ValueError, OverflowError):
        return math.nan


class _Parser:
    def __init__(self, source: str, parameters: frozenset[str]) -> None:
        self.tokens = _tokenize(source)
        self.position = 0
        self.parameters = parameters
        # Sum indices currently in scope.
        self.indices: list[str] = []

    def peek(self) -> _Token | None:
        return self.tokens[self.position] if self.position < len(self.tokens) else None

    def is_symbol(self, value: str) -> bool:
        token = self.peek()
        return token is not None and token.kind == "symbol" and token.value == value

    def expect_symbol(self, value: str) -> None:
        if not self.is_symbol(value):
            raise ExpressionError(f'Expected "{value}"')
        self.position += 1

    def expect_identifier(self) -> str:
        token = self.peek()
        if token is None or token.kind != "identifier":
            raise ExpressionError("Expected an identifier")
        self.position += 1
        return token.value

    def parse(self) -> Node:
        node = self.parse_expr()
        token = self.peek()
        if token is not None:
            raise ExpressionError(f'Unexpected "{token.value}"')
        return node

    def parse_expr(self) -> Node:
        node = self.parse_term()
        while self.is_symbol("+") or self.is_symbol("-"):
            op = self.tokens[self.position].value
            self.position += 1
            left, right = node, self.parse_term()
            if op == "+":
                node = lambda env, l=left, r=right: l(env) + r(env)
            else:
                node = lambda env, l=left, r=right: l(env) - r(env)
        return node

    def parse_term(self) -> Node:
        node = self.parse_unary()
        while self.is_symbol("*") or self.is_symbol("/"):
            op = self.tokens[self.position].value
            self.position += 1
            left, right = node, self.parse_unary()
            if op == "*":
                node = lambda env, l=left, r=right: l(env) * r(env)
            else:
                node = lambda env, l=left, r=right: _divide(l(env), r(env))
        return node

    def parse_unary(self) -> Node:
        if self.is_symbol("+") or self.is_symbol("-"):
            op = self.tokens[self.position].value
            self.position += 1
            operand = self.parse_unary()
            return operand if op == "+" else (lambda env: -operand(env))
        return self.parse_power()

    def parse_power(self) -> Node:
        base = self.parse_primary()
        if self.is_symbol("^"):
            self.position += 1
            exponent = self.parse_unary()
            return lambda env: _power(base(env), exponent(env))
        return base

    def parse_bound(self) -> Node:
        token = self.peek()
        if (
            token is not None
            and token.kind == "number"
            and float(token.value).is_integer()
        ):
            self.position += 1
            value = float(token.value)
            return lambda env: value
        if (
            token is not None
            and token.kind == "identifier"
            and token.value in self.parameters
        ):
            self.position += 1
            name = token.value
            return lambda env: env[name]
        raise ExpressionError("sum() bounds must be integers or parameter ids")

    def parse_sum(self) -> Node:
        self.expect_symbol("(")
        index = self.expect_identifier()
        if (
            index == VARIABLE
            or index in CONSTANTS
            or index in FUNCTIONS
            or index in self.parameters
        ):
            raise ExpressionError(f'"{index}" cannot be used as a sum index')
        self.expect_symbol(",")
        start = self.parse_bound()
        self.expect_symbol(",")
        stop = self.parse_bound()
        self.expect_symbol(",")
        self.indices.append(index)
        body = self.parse_expr()
        self.indices.pop()
        self.expect_symbol(")")

        def evaluate(env: Env) -> float:
            low, high = _round_half_up(start(env)), _round_half_up(stop(env))
            scope = dict(env)
            total = 0.0
            for k in range(low, high + 1):
                scope[index] = k
                total += body(scope)
            return total

        return evaluate

    def parse_primary(self) -> Node:
        token = self.peek()
        if token is None:
            raise ExpressionError("Unexpected end of expression")

        if token.kind == "number":
            self.position += 1
            value = float(token.value)
            return lambda env: value

        if token.kind == "identifier":
            self.position += 1
            name = token.value
            if name == "sum":
                return self.parse_sum()
            if name in FUNCTIONS:
                self.expect_symbol("(")
                arg = self.parse_expr()
                self.expect_symbol(")")
                function = FUNCTIONS[name]
                return lambda env: _call(function, arg(env))
            if name in CONSTANTS:
                value = CONSTANTS[name]
                return lambda env: value
            if name == VARIABLE or name in self.parameters or name in self.indices:
                return lambda env: env[name]
            raise ExpressionError(f'Unknown identifier "{name}"')

        if self.is_symbol("("):
            self.position += 1
            node = self.parse_expr()
            self.expect_symbol(")")
            return node

        raise ExpressionError(f'Unexpected "{token.value}"')


def _round_half_up(value: float) -> int:
    return math.floor(value + 0.5)


def compile_expression(source: str, parameters: frozenset[str] = frozenset()) -> Node:
    """Compile `source` into a function of an environment holding "x" and the parameter values."""
    return _Parser(source, parameters).parse()


def read_parameter(value: float, integer: bool) -> float:
    """Value an expression sees for a parameter, per the `integer` flag."""
    return _round_half_up(value) if integer else value
