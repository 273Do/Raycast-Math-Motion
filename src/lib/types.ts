export type Quality = "low" | "medium" | "high";
export type OutputFormat = "mp4" | "gif";

export type MotionRequest = {
  prompt: string;
  quality: Quality;
  format: OutputFormat;
};

export type MotionResult = {
  sceneName: string;
  code: string;
  outputPath?: string;
  durationMs: number;
};

export type GenerationStage = "generating-code" | "rendering" | "done";

export type EnvironmentStatus = {
  python?: string;
  manim?: string;
  latex?: string;
};
