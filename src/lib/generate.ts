import { GenerationStage, MotionRequest, MotionResult } from "@/lib/types";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// TODO: Replace with real LLM code generation + manim rendering.
export const generateMotion = async (
  _request: MotionRequest,
  onStage: (stage: GenerationStage) => void,
): Promise<MotionResult> => {
  const startedAt = Date.now();

  onStage("generating-code");
  await sleep(1200);

  onStage("rendering");
  await sleep(1500);

  onStage("done");

  return {
    sceneName: "MathMotionScene",
    code: `from manim import *


class MathMotionScene(Scene):

    def construct(self):
        axes = Axes(x_range=[-3, 3], y_range=[-1, 9])
        graph = axes.plot(lambda x: x**2, color=BLUE)
        label = MathTex("y = x^2").next_to(graph, UP)

        self.play(Create(axes))
        self.play(Create(graph), Write(label))
        self.wait()
`,
    durationMs: Date.now() - startedAt,
  };
};
