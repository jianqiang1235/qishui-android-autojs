/**
 * 广告业务层：进广告 → 等倒计时 → 领奖 → 落地页兜底
 *
 * 设计原则（都是从 iOS 版真机踩坑换来的）：
 *   1. 倒计时不写死超时，按界面上显示的剩余秒数自适应，封顶 AD_TIMEOUT_MAX
 *   2. 领奖分两步确认，第二步失败要退回重试，不能只记一次 idle
 *   3. 落地页判定必须"强特征单条命中"或"弱特征两条以上"，否则会把正常广告底部的下载条误判成落地页
 */

var CFG = require("../config.js");
var LOG = require("./logger.js");
var U = require("./ui.js");
var SC = require("./screen.js");
var App = require("./app.js");

/* ---------- 倒计时 ---------- */

/**
 * 从一段文本里解析出秒数，取其中最大的数字
 * 例："30秒后可领奖励" → 30；"倒计时 3" → 3；"5s" → 5
 */
function parseSeconds(text) {
    if (!text) return -1;
    var nums = String(text).match(/\d+/g);
    if (!nums || nums.length === 0) return -1;
    var max = -1;
    for (var i = 0; i < nums.length; i++) {
        var v = parseInt(nums[i], 10);
        if (!isNaN(v) && v > max) max = v;
    }
    return max;
}

/**
 * 读取当前界面上的倒计时
 * returns { found: bool, sec: number, text: string, from: "ui"|"ocr" }
 */
function readCountdown() {
    // 1) 控件层：直接用正则选择器匹配倒计时文本
    var nodes = [];
    try {
        nodes = textMatches(new RegExp(CFG.COUNTDOWN_PATTERN)).find();
    } catch (e) {
        nodes = [];
    }
    for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (!U.inScreen(n)) continue;
        var t = U.textOf(n);
        var sec = parseSeconds(t);
        if (sec > 0) {
            return { found: true, sec: sec, text: t, from: "ui" };
        }
    }

    // 2) OCR 兜底
    if (SC.ocrAvailable()) {
        var p = SC.findPoint(CFG.COUNTDOWN_PATTERN);
        if (p) {
            var sec2 = parseSeconds(p.text);
            if (sec2 > 0) return { found: true, sec: sec2, text: p.text, from: "ocr" };
        }
    }
    return { found: false, sec: -1, text: "", from: "" };
}

/**
 * 等广告播完。返回 true 表示这轮广告确实播完了（可以领奖）
 */
function waitAdFinish() {
    var t0 = Date.now();
    var cap = t0 + CFG.AD_TIMEOUT_MAX * 1000;
    var deadline = t0 + CFG.AD_TIMEOUT_BASE * 1000;
    var seenCountdown = false;
    var missStreak = 0;

    while (Date.now() < cap) {
        var r = readCountdown();
        if (r.found) {
            seenCountdown = true;
            missStreak = 0;
            LOG.info("倒计时 " + r.sec + "s（来源 " + r.from + "，原文「" + r.text + "」）");
            if (r.sec <= CFG.CLAIM_BEFORE_SEC) return true;

            // 按剩余秒数续期，但不越过封顶
            var est = Date.now() + r.sec * 1000 + 3000;
            if (est > deadline) deadline = Math.min(est, cap);
            sleep(r.sec >= 10 ? 1500 : 600);
            continue;
        }

        // 没有倒计时：看看有没有可跳过的按钮
        var skip = U.existsKeywords(CFG.SKIP_KEYWORDS);
        if (skip && (seenCountdown || Date.now() - t0 > 8000)) {
            U.tapKeywords(CFG.SKIP_KEYWORDS, 1500);
            LOG.info("点了跳过");
            sleep(1000);
        }

        missStreak++;
        if (seenCountdown && missStreak >= 6) {
            LOG.info("倒计时消失，判定广告结束");
            return true;
        }
        if (!seenCountdown && Date.now() > deadline) {
            LOG.warn("等待 " + CFG.AD_TIMEOUT_BASE + "s 仍未出现倒计时，判定本轮没有广告");
            return false;
        }
        sleep(400);
    }
    LOG.warn("等待达到封顶 " + CFG.AD_TIMEOUT_MAX + "s");
    return seenCountdown;
}

/* ---------- 进广告 ---------- */

/**
 * 是不是停在会员/开通弹窗
 */
function inMemberPopup() {
    return U.existsKeywords(CFG.MEMBER_POPUP_KEYWORDS);
}

/**
 * 进入广告：优先点「免费听歌」类入口；停在了会员弹窗上也一样点它
 */
function enterAd() {
    var ok = U.tapKeywords(CFG.AD_ENTRY_KEYWORDS, 4000);
    if (!ok && SC.ocrAvailable()) {
        var entryPattern = CFG.AD_ENTRY_KEYWORDS.join("|");
        ok = SC.tapPattern(entryPattern);
    }
    if (!ok) {
        // 试着先清掉弹窗再找入口
        if (inMemberPopup()) {
            LOG.info("命中会员弹窗，尝试关闭");
            U.tapKeywords(CFG.POPUP_CLOSE_KEYWORDS, 2000);
            sleep(1200);
            ok = U.tapKeywords(CFG.AD_ENTRY_KEYWORDS, 3000);
        }
    }
    if (ok) {
        LOG.step("已点开广告入口");
        sleep(2500);
    }
    return ok;
}

/**
 * 是否停在落地页（电商商详页 / 应用下载页）
 */
function isLandingPage() {
    var hits = 0;
    var strong = false;
    var texts = U.visibleTexts();
    for (var i = 0; i < texts.length; i++) {
        for (var j = 0; j < CFG.LANDING_KEYWORDS.length; j++) {
            if (texts[i].indexOf(CFG.LANDING_KEYWORDS[j]) >= 0) {
                hits++;
                if (CFG.LANDING_KEYWORDS[j] === "向上滑动浏览落地页") strong = true;
                break;
            }
        }
    }
    if (strong) return true;
    if (hits >= 2) return true;

    // 控件里没有，再看一眼 OCR
    if (SC.ocrAvailable()) {
        var items = SC.detect();
        var ocrHits = 0;
        for (var k = 0; k < items.length; k++) {
            for (var m = 0; m < CFG.LANDING_KEYWORDS.length; m++) {
                if (items[k].text.indexOf(CFG.LANDING_KEYWORDS[m]) >= 0) {
                    if (CFG.LANDING_KEYWORDS[m] === "向上滑动浏览落地页") return true;
                    ocrHits++;
                    break;
                }
            }
        }
        if (ocrHits >= 2) return true;
    }
    return false;
}

/**
 * 从落地页退出来，三层兜底
 */
function escapeLanding() {
    LOG.warn("检测到落地页，开始退出");
    // 第一层：左上角「完成/关闭」
    if (U.tapKeywords(CFG.LANDING_CLOSE_KEYWORDS, 2500)) {
        sleep(1500);
        if (!isLandingPage()) {
            LOG.info("「完成」退出落地页成功");
            return true;
        }
    }

    // 第二层：系统返回键 / 边缘右滑，最多 SWIPE_BACK_MAX 次
    for (var i = 0; i < CFG.SWIPE_BACK_MAX; i++) {
        App.goBack();
        if (!isLandingPage()) {
            LOG.info("返回手势退出落地页成功（第 " + (i + 1) + " 次）");
            return true;
        }
    }

    // 第三层：回桌面重开 App
    LOG.warn("落地页退不出去，回桌面重启 App");
    App.restart();
    return !isLandingPage();
}

/* ---------- 领奖 ---------- */

/**
 * 领奖。返回：
 *   1  = 成功（看到成功提示）
 *   0  = 没找到按钮 / 点了但没确认成功
 *  -1  = 途中掉进了落地页或界面异常
 */
function claim() {
    if (isLandingPage()) {
        escapeLanding();
        return -1;
    }

    var ok1 = U.tapKeywords(CFG.CLAIM_KEYWORDS, 3500);
    if (!ok1 && SC.ocrAvailable()) {
        ok1 = SC.tapPattern(CFG.CLAIM_KEYWORDS.join("|"));
    }

    if (!ok1) {
        // 有些版本广告结束会自动到账，直接看提示
        if (U.existsKeywords(CFG.CLAIM_OK_KEYWORDS)) {
            LOG.info("未找到领奖按钮，但检测到成功提示");
            return 1;
        }
        if (SC.ocrAvailable() && SC.hasPattern(CFG.CLAIM_OK_KEYWORDS.join("|"))) {
            return 1;
        }
        LOG.warn("没有找到领奖按钮");
        return 0;
    }

    LOG.step("已点领奖，等待确认");

    // 第二阶段：等成功提示
    if (U.waitKeywords(CFG.CLAIM_OK_KEYWORDS, 4000)) {
        LOG.info("领取成功（控件确认）");
        return 1;
    }
    if (SC.ocrAvailable() && SC.hasPattern(CFG.CLAIM_OK_KEYWORDS.join("|"))) {
        LOG.info("领取成功（OCR 确认）");
        return 1;
    }

    // 可能还有一层二次确认按钮
    if (U.tapKeywords(CFG.CLAIM_KEYWORDS, 2500)) {
        sleep(1500);
        if (U.existsKeywords(CFG.CLAIM_OK_KEYWORDS)) {
            LOG.info("领取成功（二次确认后）");
            return 1;
        }
        if (SC.ocrAvailable() && SC.hasPattern(CFG.CLAIM_OK_KEYWORDS.join("|"))) {
            return 1;
        }
    }

    // 仍然没确认：可能落进了落地页
    if (isLandingPage()) {
        escapeLanding();
        return -1;
    }
    LOG.warn("领奖已点击但未看到成功提示");
    return 0;
}

/**
 * 是否卡在需要人工处理的界面（登录/验证码）
 */
function needManual() {
    return U.existsKeywords(CFG.MANUAL_KEYWORDS);
}

module.exports = {
    parseSeconds: parseSeconds,
    readCountdown: readCountdown,
    waitAdFinish: waitAdFinish,
    inMemberPopup: inMemberPopup,
    enterAd: enterAd,
    isLandingPage: isLandingPage,
    escapeLanding: escapeLanding,
    claim: claim,
    needManual: needManual,
};
