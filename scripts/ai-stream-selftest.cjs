#!/usr/bin/env node
// 用真实接口事件形态检查流式正文：Responses delta 只出现一次，推理不混入正文。
const fs = require("node:fs");
const assert = require("node:assert/strict");

const source = fs.readFileSync(__dirname + "/../yuketang-ComplexAutomation.user.js", "utf8");
const names = ["createStreamState", "consumeStreamBlock", "consumeStreamChunk", "flushStreamBuffer", "consumeStreamEvent", "extractStreamText", "flattenContent", "extractUsableJsonText"];
const methods = names.map((name) => {
  const match = source.match(new RegExp(`\\n {4}${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n {4}\\},`));
  assert(match, `未找到 ${name}`);
  return match[0];
}).join("\n");
const Solver = eval(`({${methods}})`);

const frame = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
const state = Solver.createStreamState();
const sse = frame("response.reasoning_text.delta", { delta: "内部推理" })
  + frame("response.output_text.delta", { delta: "答" })
  + frame("response.output_text.delta", { delta: "案" });
Solver.consumeStreamChunk(state, sse.slice(0, 57));
Solver.consumeStreamChunk(state, sse);
Solver.flushStreamBuffer(state);
assert.equal(state.content, "答案", "Responses 正文不能重复追加");
assert.equal(state.reasoning, "内部推理", "推理不能混入正文");
assert.equal(Solver.extractStreamText(state), "答案");

const chat = Solver.createStreamState();
const chatFirst = 'data: {"choices":[{"delta":{"content":"好"}}]}\n\n';
Solver.consumeStreamChunk(chat, chatFirst);
Solver.consumeStreamChunk(chat, chatFirst + 'data: {"choices":[{"delta":{"content":"的"}}]}\n\n');
assert.equal(Solver.extractStreamText(chat), "好的", "Chat Completions 流式正文仍须正常拼接");

console.log("ai-stream-selftest: OK");
