"""Plays blueprint animations at absolute start times.

Manim plays animations in sequential `Scene.play` calls, while blueprint animations start
at arbitrary times and may overlap. The timeline is cut at every start and end, and each
segment plays a slice of every animation running through it. An animation is built when its
first slice begins, so it starts from the state its target is in at that moment.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from manim import Animation, Mobject, Scene, linear


@dataclass
class TimelineEntry:
    start: int  # frame
    end: int  # frame
    mobject: Mobject
    build: Callable[[], Animation]
    animation: Animation | None = field(default=None, init=False)

    def ensure_built(self) -> Animation:
        if self.animation is None:
            # Let updaters (e.g. a graph that redraws from parameters) catch up first.
            self.mobject.update(0)
            self.animation = self.build()
        return self.animation


class _Slice(Animation):
    """Plays `entry` from local progress `alpha_from` to `alpha_to`."""

    def __init__(
        self, entry: TimelineEntry, alpha_from: float, alpha_to: float, run_time: float
    ) -> None:
        self.entry = entry
        self.alpha_from = alpha_from
        self.alpha_to = alpha_to
        self.is_first = alpha_from == 0
        self.is_last = alpha_to == 1
        super().__init__(entry.mobject, run_time=run_time, rate_func=linear)

    def is_introducer(self) -> bool:
        # Introducers add their mobject in `_setup_scene`; until then it must stay off screen.
        return self.is_first and self.entry.ensure_built().is_introducer()

    def is_remover(self) -> bool:
        return self.is_last and self.entry.ensure_built().is_remover()

    def _setup_scene(self, scene: Scene) -> None:
        if self.is_first:
            self.entry.ensure_built()._setup_scene(scene)

    def begin(self) -> None:
        if self.is_first:
            self.entry.ensure_built().begin()

    def interpolate(self, alpha: float) -> None:
        progress = self.alpha_from + (self.alpha_to - self.alpha_from) * alpha
        self.entry.ensure_built().interpolate(progress)

    def update_mobjects(self, dt: float) -> None:
        self.entry.ensure_built().update_mobjects(dt)

    def finish(self) -> None:
        if self.is_last:
            self.entry.ensure_built().finish()
        else:
            self.interpolate(1)

    def clean_up_from_scene(self, scene: Scene) -> None:
        if self.is_last:
            self.entry.ensure_built().clean_up_from_scene(scene)


def _run_time(frames: int, fps: int) -> float:
    # Manim renders `ceil(run_time * fps)` frames; stay just under the boundary so float
    # error cannot add a frame.
    return (frames - 1e-6) / fps


def _play_instantly(scene: Scene, entry: TimelineEntry) -> None:
    """Applies an animation shorter than one frame without rendering it."""
    animation = entry.ensure_built()
    animation._setup_scene(scene)
    animation.begin()
    animation.finish()
    animation.clean_up_from_scene(scene)


def play_timeline(
    scene: Scene, entries: list[TimelineEntry], total_frames: int, fps: int
) -> None:
    """Plays `entries` (timed in frames) and fills the rest of `total_frames` with waits."""
    # Within one frame, entries keep their blueprint order; a target's previous animation
    # always comes first because animations on one target never overlap.
    pending = sorted(entries, key=lambda e: e.start)
    boundaries = sorted(
        {0, total_frames, *(e.start for e in entries), *(e.end for e in entries)}
    )

    for segment_start, segment_end in zip(boundaries, boundaries[1:]):
        for entry in pending:
            if entry.start == entry.end == segment_start:
                _play_instantly(scene, entry)

        run_time = _run_time(segment_end - segment_start, fps)
        slices = [
            _Slice(
                entry,
                (segment_start - entry.start) / (entry.end - entry.start),
                (segment_end - entry.start) / (entry.end - entry.start),
                run_time=run_time,
            )
            for entry in pending
            if entry.start <= segment_start
            and segment_end <= entry.end
            and entry.start < entry.end
        ]
        if slices:
            scene.play(*slices, run_time=run_time)
        else:
            # A frozen wait truncates its frame count instead, so always render it frame by frame.
            scene.wait(run_time, frozen_frame=False)

    for entry in pending:
        if entry.start == entry.end == total_frames:
            _play_instantly(scene, entry)
