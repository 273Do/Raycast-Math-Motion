import { Blueprint } from "@/schema";

export type Quality = "low" | "medium" | "high";
export type OutputFormat = "mp4" | "gif";

export type MotionRequest = {
  prompt: string;
  quality: Quality;
  format: OutputFormat;
};

export type MotionResult = {
  blueprint: Blueprint;
  outputPath: string;
  durationMs: number;
};

export type GenerationStage = "generating-blueprint" | "rendering" | "done";

export type EnvironmentStatus = {
  python?: string;
  manim?: string;
  latex?: string;
};
