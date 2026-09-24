#!/usr/bin/env node
// 用虚拟时钟验证流式空闲/总时长超时、终止和同步请求失败的收口。
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const source = fs.readFileSync(__dirname + "/../yuketang-ComplexAutomation.user.js", "utf8");
const begin = source.indexOf("    async askAI(imageDataUrl,");
const end = source.indexOf("    createStreamState() {", begin);
assert(begin >= 0 && end > begin);

function scenario({ stream = true, throwOnStart = false } = {}) {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  const logs = [];
  let request;
  let abortCount = 0;
  const StopGate = { abortInflight: null, isStopped: () => false };
  const context = {
    Config: { aiTimeout: 240000 }, StopGate,
    Store: { getAIConf: () => ({
      url: "https://example.test/v1/responses", key: "test-key", model: "test-model",
      apiFormat: "openai-responses", authMethod: "bearer", stream,
      thinkingEnabled: false,
    }) },
    panel: { log: (message) => logs.push(message) },
    Date: { now: () => now },
    setTimeout: (callback, delay) => {
      const id = nextId++;
      timers.set(id, { due: now + delay, callback });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    GM_xmlhttpRequest: (details) => {
      request = details;
      if (throwOnStart) throw new Error("manager unavailable");
      return { abort: () => { abortCount++; } };
    },
  };
  const solver = vm.runInNewContext(`({${source.slice(begin, end)}})`, context);
  Object.assign(solver, {
    resolveAPIFormat: () => "openai-responses", normalizeEndpoint: (url) => url,
    buildPrompt: () => ({ system: "OK" }), getMaxOutputTokens: () => 16,
    buildThinkingParams: () => ({}), buildAuthHeaders: () => ({ Authorization: "Bearer test-key" }),
    createStreamState: () => ({ offset: 0, firstChunkReceived: false, content: "", reasoning: "" }),
    consumeStreamChunk: (state, responseText) => { state.offset = responseText.length; },
    extractUsableJsonText: () => "", extractStreamText: () => "OK", extractAIText: () => "OK",
  });
  const advance = (ms) => {
    const target = now + ms;
    for (;;) {
      const entry = [...timers].sort((a, b) => a[1].due - b[1].due)[0];
      if (!entry || entry[1].due > target) break;
      now = entry[1].due;
      timers.delete(entry[0]);
      entry[1].callback();
    }
    now = target;
  };
  return {
    solver, advance, StopGate, logs, timers,
    get request() { return request; },
    get abortCount() { return abortCount; },
  };
}

(async () => {
  const first = scenario();
  const firstPromise = first.solver.askAI("data:image/png;base64,AA==");
  first.advance(240000);
  await assert.rejects(firstPromise, /没有新回传.*尚未收到首个回传/);
  assert.equal(first.abortCount, 1);
  assert.equal(first.timers.size, 0);

  const partial = scenario();
  const partialPromise = partial.solver.askAI("data:image/png;base64,AA==");
  partial.advance(100000);
  partial.request.onprogress({ responseText: "event: response.created\n\n" });
  partial.advance(240000);
  await assert.rejects(partialPromise, /没有新回传.*已收到部分回传/);
  assert.equal(partial.abortCount, 1);
  const logCount = partial.logs.length;
  partial.request.onprogress({ responseText: "late data" });
  partial.request.onload({ status: 200, responseText: "{}" });
  assert.equal(partial.logs.length, logCount, "超时后不得再处理晚到的事件");

  const total = scenario();
  const totalPromise = total.solver.askAI("data:image/png;base64,AA==");
  for (let i = 0; i < 7; i++) {
    total.advance(100000);
    total.request.onprogress({ responseText: "x".repeat(i + 1) });
  }
  total.advance(20000);
  await assert.rejects(totalPromise, /总耗时超过 720 秒/);
  assert.equal(total.abortCount, 1);

  const stopped = scenario();
  const stoppedPromise = stopped.solver.askAI("data:image/png;base64,AA==");
  stopped.StopGate.abortInflight();
  await assert.rejects(stoppedPromise, /已终止/);
  assert.equal(stopped.abortCount, 1);
  assert.equal(stopped.timers.size, 0);

  const failed = scenario({ throwOnStart: true });
  await assert.rejects(failed.solver.askAI("data:image/png;base64,AA=="), /请求启动失败：manager unavailable/);
  assert.equal(failed.timers.size, 0);

  const nonStream = scenario({ stream: false });
  const nonStreamPromise = nonStream.solver.askAI("data:image/png;base64,AA==");
  assert.equal(nonStream.request.timeout, 240000);
  assert.equal(nonStream.timers.size, 0);
  nonStream.request.ontimeout();
  await assert.rejects(nonStreamPromise, /请求超时/);
  console.log("ai-timeout-selftest: OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });
