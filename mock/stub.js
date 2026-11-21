/**
 * AutoJs6 运行时模拟器
 *
 * 目的：在没有安卓设备的情况下，验证 main.js 的控制流是否会卡死、超时、空转。
 * 做法：把 AutoJs6 的全局 API 全部用假实现挂到 global，
 *       sleep() 不真睡只推进虚拟时钟，界面用"阶段状态机"生成控件节点。
 */

var clock = 0;

/* 把 Date.now 也接到虚拟时钟上，否则代码里的 Date.now() 判断不会随 sleep 推进，
   真实运行时 sleep 会推进真实时间，这一步是 mock 必须补的。 */
var realNow = Date.now.bind(Date);
var baseMs = realNow();
Date.now = function () {
    return baseMs + clock;
};

var screen = {
    width: 1080,
    height: 2400,
};

/* ---------- 节点构造 ---------- */

function rect(l, t, r, b) {
    return {
        left: l, top: t, right: r, bottom: b,
        width: function () { return r - l; },
        height: function () { return b - t; },
        centerX: function () { return (l + r) / 2; },
        centerY: function () { return (t + b) / 2; },
    };
}

function node(text, desc, clickable, box) {
    return {
        text: function () { return text; },
        desc: function () { return desc; },
        clickable: function () { return !!clickable; },
        click: function () {
            if (!clickable) return false;
            scene.stats.taps++;
            handleTap(text);
            return true;
        },
        bounds: function () { return box; },
    };
}

/* ---------- 场景状态机 ---------- */

var scene = {
    mode: "normal", // normal / landing / noad
    phase: "player", // player / ad / claim / success / landing
    adStart: 0,
    adSeconds: 35,
    successAt: 0,
    landingAt: 0,
    stats: { taps: 0, enterAd: 0, claimDone: 0, landingEscaped: 0, ocrCalls: 0 },
};

function elapsed() {
    return clock / 1000;
}

function goPhase(p) {
    scene.phase = p;
    if (p === "ad") scene.adStart = clock;
    if (p === "success") scene.successAt = clock;
    if (p === "landing") scene.landingAt = clock;
}

function remainingSec() {
    return Math.max(0, Math.round(scene.adSeconds - (clock - scene.adStart) / 1000));
}

/**
 * 状态机随时间自动推进（每次读取界面时调用）
 */
function advance() {
    if (scene.mode === "noad") return; // 无广告场景保持停在广告页
    if (scene.phase === "ad" && remainingSec() <= 1) {
        if (scene.mode === "landing") goPhase("landing");
        else goPhase("claim");
    }
    if (scene.phase === "success" && clock - scene.successAt > 2500) {
        goPhase("player");
    }
}

function currentNodes() {
    advance();
    var list = [];

    if (scene.phase === "player") {
        list.push(node("汽水音乐", "", false, rect(0, 0, 1080, 200)));
        list.push(node("8元开通", "会员弹窗", true, rect(700, 900, 900, 960)));
        list.push(node("免费听歌", "看广告免费听 30 分钟", true, rect(540, 1900, 900, 2000)));
        list.push(node("我的", "", true, rect(900, 2250, 1080, 2380)));
    } else if (scene.phase === "ad") {
        if (scene.mode === "noad") {
            list.push(node("广告", "第三方广告", false, rect(0, 300, 1080, 2000)));
            list.push(node("跳过", "", true, rect(950, 120, 1060, 180)));
        } else {
            var sec = remainingSec();
            list.push(node(sec + "秒后可领奖励", "", false, rect(700, 120, 1000, 180)));
            list.push(node("跳过", "", true, rect(950, 120, 1060, 180)));
            list.push(node("广告", "第三方广告", false, rect(0, 300, 1080, 2000)));
        }
    } else if (scene.phase === "claim") {
        list.push(node("领取奖励", "", true, rect(300, 1800, 780, 1900)));
        list.push(node("关闭广告", "", true, rect(950, 120, 1060, 180)));
    } else if (scene.phase === "success") {
        list.push(node("领取成功", "", false, rect(700, 150, 1000, 210)));
        list.push(node("继续听歌", "", true, rect(300, 1800, 780, 1900)));
    } else if (scene.phase === "landing") {
        list.push(node("向上滑动浏览落地页", "", false, rect(200, 1900, 880, 1980)));
        list.push(node("领券购买", "", true, rect(300, 2150, 780, 2260)));
        list.push(node("完成", "", true, rect(30, 100, 200, 170)));
        list.push(node("立即下载", "", true, rect(300, 2300, 780, 2380)));
    }
    return list;
}

/* ---------- 选择器 ---------- */

function makeSelector(pred) {
    var sel = {
        find: function () {
            var all = currentNodes();
            var out = [];
            for (var i = 0; i < all.length; i++) {
                if (pred(all[i])) out.push(all[i]);
            }
            return out;
        },
        findOnce: function () {
            var a = sel.find();
            return a.length > 0 ? a[0] : null;
        },
        exists: function () {
            return sel.find().length > 0;
        },
    };
    return sel;
}

global.text = function (v) {
    return makeSelector(function (n) { return n.text() === v; });
};
global.textContains = function (v) {
    return makeSelector(function (n) { return n.text().indexOf(v) >= 0; });
};
global.textMatches = function (re) {
    var r = re instanceof RegExp ? re : new RegExp(re);
    return makeSelector(function (n) { return n.text() && r.test(n.text()); });
};
global.textStartsWith = function (v) {
    return makeSelector(function (n) { return n.text().indexOf(v) === 0; });
};
global.desc = function (v) {
    return makeSelector(function (n) { return n.desc() === v; });
};
global.descContains = function (v) {
    return makeSelector(function (n) { return n.desc().indexOf(v) >= 0; });
};
global.descMatches = function (re) {
    var r = re instanceof RegExp ? re : new RegExp(re);
    return makeSelector(function (n) { return n.desc() && r.test(n.desc()); });
};

/* ---------- 设备与手势 ---------- */

global.device = {
    width: screen.width,
    height: screen.height,
    sdkInt: 34,
    brand: "mock",
    model: "MockPhone",
    isScreenOn: function () { return true; },
    wakeUp: function () { },
    keepScreenOn: function () { },
    keepScreenDim: function () { },
    cancelKeepingAwake: function () { },
};

global.sleep = function (ms) {
    clock += (ms || 0);
    // 熔断：虚拟时间超过 2 小时说明有死循环，直接抛错而不是卡住测试
    if (clock > 2 * 60 * 60 * 1000) {
        throw new Error("mock 虚拟时间超过 2 小时，疑似死循环（clock=" + clock + "ms）");
    }
};

global.click = function (x, y) {
    var nodes = currentNodes();
    for (var i = 0; i < nodes.length; i++) {
        var b = nodes[i].bounds();
        if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) {
            if (nodes[i].clickable()) {
                scene.stats.taps++;
                handleTap(nodes[i].text());
                return true;
            }
        }
    }
    return false;
};

function handleTap(text) {
    console.log("    [mock 点击] " + text);
    if (scene.phase === "player" && text.indexOf("免费听歌") >= 0) {
        scene.stats.enterAd++;
        goPhase("ad");
        return;
    }
    if (scene.phase === "ad" && text.indexOf("跳过") >= 0) {
        goPhase(scene.mode === "landing" ? "landing" : "claim");
        return;
    }
    if (scene.phase === "claim" && text.indexOf("领取奖励") >= 0) {
        scene.stats.claimDone++;
        goPhase("success");
        return;
    }
    if (scene.phase === "landing" && (text === "完成" || text === "关闭")) {
        scene.stats.landingEscaped++;
        goPhase("player");
        return;
    }
}

global.swipe = function () { return true; };
global.home = function () { goPhase("player"); return true; };
global.back = function () {
    if (scene.phase === "landing") {
        goPhase("player");
        return true;
    }
    return true;
};

/* ---------- 应用控制 ---------- */

var foreground = "com.luna.music";

global.currentPackage = function () { return foreground; };
global.currentActivity = function () { return ".MainActivity"; };

global.app = {
    launchPackage: function (pkg) {
        foreground = pkg;
        return true;
    },
    openAppSetting: function () { return true; },
    getPackageName: function () { return "com.luna.music"; },
};

global.auto = {
    waitFor: function () { return true; },
    service: {},
    setMode: function () { },
};

global.events = {
    handlers: {},
    on: function (name, fn) { this.handlers[name] = fn; },
    emit: function (name) {
        var f = this.handlers[name];
        if (f) f();
    },
};

/* ---------- 文件 ---------- */

var memfs = {};

global.files = {
    ensureDir: function () { return true; },
    write: function (p, content) { memfs[p] = content; return true; },
    append: function (p, content) {
        memfs[p] = (memfs[p] || "") + content;
        return true;
    },
    read: function (p) { return memfs[p] || ""; },
    exists: function (p) { return memfs[p] !== undefined; },
    join: function () {
        return Array.prototype.slice.call(arguments).join("/").replace(/\/+/g, "/");
    },
};

global.toast = function (msg) { console.log("    [toast] " + msg); };
global.toastLog = function (msg) { console.log("    [toast] " + msg); };

/* ---------- 截图与 OCR ---------- */

global.images = {
    requestScreenCapture: function () { return true; },
    captureScreen: function () { return { width: screen.width, height: screen.height }; },
    save: function () { return true; },
};

global.ocr = {
    mode: "mlkit",
    detect: function () {
        scene.stats.ocrCalls++;
        var nodes = currentNodes();
        var out = [];
        for (var i = 0; i < nodes.length; i++) {
            if (!nodes[i].text()) continue;
            out.push({
                label: nodes[i].text(),
                confidence: 0.95,
                bounds: nodes[i].bounds(),
            });
        }
        return out;
    },
    recognizeText: function () {
        return currentNodes().map(function (n) { return n.text(); });
    },
};

/* ---------- 导出 ---------- */

module.exports = {
    scene: scene,
    clock: function () { return clock; },
    nodes: currentNodes,
    memfs: memfs,
    reset: function (mode, adSeconds) {
        clock = 0;
        baseMs = realNow();
        scene.mode = mode || "normal";
        scene.phase = "player";
        scene.adStart = 0;
        scene.adSeconds = adSeconds || 35;
        scene.stats = { taps: 0, enterAd: 0, claimDone: 0, landingEscaped: 0, ocrCalls: 0 };
        foreground = "com.luna.music";
        memfs = {};
    },
};
