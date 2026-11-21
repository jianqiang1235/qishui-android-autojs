/**
 * 汽水音乐 · 自动领取广告福利（安卓 / AutoJs6）
 *
 * 用法：把整个文件夹拷到手机，用 AutoJs6 打开 main.js 运行。
 * 适配：界面变了只改 config.js，逻辑不要动。
 *
 * 【2026-11-21 真机实测改版】主流程按安卓实际界面重构：
 *
 *   旧流程（iOS 逻辑）：播放页 → 点「免费听歌」→ 看广告 → 领时长
 *   新流程（安卓实测）：福利中心 → 点「看广告赚金币 · 去完成」→ 激励视频
 *                      → 倒计时归零 → 右上角「领取成功」→ 回福利中心 → 下一轮
 *
 * 每一轮都会对比「已完成N次」的进度，用真实进度变化判定成功，
 * 而不是只看屏幕上蹦没蹦「领取成功」两个字。
 */

var CFG = require("./config.js");
var LOG = require("./lib/logger.js");
var U = require("./lib/ui.js");
var SC = require("./lib/screen.js");
var App = require("./lib/app.js");
var Ads = require("./lib/ads.js");
var W = require("./lib/welfare.js");
var F = require("./lib/freeDays.js");

/** 免费畅听真实进度（落盘在 lib/freeDays.js，跨运行保留） */
var stats = {
    round: 0,
    success: 0,
    fail: 0,
    noAd: 0,
    abnormal: 0,
    manual: 0,
    member: 0,
    startTime: 0,
};

function fmtMs(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    var ss = s % 60;
    return m + "分" + (ss < 10 ? "0" : "") + ss + "秒";
}

function ensureAccessibility() {
    try {
        auto.waitFor();
    } catch (e) {
        LOG.err("等待无障碍服务失败: " + e);
    }
    try {
        if (!auto.service) {
            LOG.err("无障碍服务未开启，请在 AutoJs6 里打开无障碍权限");
            return false;
        }
    } catch (e2) {
        // 某些版本 auto.service 不可用，交给后续点击间接判断
    }
    LOG.info("无障碍服务就绪");
    return true;
}

function keepScreenAwake() {
    try {
        device.keepScreenOn(3600 * 1000);
        LOG.info("已申请屏幕常亮 1 小时");
    } catch (e) {
        try {
            device.keepScreenDim();
        } catch (e2) {
            LOG.warn("屏幕常亮设置失败: " + e2);
        }
    }
}

/**
 * 跑一轮，返回 success / fail / noad / abnormal / manual
 */
function oneRound() {
    // 1. 停在风控验证页（短信验证码）→ 停下等人
    if (W.inRisk()) {
        LOG.err("停在字节风控验证页，需要人工输入短信验证码");
        return "manual";
    }

    // 2. 上一轮残留的广告页 / 直播间，先退出来
    if (W.inAd()) {
        LOG.info("检测到残留广告页，先退出");
        W.exitAd();
        sleep(1200);
    } else if (F.isLivePage()) {
        LOG.info("检测到残留直播间，先退出");
        F.closeLive();
    }

    // 3. 确保 App 在前台
    if (!App.ensureForeground()) return "abnormal";

    // 4. 主路径：发现页右上角「免N天」→ 激励视频 → 免费畅听 +1 天
    //    VIP 期间福利中心整个消失，但这个入口一直都在；
    //    点一下直接进 ExcitingVideoActivity 广告，绕过福利中心那一堆坐标点击。
    var freeResult = runFreeRound();
    if (freeResult !== "noentry") return freeResult;

    // 5. 备用路径：福利中心「看广告赚金币」（只有非 VIP 的普通态才有）
    return welfareRound();
}

/**
 * 主路径：发现页「免N天」入口完整一轮
 * 返回 success / fail / noad / abnormal / manual / noentry（没找到入口，交给备用路径）
 */
function runFreeRound() {
    if (!W.goDiscover()) LOG.warn("没能回到发现页");
    sleep(1000);
    F.closePanel();

    var before = F.readDays();
    LOG.info("当前免费畅听天数: " + (before >= 0 ? "免" + before + "天" : "未读到（OCR 不可用）"));

    if (!F.tapEntry()) return "noentry";

    var enter = F.waitEnterAd();
    if (enter === "risk") return "manual";
    if (enter === "live") {
        LOG.warn("命中直播间形式广告，退出换一条");
        F.closeLive();
        return "noad";
    }
    if (enter !== "ad") {
        LOG.warn("点了「免N天」没进广告（当前 " + W.activity() + "）");
        return "noad";
    }

    if (!Ads.waitAdFinish()) {
        LOG.warn("没识别到有效倒计时");
        W.exitAd();
        return "noad";
    }

    var claimResult = Ads.claim();

    // 广告里的「再看X秒继续解锁 / 第N日免费听」→ 点「坚持退出」回 App
    F.closeContinueDialog();
    sleep(1200);

    // 回 App 后等天数面板
    var panel = { day: -1, claimed: false };
    for (var i = 0; i < 6; i++) {
        if (!W.inApp()) {
            App.ensureForeground();
            sleep(1500);
            continue;
        }
        W.invalidate();
        F.invalidate();

        panel = F.panelClaimed();
        if (panel.claimed && panel.day > 0) break;
        sleep(1500);
    }

    // 关掉「再看N个提前享第M天畅听」面板
    F.closePanel();

    if (panel.claimed && panel.day > 0) {
        // 【关键】「第N天畅听 已领取」是唯一可信的进度：
        // 免费畅听是连环任务，天数越往后每天要看的广告越多（实测第22天要连看3条），
        // 一条广告看完次数不够时天数根本不会涨，面板仍然停在同一个「已领取」天数。
        // 所以只有「已领取」的天数真的变大，才算这一轮有进展。
        if (F.claimedDay() < 0) {
            F.setClaimedDay(panel.day);
            LOG.info("建立进度基线：已领取到第" + panel.day + "天");
            return "fail";
        }
        if (panel.day > F.claimedDay()) {
            LOG.step("已领取天数 " + F.claimedDay() + " → " + panel.day + "，本轮 +1 天");
            F.setClaimedDay(panel.day);
            F.rememberDays(panel.day);
            return "success";
        }
        LOG.info("已领取天数仍是第" + panel.day + "天，本条广告计入提前解锁进度（尚未 +1 天）");
        return "fail";
    }

    if (claimResult === -1) return "abnormal";
    if (claimResult === 1) {
        LOG.info("已确认领取，但没弹天数面板，本轮不计入成功");
    }
    return "fail";
}

/**
 * 备用路径：福利中心 → 看广告赚金币（旧流程，普通态才可用）
 */
function welfareRound() {
    // VIP 生效期间底部第 4 个 tab 是「会员」，福利中心入口整个消失，
    // 这种状态下继续盲点只会把页面点到别的 App，所以直接返回 member 交给主循环等。
    if (!W.isInWelfareCenter() && W.isMemberState() && !W.hasCoinEntry()) {
        LOG.warn(CFG.MEMBER_STATE_HINT + "（底部 tab: " + W.tabText() + "）");
        return "member";
    }

    if (!W.enterWelfareCenter()) {
        LOG.warn("本轮没能进入福利中心");
        return "noad";
    }

    var before = W.doneCount();
    LOG.info("本轮开始前进度：已完成 " + (before >= 0 ? before : "?") + " 次");

    var started = W.startAdTask();
    if (started === "risk") return "manual";
    if (started !== "ad") {
        LOG.warn("没能进入广告（结果 " + started + "）");
        return "noad";
    }

    if (!Ads.waitAdFinish()) {
        LOG.warn("本轮没有识别到有效倒计时");
        W.exitAd();
        return "noad";
    }

    var claimResult = Ads.claim();

    W.exitAd();
    sleep(1800);

    if (W.enterWelfareCenter()) {
        var after = W.doneCount();
        if (before >= 0 && after >= 0) {
            LOG.info("任务进度：" + before + " → " + after);
            if (after > before) {
                LOG.step("进度确认增长，本轮成功");
                return "success";
            }
        }
    }

    if (claimResult === 1) return "success";
    if (claimResult === -1) return "abnormal";
    return "fail";
}

function summary() {
    var total = Date.now() - stats.startTime;
    var avg = stats.success > 0 ? Math.round(total / stats.success) : 0;
    var text =
        "=== 运行结束 ===\n" +
        "总轮次: " + stats.round + "  成功: " + stats.success +
        "  失败: " + stats.fail + "  无广告: " + stats.noAd +
        "  异常: " + stats.abnormal + "  待人工: " + stats.manual +
        "  会员锁定: " + stats.member + "\n" +
        "总耗时: " + fmtMs(total) + "  平均每次成功: " + fmtMs(avg) + "\n" +
        "日志: " + CFG.LOG_FILE;
    LOG.raw(text);
    console.log(text);
    toast("完成 " + stats.success + " 次领取");
}

function main() {
    LOG.init();
    stats.startTime = Date.now();
    LOG.raw("=== 启动 ===\n包名: " + CFG.APP_PACKAGE +
        "\n屏幕: " + device.width + "x" + device.height +
        "\nSDK: " + (device.sdkInt || "?") +
        "\n最大轮次: " + (CFG.MAX_LOOP_COUNT > 0 ? CFG.MAX_LOOP_COUNT : "不限") +
        "\n");

    if (!ensureAccessibility()) {
        toast("无障碍未开启，脚本退出");
        return;
    }

    keepScreenAwake();
    SC.ensureCapture();
    var ocrOk = SC.probeOcr();
    LOG.info("OCR 可用: " + ocrOk + (ocrOk ? "" : "（未装 OCR 插件，走控件+坐标模式）"));
    F.loadProgress();

    if (!App.launch(3)) {
        LOG.err("无法启动 " + CFG.APP_NAME + "，请确认已安装并已登录");
        summary();
        return;
    }

    var idleStreak = 0;
    var memberStreak = 0;
    var loop = 0;

    while (true) {
        if (CFG.MAX_LOOP_COUNT > 0 && loop >= CFG.MAX_LOOP_COUNT) {
            LOG.info("已达到最大轮次 " + CFG.MAX_LOOP_COUNT);
            break;
        }
        loop++;
        stats.round++;
        LOG.step("第 " + loop + " 轮开始（Activity: " + W.activity() + "）");

        var result = "fail";
        try {
            result = oneRound();
        } catch (e) {
            LOG.err("第 " + loop + " 轮异常: " + e);
            result = "abnormal";
        }

        if (result === "success") {
            stats.success++;
            idleStreak = 0;
            memberStreak = 0;
            LOG.step("第 " + loop + " 轮领取成功（累计 " + stats.success + " 次）");
            if (CFG.TOAST_EACH_ROUND) toast("第 " + stats.success + " 次领取成功");
        } else if (result === "noad") {
            stats.noAd++;
            idleStreak++;
            LOG.warn("第 " + loop + " 轮没有广告可看（累计空转 " + idleStreak + "）");
        } else if (result === "abnormal") {
            stats.abnormal++;
            idleStreak++;
            LOG.warn("第 " + loop + " 轮页面异常（累计空转 " + idleStreak + "）");
        } else if (result === "manual") {
            stats.manual++;
            LOG.err("需要人工处理（验证码/登录），脚本暂停 90 秒等待");
            toast("请人工完成验证码，脚本等待中");
            sleep(90000);
            continue;
        } else if (result === "member") {
            stats.member++;
            memberStreak++;
            LOG.warn("会员态锁定（第 " + memberStreak + "/" + CFG.MEMBER_RETRY_MAX +
                " 次），" + Math.round(CFG.MEMBER_RETRY_SLEEP / 60000) + " 分钟后重试");
            if (memberStreak >= CFG.MEMBER_RETRY_MAX) {
                LOG.err("连续 " + memberStreak + " 次都处于会员态，福利中心不开放，脚本退出。VIP 到期后再运行即可。");
                toast("会员期间无福利入口，已退出");
                break;
            }
            toast("会员期间无福利入口，稍后重试");
            sleep(CFG.MEMBER_RETRY_SLEEP);
            continue;
        } else {
            stats.fail++;
            idleStreak++;
            LOG.warn("第 " + loop + " 轮领取未确认（累计空转 " + idleStreak + "）");
        }

        if (idleStreak >= CFG.IDLE_BEFORE_RESTART) {
            LOG.warn("连续 " + idleStreak + " 轮没有进展，重启 App");
            App.restart();
            idleStreak = 0;
        }

        if (result !== "success") {
            sleep(CFG.IDLE_SLEEP);
        } else {
            sleep(1500);
        }
    }

    summary();
}

events.on("exit", function () {
    try {
        summary();
    } catch (e) {
        // 退出阶段异常不再抛出
    }
    try {
        device.cancelKeepingAwake();
    } catch (e2) {
        // 忽略
    }
});

main();
