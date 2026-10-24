import { environment } from "@raycast/api";
import { execFile, spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { EnvironmentStatus } from "@/lib/types";

const execFileAsync = promisify(execFile);

const isWindows = process.platform === "win32";

const EXTRA_PATHS = isWindows ? [] : ["/opt/homebrew/bin", "/usr/local/bin", "/Library/TeX/texbin"];
export const ENV = { ...process.env, PATH: [...EXTRA_PATHS, process.env.PATH].join(path.delimiter) };

const SYSTEM_PYTHON = isWindows ? "python" : "python3";

export const VENV_DIR = path.join(environment.supportPath, "venv");
export const VENV_PYTHON = isWindows
  ? path.join(VENV_DIR, "Scripts", "python.exe")
  : path.join(VENV_DIR, "bin", "python");

export const RENDER_SCRIPT = path.join(environment.assetsPath, "renderer", "render.py");
export const OUTPUT_DIR = path.join(os.homedir(), "Downloads");

const tryRun = async (command: string, args: string[]): Promise<string | undefined> => {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { env: ENV, timeout: 15_000 });
    return (stdout || stderr).trim().split("\n")[0];
  } catch {
    return undefined;
  }
};

export const findLatex = () => tryRun("latex", ["--version"]);

export const checkEnvironment = async (): Promise<EnvironmentStatus> => {
  const [python, manim, latex] = await Promise.all([
    tryRun(SYSTEM_PYTHON, ["--version"]),
    tryRun(VENV_PYTHON, ["-c", "import importlib.metadata as m; print(m.version('manim'))"]),
    findLatex(),
  ]);
  return { python, manim, latex };
};

const runStreaming = (command: string, args: string[], onOutput: (line: string) => void): Promise<void> => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: ENV });
    const tail: string[] = [];

    const handle = (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        tail.push(trimmed);
        if (tail.length > 20) tail.shift();
        onOutput(trimmed);
      }
    };

    child.stdout.on("data", handle);
    child.stderr.on("data", handle);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} exited with code ${code}\n\n${tail.join("\n")}`));
    });
  });
};

export const installManim = async (onOutput: (line: string) => void): Promise<void> => {
  onOutput("Creating virtual environment…");
  await runStreaming(SYSTEM_PYTHON, ["-m", "venv", VENV_DIR], onOutput);
  await runStreaming(VENV_PYTHON, ["-m", "pip", "install", "--upgrade", "pip"], onOutput);
  await runStreaming(VENV_PYTHON, ["-m", "pip", "install", "manim"], onOutput);
};
