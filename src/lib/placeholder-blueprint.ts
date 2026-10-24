import { Blueprint } from "@/schema";

/** Stands in for the LLM until it is connected. Uses no `math` objects, so it renders without LaTeX. */
export const PLACEHOLDER_BLUEPRINT: Blueprint = {
  version: "1.0",
  title: "Parabola",
  scene: { width: 1280, height: 720, fps: 30, background: "#101014", duration: 5 },
  objects: [
    {
      id: "axes",
      type: "axes",
      position: [0, -0.5],
      style: { color: "#B8B8C8", opacity: 1, scale: 1 },
      data: { xRange: [-3, 3], yRange: [-1, 9] },
    },
    {
      id: "parabola",
      type: "graph",
      position: [0, -0.5],
      style: { color: "#58C4DD", opacity: 1, scale: 1 },
      data: { expression: "x^2", xRange: [-3, 3], axesId: "axes" },
    },
    {
      id: "label",
      type: "text",
      position: [0, 3.3],
      style: { color: "#FFFFFF", opacity: 1, scale: 1 },
      data: { text: "y = x²", fontSize: 40 },
    },
  ],
  animations: [
    { target: "axes", action: "create", start: 0, duration: 1.5, params: {} },
    { target: "parabola", action: "create", start: 1.5, duration: 2, params: {} },
    { target: "label", action: "write", start: 2, duration: 1, params: {} },
  ],
};
