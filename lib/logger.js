/**
 * 日志：同时输出到控制台、toast 和 /sdcard 下的日志文件
 * 真机跑长跑时控制台会被切走，日志文件是唯一可靠的排查依据。
 */

var CFG = require("../config.js");

var inited = false;

function pad2(n) {
    return (n < 10 ? "0" : "") + n;
}

function ts() {
    var d = new Date();
    return pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + " " +
        pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
}

function init() {
    if (inited) return;
    inited = true;
    try {
        files.ensureDir(CFG.LOG_FILE);
    } catch (e) {
        // ensureDir 不可用时直接 append，父目录通常已存在
    }
    try {
        if (CFG.LOG_OVERWRITE) {
            files.write(CFG.LOG_FILE, "=== 汽水音乐自动领福利 " + ts() + " ===\n");
        }
    } catch (e) {
        console.warn("日志文件初始化失败: " + e);
    }
}

function line(level, msg) {
    init();
    var s = "[" + ts() + "][" + level + "] " + msg;
    console.log(s);
    try {
        files.append(CFG.LOG_FILE, s + "\n");
    } catch (e) {
        // 忽略写盘失败，不能因为日志挂掉主流程
    }
}

module.exports = {
    init: init,
    info: function (msg) { line("INFO", msg); },
    warn: function (msg) { line("WARN", msg); },
    err: function (msg) { line("ERR ", msg); },
    step: function (msg) {
        line("STEP", msg);
        // 关键节点弹一下提示，方便肉眼确认进度
        try { toast(msg); } catch (e) { }
    },
    raw: function (msg) {
        init();
        try { files.append(CFG.LOG_FILE, msg + "\n"); } catch (e) { }
    },
};
