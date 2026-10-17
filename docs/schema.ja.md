# Blueprint スキーマ(`src/schema/`)

`src/schema/` は、Animation Blueprint が正しいかを判定する場所です。Blueprint は、LLM がシーンの内容を記述して出力する JSON です。LLM、TypeScript の拡張機能、Python のレンダラーの3者をつなぐ契約にあたり、この検証を通った Blueprint だけがレンダラーに渡されます。

## 検証の流れ

```text
JSON テキスト
  │  validateBlueprintJson()      JSON.parse            → invalid_json
  ▼
unknown な値
  │  validateBlueprint()
  │    1. BlueprintSchema (Zod)   構造と値の範囲        → schema_error, unknown_field, out_of_range, …
  │    2. checkRules()            フィールド間ルール    → unknown_reference, target_overlap, …
  ▼
{ ok: true, blueprint, warnings } | { ok: false, errors, warnings }
```

- 1 で失敗した場合、2 は実行しません。そのため、ルール側では型が正しい前提で処理を書けます。
- 2 の中でも、時間とライフサイクルの検査は、すべての参照が解決できた場合だけ実行します。
- エラーは例外を投げずに集めるので、1回の実行で見つかった問題をすべて報告します。

## ファイル

| ファイル            | 役割                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `blueprint.ts`      | 構造、フィールドの型、必須項目、値の範囲(`LIMITS`)を Zod で定義する。JSON Schema の生成元。    |
| `rules.ts`          | JSON Schema では表現できないフィールド間ルール(`checkRules`)。                                 |
| `expression.ts`     | グラフ式のパーサー。許可した文法だけを受け付け、式を評価(実行)することはない。                 |
| `latex.ts`          | `math` オブジェクトで使える LaTeX コマンドと環境の許可リスト。                                 |
| `issues.ts`         | エラーの型と、エラーコードの一覧。                                                             |
| `validate.ts`       | 入口。JSON の読み込み → Zod → ルールの順に実行し、Zod のエラーを独自のエラーコードに変換する。 |
| `index.ts`          | 外から使う関数と型の出口。`@/schema` から import する。                                        |
| `blueprint.test.ts` | fixture、式の文法、LaTeX の許可リストのテスト。                                                |

ディレクトリ外の関連ファイル:

| パス                                   | 役割                                                                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `schema/blueprint.schema.json`         | `blueprint.ts` から生成した JSON Schema。Ollama の `format` と、Python レンダラーの `jsonschema` での検証に使う。手で編集しない。 |
| `scripts/generate-blueprint-schema.ts` | 上のファイルを書き出すスクリプト(`npm run generate:schema`)。                                                                     |
| `tests/renderer-fixtures/`             | 手書きの Blueprint と、それぞれの期待結果を書いた `expectations.json`。                                                           |

## 使い方

```ts
import { validateBlueprintJson } from "@/schema";

const result = validateBlueprintJson(text);
if (!result.ok) {
  for (const issue of result.errors) console.log(issue.code, issue.path, issue.message);
} else {
  render(result.blueprint); // Blueprint 型として扱える
}
```

各エラーには、`code`、`animations[1].target` のような `path`、人が読むための `message` が入ります。

## Blueprint の構造

```jsonc
{
  "version": "1.0",
  "title": "…",
  "scene": { "width": 1280, "height": 720, "fps": 30, "background": "#101014", "duration": 12 },
  "objects": [/* 描画オブジェクトとパラメータ */],
  "animations": [/* { target, action, start, duration, params } */],
}
```

どのオブジェクトも、定義にないフィールドを含むと拒否されます。

### オブジェクト

描画オブジェクトには、共通して `id`、`type`、`position`、`style`(`color`、`opacity`、`scale`)、`data` があります。

| `type`           | `data`                                             |
| ---------------- | -------------------------------------------------- |
| `text`           | `text`, `fontSize`                                 |
| `math`           | `latex`, `fontSize`                                |
| `axes`           | `xRange`, `yRange`                                 |
| `graph`          | `expression`, `xRange`, `axesId`                   |
| `circle`         | `radius`(4 以下)                                   |
| `dot`            | `radius`(0.5 以下)                                 |
| `rectangle`      | `width`, `height`                                  |
| `line` / `arrow` | `start`, `end`                                     |
| `polygon`        | `points`(3〜20 個)                                 |
| `parameter`      | `initial`, `integer`(`position` と `style` はない) |

### アニメーション

どのアニメーションにも `target`、`action`、`start`、`duration`、`params` があります。`params` の中身はアクションによって変わります。

| `action`                                             | `params`                  |
| ---------------------------------------------------- | ------------------------- |
| `create`, `write`, `fade_in`, `fade_out`, `indicate` | `{}`                      |
| `move`                                               | `to: [x, y]`              |
| `rotate`                                             | `angle`(度)               |
| `scale`                                              | `factor`                  |
| `transform`                                          | `into: <オブジェクト ID>` |
| `animate_parameter`                                  | `to`                      |

### 取り決め

- **単位:** 座標はピクセルではなく Manim の単位。画面に映るのはおよそ x ±7.1、y ±4 の範囲。
- **`position`:** オブジェクトの中心。`data` 内の形状(`start`、`end`、`points`)は、この中心からの相対座標。
- **角度:** 度。
- **時間:** 秒。各アニメーションは、開始を含み終了を含まない区間 `[start, start + duration)` を占める。
- **整数パラメータ:** `integer` が true の場合、値は `floor(value + 0.5)` として読む。

## 上限値(`LIMITS`)

| 項目                                   | 範囲                  |
| -------------------------------------- | --------------------- |
| `scene.width` / `scene.height`         | 320〜1920 / 240〜1080 |
| `scene.fps`                            | 15〜60                |
| `scene.duration`、`start`、`duration`  | 30 秒まで             |
| オブジェクト数 / アニメーション数      | 30 / 60 まで          |
| 座標                                   | x ±8、y ±4.5          |
| `style.scale`、`scale.factor`          | 0 より大きく 5 以下   |
| `style.opacity`                        | 0〜1                  |
| `fontSize`                             | 8〜144                |
| `text` / `latex` / `expression` の長さ | 200 / 300 / 300 文字  |
| 軸の範囲の値、`parameter` の値         | ±100                  |
| 1つの `sum()` の項数                   | 100                   |

## フィールド間ルール(`rules.ts`)

| ルール                                                                                                                                                                     | コード                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| オブジェクトの ID が重複しない。                                                                                                                                           | `duplicate_id`        |
| 範囲がすべて min < max になっている(`axes.xRange` / `yRange`、`graph.xRange`)。                                                                                            | `out_of_range`        |
| `animations[].target`、`graph.data.axesId`、`transform.params.into` が存在するオブジェクトを指している。                                                                   | `unknown_reference`   |
| 参照先の種類が正しい。`axesId` は `axes` を指す。`parameter` を対象にできるのは `animate_parameter` だけ。`transform` で `parameter` や自分自身には変形できない。          | `invalid_reference`   |
| どのアニメーションも `scene.duration` 以内に終わる。                                                                                                                       | `exceeds_duration`    |
| 1つのオブジェクトで2つのアニメーションを同時に実行しない。片方の終了時刻ともう片方の開始時刻がちょうど同じ場合は許可する。`transform` は `into` のオブジェクトも占有する。 | `target_overlap`      |
| オブジェクトがライフサイクルに従っている(下記参照)。                                                                                                                       | `lifecycle_violation` |
| グラフ式が文法に従い、各 `sum()` が項数の上限内に収まっている。                                                                                                            | `invalid_expression`  |
| LaTeX が許可されたコマンドと環境だけを使っている。                                                                                                                         | `forbidden_latex`     |
| 一度も登場しない描画オブジェクトは、エラーではなく警告にする。                                                                                                             | `never_appears`       |

### ライフサイクル

描画オブジェクトは `pending(未登場)→ visible(表示中)→ gone(退場)` の順に状態が変わります。

- `create`、`write`、`fade_in` は登場アクション。`pending` のときだけ使える。
- それ以外のアクションは `visible` のときだけ使える。
- `fade_out` で対象は `gone` になる。
- `transform` では、Manim の `ReplacementTransform` と同じく、対象が `gone` になり、`into` のオブジェクトが `pending` から `visible` になる。`into` のオブジェクトは、それより前に登場していてはいけない。
- `gone` になったオブジェクトは再登場できない。`ReplacementTransform` は変形元のオブジェクトの形そのものを書き換えるので、再登場させても元の形では表示されないため。
- `parameter` オブジェクトは常に使える状態で、登場アクションはいらない。

## グラフ式(`expression.ts`)

```text
expr    := term (("+" | "-") term)*
term    := unary (("*" | "/") unary)*
unary   := ("+" | "-") unary | power
power   := primary ("^" unary)?
primary := number | identifier | call | "(" expr ")"
call    := function "(" expr ")" | "sum(" identifier "," bound "," bound "," expr ")"
bound   := integer | parameter id
```

- **使える識別子:** 変数 `x`、定数 `pi` と `e`、パラメータの ID、`sum()` の本体の中でだけ使えるインデックス。
- **使える関数:** `sin`、`cos`、`tan`、`asin`、`acos`、`atan`、`sinh`、`cosh`、`tanh`、`exp`、`log`、`sqrt`、`abs`、`floor`、`ceil`。
- **`sum(k, from, to, body)`:** 有限和。上下限は整数リテラルかパラメータの ID でなければならない。項数は、そのパラメータがシーン中にとる最大値で検査する。最大値は、`initial` と、すべての `animate_parameter.to` のうち最大のもの。
- **使えないもの:** 掛け算記号の省略。`2x` ではなく `2 * x` と書く。

パーサーは AST(構文木)を組み立てるだけで、式を `eval()` に渡すことはありません。レンダラーは同じ AST を評価します。

## LaTeX(`latex.ts`)

- 使えるのは `LATEX_COMMANDS` にあるコマンドだけ。内容はギリシャ文字、分数と根号、総和・積分などの大型演算子、よく使う関数、関係演算子、矢印、各種記号。
- 使える環境は `matrix`、`pmatrix`、`bmatrix`、`vmatrix`、`cases`、`aligned` だけ。
- 空白や記号そのものを表す1文字のエスケープ(`\,` `\;` `\:` `\!` `\ ` `\{` `\}` `\|` `\\`)は使える。
- `^^` は拒否する。`^^5c` は TeX でバックスラッシュを16進で表す記法で、許可リストをすり抜けられてしまうため。
- ASCII 以外の文字は拒否する。MathTex では組版できないため。日本語などは `text` オブジェクトを使う。

これにより、`\input`、`\include`、`\write`、`\def`、`\csname` などのコマンドを防ぎます。これらは、ローカルのファイルの中身を動画に描画したり、TeX の入力の解釈を変えたりできてしまいます。

## JSON Schema

`npm run generate:schema` で、`BlueprintSchema` から `z.toJSONSchema`(draft 2020-12)を使って `schema/blueprint.schema.json` を書き出します。

- **Ollama:** `format` として渡し、生成される JSON の形を制約する。
- **Python レンダラー:** `jsonschema` での構造の検証に使う。

JSON Schema が表すのは `blueprint.ts` の構造だけです。`rules.ts` のルールは Python 側でも改めて実装する必要があります。`refine` や `transform` は生成される JSON Schema に反映されないので、`blueprint.ts` では使わず、その種の検査は `rules.ts` に書いてください。

## エラーコード

| コード                    | 発生元        | 意味                                                         |
| ------------------------- | ------------- | ------------------------------------------------------------ |
| `invalid_json`            | `validate.ts` | 入力が正しい JSON ではない。                                 |
| `schema_error`            | Zod           | その他の構造の問題。型の間違いや必須フィールドの欠落など。   |
| `unknown_field`           | Zod           | スキーマに定義されていないフィールド。                       |
| `unsupported_object_type` | Zod           | 未知の `objects[].type`。                                    |
| `unsupported_action`      | Zod           | 未知の `animations[].action`。                               |
| `out_of_range`            | Zod、rules    | 値が範囲外、または min ≥ max の範囲。                        |
| `duplicate_id`            | rules         | 2つのオブジェクトが同じ ID を使っている。                    |
| `unknown_reference`       | rules         | 存在しないオブジェクトへの参照。                             |
| `invalid_reference`       | rules         | 種類の合わないオブジェクトへの参照。                         |
| `exceeds_duration`        | rules         | アニメーションが `scene.duration` より後に終わる。           |
| `target_overlap`          | rules         | 1つのオブジェクトで2つのアニメーションの時間が重なっている。 |
| `lifecycle_violation`     | rules         | オブジェクトの今の状態では使えないアクション。               |
| `invalid_expression`      | rules         | 文法外のグラフ式、または `sum()` の項数が多すぎる。          |
| `forbidden_latex`         | rules         | 許可されていない LaTeX のコマンド、環境、文字。              |
| `never_appears`           | rules(警告)   | 一度も表示されない描画オブジェクト。                         |

## テスト

`npm test` は、まず `tsc --noEmit` を実行し、そのあと `src/**/*.test.ts` を実行します。テストでは次を確認しています。

- `tests/renderer-fixtures/` のすべての fixture が、`expectations.json` に書いたとおりの結果になる。有効な fixture は警告なしで通る。各 `invalid-*` fixture は、そこに書かれたコードと場所のエラーがちょうど1つ出て失敗する。
- `schema/blueprint.schema.json` が、`blueprint.ts` から生成した内容と一致する。
- 式の文法と LaTeX の許可リストが、代表的な入力を正しく通し、正しく拒否する。

## スキーマの変え方

オブジェクトの種類やアクションを追加する手順:

1. `blueprint.ts` に追加する。`visualObject()` か `animation()` を使う。
2. 必要なフィールド間ルールを `rules.ts` に追加する。新しい参照や、ライフサイクルへの新しい影響など。
3. `npm run generate:schema` を実行し、`schema/blueprint.schema.json` をコミットする。
4. 有効な fixture と、必要に応じて `invalid-*` の fixture を追加し、両方を `expectations.json` に記録する。
5. Python レンダラーにも、同じオブジェクトやアクションと、同じルールを実装する。

これまで有効だった Blueprint が無効になる変更をする場合は、`BLUEPRINT_VERSION` も変更してください。
