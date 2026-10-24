"""Builds a Manim scene from a validated Animation Blueprint.

Conventions follow tests/renderer-fixtures/README.md: Manim scene units, `position` is the
object's center, geometry is relative to it, angles are degrees, and intervals are half-open.
"""

from __future__ import annotations

import math
from typing import Any, Callable

import numpy as np
from expression import ExpressionError, compile_expression, read_parameter
from manim import (
    DEGREES,
    Animation,
    Arrow,
    Axes,
    Circle,
    Create,
    Dot,
    FadeIn,
    FadeOut,
    Indicate,
    Line,
    MathTex,
    Mobject,
    Polygon,
    Rectangle,
    ReplacementTransform,
    Rotate,
    Scene,
    Text,
    ValueTracker,
    VGroup,
    VMobject,
    Write,
)
from timeline import TimelineEntry, play_timeline

Blueprint = dict[str, Any]
BlueprintObject = dict[str, Any]

GRAPH_SAMPLES = 400


class RenderError(Exception):
    """The blueprint cannot be rendered, e.g. because it uses an unknown type or action."""


# Problems with the blueprint itself, as opposed to the environment or Manim.
BLUEPRINT_ERRORS = (RenderError, ExpressionError)


def _point(xy: list[float]) -> np.ndarray:
    return np.array([xy[0], xy[1], 0.0])


def _nice_step(low: float, high: float) -> float:
    """Tick spacing that gives roughly ten ticks over the range."""
    raw = (high - low) / 10
    magnitude = 10 ** math.floor(math.log10(raw))
    for factor in (1, 2, 5, 10):
        if raw <= factor * magnitude:
            return factor * magnitude
    return 10 * magnitude


def _apply_style(mobject: VMobject, style: dict[str, Any], filled: bool) -> None:
    mobject.set_stroke(color=style["color"], opacity=style["opacity"])
    if filled:
        mobject.set_fill(color=style["color"], opacity=style["opacity"])


class _Builder:
    def __init__(self, blueprint: Blueprint) -> None:
        self.objects: dict[str, BlueprintObject] = {
            o["id"]: o for o in blueprint["objects"]
        }
        self.parameters: dict[str, ValueTracker] = {}
        self.mobjects: dict[str, Mobject] = {}
        # Where each object's `position` currently is; move/rotate/scale work relative to it.
        self.anchors: dict[str, np.ndarray] = {}

        for obj in blueprint["objects"]:
            if obj["type"] == "parameter":
                self.parameters[obj["id"]] = ValueTracker(obj["data"]["initial"])
        # Axes first, so graphs can be drawn on them.
        for obj in sorted(blueprint["objects"], key=lambda o: o["type"] != "axes"):
            if obj["type"] != "parameter":
                mobject = self.build_mobject(obj)
                self.mobjects[obj["id"]] = mobject
                self.anchors[obj["id"]] = (
                    mobject.get_center()
                    if obj["type"] == "graph"
                    else _point(obj["position"])
                )

    def build_mobject(self, obj: BlueprintObject) -> Mobject:
        kind, data, style = obj["type"], obj["data"], obj["style"]
        position = _point(obj["position"])

        if kind == "graph":
            return self.build_graph(obj)

        if kind == "text":
            mobject = Text(data["text"], font_size=data["fontSize"])
            _apply_style(mobject, style, filled=True)
            mobject.set_stroke(width=0)
            mobject.move_to(position)
        elif kind == "math":
            mobject = MathTex(data["latex"], font_size=data["fontSize"])
            _apply_style(mobject, style, filled=True)
            mobject.move_to(position)
        elif kind == "axes":
            x_low, x_high = data["xRange"]
            y_low, y_high = data["yRange"]
            mobject = Axes(
                x_range=[x_low, x_high, _nice_step(x_low, x_high)],
                y_range=[y_low, y_high, _nice_step(y_low, y_high)],
                axis_config={"color": style["color"]},
            )
            mobject.set_stroke(opacity=style["opacity"])
            mobject.set_fill(opacity=style["opacity"])
            mobject.move_to(position)
        elif kind == "circle":
            mobject = Circle(radius=data["radius"])
            _apply_style(mobject, style, filled=False)
            mobject.move_to(position)
        elif kind == "dot":
            mobject = Dot(radius=data["radius"])
            _apply_style(mobject, style, filled=True)
            mobject.move_to(position)
        elif kind == "rectangle":
            mobject = Rectangle(width=data["width"], height=data["height"])
            _apply_style(mobject, style, filled=False)
            mobject.move_to(position)
        elif kind in ("line", "arrow"):
            start, end = (
                position + _point(data["start"]),
                position + _point(data["end"]),
            )
            mobject = Line(start, end) if kind == "line" else Arrow(start, end, buff=0)
            _apply_style(mobject, style, filled=kind == "arrow")
        elif kind == "polygon":
            mobject = Polygon(*(position + _point(p) for p in data["points"]))
            _apply_style(mobject, style, filled=False)
        else:
            raise RenderError(f'Unsupported object type "{kind}"')

        mobject.scale(style["scale"], about_point=position)
        return mobject

    def build_graph(self, obj: BlueprintObject) -> Mobject:
        """Draws the graph in its axes' coordinates; the graph's own `position` and `scale` are not used."""
        data, style = obj["data"], obj["style"]
        axes = self.mobjects[data["axesId"]]
        assert isinstance(axes, Axes)
        function = compile_expression(data["expression"], frozenset(self.parameters))
        integer = {pid: self.objects[pid]["data"]["integer"] for pid in self.parameters}
        x_low, x_high = data["xRange"]
        y_low, y_high = axes.y_range[0], axes.y_range[1]

        def draw() -> VGroup:
            env: dict[str, float] = {
                pid: read_parameter(self.parameters[pid].get_value(), integer[pid])
                for pid in self.parameters
            }

            def evaluate(x: float) -> float:
                env["x"] = x
                return function(env)

            # Plot each run of samples that is defined and inside the y range, so asymptotes,
            # domain gaps, and values off the axes are left out instead of drawn as spikes.
            xs = np.linspace(x_low, x_high, GRAPH_SAMPLES + 1)
            ys = [evaluate(x) for x in xs]
            visible = [math.isfinite(y) and y_low <= y <= y_high for y in ys]
            pieces = VGroup()
            run_start: int | None = None
            for i, ok in enumerate([*visible, False]):
                if ok and run_start is None:
                    run_start = i
                elif not ok and run_start is not None:
                    if i - run_start >= 2:
                        piece = VMobject()
                        piece.set_points_smoothly(
                            [axes.c2p(xs[j], ys[j]) for j in range(run_start, i)]
                        )
                        pieces.add(piece)
                    run_start = None
            _apply_style(pieces, style, filled=False)
            pieces.set_fill(opacity=0)
            return pieces

        graph = draw()
        if self.parameters:
            graph.add_updater(lambda m: m.become(draw()))
        return graph

    def build_animation(self, animation: dict[str, Any]) -> Callable[[], Animation]:
        """Returns a factory, because most animations capture their target's state when built."""
        target_id, action, params = (
            animation["target"],
            animation["action"],
            animation["params"],
        )

        if action == "animate_parameter":
            tracker = self.parameters[target_id]
            return lambda: tracker.animate.set_value(params["to"]).build()

        mobject = self.mobjects[target_id]

        if action == "create":
            return lambda: Create(mobject)
        if action == "write":
            return lambda: Write(mobject)
        if action == "fade_in":
            return lambda: FadeIn(mobject)
        if action == "fade_out":
            return lambda: FadeOut(mobject)
        if action == "indicate":
            return lambda: Indicate(mobject)
        if action == "move":

            def move() -> Animation:
                destination = _point(params["to"])
                shift = destination - self.anchors[target_id]
                self.anchors[target_id] = destination
                return mobject.animate.shift(shift).build()

            return move
        if action == "rotate":
            return lambda: Rotate(
                mobject,
                angle=params["angle"] * DEGREES,
                about_point=self.anchors[target_id],
            )
        if action == "scale":
            return lambda: mobject.animate.scale(
                params["factor"], about_point=self.anchors[target_id]
            ).build()
        if action == "transform":
            into = self.mobjects[params["into"]]
            return lambda: ReplacementTransform(mobject, into)
        raise RenderError(f'Unsupported action "{action}"')

    def mobject_for(self, target_id: str) -> Mobject:
        if target_id in self.parameters:
            return self.parameters[target_id]
        return self.mobjects[target_id]


def build_scene_class(blueprint: Blueprint, fps: int) -> type[Scene]:
    class BlueprintScene(Scene):
        def construct(self) -> None:
            builder = _Builder(blueprint)
            entries = []
            for animation in blueprint["animations"]:
                start = round(animation["start"] * fps)
                end = round((animation["start"] + animation["duration"]) * fps)
                entries.append(
                    TimelineEntry(
                        start=start,
                        end=end,
                        mobject=builder.mobject_for(animation["target"]),
                        build=builder.build_animation(animation),
                    )
                )
            play_timeline(
                self, entries, round(blueprint["scene"]["duration"] * fps), fps
            )

    return BlueprintScene
