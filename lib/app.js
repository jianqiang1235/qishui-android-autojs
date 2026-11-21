/**
 * App 生命周期：启动、前台校验、唤醒解锁、重启兜底
 *
 * 踩坑记录：直接调 launchPackage 在锁屏或刚切走时经常返回成功但界面没起来，
 * 必须靠 currentPackage() 校验，重试若干次，最后才回桌面重新找图标。
 */

var CFG = require("../config.js");
var LOG = require("./logger.js");
var U = require("./ui.js");

function isForeground() {
    return U.currentPkg() === CFG.APP_PACKAGE;
}

/**
 * 唤醒屏幕（不解锁密码，需要用户自己关闭锁屏密码或用信任设备解锁）
 */
function wakeScreen() {
    try {
        if (device.isScreenOn && !device.isScreenOn()) {
            device.wakeUp();
            sleep(800);
            LOG.info("已唤醒屏幕");
        }
    } catch (e) {
        LOG.warn("唤醒屏幕失败: " + e);
    }
}

/**
 * 启动 App，成功返回 true
 */
function launch(retry) {
    var times = retry || 3;
    wakeScreen();
    for (var i = 0; i < times; i++) {
        try {
            app.launchPackage(CFG.APP_PACKAGE);
        } catch (e) {
            LOG.warn("launchPackage 异常(第" + (i + 1) + "次): " + e);
        }
        sleep(2000);
        if (isForeground()) {
            LOG.info("App 已在前台（第 " + (i + 1) + " 次尝试）");
            sleep(CFG.APP_LAUNCH_SETTLE);
            return true;
        }
        LOG.warn("第 " + (i + 1) + " 次启动未进入前台，当前: " + U.currentPkg());
        sleep(1200);
    }

    // 最后一次：回桌面再点图标
    LOG.warn("常规启动失败，改从桌面启动");
    try {
        home();
    } catch (e) {
        // home 不可用时继续
    }
    sleep(2000);
    var icon = U.findOneByKeywords([CFG.APP_NAME]);
    if (icon && U.tapNode(icon)) {
        sleep(3000);
        if (isForeground()) {
            LOG.info("从桌面启动成功");
            sleep(CFG.APP_LAUNCH_SETTLE);
            return true;
        }
    }
    return false;
}

/**
 * 确保 App 在前台，不在就拉起
 */
function ensureForeground() {
    if (isForeground()) return true;
    LOG.warn("App 不在前台，当前: " + U.currentPkg() + "，尝试拉起");
    return launch(2);
}

/**
 * 重启：回到桌面 → 杀掉 → 重新启动
 */
function restart() {
    LOG.warn("重启 App");
    try {
        home();
    } catch (e) {
        // 忽略
    }
    sleep(1500);
    try {
        app.openAppSetting(CFG.APP_PACKAGE);
        sleep(1000);
        back();
        sleep(800);
    } catch (e) {
        // 部分系统不允许直接跳设置，忽略
    }
    return launch(3);
}

/**
 * 回退一层：优先系统返回键，失败则从左侧边缘右滑（安卓的侧滑返回手势）
 */
function goBack() {
    var ok = false;
    try {
        ok = back();
    } catch (e) {
        ok = false;
    }
    if (ok) {
        LOG.info("按返回键");
        sleep(1200);
        return true;
    }
    var h = device.height;
    try {
        swipe(2, Math.round(h * 0.5), Math.round(device.width * CFG.SWIPE_END_X_RATIO),
            Math.round(h * 0.5), 400);
        LOG.info("左侧右滑返回");
        sleep(1200);
        return true;
    } catch (e2) {
        LOG.warn("返回手势失败: " + e2);
        return false;
    }
}

module.exports = {
    isForeground: isForeground,
    wakeScreen: wakeScreen,
    launch: launch,
    ensureForeground: ensureForeground,
    restart: restart,
    goBack: goBack,
};
