# Math Motion

Describe a math animation in plain language, and Math Motion turns it into a video with [Manim](https://www.manim.community/).

A local LLM running in [Ollama](https://ollama.com/) designs the animation. Your prompts never leave your computer.

## Requirements

| Tool                | Required | Purpose                                                                         |
| ------------------- | -------- | ------------------------------------------------------------------------------- |
| Python 3            | Yes      | Runs Manim                                                                      |
| Ollama and a model  | Yes      | Designs the animation from your prompt                                          |
| LaTeX (e.g. MacTeX) | No       | Renders math formulas. Without it, scenes that contain formulas fail to render. |

## Setup

1. **Install Python 3**, for example with `brew install python`.
2. **Install Ollama** from [ollama.com](https://ollama.com/download), start it, and download a model:

   ```sh
   ollama pull qwen3:8b
   ```

   Any installed model can be chosen in the command. Larger models follow the instructions more reliably but take longer.

3. **Open Create Math Motion.** On first launch, the command checks your environment. Press **↵** to install Manim. Manim goes into a virtual environment owned by the extension, so your global Python stays untouched. The installation can take a few minutes.

   If the installation fails while building `pycairo`, install the system libraries first:

   ```sh
   brew install cairo pkg-config
   ```

4. **(Optional) Install LaTeX** to render formulas, for example [MacTeX](https://www.tug.org/mactex/).

## Usage

1. Open **Create Math Motion**.
2. Describe the animation, for example "Plot y = x^2 and show a tangent line moving along the curve". The Examples section of the action panel has more prompts.
3. Choose a model, the quality, and the format (MP4 or GIF).
4. Press **⌘↵** to generate.

The model designs the animation, which is checked before rendering. If the design breaks a rule, the model is asked to fix it, up to two times. The video is saved to `~/Downloads`.

From the result, you can open the video, show it in Finder, copy the generated blueprint, or regenerate with **⌘R**.

## Preferences

| Preference | Default                  | Description                    |
| ---------- | ------------------------ | ------------------------------ |
| Ollama URL | `http://localhost:11434` | Base URL of the Ollama server. |

## Troubleshooting

- **"Could not reach Ollama"**: start Ollama, or check the Ollama URL preference. Then press **⌘R** in the form to reload the models.
- **No models in the list**: download one with `ollama pull <model>`, then press **⌘R**.
- **"The generated blueprint is invalid"**: the model could not produce a valid animation. Try again, simplify the prompt, or choose a larger model.
- **Formulas fail to render**: install LaTeX, then try again.
