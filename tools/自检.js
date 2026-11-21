/**
 * 自检工具 —— 第一次用 / 跑不起来时先跑这个
 * 逐项检查：无障碍、截图权限、OCR、汽水音乐是否安装、屏幕参数、当前前台
 */

var CFG = require("../config.js");
var LOG = require("../lib/logger.js");
var U = require("../lib/ui.js");
var SC = require("../lib/screen.js");

var pass = 0;
var fail = 0;

function check(name, ok, detail) {
    if (ok) {
        pass++;
        LOG.info("[通过] " + name + (detail ? "  " + detail : ""));
    } else {
        fail++;
        LOG.err("[失败] " + name + (detail ? "  " + detail : ""));
    }
}

function main() {
    LOG.init();
    LOG.raw("=== 自检 ===");

    // 1. 无障碍
    var a11y = false;
    try {
        auto.waitFor();
        a11y = !!auto.service;
    } catch (e) {
        a11y = false;
    }
    check("无障碍服务", a11y, a11y ? "" : "去 AutoJs6 → 设置 → 无障碍服务里打开");

    // 2. 截图权限
    var cap = SC.ensureCapture();
    check("截图权限", cap, cap ? "" : "运行时会弹一次授权框，必须点「立即开始」");

    // 3. OCR
    var ocrOk = SC.ocrAvailable();
    check("OCR 模块", ocrOk, ocrOk ? "" : "AutoJs6 版本过低，或 OCR 插件未安装");

    // 4. 汽水音乐是否安装（用启动并校验前台的方式判断，最可靠）
    var launched = false;
    try {
        app.launchPackage(CFG.APP_PACKAGE);
        sleep(3000);
        launched = U.currentPkg() === CFG.APP_PACKAGE;
    } catch (e2) {
        launched = false;
    }
    check("汽水音乐已安装 (" + CFG.APP_PACKAGE + ")", launched, launched ? "" : "包名不对或未安装，见 docs/适配说明.md");

    // 5. 屏幕
    LOG.info("屏幕尺寸: " + device.width + "x" + device.height +
        "  SDK=" + (device.sdkInt || "?") +
        "  品牌=" + (device.brand || "?") + "  型号=" + (device.model || "?"));

    // 6. 当前界面文字预览
    var texts = U.visibleTexts();
    LOG.info("当前界面可见文字 " + texts.length + " 条");
    for (var i = 0; i < texts.length && i < 30; i++) {
        LOG.raw("   · " + texts[i]);
    }

    // 7. 关键关键词命中情况
    var groups = [
        ["广告入口", CFG.AD_ENTRY_KEYWORDS],
        ["领奖按钮", CFG.CLAIM_KEYWORDS],
        ["成功提示", CFG.CLAIM_OK_KEYWORDS],
        ["落地页特征", CFG.LANDING_KEYWORDS],
    ];
    for (var g = 0; g < groups.length; g++) {
        var hit = U.existsKeywords(groups[g][1]);
        LOG.info("关键词组「" + groups[g][0] + "」当前界面命中: " + (hit ? "是" : "否"));
    }

    LOG.raw("\n=== 结果: 通过 " + pass + " 项，失败 " + fail + " 项 ===");
    if (fail === 0) {
        toast("自检全部通过，可以跑 main.js");
    } else {
        toast("有 " + fail + " 项没通过，看日志: " + CFG.LOG_FILE);
    }
}

main();
