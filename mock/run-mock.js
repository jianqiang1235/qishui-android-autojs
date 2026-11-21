/**
 * 无设备回归测试
 *
 * 用法：node mock/run-mock.js
 *
 * 三个场景：
 *   normal  —— 35 秒广告（故意超过上游固定 30s 超时），验证自适应不会误判
 *   landing —— 广告结束跳电商落地页，验证三层兜底能退出来
 *   noad    —— 广告页没有倒计时，验证快速失败而不是空转 150 秒
 */

var stub = require("./stub.js");
var pathMod = require("path");

// 项目根目录（本文件在 <项目根>/mock/ 下）
// 注意：不能用硬编码目录名判断，clone 到别的目录名时会导致缓存清不掉、只有第一个场景真正执行
var PROJECT_ROOT = pathMod.resolve(__dirname, "..");

var buf = [];
var realLog = console.log;

function fakeLog() {
    var parts = [];
    for (var i = 0; i < arguments.length; i++) parts.push(String(arguments[i]));
    buf.push(parts.join(" "));
}
console.log = fakeLog;
console.warn = fakeLog;
console.error = fakeLog;

var CFG = require("../config.js");
CFG.MAX_LOOP_COUNT = 3;
CFG.LOG_OVERWRITE = true;
CFG.IDLE_SLEEP = 8000;

var cases = [
    { name: "normal", desc: "35 秒广告，正常领奖", expectClaim: 3, expectLandingEscape: 0 },
    { name: "landing", desc: "广告结束跳落地页", expectClaim: 0, expectLandingEscape: 1 },
    { name: "noad", desc: "无倒计时（无广告）", expectClaim: 0, expectLandingEscape: 0 },
];

var results = [];
console.log = realLog;

for (var i = 0; i < cases.length; i++) {
    var c = cases[i];
    buf = [];
    console.log = fakeLog;
    console.warn = fakeLog;
    console.error = fakeLog;

    stub.reset(c.name, 35);

    // 清掉模块缓存，让 main.js 重新执行
    // 注意：config.js 必须保留在缓存里，否则 MAX_LOOP_COUNT 会被重置为 0（不限轮次 → 死循环）
    var keys = Object.keys(require.cache);
    for (var k = 0; k < keys.length; k++) {
        if (keys[k].indexOf(PROJECT_ROOT) >= 0 &&
            keys[k].indexOf("stub.js") < 0 &&
            keys[k].indexOf("config.js") < 0 &&
            keys[k].indexOf("run-mock.js") < 0) {
            delete require.cache[keys[k]];
        }
    }

    var ok = true;
    var errMsg = "";
    try {
        require("../main.js");
        global.events.emit("exit");
    } catch (e) {
        ok = false;
        errMsg = String(e) + "\n" + (e && e.stack ? e.stack : "");
    }

    console.log = realLog;
    console.warn = realLog;
    console.error = realLog;

    var st = stub.scene.stats;
    var logText = buf.join("\n");
    var virtualMs = stub.clock();

    var passClaim = c.expectClaim === 0 ? st.claimDone === 0 : st.claimDone >= c.expectClaim;
    var passEscape = st.landingEscaped >= c.expectLandingEscape;
    var pass = ok && passClaim && passEscape;

    results.push({
        name: c.name,
        desc: c.desc,
        pass: pass,
        ok: ok,
        errMsg: errMsg,
        claimDone: st.claimDone,
        landingEscaped: st.landingEscaped,
        taps: st.taps,
        enterAd: st.enterAd,
        virtualSec: Math.round(virtualMs / 1000),
        log: logText,
    });
}

/* ---------- 输出报告 ---------- */

realLog("");
realLog("================ 无设备回归结果 ================");
for (var r = 0; r < results.length; r++) {
    var x = results[r];
    realLog("");
    realLog("场景 " + x.name + " —— " + x.desc);
    realLog("  结果      : " + (x.pass ? "PASS" : "FAIL"));
    realLog("  领奖次数  : " + x.claimDone + "（预期 " + cases[r].expectClaim + "）");
    realLog("  落地页退出: " + x.landingEscaped + " 次");
    realLog("  点击次数  : " + x.taps);
    realLog("  进广告次数: " + x.enterAd);
    realLog("  虚拟耗时  : " + x.virtualSec + " 秒");
    if (!x.ok) realLog("  异常      : " + x.errMsg);
    if (!x.pass) {
        realLog("  日志尾部  :");
        var lines = x.log.split("\n");
        for (var q = Math.max(0, lines.length - 12); q < lines.length; q++) {
            realLog("    " + lines[q]);
        }
    }
}

var failed = results.filter(function (v) { return !v.pass; }).length;
realLog("");
realLog("===============================================");
realLog(failed === 0 ? "全部通过 (" + results.length + "/" + results.length + ")" : ("失败 " + failed + " 个场景"));

// 把完整日志写盘，便于排查
var fs = require("fs");
var path = require("path");
var out = path.join(__dirname, "run-mock.log");
var text = "";
for (var m = 0; m < results.length; m++) {
    text += "\n########## " + results[m].name + " ##########\n" + results[m].log + "\n";
}
fs.writeFileSync(out, text);
realLog("完整日志: " + out);

process.exit(failed === 0 ? 0 : 1);
