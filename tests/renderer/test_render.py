"""Renders every valid fixture and checks the rejections the renderer is responsible for."""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

# The venv the extension's setup screen installs Manim into (`environment.supportPath` on macOS).
EXTENSION_VENV = (
    Path.home() / "Library" / "Application Support" / "com.raycast.macos" / "extensions" / "math-motion" / "venv" / "bin" / "python"
)


def find_manim_python() -> str:
    """MANIM_PYTHON, then the extension's venv, then the interpreter running the tests."""
    if os.environ.get("MANIM_PYTHON"):
        return os.environ["MANIM_PYTHON"]
    if EXTENSION_VENV.exists():
        return str(EXTENSION_VENV)
    return sys.executable


PYTHON = find_manim_python()

ROOT = Path(__file__).resolve().parents[2]
RENDER = ROOT / "assets" / "renderer" / "render.py"
FIXTURES = ROOT / "tests" / "renderer-fixtures"
EXPECTATIONS = json.loads((FIXTURES / "expectations.json").read_text())

# Fixtures the renderer itself rejects. The others are only rejected by the TypeScript validator.
RENDERER_REJECTS = ["invalid-json.json", "invalid-unsupported-action.json", "invalid-expression.json"]

HAS_LATEX = shutil.which("latex") is not None
HAS_FFPROBE = shutil.which("ffprobe") is not None
FPS = 15  # --quality low


def run_renderer(blueprint: Path, output: Path) -> tuple[int, dict]:
    result = subprocess.run(
        [PYTHON, str(RENDER), str(blueprint), "--output", str(output), "--quality", "low"],
        capture_output=True,
        text=True,
        timeout=600,
    )
    lines = result.stdout.strip().splitlines()
    assert lines, f"no output\n{result.stderr}"
    return result.returncode, json.loads(lines[-1])


def count_frames(video: Path) -> int:
    result = subprocess.run(
        [
            "ffprobe",
            *("-v", "error", "-count_frames", "-select_streams", "v:0"),
            *("-show_entries", "stream=nb_read_frames", "-of", "csv=p=0"),
            str(video),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return int(result.stdout.strip())


def uses_latex(blueprint: dict) -> bool:
    return any(o["type"] == "math" for o in blueprint["objects"])


class RenderFixturesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        check = subprocess.run([PYTHON, "-c", "import manim"], capture_output=True)
        if check.returncode != 0:
            raise RuntimeError(
                f"Manim is not importable from {PYTHON}. Install it from the extension's setup screen "
                "or set MANIM_PYTHON to a Python that has Manim."
            )

    def setUp(self) -> None:
        self.output_dir = Path(tempfile.mkdtemp(prefix="math-motion-test-")).resolve()
        self.addCleanup(shutil.rmtree, self.output_dir)

    def test_valid_fixtures_render(self) -> None:
        for name, expected in EXPECTATIONS.items():
            if not expected["valid"]:
                continue
            with self.subTest(fixture=name):
                blueprint = json.loads((FIXTURES / name).read_text())
                if uses_latex(blueprint) and not HAS_LATEX:
                    self.skipTest("LaTeX is not installed")
                output = self.output_dir / f"{Path(name).stem}.mp4"

                code, response = run_renderer(FIXTURES / name, output)

                self.assertEqual(code, 0, response)
                self.assertEqual(response, {"ok": True, "output": str(output)})
                self.assertTrue(output.stat().st_size > 0)
                if HAS_FFPROBE:
                    self.assertEqual(count_frames(output), round(blueprint["scene"]["duration"] * FPS))

    def test_gif_output(self) -> None:
        output = self.output_dir / "graph.gif"
        code, response = run_renderer(FIXTURES / "graph.json", output)
        self.assertEqual(code, 0, response)
        self.assertEqual(output.read_bytes()[:6], b"GIF89a")

    def test_rejects_invalid_blueprints(self) -> None:
        for name in RENDERER_REJECTS:
            with self.subTest(fixture=name):
                output = self.output_dir / "rejected.mp4"
                code, response = run_renderer(FIXTURES / name, output)
                self.assertEqual(code, 2, response)
                self.assertFalse(response["ok"])
                self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
