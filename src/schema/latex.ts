/** LaTeX command allowlist for `math` objects. */

export const LATEX_COMMANDS: ReadonlySet<string> = new Set([
  // Greek letters
  ...["alpha", "beta", "gamma", "delta", "epsilon", "varepsilon", "zeta", "eta", "theta", "vartheta"],
  ...["iota", "kappa", "lambda", "mu", "nu", "xi", "pi", "varpi", "rho", "sigma", "tau", "upsilon"],
  ...["phi", "varphi", "chi", "psi", "omega"],
  ...["Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi", "Sigma", "Upsilon", "Phi", "Psi", "Omega"],
  // Structures
  ...["frac", "dfrac", "tfrac", "sqrt", "binom", "left", "right", "big", "Big", "bigg", "Bigg"],
  ...["overline", "underline", "hat", "bar", "vec", "dot", "ddot", "tilde", "widehat", "widetilde"],
  ...["overbrace", "underbrace", "boxed", "text", "mathrm", "mathbf", "mathit", "mathbb", "mathcal"],
  ...["operatorname", "begin", "end", "quad", "qquad", "displaystyle", "textstyle"],
  // Big operators
  ...["sum", "prod", "int", "iint", "iiint", "oint", "lim", "limsup", "liminf", "max", "min", "sup", "inf"],
  // Functions
  ...["sin", "cos", "tan", "sec", "csc", "cot", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh"],
  ...["log", "ln", "exp", "det", "dim", "ker", "deg", "gcd", "arg"],
  // Relations and operators
  ...["le", "leq", "ge", "geq", "neq", "ne", "approx", "equiv", "sim", "simeq", "cong", "propto"],
  ...["times", "cdot", "div", "pm", "mp", "ast", "circ", "bullet", "oplus", "otimes"],
  ...["in", "notin", "ni", "subset", "subseteq", "supset", "supseteq", "cup", "cap", "setminus"],
  ...["land", "lor", "lnot", "neg", "forall", "exists", "nexists", "mid", "parallel", "perp"],
  ...["to", "gets", "mapsto", "rightarrow", "leftarrow", "leftrightarrow", "Rightarrow", "Leftarrow"],
  ...["Leftrightarrow", "implies", "iff", "uparrow", "downarrow"],
  // Symbols
  ...["infty", "partial", "nabla", "emptyset", "varnothing", "ell", "hbar", "Re", "Im", "angle"],
  ...["triangle", "degree", "prime", "cdots", "ldots", "vdots", "ddots", "dots"],
  ...["langle", "rangle", "lfloor", "rfloor", "lceil", "rceil", "vert", "Vert", "lbrace", "rbrace"],
]);

/** Environments allowed after `\begin` / `\end`. */
export const LATEX_ENVIRONMENTS: ReadonlySet<string> = new Set([
  "matrix",
  "pmatrix",
  "bmatrix",
  "vmatrix",
  "cases",
  "aligned",
]);

export type LatexProblem = { message: string };

export const checkLatex = (source: string): LatexProblem | undefined => {
  if (/[^\x20-\x7E]/.test(source)) {
    return { message: "Only ASCII is allowed in math; use a text object for other scripts" };
  }
  // `^^5c` is TeX's hex notation for a backslash and would bypass the command allowlist.
  if (source.includes("^^")) {
    return { message: '"^^" escapes are not allowed' };
  }

  for (const match of source.matchAll(/\\([A-Za-z]+|.)/g)) {
    const command = match[1];
    // Single-character escapes such as `\,` `\{` `\\` are spacing or literal symbols.
    if (!/^[A-Za-z]/.test(command)) {
      if (/[,;:! {}|\\]/.test(command)) continue;
      return { message: `"\\${command}" is not allowed` };
    }
    if (!LATEX_COMMANDS.has(command)) {
      return { message: `LaTeX command "\\${command}" is not allowed` };
    }
  }

  for (const match of source.matchAll(/\\(?:begin|end)\s*\{([^}]*)\}/g)) {
    if (!LATEX_ENVIRONMENTS.has(match[1])) {
      return { message: `LaTeX environment "${match[1]}" is not allowed` };
    }
  }

  return undefined;
};
