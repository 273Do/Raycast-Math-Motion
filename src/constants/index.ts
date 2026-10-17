import { GenerationStage, OutputFormat, Quality } from "@/lib/types";

export const EXAMPLE_PROMPTS = [
  "Plot y = x^2 and show a tangent line moving along the curve",
  "Visually prove the Pythagorean theorem using the areas of squares",
  "Animate a point on the unit circle and its relationship to the sine wave",
];

export const QUALITY_OPTIONS: { value: Quality; title: string; flag: string }[] = [
  { value: "low", title: "Low (480p15)", flag: "-ql" },
  { value: "medium", title: "Medium (720p30)", flag: "-qm" },
  { value: "high", title: "High (1080p60)", flag: "-qh" },
];

export const FORMAT_OPTIONS: { value: OutputFormat; title: string }[] = [
  { value: "mp4", title: "MP4" },
  { value: "gif", title: "GIF" },
];

export const STAGE_LABELS: Record<GenerationStage, string> = {
  "generating-code": "Generating Manim code…",
  rendering: "Rendering animation…",
  done: "Done",
};
