import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "assets" / "renderer"))

from expression import ExpressionError, compile_expression, read_parameter  # noqa: E402

PARAMETERS = frozenset({"n"})


def evaluate(source: str, x: float = 0.0, **parameters: float) -> float:
    return compile_expression(source, PARAMETERS)({"x": x, **parameters})


class GrammarTest(unittest.TestCase):
    # Same cases as the "expression grammar" suite in src/schema/blueprint.test.ts.
    def test_accepts(self) -> None:
        for source in ["sin(x)", "x^2 / 2 - 3 * x + 1", "-x^2", "exp(-x^2) * cos(2 * pi * x)", "sum(k, 1, n, x^k / k)"]:
            with self.subTest(source=source):
                compile_expression(source, PARAMETERS)

    def test_rejects(self) -> None:
        for source in [
            "__import__('os')",
            "2x",
            "y + 1",
            "eval(x)",
            "sin x",
            "x.real",
            "sum(x, 1, 3, x)",
            "sum(k, 1, 2.5, k)",
            "k + 1",
            "(x",
            "",
        ]:
            with self.subTest(source=source):
                with self.assertRaises(ExpressionError):
                    compile_expression(source, PARAMETERS)


class EvaluationTest(unittest.TestCase):
    def test_precedence(self) -> None:
        self.assertEqual(evaluate("1 + 2 * 3"), 7)
        self.assertEqual(evaluate("-x^2", x=3), -9)
        self.assertEqual(evaluate("2^3^2"), 512)
        self.assertEqual(evaluate("2^-1"), 0.5)
        self.assertEqual(evaluate("(1 + 2) * 3"), 9)

    def test_functions_and_constants(self) -> None:
        self.assertAlmostEqual(evaluate("sin(pi / 2)"), 1)
        self.assertAlmostEqual(evaluate("log(e)"), 1)
        self.assertEqual(evaluate("abs(-3) + floor(1.7) + ceil(1.2)"), 6)

    def test_sum_with_parameter_bound(self) -> None:
        self.assertEqual(evaluate("sum(k, 1, n, k)", n=4), 10)
        self.assertEqual(evaluate("sum(k, 1, n, x * k)", x=2, n=3), 12)
        # An empty range sums to zero.
        self.assertEqual(evaluate("sum(k, 3, 1, k)"), 0)

    def test_undefined_values_are_nan(self) -> None:
        for source, x in [("log(x)", 0), ("sqrt(x - 1)", 0), ("1 / x", 0), ("x^0.5", -1), ("exp(x)", 1000)]:
            with self.subTest(source=source):
                self.assertTrue(math.isnan(evaluate(source, x=x)))

    def test_integer_parameter(self) -> None:
        self.assertEqual(read_parameter(2.5, integer=True), 3)
        self.assertEqual(read_parameter(2.49, integer=True), 2)
        self.assertEqual(read_parameter(2.49, integer=False), 2.49)


if __name__ == "__main__":
    unittest.main()
