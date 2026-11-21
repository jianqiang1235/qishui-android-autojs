/**
 * 汽水音乐 · 自动领取广告福利（安卓 / AutoJs6）
 *
 * 用法：把整个文件夹拷到手机，用 AutoJs6 打开 main.js 运行。
 * 适配：界面文案和按钮位置变了，只改 config.js 里的关键词，不要动这里的逻辑。
 *
 * 主流程：确保前台 → 进广告 → 等倒计时 → 点领奖 → 二次确认 → 落地上兜底 → 循环
 */

var CFG = require("./config.js");
var LOG = require("./lib/logger.js");
var U = require("./lib/ui.js");
var SC = require("./lib/screen.js");
var App = require("./lib/app.js");
var Ads = require("./lib/ads.js");

var stats = {
    round: 0,
    success: 0,
    fail: 0,
    noAd: 0,
    abnormal: 0,
    manual: 0,
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
        // 某些版本 auto.service 字段不可用，交给后续点击是否成功来间接判断
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
    // 1. 前台
    if (!App.ensureForeground()) return "abnormal";

    // 2. 需要人工处理的界面
    if (Ads.needManual()) {
        LOG.err("界面要求登录或验证码，脚本暂停");
        return "manual";
    }

    // 3. 如果已经在落地页，先退出来
    if (Ads.isLandingPage()) {
        Ads.escapeLanding();
        return "abnormal";
    }

    // 4. 进广告
    if (!Ads.enterAd()) {
        LOG.warn("本轮没能进入广告");
        return "noad";
    }

    // 5. 等广告播完
    if (!Ads.waitAdFinish()) {
        LOG.warn("本轮没有识别到广告倒计时");
        return "noad";
    }

    // 6. 领奖
    var r = Ads.claim();
    if (r === 1) return "success";
    if (r === -1) return "abnormal";
    return "fail";
}

function summary() {
    var total = Date.now() - stats.startTime;
    var avg = stats.success > 0 ? Math.round(total / stats.success) : 0;
    var text =
        "=== 运行结束 ===\n" +
        "总轮次: " + stats.round + "  成功: " + stats.success +
        "  失败: " + stats.fail + "  无广告: " + stats.noAd +
        "  异常: " + stats.abnormal + "\n" +
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
    LOG.info("OCR 可用: " + SC.ocrAvailable());

    if (!App.launch(3)) {
        LOG.err("无法启动 " + CFG.APP_NAME + "，请确认已安装并已登录");
        summary();
        return;
    }

    var idleStreak = 0;
    var loop = 0;

    while (true) {
        if (CFG.MAX_LOOP_COUNT > 0 && loop >= CFG.MAX_LOOP_COUNT) {
            LOG.info("已达到最大轮次 " + CFG.MAX_LOOP_COUNT);
            break;
        }
        loop++;
        stats.round++;
        LOG.step("第 " + loop + " 轮开始");

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
            LOG.step("第 " + loop + " 轮领取成功（累计 " + stats.success + " 次）");
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
            LOG.err("需要人工登录，停止");
            break;
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
