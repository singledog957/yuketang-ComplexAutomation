#!/usr/bin/env node
// 文本题目路径：空位顺序、视觉内容回退判据、严格 JSON 与主观题编辑器写入。
const fs = require("node:fs");
const assert = require("node:assert/strict");

const source = fs.readFileSync(__dirname + "/../yuketang-ComplexAutomation.user.js", "utf8");
const grab = (start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, `未找到 ${start}`);
  return source.slice(from, to);
};
const Solver = eval(`({
${grab("    getWrittenQuestionText(", "    getVisibleOptionCount(")}
${grab("    detectQuestionType(itemBodyElement) {", "    parseWrittenAnswer(")}
${grab("    parseWrittenAnswer(raw, questionType, blankCount = 0) {", "    async fillBlanks(")}
})`);
const submitStart = source.indexOf("    async autoSelectAndSubmit(");
const submitEnd = source.indexOf("\n  };", submitStart);
assert(submitStart >= 0 && submitEnd > submitStart);
Object.assign(Solver, eval(`({${source.slice(submitStart, submitEnd)}})`));
const logs = [];
const panel = { log: (message) => logs.push(message) };
let unsafeWindow;
const StopGate = { isStopped: () => false };
const AiWorkspace = { isDisabledElement: () => false };
const Utils = { sleep: async () => {} };
const text = (value) => ({ nodeType: 3, textContent: value });
const element = (tagName, childNodes = [], options = {}) => ({
  nodeType: 1, tagName: tagName.toUpperCase(), childNodes,
  type: options.type,
  matches: () => false,
  querySelector: options.querySelector || (() => null),
});

(async () => {
  const body = element("div", [
    text("Boundary Attack 从一个已经是"),
    element("input", [], { type: "text" }),
    text("的点开始初始化，在优化过程中沿边界随机游走。"),
  ]);
  const root = { querySelector: (selector) => selector === ".item-body" ? body : null };
  const written = Solver.getWrittenQuestionText(root, "fillblank");
  assert.match(written.text, /已经是【空1】的点/);
  assert.equal(written.blankCount, 1);
  assert.equal(written.hasVisual, false);
  assert.deepEqual(Solver.parseWrittenAnswer('{"type":"fillblank","answers":["非对抗样本"]}', "fillblank", 1),
    { type: "fillblank", answers: ["非对抗样本"] });
  assert.equal(Solver.parseWrittenAnswer('{"type":"fillblank","answers":[]}', "fillblank", 1), null);
  assert.equal(Solver.parseWrittenAnswer('非对抗样本', "fillblank", 1), null);
  assert.equal(Solver.parseWrittenAnswer('{"type":"fillblank","answers":["a","b"]}', "fillblank", 1), null);

  body.childNodes.push(element("img"));
  assert.equal(Solver.getWrittenQuestionText(root, "fillblank").hasVisual, true);

  const questionBody = element("div", [text("请简述拟牛顿法优化法的局限性。")]);
  const subjectiveBody = element("div", [], {
    querySelector: (selector) => selector === ".problem-body" ? questionBody : null,
  });
  const subjectiveRoot = {
    querySelector: (selector) => selector === ".item-body" ? subjectiveBody : null,
  };
  assert.equal(Solver.getWrittenQuestionText(subjectiveRoot, "subjective").text,
    "请简述拟牛顿法优化法的局限性。");
  assert.deepEqual(Solver.parseWrittenAnswer('{"type":"subjective","answers":["收敛效果依赖条件。"]}', "subjective"),
    { type: "subjective", answers: ["收敛效果依赖条件。"] });
  assert.equal(Solver.parseWrittenAnswer('{"type":"subjective","answers":["一","二"]}', "subjective"), null);

  let editorText = "";
  unsafeWindow = { UE: { getEditor: () => ({
    setContent: (html) => { editorText = html.replace(/<[^>]+>/g, ""); },
    getContentTxt: () => editorText,
  }) } };
  const container = { querySelector: () => ({ id: "ueditor-1" }) };
  const editorRoot = { querySelector: () => container };
  assert.equal(await Solver.fillSubjectiveAnswer("简短的连续正文。", editorRoot), true);
  assert.equal(editorText, "简短的连续正文。");
  assert(logs.some((line) => line.includes("AI 建议主观题")));

  let wholeAssignmentClicked = false;
  const wholeAssignmentButton = {
    innerText: "提交作业", offsetParent: {},
    click: () => { wholeAssignmentClicked = true; },
  };
  const ownerDocument = { querySelectorAll: () => [wholeAssignmentButton] };
  const answerRoot = {
    ownerDocument,
    parentElement: { querySelectorAll: () => [] },
    querySelectorAll: () => [],
  };
  Solver.detectQuestionType = () => "subjective";
  Solver.parseAIAnswer = () => ({ type: "subjective", answers: ["正文"] });
  Solver.fillSubjectiveAnswer = async () => true;
  assert.equal(await Solver.autoSelectAndSubmit("{}", answerRoot), "incomplete");
  assert.equal(wholeAssignmentClicked, false, "不得把提交作业按钮当逐题提交");
  console.log("written-answer-selftest: OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });
