"""Renders an Animation Blueprint to MP4 or GIF with Manim.

    python render.py BLUEPRINT.json --output OUT.mp4 [--quality low|medium|high] [--schema SCHEMA.json]

The blueprint is expected to have passed the TypeScript validation (src/schema). `--schema`
re-checks its structure with `jsonschema` as a second line of defense.

Prints one JSON line to stdout: {"ok": true, "output": PATH} or {"ok": false, "error": MESSAGE}.
Exit codes: 0 rendered, 2 the blueprint was rejected, 1 rendering failed.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any

SUPPORTED_VERSION = "1.0"
FRAME_HEIGHT = 8.0

# (pixel height, fps). Overrides the blueprint's resolution while keeping its aspect ratio.
QUALITY_PRESETS = {
    "low": (480, 15),
    "medium": (720, 30),
    "high": (1080, 60),
}


class BlueprintRejected(Exception):
    pass


def load_blueprint(path: Path, schema_path: Path | None) -> dict[str, Any]:
    try:
        blueprint = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise BlueprintRejected(f"Invalid JSON: {error}") from error

    if schema_path is not None:
        try:
            import jsonschema
        except ImportError as error:
            raise RuntimeError("--schema requires the jsonschema package") from error
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        try:
            jsonschema.validate(blueprint, schema)
        except jsonschema.ValidationError as error:
            location = "/".join(str(p) for p in error.absolute_path)
            raise BlueprintRejected(
                f"Schema violation at {location or '<root>'}: {error.message}"
            ) from error

    if not isinstance(blueprint, dict) or blueprint.get("version") != SUPPORTED_VERSION:
        raise BlueprintRejected(
            f"Unsupported blueprint version; expected {SUPPORTED_VERSION}"
        )
    return blueprint


def resolve_output_settings(
    scene: dict[str, Any], quality: str | None
) -> tuple[int, int, int]:
    """Pixel width, pixel height, and fps."""
    if quality is None:
        return scene["width"], scene["height"], scene["fps"]
    height, fps = QUALITY_PRESETS[quality]
    # Video encoders need even dimensions.
    width = round(height * scene["width"] / scene["height"] / 2) * 2
    return width, height, fps


def render(blueprint: dict[str, Any], output: Path, quality: str | None) -> Path:
    # Imported here so `--help` and rejected blueprints do not pay for loading Manim.
    from blueprint_scene import BLUEPRINT_ERRORS, build_scene_class
    from manim import tempconfig

    scene = blueprint["scene"]
    width, height, fps = resolve_output_settings(scene, quality)
    output_format = output.suffix.lstrip(".").lower()
    if output_format not in ("mp4", "gif"):
        raise BlueprintRejected(
            f'Unsupported output format ".{output_format}"; use .mp4 or .gif'
        )

    with tempfile.TemporaryDirectory(prefix="math-motion-") as media_dir:
        settings = {
            "media_dir": media_dir,
            "output_file": "scene",
            "format": output_format,
            "pixel_width": width,
            "pixel_height": height,
            "frame_rate": fps,
            "frame_height": FRAME_HEIGHT,
            "frame_width": FRAME_HEIGHT * scene["width"] / scene["height"],
            "background_color": scene["background"],
            "disable_caching": True,
            "progress_bar": "none",
            "verbosity": "ERROR",
        }
        with tempconfig(settings):
            try:
                manim_scene = build_scene_class(blueprint, fps)()
                manim_scene.render()
            except BLUEPRINT_ERRORS as error:
                raise BlueprintRejected(f"{type(error).__name__}: {error}") from error
            rendered = Path(manim_scene.renderer.file_writer.movie_file_path)
            if output_format == "gif":
                rendered = rendered.with_suffix(".gif")

        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(rendered, output)
    return output


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Render an Animation Blueprint with Manim."
    )
    parser.add_argument("blueprint", type=Path)
    parser.add_argument(
        "--output", type=Path, required=True, help="Destination .mp4 or .gif file"
    )
    parser.add_argument(
        "--quality",
        choices=QUALITY_PRESETS,
        help="Override the blueprint's resolution and fps",
    )
    parser.add_argument(
        "--schema", type=Path, help="JSON Schema to re-validate the blueprint against"
    )
    args = parser.parse_args()

    def respond(payload: dict[str, Any]) -> None:
        print(json.dumps(payload), flush=True)

    try:
        blueprint = load_blueprint(args.blueprint, args.schema)
        output = render(blueprint, args.output.resolve(), args.quality)
    except BlueprintRejected as error:
        respond({"ok": False, "error": str(error)})
        return 2
    except Exception as error:  # noqa: BLE001 - reported to the extension instead of a traceback
        respond({"ok": False, "error": f"{type(error).__name__}: {error}"})
        return 1

    respond({"ok": True, "output": str(output)})
    return 0


if __name__ == "__main__":
    sys.exit(main())
