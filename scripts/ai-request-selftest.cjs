#!/usr/bin/env node
// 验证 askAI 每次读取当前模型配置，并按流式/非流式设置 GM 请求超时。
const fs = require("node:fs");
const assert = require("node:assert/strict");

const source = fs.readFileSync(__dirname + "/../yuketang-ComplexAutomation.user.js", "utf8");
const begin = source.indexOf("    async askAI(imageDataUrl,");
const end = source.indexOf("    createStreamState() {", begin);
assert(begin >= 0 && end > begin, "未找到 askAI 方法");

const Config = { aiTimeout: 240000 };
const StopGate = { abortInflight: null, isStopped: () => false };
const logs = [];
const panel = { log: (message) => logs.push(message) };
let saved = {
  url: "https://example.test/v1/responses",
  key: "test-key",
  model: "gpt-6-sol",
  apiFormat: "openai-responses",
  authMethod: "bearer",
  thinkingEnabled: true,
  maxTokens: 0,
  stream: true,
};
const Store = { getAIConf: () => ({ ...saved }) };
let request;
const GM_xmlhttpRequest = (details) => {
  request = details;
  queueMicrotask(() => details.onload({ status: 200, responseText: "{}" }));
  return { abort() {} };
};
const Solver = eval(`({${source.slice(begin, end)}})`);
Object.assign(Solver, {
  resolveAPIFormat: () => "openai-responses",
  normalizeEndpoint: (url) => url,
  buildPrompt: () => ({ system: "Reply OK" }),
  getMaxOutputTokens: () => 32,
  buildThinkingParams: () => ({}),
  buildAuthHeaders: () => ({ Authorization: "Bearer test-key" }),
  createStreamState: () => ({ firstChunkReceived: false }),
  consumeStreamChunk: () => {},
  flushStreamBuffer: () => {},
  extractStreamText: () => "OK",
  extractAIText: () => "OK",
});

(async () => {
  assert.equal(await Solver.askAI("data:image/png;base64,AA=="), "OK");
  assert.equal(JSON.parse(request.data).model, "gpt-6-sol");
  assert.equal(Object.hasOwn(request, "timeout"), false, "流式请求不应传 timeout: 0");
  assert(logs.some((line) => line.includes("model=gpt-6-sol")), "日志应显示实际模型");

  saved = { ...saved, model: "gpt-5.6-luna", stream: false };
  assert.equal(await Solver.askAI("data:image/png;base64,AA=="), "OK");
  assert.equal(JSON.parse(request.data).model, "gpt-5.6-luna", "每次请求要重读模型配置");
  assert.equal(request.timeout, Config.aiTimeout, "非流式保留超时上限");
  console.log("ai-request-selftest: OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });
