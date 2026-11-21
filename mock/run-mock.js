/**
 * 无设备回归测试
 *
 * 用法：node mock/run-mock.js
 *
 * 四个场景（2026-11-21 按安卓真机界面重写）：
 *   normal  —— 20 秒激励视频，验证「金币入口 → 福利中心 → 去完成 → 领取成功」整条链路
 *   landing —— 广告结束跳出商品落地页，验证三层兜底能退回来
 *   noad    —— 点「去完成」没反应，验证快速失败而不是空转 150 秒
 *   risk    —— 触发字节风控短信验证，验证脚本会停下等人而不是乱点
 *
 * 另外每个场景都会顺带验证一件事：
 *   广告正片自带的「商家推荐 / 精彩应用 / 立即下载」不能再被误判成落地页
 *   （iOS 版踩过这个坑，安卓这版重写时又差点中招）
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
    {
        name: "normal",
        desc: "20 秒激励视频，正常领奖 3 轮",
        adSeconds: 20,
        expectClaim: 3,
        expectEnterAd: 3,
        expectLandingEscape: 0,
        maxVirtualSec: 400,
    },
    {
        name: "landing",
        desc: "广告结束跳商品落地页",
        adSeconds: 20,
        expectClaim: 0,
        expectEnterAd: 1,
        expectLandingEscape: 1,
        maxVirtualSec: 400,
    },
    {
        name: "noad",
        desc: "点去完成没有广告（应快速失败）",
        adSeconds: 20,
        expectClaim: 0,
        expectEnterAd: 0,
        expectLandingEscape: 0,
        maxVirtualSec: 400,
    },
    {
        name: "risk",
        desc: "触发字节风控短信验证（应停下等人）",
        adSeconds: 20,
        expectClaim: 0,
        expectEnterAd: 1,
        expectLandingEscape: 0,
        maxVirtualSec: 600,
    },
    {
        name: "member",
        desc: "会员(VIP)态，福利中心无入口（应一次都不乱点）",
        adSeconds: 20,
        expectClaim: 0,
        expectEnterAd: 0,
        expectLandingEscape: 0,
        expectNoTaps: true,
        expectMaxTaps: 3,   // 每轮允许点一次底部「发现」tab 回发现页，其余一律不许点
        maxVirtualSec: 1100,
    },
    {
        name: "freedays",
        desc: "发现页右上「免N天」→ 广告 → 天数 +1（VIP 期间唯一可用路径）",
        adSeconds: 20,
        expectClaim: 2,       // 3 轮里首轮建基线，后两轮各 +1
        expectEnterAd: 3,
        expectLandingEscape: 0,
        expectDays: 21,      // 起始免18天，3 轮 +3
        maxVirtualSec: 500,
    },
];

var results = [];
console.log = realLog;

for (var i = 0; i < cases.length; i++) {
    var c = cases[i];
    buf = [];
    console.log = fakeLog;
    console.warn = fakeLog;
    console.error = fakeLog;

    stub.reset(c.name, c.adSeconds);

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
    var virtualSec = Math.round(stub.clock() / 1000);

    var passClaim = c.expectClaim === 0 ? st.claimDone === 0 : st.claimDone >= c.expectClaim;
    var passEnter = st.enterAd >= c.expectEnterAd;
    var passEscape = st.landingEscaped >= c.expectLandingEscape;
    var passTime = virtualSec <= c.maxVirtualSec;

    // 关键回归：正常场景里绝对不能出现"误判落地页"
    var falseLanding = c.expectLandingEscape === 0 && st.landingEscaped > 0;

    // 会员态场景里，脚本不该进会员页、不该进广告、不该领取；
    // 允许点底部「发现」tab 回发现页（主路径需要在发现页上工作）
    var passNoTap = !c.expectNoTaps ||
        (st.memberPage === 0 && st.enterAd === 0 && st.claimDone === 0 &&
            st.taps <= (c.expectMaxTaps === undefined ? 0 : c.expectMaxTaps));

    // 「免N天」场景：天数必须真的涨到预期值
    var passDays = c.expectDays === undefined || stub.scene.days >= c.expectDays;

    var pass = ok && passClaim && passEnter && passEscape && passTime && !falseLanding && passNoTap && passDays;

    results.push({
        name: c.name,
        desc: c.desc,
        pass: pass,
        ok: ok,
        errMsg: errMsg,
        claimDone: st.claimDone,
        enterAd: st.enterAd,
        landingEscaped: st.landingEscaped,
        taps: st.taps,
        memberPage: st.memberPage,
        doneCount: stub.scene.doneCount,
        coin: stub.scene.coin,
        days: stub.scene.days,
        virtualSec: virtualSec,
        falseLanding: falseLanding,
        passNoTap: passNoTap,
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
    realLog("  结果        : " + (x.pass ? "PASS" : "FAIL"));
    realLog("  领奖次数    : " + x.claimDone + "（预期 " + cases[r].expectClaim + "）");
    realLog("  进广告次数  : " + x.enterAd);
    realLog("  落地页退出  : " + x.landingEscaped + " 次");
    realLog("  任务进度    : 已完成 " + x.doneCount + " 次，金币 " + x.coin);
    if (cases[r].expectDays !== undefined) {
        realLog("  免费天数    : 免" + x.days + "天（预期 ≥ 免" + cases[r].expectDays + "天）");
    }
    realLog("  点击次数    : " + x.taps + (x.passNoTap ? "" : "（会员态不应点击，本应 0）"));
    realLog("  会员页进入  : " + x.memberPage + " 次");
    realLog("  虚拟耗时    : " + x.virtualSec + " 秒");
    if (x.falseLanding) realLog("  ⚠ 出现落地页误判（广告自带 panel 被当成落地页）");
    if (!x.ok) realLog("  异常        : " + x.errMsg);
    if (!x.pass) {
        realLog("  日志尾部    :");
        var lines = x.log.split("\n");
        for (var q = Math.max(0, lines.length - 14); q < lines.length; q++) {
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
