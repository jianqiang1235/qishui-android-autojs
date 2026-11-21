/**
 * AutoJs6 运行时模拟器
 *
 * 目的：在没有安卓设备的情况下，验证 main.js 的控制流是否会卡死、超时、空转。
 * 做法：把 AutoJs6 的全局 API 全部用假实现挂到 global，
 *       sleep() 不真睡只推进虚拟时钟，界面用"阶段状态机"生成控件节点。
 *
 * 【2026-11-21 按真机实测重写】
 *   界面结构照搬荣耀畅玩40 的实际 dump 结果：
 *     - 分辨率 720x1612，坐标与实测完全一致
 *     - 倒计时在 content-desc（`14秒后可领取奖励，关闭，按钮`），不在 text 里
 *     - 福利中心是 Flutter 页，按钮按坐标点
 *     - 广告 Activity = ExcitingVideoActivity
 *     - 广告正片自带「商家推荐/精彩应用/立即下载」，用来验证不会再误判成落地页
 */

var clock = 0;

/* sleep 只推进虚拟时钟，所以 Date.now 也必须跟着走 */
var realNow = Date.now.bind(Date);
var baseMs = realNow();
Date.now = function () {
    return baseMs + clock;
};

var screen = {
    width: 720,
    height: 1612,
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
            handleTap(text, desc, Math.round(box.centerX()), Math.round(box.centerY()));
            return true;
        },
        bounds: function () { return box; },
    };
}

/* ---------- 场景状态机 ---------- */

var scene = {
    mode: "normal",      // normal / noad / landing / risk / member
    phase: "player",     // player / welfare / ad / claim / shop / risk / member
    adStart: 0,
    adSeconds: 20,
    doneCount: 0,        // 「看广告赚金币 已完成N次」
    coin: 0,             // 金币收益
    stats: { taps: 0, enterAd: 0, claimDone: 0, landingEscaped: 0, ocrCalls: 0, memberPage: 0 },
};

function goPhase(p) {
    scene.phase = p;
    if (p === "ad") scene.adStart = clock;
}

function remainingSec() {
    return Math.max(0, Math.round(scene.adSeconds - (clock - scene.adStart) / 1000));
}

/** 时间推进：广告倒计时到 0 后进入 claim / shop / risk */
function advance() {
    if (scene.phase !== "ad") return;
    if (remainingSec() > 0) return;

    if (scene.mode === "landing") {
        goPhase("shop");
    } else if (scene.mode === "risk") {
        goPhase("risk");
    } else {
        goPhase("claim");
    }
}

/* ---------- 各阶段控件 ---------- */

function currentNodes() {
    advance();
    var list = [];

    if (scene.phase === "player") {
        if (scene.mode === "member") {
            // 实测会员态播放页：右上角【没有】金币入口，底部第 4 个 tab 是「会员」
            list.push(node("汽水音乐", "", false, rect(0, 0, 300, 100)));
            list.push(node("选择听歌偏好", "", false, rect(296, 60, 504, 124)));
            list.push(node("发现", "", true, rect(34, 1511, 110, 1554)));
            list.push(node("听抖音", "", true, rect(159, 1507, 273, 1558)));
            list.push(node("音乐", "", true, rect(343, 1511, 419, 1554)));
            list.push(node("会员", "", true, rect(466, 1507, 542, 1558)));
            list.push(node("我的", "", true, rect(610, 1507, 686, 1558)));
        } else {
            // 普通态播放页：右上角金币入口 + 底部 tab（第 4 个是「福利」）
            list.push(node("汽水音乐", "", false, rect(0, 0, 300, 100)));
            list.push(node("", "金币入口", true, rect(536, 48, 600, 136)));
            list.push(node("选择听歌偏好", "", false, rect(296, 60, 504, 124)));
            list.push(node("发现", "", true, rect(39, 1510, 105, 1554)));
            list.push(node("福利", "", true, rect(471, 1510, 537, 1554)));
            list.push(node("我的", "", true, rect(615, 1510, 681, 1554)));
        }

    } else if (scene.phase === "member") {
        // 实测会员充值页：只有套餐和底部 tab，全程没有任何金币/福利入口节点
        list.push(node("", "超低价续费 汽水会员", false, rect(0, 0, 300, 200)));
        list.push(node("", "会员中心", true, rect(600, 60, 700, 130)));
        list.push(node("", "7天体验卡，￥1，原价11元，限时特惠，已选中", false, rect(32, 408, 318, 741)));
        list.push(node("", "连续包年，￥78，原价128元，立省50元，低至6.5元/月", false, rect(334, 408, 581, 741)));
        list.push(node("", "1元开通", true, rect(32, 1290, 688, 1386)));
        list.push(node("发现", "", true, rect(34, 1511, 110, 1554)));
        list.push(node("听抖音", "", true, rect(159, 1507, 273, 1558)));
        list.push(node("音乐", "", true, rect(343, 1511, 419, 1554)));
        list.push(node("会员", "", true, rect(466, 1507, 542, 1558)));
        list.push(node("我的", "", true, rect(610, 1507, 686, 1558)));

    } else if (scene.phase === "welfare") {
        // 福利中心：标题 + 资产 + 任务列表（按钮按坐标，节点只给描述文字）
        list.push(node("", "做任务 赚金币", false, rect(30, 390, 300, 440)));
        list.push(node(coinText(), "金币收益", false, rect(40, 250, 300, 330)));
        list.push(node("", "签到得金币 288", false, rect(40, 500, 508, 580)));
        list.push(node("", "逛街赚金币 最高5000", false, rect(40, 660, 508, 700)));
        list.push(node("", "浏览低价商品30秒即得3663金币，每日可完成0/15次", false, rect(40, 697, 508, 769)));
        list.push(node("", "看广告赚金币 2370", false, rect(40, 820, 508, 860)));
        list.push(node("", "本次得2370金币，已完成" + scene.doneCount + "次", false, rect(40, 887, 508, 923)));
        // 「看广告赚金币」那条右侧的「去完成」按钮 —— 实测无无障碍文字，靠坐标点
        list.push(node("", "去完成", true, rect(535, 820, 680, 900)));
        list.push(node("", "去逛街", true, rect(535, 660, 680, 740)));
        list.push(node("", "去签到", true, rect(535, 500, 680, 580)));
        list.push(node("发现", "", true, rect(39, 1510, 105, 1554)));
        list.push(node("福利", "", true, rect(471, 1510, 537, 1554)));
        list.push(node("我的", "", true, rect(615, 1510, 681, 1554)));

    } else if (scene.phase === "ad") {
        // 激励视频：倒计时在 desc 里（实测真实写法）
        var sec = remainingSec();

        if (scene.mode === "noad") {
            list.push(node("", "广告", false, rect(0, 300, 720, 1300)));
            list.push(node("", "跳过", true, rect(600, 60, 690, 120)));
        } else {
            list.push(node("", sec + "秒后可领取奖励，关闭，按钮", true, rect(380, 48, 688, 112)));
            list.push(node("", "广告", false, rect(30, 48, 100, 112)));
            list.push(node("", "反馈，按钮", false, rect(268, 48, 348, 112)));
            // 实测：每条广告正片都自带这三个词，用来验证不再误判落地页
            list.push(node("", "红果免费漫剧", false, rect(258, 1372, 462, 1412)));
            list.push(node("", "商家推荐", false, rect(252, 1433, 348, 1464)));
            list.push(node("", "精彩应用", false, rect(372, 1433, 468, 1464)));
            list.push(node("", "立即下载", true, rect(30, 1480, 690, 1560)));
        }

    } else if (scene.phase === "claim") {
        // 倒计时归零：右上角 desc 变「领取成功，关闭，按钮」
        list.push(node("", "领取成功，关闭，按钮", true, rect(518, 48, 688, 112)));
        list.push(node("", "番茄免费小说", false, rect(258, 1372, 462, 1412)));
        list.push(node("", "商家推荐", false, rect(252, 1433, 348, 1464)));
        list.push(node("", "精彩应用", false, rect(372, 1433, 468, 1464)));
        list.push(node("", "立即下载", true, rect(30, 1480, 690, 1560)));

    } else if (scene.phase === "shop") {
        // 跳出 App 的商品落地页
        list.push(node("", "向上滑动浏览落地页", false, rect(200, 1900 - 1200, 520, 200)));
        list.push(node("", "领券购买", true, rect(300, 1000, 420, 1080)));
        list.push(node("", "完成", true, rect(30, 100, 200, 170)));
        list.push(node("", "立即下载", true, rect(300, 1300, 690, 1380)));

    } else if (scene.phase === "risk") {
        // 字节风控短信验证页
        list.push(node("输入验证码", "", false, rect(64, 196, 344, 272)));
        list.push(node("验证码已发送至+86 185****8427", "", false, rect(64, 296, 493, 334)));
        list.push(node("53s后重新获取", "", false, rect(64, 574, 254, 612)));
    }
    return list;
}

function coinText() {
    return String(scene.coin);
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

/**
 * className 选择器
 * 真实机子上底部 tab 文字都是 android.widget.TextView（已在 d3.xml 里核实），
 * mock 里所有节点都当 TextView 返回，保证 bottomTabs() 能读到 tab 文字
 */
global.className = function (v) {
    return makeSelector(function () { return true; });
};

/* ---------- 设备与手势 ---------- */

global.device = {
    width: screen.width,
    height: screen.height,
    sdkInt: 33,
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
    if (clock > 3 * 60 * 60 * 1000) {
        throw new Error("mock 虚拟时间超过 3 小时，疑似死循环（clock=" + clock + "ms）");
    }
};

global.click = function (x, y) {
    var nodes = currentNodes();
    for (var i = 0; i < nodes.length; i++) {
        var b = nodes[i].bounds();
        if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) {
            if (nodes[i].clickable()) {
                scene.stats.taps++;
                handleTap(nodes[i].text(), nodes[i].desc(), x, y);
                return true;
            }
        }
    }
    return false;
};

/* ---------- 点击语义 ---------- */

function handleTap(text, desc, x, y) {
    var label = (text || "") + "|" + (desc || "");
    console.log("    [mock 点击] " + label + " @ " + x + "," + y);

    // 播放页 → 点金币入口 → 福利中心
    if (scene.phase === "player" && desc === "金币入口") {
        goPhase("welfare");
        return;
    }
    // 播放页 → 点底部「福利」tab → 福利中心
    if (scene.phase === "player" && text === "福利") {
        goPhase("welfare");
        return;
    }
    // 会员态 → 点底部「会员」tab → 会员充值页（该页没有任何福利入口）
    if ((scene.phase === "player" || scene.phase === "member") && text === "会员") {
        scene.stats.memberPage++;
        goPhase("member");
        return;
    }

    // 福利中心 → 点「去完成」→ 进广告
    if (scene.phase === "welfare" && desc === "去完成") {
        if (scene.mode === "noad") {
            // 无广告场景：点了没反应
            return;
        }
        scene.stats.enterAd++;
        goPhase("ad");
        return;
    }

    // 广告/领取页 → 点右上角「领取成功，关闭」
    if ((scene.phase === "ad" || scene.phase === "claim") && desc.indexOf("领取成功") >= 0) {
        if (scene.phase === "claim") {
            scene.stats.claimDone++;
            scene.doneCount++;
            scene.coin += 2370;
        }
        goPhase("welfare");
        return;
    }

    // 广告页 → 点跳过
    if (scene.phase === "ad" && desc === "跳过") {
        goPhase(scene.mode === "landing" ? "shop" : "claim");
        return;
    }

    // 商品落地页 → 点「完成」回福利中心
    if (scene.phase === "shop" && (desc === "完成" || desc === "关闭")) {
        scene.stats.landingEscaped++;
        goPhase("welfare");
        return;
    }
}

global.swipe = function () { return true; };

global.home = function () {
    goPhase("welfare");
    return true;
};

global.back = function () {
    if (scene.phase === "shop") {
        scene.stats.landingEscaped++;
        goPhase("welfare");
        return true;
    }
    if (scene.phase === "ad" || scene.phase === "claim") {
        goPhase("welfare");
        return true;
    }
    return true;
};

/* ---------- 应用控制 ---------- */

var foreground = "com.luna.music";

global.currentPackage = function () { return foreground; };

global.currentActivity = function () {
    if (scene.phase === "ad" || scene.phase === "claim") {
        return "com.ss.android.excitingvideo.ExcitingVideoActivity";
    }
    if (scene.phase === "risk") {
        return "com.bytedance.bdturing.BdTuringVerifyActivity";
    }
    if (scene.phase === "shop") {
        return "com.taobao.taobao.DetailActivity";
    }
    return "com.luna.biz.main.main.MainActivity";
};

global.app = {
    launchPackage: function (pkg) {
        foreground = pkg;
        if (pkg === "com.luna.music") {
            goPhase("player");
        }
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
            var t = nodes[i].text() || nodes[i].desc();
            if (!t) continue;
            out.push({ label: t, confidence: 0.95, bounds: nodes[i].bounds() });
        }
        return out;
    },
    recognizeText: function () {
        return currentNodes().map(function (n) { return n.text() || n.desc(); });
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
        scene.adSeconds = adSeconds || 20;
        scene.doneCount = 0;
        scene.coin = 0;
        scene.stats = { taps: 0, enterAd: 0, claimDone: 0, landingEscaped: 0, ocrCalls: 0, memberPage: 0 };
        foreground = "com.luna.music";
        memfs = {};
    },
};
