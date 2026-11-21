/**
 * 福利中心适配层
 *
 * 这个文件是 2026-11-21 真机实测后新增的，专门解决安卓版与 iOS 版的四个根本差异：
 *
 *   1. 入口路径不同
 *      iOS：播放付费歌曲 → 弹「免费听歌」→ 看广告
 *      安卓：播放页右上金币图标 → 福利中心 → 「看广告赚金币」→「去完成」
 *
 *   2. 福利中心是 Flutter 页面，按钮【没有无障碍节点】
 *      整个页面在控件树里只有一段段描述文字，没有任何 clickable 的按钮节点。
 *      所以这里只能按坐标比例点，比例基于实测机 720x1612。
 *
 *   3. 底部第 4 个 tab 会变
 *      VIP 期间 App 把「福利」换成「会员」做续费引流，而且【整个 App 都没有金币入口】。
 *      实测（VIP 至 2026-11-22）：播放页右上无金币图标、会员页只有套餐、
 *      「我的」页也没有福利中心入口 —— 会员期间就是进不去。
 *
 *   4. 查询必须走快照
 *      真机实测：AutoJs6 每次无障碍查询要 2~3 秒，
 *      一个轮次里几十次 find 会把一轮拖到 1~2 分钟。
 *      所以这里统一「一次抓全、本地匹配」：两次 find 拿到全部文字节点，后续判断全在本地。
 */

var CFG = require("../config.js");
var LOG = require("./logger.js");
var U = require("./ui.js");
var App = require("./app.js");

/* ---------- 界面快照 ---------- */

var _snap = null;
var _snapAt = 0;

/** 点击/页面变化后调用，下次查询重新抓 */
function invalidate() {
    _snap = null;
    _snapAt = 0;
}

function collect(nodes, out, seen) {
    for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var b = null;
        try {
            b = n.bounds();
        } catch (e) {
            b = null;
        }
        if (!b) continue;
        if (b.width() <= 0 || b.height() <= 0) continue;

        var t = U.textOf(n);
        var d = U.descOf(n);
        var label = t || d;
        if (!label) continue;

        var key = label + "@" + b.left + "," + b.top;
        if (seen[key]) continue;
        seen[key] = true;

        var clk = false;
        try {
            clk = !!n.clickable();
        } catch (e2) {
            clk = false;
        }

        out.push({
            text: t,
            desc: d,
            label: label,
            left: b.left,
            top: b.top,
            right: b.right,
            bottom: b.bottom,
            cx: Math.round(b.left + b.width() / 2),
            cy: Math.round(b.top + b.height() / 2),
            clickable: clk,
        });
    }
}

/**
 * 抓一次界面快照（600ms 内复用），返回 [{text,desc,label,left,top,right,bottom,cx,cy,clickable}]
 */
function snapshot(force) {
    var now = Date.now();
    if (!force && _snap && (now - _snapAt) < 600) return _snap;

    var out = [];
    var seen = {};
    try {
        collect(textMatches(/.+/).find(), out, seen);
    } catch (e) {
        // 抓不到就留空
    }
    try {
        collect(descMatches(/.+/).find(), out, seen);
    } catch (e2) {
        // 同上
    }

    _snap = out;
    _snapAt = now;
    return out;
}

/** 快照里是否有关键词（本地匹配，不查无障碍） */
function hasAny(keywords) {
    var items = snapshot(false);
    for (var i = 0; i < items.length; i++) {
        var s = items[i].label;
        for (var k = 0; k < keywords.length; k++) {
            if (keywords[k] && s.indexOf(keywords[k]) >= 0) return true;
        }
    }
    return false;
}

/* ---------- 当前在哪 ---------- */

function activity() {
    try {
        return String(currentActivity() || "");
    } catch (e) {
        return "";
    }
}

/** 是否在激励视频广告里 */
function inAd() {
    return activity().indexOf(CFG.AD_ACTIVITY_KEY) >= 0;
}

/** 是否弹了字节风控（短信验证） */
function inRisk() {
    if (activity().indexOf(CFG.RISK_ACTIVITY_KEY) >= 0) return true;
    return hasAny(CFG.MANUAL_DESC_KEYWORDS);
}

/** 当前包名是不是汽水音乐 */
function inApp() {
    return U.currentPkg() === CFG.APP_PACKAGE;
}

/** 是否已经在福利中心 */
function isInWelfareCenter() {
    if (!inApp()) return false;
    if (activity().indexOf(CFG.AD_ACTIVITY_KEY) >= 0) return false;
    if (activity().indexOf(CFG.RISK_ACTIVITY_KEY) >= 0) return false;
    return hasAny(CFG.WELFARE_TITLE_KEYWORDS);
}

/* ---------- 坐标换算 ---------- */

function point(ratio) {
    return {
        x: Math.round(ratio[0] * device.width),
        y: Math.round(ratio[1] * device.height),
    };
}

function tapRatio(ratio, label) {
    var p = point(ratio);
    try {
        var ok = click(p.x, p.y);
        invalidate();
        LOG.info("坐标点击「" + (label || "") + "」 " + p.x + "," + p.y + (ok ? " 成功" : " 失败"));
        return ok;
    } catch (e) {
        LOG.warn("坐标点击「" + (label || "") + "」失败: " + e);
        return false;
    }
}

/* ---------- 任务进度 ---------- */

/**
 * 读取「看广告赚金币」当前已完成次数
 * 实测文案：`本次得2370金币，已完成0次`
 * 返回 -1 表示没读到
 */
function doneCount() {
    var items = snapshot(false);
    for (var i = 0; i < items.length; i++) {
        var m = String(items[i].label).match(/已完成(\d+)次/);
        if (m) return parseInt(m[1], 10);
    }
    return -1;
}

/** 读取金币收益数字（`我的资产` 区域），读不到返回 -1 */
function coinBalance() {
    var items = snapshot(false);
    for (var i = 1; i < items.length; i++) {
        if (items[i].label === "金币收益") {
            var v = parseInt(items[i - 1].label, 10);
            if (!isNaN(v)) return v;
        }
    }
    return -1;
}

/* ---------- 底部 tab / 会员态 ---------- */

/**
 * 读底部 tab 上的文字
 * 实测 tab 条 bounds 在 y≈1507~1558，占屏高 0.935~0.967
 * 走快照，不额外查询
 */
function bottomTabs() {
    var h = device.height;
    var top = Math.round(h * CFG.TAB_BAND_TOP_RATIO);
    var bot = Math.round(h * CFG.TAB_BAND_BOTTOM_RATIO);

    var items = snapshot(false);
    var out = [];
    var seen = {};
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.top < top || it.bottom > bot) continue;
        var t = it.text;
        // tab 名都是 1~4 个汉字，把数字/英文残留（系统管家的 "240.19 MB" 之类）过滤掉
        if (!/^[\u4e00-\u9fa5]{1,4}$/.test(t)) continue;
        if (seen[t]) continue;
        seen[t] = true;
        out.push({ text: t, x: it.cx, y: it.cy });
    }
    out.sort(function (a, b) { return a.x - b.x; });
    return out;
}

/** 底部 tab 的文字串，用于日志 */
function tabText() {
    var tabs = bottomTabs();
    var arr = [];
    for (var i = 0; i < tabs.length; i++) arr.push(tabs[i].text);
    return arr.join("/");
}

/**
 * 是否处于会员(VIP)状态
 * 判据：底部有「会员」tab，且没有「福利」tab
 */
function isMemberState() {
    var tabs = bottomTabs();
    if (tabs.length === 0) return false;
    var hasWelfare = false;
    var hasMember = false;
    for (var i = 0; i < tabs.length; i++) {
        var t = tabs[i].text;
        for (var k = 0; k < CFG.WELFARE_TAB_KEYWORDS.length; k++) {
            if (t.indexOf(CFG.WELFARE_TAB_KEYWORDS[k]) >= 0) hasWelfare = true;
        }
        for (var m = 0; m < CFG.MEMBER_TAB_KEYWORDS.length; m++) {
            if (t.indexOf(CFG.MEMBER_TAB_KEYWORDS[m]) >= 0) hasMember = true;
        }
    }
    return hasMember && !hasWelfare;
}

/** 当前页面上有没有金币入口节点（必须先确认存在，绝不盲点坐标） */
function hasCoinEntry() {
    return hasAny([CFG.COIN_ENTRY_DESC]);
}

/* ---------- 退出广告 ---------- */

/**
 * 从广告里退出来
 *
 * 【真机实测 2026-11-21】
 *   1. 倒计时期间点右上角 X = 关闭本条广告
 *   2. 倒计时归零后，广告会【自动弹出】「再看N个视频提前得 第M日免费听」浮层，
 *      右上角同时变「领取成功」，这个浮层没有任何无障碍文字（Flutter 自绘），
 *      能退出的唯一办法是点浮层里的「坚持退出」（实测坐标 360,1006）。
 *      按返回键无效。
 *   3. 点「领取奖励」会继续连播下一条，不是退出。
 */
var CONTINUE_TAP_Y = [0.624, 0.598, 0.652];

function claimReadyOnScreen() {
    var items = snapshot(true);
    for (var i = 0; i < items.length; i++) {
        if (String(items[i].label).indexOf(CFG.CLAIM_READY_DESC) >= 0) return true;
    }
    return false;
}

/** 点浮层里的「坚持退出」，多档 y 兜底 */
function tapContinueExit() {
    for (var i = 0; i < CONTINUE_TAP_Y.length; i++) {
        var x = Math.round(device.width * 0.5);
        var y = Math.round(device.height * CONTINUE_TAP_Y[i]);
        try {
            click(x, y);
        } catch (e) {
            // 忽略
        }
        sleep(1200);
        invalidate();
        if (!inAd()) return true;
    }
    return false;
}

function exitAd() {
    if (!inAd()) return true;

    for (var i = 0; i < 4; i++) {
        if (claimReadyOnScreen()) {
            LOG.info("广告已播完（右上角「领取成功」），点浮层「坚持退出」");
            if (tapContinueExit()) {
                LOG.info("已退出广告（坚持退出）");
                return true;
            }
            continue;
        }

        tapRatio(CFG.AD_CLAIM_RATIO, "广告右上角");
        sleep(1500);
        if (!inAd()) {
            LOG.info("已退出广告（点了 " + (i + 1) + " 次右上角）");
            return true;
        }
        if (tapContinueExit()) {
            LOG.info("已退出广告（点右上角后弹层，走坚持退出）");
            return true;
        }
    }

    for (var k = 0; k < 2; k++) {
        try {
            back();
            invalidate();
        } catch (e) {
            App.goBack();
        }
        sleep(1200);
        if (!inAd()) {
            LOG.info("已退出广告（返回键）");
            return true;
        }
    }

    LOG.warn("广告退不出去，重启 App");
    App.restart();
    invalidate();
    return !inAd();
}

/* ---------- 进福利中心 ---------- */

/** 回「发现」页（播放页 / 首页） */
function goDiscover() {
    if (U.tapKeywords(CFG.DISCOVER_TAB_KEYWORDS, 1500)) {
        invalidate();
        sleep(2000);
        return true;
    }
    tapRatio(CFG.DISCOVER_TAB_RATIO, "发现tab(坐标)");
    sleep(2000);
    return false;
}

/** 关掉可能盖住的会员弹窗 */
function closeMemberPopup() {
    if (hasAny(CFG.MEMBER_POPUP_KEYWORDS)) {
        LOG.info("检测到会员弹窗，先关掉");
        if (U.tapKeywords(CFG.POPUP_CLOSE_KEYWORDS, 2000)) {
            invalidate();
            sleep(1500);
        }
    }
}

/**
 * 保证当前在福利中心
 *
 * 两种状态：
 *   A. 普通状态：底部有「福利」tab / 播放页右上角有金币入口 → 能进
 *   B. 会员态：底部第 4 个 tab 是「会员」，整个 App 没有金币入口 → 进不去
 *
 * 原则：**只有节点真的存在才点**，不盲点坐标。
 * 实测盲点会把页面点到别的 App（例如荣耀系统管家）。
 */
function enterWelfareCenter() {
    if (inRisk()) {
        LOG.err("当前停在风控验证页，需要人工处理");
        return false;
    }

    if (inAd()) {
        exitAd();
        if (!inApp()) App.launch(2);
        sleep(1500);
    }

    if (isInWelfareCenter()) {
        LOG.info("已经在福利中心");
        return true;
    }

    if (!inApp()) {
        if (!App.launch(3)) {
            LOG.err("无法拉起 " + CFG.APP_NAME);
            return false;
        }
    }

    var member = isMemberState();
    LOG.info("当前底部 tab: " + tabText() + (member ? "（会员态）" : ""));

    // 阶段一：回发现页，顺便关弹窗
    goDiscover();
    closeMemberPopup();

    // 阶段二：金币入口（必须节点存在才点）
    if (hasCoinEntry()) {
        if (U.tapKeywords([CFG.COIN_ENTRY_DESC], 2500)) {
            invalidate();
            sleep(3000);
            if (isInWelfareCenter()) {
                LOG.step("已进入福利中心（金币入口）");
                return true;
            }
            LOG.warn("点了金币入口但没到福利中心（Activity: " + activity() + "）");
        }
    } else {
        LOG.info("当前页面没有「" + CFG.COIN_ENTRY_DESC + "」节点");
    }

    // 阶段三：「福利」tab 文字
    if (U.tapKeywords(CFG.WELFARE_TAB_KEYWORDS, 2000)) {
        invalidate();
        sleep(3000);
        if (isInWelfareCenter()) {
            LOG.step("已进入福利中心（福利 tab）");
            return true;
        }
    }

    // 阶段四：会员态下点第 4 个 tab，进的是会员页，该页若也没有金币入口就到此为止
    if (member) {
        tapRatio(CFG.WELFARE_TAB_RATIO, "第4个tab(会员)");
        sleep(2500);
        if (isInWelfareCenter()) {
            LOG.step("已进入福利中心（第4个tab）");
            return true;
        }
        if (hasCoinEntry()) {
            if (U.tapKeywords([CFG.COIN_ENTRY_DESC], 2500)) {
                invalidate();
                sleep(3000);
                if (isInWelfareCenter()) {
                    LOG.step("已进入福利中心（会员页金币入口）");
                    return true;
                }
            }
        }
        LOG.warn(CFG.MEMBER_STATE_HINT + "，本轮不去福利中心");
        return false;
    }

    // 阶段五：非会员态的最后兜底，第 4 个 tab 就是「福利」
    tapRatio(CFG.WELFARE_TAB_RATIO, "福利 tab 坐标");
    sleep(3000);
    if (isInWelfareCenter()) {
        LOG.step("已进入福利中心（坐标兜底）");
        return true;
    }

    LOG.warn("没能进入福利中心（当前 Activity: " + activity() + "）");
    return false;
}

/* ---------- 点任务 ---------- */

/**
 * 点「看广告赚金币」的「去完成」
 * 返回 "ad"（进了广告）/ "risk"（弹了风控验证）/ "none"（没进去）
 */
function startAdTask() {
    if (!isInWelfareCenter()) {
        if (!enterWelfareCenter()) return "none";
    }

    var before = doneCount();
    LOG.info("点「看广告赚金币」前进度：已完成 " + (before >= 0 ? before : "?") + " 次");

    tapRatio(CFG.AD_TASK_BTN_RATIO, "看广告·去完成");

    // 实测：点完先出骨架屏（SeparateNavActivity），然后才进广告或风控
    for (var i = 0; i < 6; i++) {
        sleep(1500);
        if (inRisk()) {
            LOG.err("触发了字节风控（bdturing），需要人工输入短信验证码");
            return "risk";
        }
        if (inAd()) {
            LOG.step("已进入广告");
            return "ad";
        }
    }

    LOG.warn("点了「去完成」但没进广告（当前 Activity: " + activity() + "）");
    return "none";
}

/** 点「逛街赚金币」的「去逛街」（浏览商品 30 秒，风控一般比激励视频低） */
function startStreetTask() {
    if (!isInWelfareCenter()) {
        if (!enterWelfareCenter()) return "none";
    }
    tapRatio(CFG.STREET_TASK_BTN_RATIO, "逛街·去逛街");
    sleep(3000);
    if (inRisk()) return "risk";
    if (inAd()) return "ad";
    if (!inApp()) {
        LOG.step("已跳出到商品页");
        return "shop";
    }
    return "none";
}

/** 点「去签到」 */
function doSign() {
    tapRatio(CFG.SIGN_TASK_BTN_RATIO, "签到·去签到");
    sleep(2500);
    return !inRisk();
}

module.exports = {
    activity: activity,
    inAd: inAd,
    inRisk: inRisk,
    inApp: inApp,
    isInWelfareCenter: isInWelfareCenter,
    snapshot: snapshot,
    invalidate: invalidate,
    hasAny: hasAny,
    bottomTabs: bottomTabs,
    tabText: tabText,
    isMemberState: isMemberState,
    hasCoinEntry: hasCoinEntry,
    goDiscover: goDiscover,
    closeMemberPopup: closeMemberPopup,
    point: point,
    tapRatio: tapRatio,
    doneCount: doneCount,
    coinBalance: coinBalance,
    exitAd: exitAd,
    tapContinueExit: tapContinueExit,
    enterWelfareCenter: enterWelfareCenter,
    startAdTask: startAdTask,
    startStreetTask: startStreetTask,
    doSign: doSign,
};
