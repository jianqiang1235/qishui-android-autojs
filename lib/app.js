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
 * 强制停掉会抢前台的系统组件
 * 【实测】荣耀系统管家（com.hihonor.systemmanager，带开屏广告）
 * 和负一屏（com.hihonor.hiboard）都会把 App 的启动顶掉，
 * 不先停掉它们，launchPackage 连试三次都进不了前台。
 */
function killFrontStealers() {
    var pkgs = ["com.hihonor.systemmanager", "com.hihonor.hiboard"];
    var killed = 0;
    for (var i = 0; i < pkgs.length; i++) {
        try {
            shell("am force-stop " + pkgs[i], true);
            killed++;
        } catch (e) {
            // 没 shell 权限就跳过
        }
    }
    if (killed > 0) LOG.info("已强制停止 " + killed + " 个会抢前台的系统组件");
    sleep(1500);
}

/**
 * 如果被荣耀系统组件抢了前台（管家的开屏广告、负一屏），按返回键把它关掉
 * 【实测】这种"启动失败"多半是假失败：App 其实已经在后台起来了，
 * 只是管家的开屏广告压在顶上，currentPackage() 变成 systemmanager
 */
function clearFrontStealer() {
    for (var i = 0; i < 3; i++) {
        var pkg = U.currentPkg();
        if (pkg === CFG.APP_PACKAGE) return true;
        // 只关管家的开屏广告和负一屏，绝不能把桌面（launcher）按返回键退掉
        if (pkg.indexOf("systemmanager") < 0 && pkg.indexOf("hiboard") < 0) return false;

        LOG.info("被「" + pkg + "」挡住，按返回键");
        try {
            back();
        } catch (e) {
            return false;
        }
        sleep(1500);
    }
    return isForeground();
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
        clearFrontStealer();
        if (isForeground()) {
            LOG.info("关掉抢前台的系统组件后，App 已在前台");
            sleep(CFG.APP_LAUNCH_SETTLE);
            return true;
        }
        // 返回键可能把我们退到了桌面，再拉一次
        try {
            app.launchPackage(CFG.APP_PACKAGE);
        } catch (e2) {
            // 忽略
        }
        sleep(2000);
        if (isForeground()) {
            LOG.info("清掉遮挡后重新拉起成功");
            sleep(CFG.APP_LAUNCH_SETTLE);
            return true;
        }
        LOG.warn("第 " + (i + 1) + " 次启动未进入前台，当前: " + U.currentPkg());
        sleep(1200);
    }

    // 第二次机会：先把抢前台的系统组件停掉，再直接拉起
    LOG.warn("常规启动失败，清掉抢前台的系统组件后重试");
    killFrontStealers();
    try {
        app.launchPackage(CFG.APP_PACKAGE);
    } catch (e) {
        // 忽略
    }
    sleep(2500);
    if (isForeground()) {
        LOG.info("清场后启动成功");
        sleep(CFG.APP_LAUNCH_SETTLE);
        return true;
    }

    // 最后一次：回桌面再点图标
    LOG.warn("改从桌面启动");
    clearFrontStealer();
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
        clearFrontStealer();
        if (isForeground()) {
            LOG.info("从桌面启动后被系统组件盖住，清掉后已在前台");
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
