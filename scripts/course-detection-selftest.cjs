const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const filename = path.join(__dirname, "..", "yuketang-ComplexAutomation.user.js");
const script = fs.readFileSync(filename, "utf8");
const boot = /  boot\(\);\n\}\)\(\);\s*$/;
assert.match(script, boot);
const document = {
  title: "雨课堂",
  header: null,
  querySelector(selector) {
    return selector === ".learning-space-header__primary" ? this.header : null;
  },
  querySelectorAll: () => [],
};
const location = { search: "" };
const context = { document, location, URLSearchParams };
vm.runInNewContext(script.replace(boot, `  panel = { log() {} };
  globalThis.banks = QuestionBanks;
  Store.getPendingAutoStart = () => ({ classroomId: "42", course: "工程伦理" });
})();`), context, { filename });
const { banks } = context;

document.header = { innerText: "工程伦理" };
assert.equal(banks.getCourse("42"), "工程伦理");
assert.equal(banks.load(banks.getCourse("42")).questions.length, 303);

document.header = { textContent: " 中国式现代化的理论与实践 " };
location.search = "?courseName=" + encodeURIComponent("工程伦理");
assert.equal(banks.getCourse("42"), "中国式现代化");
assert.equal(banks.load(banks.getCourse("42")).questions.length, 370);

document.header = { innerText: "其他课程" };
assert.equal(banks.getCourse("42"), "");

document.header = { innerText: " " };
assert.equal(banks.getCourse("42"), "工程伦理");

location.search = "";
assert.equal(banks.getCourse("42"), "工程伦理");
assert.equal(banks.getCourse("43"), "");

console.log("OK: 课程页眉优先、两门课选择题库、URL 回退与课堂 ID 校验");
