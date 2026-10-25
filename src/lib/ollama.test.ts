import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import { chat, listModels, OllamaError, toOllamaFormat } from "@/lib/ollama";

describe("chat", () => {
  let server: http.Server;
  let baseUrl: string;
  let lastBody: Record<string, unknown> | undefined;

  before(async () => {
    server = http.createServer((req, res) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => {
        res.setHeader("Content-Type", "application/json");
        if (req.url === "/api/tags") {
          res.end(JSON.stringify({ models: [{ name: "qwen3:8b" }, { name: "gemma4:latest" }] }));
          return;
        }
        lastBody = JSON.parse(data);
        if (lastBody?.model === "missing") {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: "model 'missing' not found" }));
          return;
        }
        res.end(JSON.stringify({ message: { role: "assistant", content: '{"ok":true}' } }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => server.close());

  test("sends the request and returns the content", async () => {
    const format = { type: "object" };
    const content = await chat({ baseUrl, model: "m", messages: [{ role: "user", content: "hi" }], format });

    assert.equal(content, '{"ok":true}');
    assert.equal(lastBody?.stream, false);
    assert.deepEqual(lastBody?.format, format);
  });

  test("explains a missing model", async () => {
    await assert.rejects(chat({ baseUrl, model: "missing", messages: [] }), (error) => {
      assert.ok(error instanceof OllamaError);
      assert.match(error.message, /ollama pull missing/);
      return true;
    });
  });

  test("explains an unreachable server", async () => {
    await assert.rejects(chat({ baseUrl: "http://127.0.0.1:1", model: "m", messages: [] }), /Could not reach Ollama/);
    await assert.rejects(listModels("http://127.0.0.1:1"), /Could not reach Ollama/);
  });

  test("lists installed models by name", async () => {
    assert.deepEqual(await listModels(baseUrl), ["gemma4:latest", "qwen3:8b"]);
  });
});

describe("toOllamaFormat", () => {
  test("drops items: false from tuples only", () => {
    const tuple = { type: "array", prefixItems: [{ type: "number" }], items: false, minItems: 1, maxItems: 1 };
    const list = { type: "array", items: { type: "string" } };
    const schema = { type: "object", properties: { tuple, list, nested: { anyOf: [tuple] } } };

    const { items, ...rest } = tuple;
    assert.equal(items, false);
    assert.deepEqual(toOllamaFormat(schema), {
      type: "object",
      properties: { tuple: rest, list, nested: { anyOf: [rest] } },
    });
  });
});
