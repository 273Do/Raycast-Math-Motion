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

export const QUALITY_OPTIONS: { value: Quality; title: string; flag: string }[] = [
  { value: "low", title: "Low (480p15)", flag: "-ql" },
  { value: "medium", title: "Medium (720p30)", flag: "-qm" },
  { value: "high", title: "High (1080p60)", flag: "-qh" },
];

export const FORMAT_OPTIONS: { value: OutputFormat; title: string }[] = [
  { value: "mp4", title: "MP4" },
  { value: "gif", title: "GIF" },
];
