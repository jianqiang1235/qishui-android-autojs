/**
 * 「免N天」免费畅听入口 —— 安卓版真正可用的主路径
 *
 * 【2026-11-21 真机实测】
 *   发现页右上角「免18天」→ 点它【直接进激励视频】→ 倒计时结束「领取成功，关闭，按钮」
 *   → 点右上角 → 弹「再看X秒继续解锁 / 第N日免费听」→ 点「坚持退出」
 *   → 回到 App 弹「再看N个提前享第M天畅听」面板（desc 里有 `第19天畅听` / `已领取`）
 *   → 点 × 关掉，右上角变成「免19天」
 *
 * 全程实测走通：18 天 → 19 天，一条广告 +1 天。
 *
 * 为什么这是主路径：
 *   - 福利中心（金币）在 VIP 期间整个消失，但这个入口一直都在
 *   - 点一下就直接进广告，不用经过福利中心那一堆坐标点击
 *
 * 这个按钮是 Flutter 自绘，控件树里**没有任何文字节点**，
 * 所以只能用 OCR 认「免18天」，OCR 认不出时退到实测坐标。
 */

var CFG = require("../config.js");
var LOG = require("./logger.js");
var SC = require("./screen.js");
var W = require("./welfare.js");
var U = require("./ui.js");

/* 记住上一次读到的天数：OCR 插件没装时，靠面板 desc 也能累计 */
var _lastDays = -1;

/* 免费畅听真实进度（面板里「第N天畅听 已领取」的 N），落盘跨运行保留 */
var _claimedDay = -1;
var PROGRESS_PATH = CFG.LOG_DIR + "/progress.json";

function loadProgress() {
    try {
        var text = files.read(PROGRESS_PATH);
        if (text) {
            var obj = JSON.parse(text);
            if (obj && obj.claimedDay >= 0) {
                _claimedDay = obj.claimedDay;
                LOG.info("已读取上次进度：已领取到第" + _claimedDay + "天");
            }
        }
    } catch (e) {
        // 首次运行没有文件，忽略
    }
    return _claimedDay;
}

function claimedDay() {
    return _claimedDay;
}

function setClaimedDay(d) {
    if (d < 0) return _claimedDay;
    _claimedDay = d;
    try {
        files.write(PROGRESS_PATH, JSON.stringify({ claimedDay: d, at: Date.now() }));
    } catch (e) {
        LOG.warn("写入进度文件失败: " + e);
    }
    return _claimedDay;
}

/* ---------- OCR 扫描（带缓存） ---------- */

var _scan = null;
var _scanAt = 0;

function centerOf(b) {
    var l, t, r, bt;
    if (!b) return null;
    if (b.left !== undefined) {
        l = b.left; t = b.top; r = b.right; bt = b.bottom;
    } else if (b.length >= 4) {
        l = b[0]; t = b[1]; r = b[2]; bt = b[3];
    } else {
        return null;
    }
    return { x: Math.round((l + r) / 2), y: Math.round((t + bt) / 2) };
}

/**
 * 扫一屏：找出「免N天」的天数和可点位置
 * 返回 {days, point, items}
 */
function scan(force) {
    var now = Date.now();
    if (!force && _scan && (now - _scanAt) < 1500) return _scan;

    var items = SC.detect();
    var reDays = new RegExp(CFG.FREE_DAYS_PATTERN);
    var reEntry = new RegExp(CFG.FREE_ENTRY_PATTERN);

    var days = -1;
    var point = null;

    for (var i = 0; i < items.length; i++) {
        var t = String(items[i].text || "");
        var m = t.match(reDays);
        if (m) days = parseInt(m[1], 10);
        if (reEntry.test(t) && !point) {
            point = centerOf(items[i].bounds);
        }
    }

    _scan = { days: days, point: point, items: items };
    _scanAt = now;
    return _scan;
}

function invalidate() {
    _scan = null;
    _scanAt = 0;
}

/* ---------- 天数读取 ---------- */

/**
 * 读当前「免N天」的天数
 * 先 OCR 认「免19天」，认不出再退回面板里的 `第N天畅听`
 */
function readDays() {
    var info = scan(false);
    if (info.days >= 0) {
        _lastDays = info.days;
        return info.days;
    }

    // OCR 不可用（没装 ML Kit / Paddle 插件）时，退回面板 desc：
    // 面板里「第19天畅听 已领取」是能读到的，取最大天数
    var items = W.snapshot(false);
    var max = -1;
    for (var i = 0; i < items.length; i++) {
        var m = String(items[i].label).match(/第(\d+)天畅听/);
        if (m) {
            var v = parseInt(m[1], 10);
            if (v > max) max = v;
        }
    }
    if (max >= 0) {
        _lastDays = max > _lastDays ? max : _lastDays;
        return max;
    }

    // 面板也不在的时候，用记账值（上一轮领到的天数）
    return _lastDays;
}

/** 记录已知天数（main 拿到面板天数后回填，供下一轮比较） */
function rememberDays(d) {
    if (d >= 0 && d > _lastDays) _lastDays = d;
    return _lastDays;
}

/** 面板里是否已经显示「第N天畅听 / 已领取」，并把「已领取」那一格的天数配对出来 */
function panelClaimed() {
    var items = W.snapshot(false);

    // 面板形态 B：「恭喜获得 第30日畅听」（用「日」，且只有这一条，没有「已领取」）
    // 它出现本身就说明今天这条已经领到了，直接认
    var bonusRe = new RegExp(CFG.PANEL_BONUS_DESC_PATTERN);
    for (var b = 0; b < items.length; b++) {
        var bt = String(items[b].label);
        if (bonusRe.test(bt)) {
            var bm = bt.match(/\d+/);
            if (bm) return { day: parseInt(bm[0], 10), claimed: true, bonus: true };
        }
    }

    var days = [];
    var claims = [];
    for (var i = 0; i < items.length; i++) {
        var t = String(items[i].label);
        var m = t.match(/第(\d+)天畅听/);
        if (m) days.push({ d: parseInt(m[1], 10), x: items[i].cx, y: items[i].cy });
        if (t.indexOf(CFG.PANEL_CLAIMED_KEYWORD) >= 0) {
            claims.push({ x: items[i].cx, y: items[i].cy });
        }
    }

    if (claims.length === 0 || days.length === 0) return { day: -1, claimed: false };

    // 面板里会同时列出「第19天畅听 已领取」和「第20天畅听 再看4个提前领」，
    // 不能简单取最大值，否则会把还没领的第20天当成已领取。
    // 这里用位置配对：找离「已领取」最近的那个「第N天畅听」。
    var best = -1;
    var bestDist = 1e18;
    for (var c = 0; c < claims.length; c++) {
        for (var k = 0; k < days.length; k++) {
            var dx = days[k].x - claims[c].x;
            var dy = days[k].y - claims[c].y;
            var dist = dx * dx + dy * dy;
            if (dist < bestDist) {
                bestDist = dist;
                best = days[k].d;
            }
        }
    }
    return { day: best, claimed: true };
}

/* ---------- 点入口 ---------- */

/** 点发现页右上角的「免N天」：OCR 优先，坐标兜底 */
function tapEntry() {
    var info = scan(true);
    if (info.point) {
        try {
            click(info.point.x, info.point.y);
            invalidate();
            LOG.info("OCR 命中「免" + info.days + "天」@(" + info.point.x + "," + info.point.y + ")");
            return guardJump();
        } catch (e) {
            LOG.warn("点击免N天入口失败: " + e);
        }
    }

    LOG.warn("OCR 没认出「免N天」，改用实测坐标");
    var ok = W.tapRatio(CFG.FREE_ENTRY_RATIO, "免N天入口(坐标)");
    invalidate();
    if (!ok) return false;
    return guardJump();
}

/**
 * 点完入口后 1.5 秒确认还留在 App 里。
 * 【实测坑】顶部常会飘一条系统通知横幅（比如「交管12123 立即查违章记录」），
 * 正好盖住右上角「免N天」按钮 (643,92)，点下去直接跳到别的 App，
 * 之后 waitEnterAd 白等 40 秒还退不出来。
 */
function guardJump() {
    sleep(1500);
    if (W.inApp()) return true;

    var pkg = U.currentPkg();
    LOG.warn("点「免N天」后跳到了「" + pkg + "」（多半是顶部通知横幅挡了入口），按返回键回 App");
    for (var i = 0; i < 2; i++) {
        try {
            back();
        } catch (e) {
            break;
        }
        sleep(1000);
    }
    invalidate();
    W.invalidate();
    return false;
}

/* ---------- 广告后的两个弹层 ---------- */

/**
 * 处理广告里的「再看N个视频提前得 第M日免费听」浮层
 * 这个浮层没有无障碍文字，只能坐标点「坚持退出」；直接复用 exitAd 的整套逻辑
 */
function closeContinueDialog(timeout) {
    if (!W.inAd()) return true;

    var deadline = Date.now() + (timeout || 12000);
    while (Date.now() < deadline) {
        if (!W.inAd()) return true;
        LOG.info("广告内弹出「提前解锁」浮层，点坚持退出");
        if (W.tapContinueExit()) {
            LOG.info("已退出广告");
            return true;
        }
    }
    return !W.inAd();
}

/** App 里是否弹了「再看N个提前享第M天畅听」面板 */
function isPanelVisible() {
    return W.hasAny(CFG.PANEL_KEYWORDS);
}

/** 关掉天数面板 */
function closePanel() {
    if (!isPanelVisible()) return true;

    W.tapRatio(CFG.PANEL_CLOSE_RATIO, "面板×");
    sleep(1200);
    if (!isPanelVisible()) {
        LOG.info("已关闭天数面板");
        return true;
    }

    // 形态 B（「恭喜获得 第N日畅听」）的 × 位置更低，实测 (650,1086)
    W.tapRatio(CFG.PANEL_CLOSE_RATIO_ALT, "面板×（低位）");
    sleep(1200);
    if (!isPanelVisible()) {
        LOG.info("已关闭天数面板（低位×）");
        return true;
    }

    // 兜底：返回键
    try {
        back();
        W.invalidate();
    } catch (e) {
        // 忽略
    }
    sleep(1000);
    return !isPanelVisible();
}

/**
 * 当前是不是「直播间」形式的广告/页面
 * 实测这种形式会随机替代 19 秒激励视频，控件里有「本场点赞 / 更多直播」这些词
 */
function isLivePage() {
    var act = String(W.activity() || "");
    if (act.indexOf(CFG.LIVE_ACTIVITY_KEY) >= 0) return true;
    return W.hasAny(CFG.LIVE_KEYWORDS);
}

/** 是不是「直播间播放器」这一层（浮在广告容器之上，back 一次能露出广告容器） */
function isLivePlayer() {
    var act = String(W.activity() || "");
    if (CFG.LIVE_PLAYER_ACTIVITY_KEY && act.indexOf(CFG.LIVE_PLAYER_ACTIVITY_KEY) >= 0) return true;
    return false;
}

/**
 * 「悬浮窗播放功能上线啦 / 暂不使用 / 立即开启」这个引导弹窗
 * 【实测坑】它会盖在直播间最上层，不点掉的话后面所有点击都打在它身上，永远退不出去
 */
function isFloatGuide() {
    return W.hasAny([CFG.FLOAT_GUIDE_KEYWORD]);
}

/** 点「暂不使用」关掉悬浮窗引导弹窗 */
function dismissFloatGuide() {
    if (!isFloatGuide()) return true;
    LOG.info("关掉「悬浮窗播放功能上线啦」引导弹窗（点暂不使用）");
    var ok = U.tapKeywords(CFG.FLOAT_GUIDE_DECLINE_KEYWORDS, 1200);
    if (!ok) W.tapRatio(CFG.FLOAT_GUIDE_DECLINE_RATIO, "暂不使用(坐标)");
    sleep(1000);
    W.invalidate();
    return !isFloatGuide();
}

/** 广告容器里是否已经出现「领取成功，关闭，按钮」 */
function claimReady() {
    return W.hasAny([CFG.CLAIM_READY_DESC]);
}

/**
 * 退出直播间 / 直播间形式广告
 * 顺序：先关悬浮窗引导弹窗 → 直播间播放器层用 back（露出广告容器）→ 还在直播就点右上角 ×
 * 返回 true 表示已经离开直播
 */
function closeLive(timeout) {
    var deadline = Date.now() + (timeout || 12000);
    while (Date.now() < deadline) {
        dismissFloatGuide();

        if (!isLivePage()) return true;

        if (isLivePlayer()) {
            LOG.info("在直播间播放器层，按返回键露出广告");
            try {
                back();
            } catch (e) {
                // 忽略
            }
        } else {
            LOG.info("检测到直播间形式，点右上角关闭");
            W.tapRatio(CFG.LIVE_CLOSE_RATIO, "直播间×");
        }
        sleep(1500);
        W.invalidate();
    }
    return !isLivePage();
}

/**
 * 等直播间形式的广告播完（它同样计时计奖励）
 * 返回 "done"（已经领取成功）/ "noad"（没等到，已退出）
 *
 * 为什么不能像以前那样直接退：直播间广告同样是有效广告，
 * 看够时长后广告容器里会出现「领取成功，关闭，按钮」，点浮层「坚持退出」就能 +1 进度。
 * 但播放器浮层会把广告容器盖住，所以要定时 back 一次露出广告容器检查。
 */
function watchLiveAd() {
    var watchMs = (CFG.LIVE_WATCH_SEC || 34) * 1000;
    var start = Date.now();

    LOG.info("直播间形式广告，等它播完（约 " + Math.round(watchMs / 1000) + " 秒）");
    while (Date.now() - start < watchMs) {
        if (W.inRisk()) {
            LOG.warn("直播间里弹了风控验证");
            return "noad";
        }
        dismissFloatGuide();
        if (claimReady()) return "done";
        sleep(1000);
    }

    // 到时间了，back 露出广告容器检查「领取成功」
    for (var i = 0; i < (CFG.LIVE_PROBE_ROUNDS || 8); i++) {
        dismissFloatGuide();

        if (claimReady()) {
            LOG.info("直播间广告已播完，检测到「领取成功」");
            return "done";
        }

        if (isLivePlayer() || isLivePage()) {
            try {
                back();
            } catch (e) {
                // 忽略
            }
            sleep(1200);
            W.invalidate();
            dismissFloatGuide();
            if (claimReady()) {
                LOG.info("直播间广告已播完，检测到「领取成功」");
                return "done";
            }
        }

        // 已露出广告容器（inAd）但还没到领取成功 → 继续等
        sleep(5000);
    }

    LOG.warn("直播间广告没等到「领取成功」，退出换一条");
    closeLive();
    return "noad";
}

/**
 * 点完入口后等进广告
 * 返回 "ad" / "live" / "risk" / "none"
 */
function waitEnterAd(timeout) {
    var deadline = Date.now() + (timeout || CFG.FREE_AD_WAIT);
    while (Date.now() < deadline) {
        if (W.inRisk()) return "risk";
        // 悬浮窗引导弹窗先关掉，否则会把「直播间」误判住
        if (isFloatGuide()) {
            dismissFloatGuide();
            continue;
        }
        if (isLivePage()) {
            LOG.warn("这次给的是直播间形式广告");
            return "live";
        }
        if (W.inAd()) {
            LOG.step("已进入广告");
            return "ad";
        }
        sleep(1500);
    }
    return "none";
}

module.exports = {
    scan: scan,
    invalidate: invalidate,
    readDays: readDays,
    rememberDays: rememberDays,
    loadProgress: loadProgress,
    claimedDay: claimedDay,
    setClaimedDay: setClaimedDay,
    panelClaimed: panelClaimed,
    tapEntry: tapEntry,
    waitEnterAd: waitEnterAd,
    isLivePage: isLivePage,
    isLivePlayer: isLivePlayer,
    isFloatGuide: isFloatGuide,
    dismissFloatGuide: dismissFloatGuide,
    claimReady: claimReady,
    watchLiveAd: watchLiveAd,
    closeLive: closeLive,
    closeContinueDialog: closeContinueDialog,
    isPanelVisible: isPanelVisible,
    closePanel: closePanel,
};
