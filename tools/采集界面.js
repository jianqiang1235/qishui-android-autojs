/**
 * 界面采集工具 —— 适配新版本时先跑这个
 *
 * 它会做三件事：
 *   1. 截一张当前屏幕的图（存到 /sdcard/qishui-autoqishui/）
 *   2. 把界面上所有控件文字 + 坐标 dump 出来
 *   3. 跑一次 OCR，把识别到的文字 + 坐标也 dump 出来
 *
 * 拿到 dump 文件后，把里面出现的按钮文案补进 config.js 对应关键词数组即可。
 */

var LOG = require("../lib/logger.js");
var U = require("../lib/ui.js");
var SC = require("../lib/screen.js");

var OUT_DIR = "/sdcard/qishui-autoqishui";

function stamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

function dumpWidgets() {
    var lines = [];
    var nodes = [];
    try {
        nodes = textMatches(/.+/).find();
    } catch (e) {
        nodes = [];
    }
    lines.push("--- 控件树（文字 / 描述 / 坐标 / 是否可点）---");
    for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (!U.inScreen(n)) continue;
        var b = null;
        try { b = n.bounds(); } catch (e) { b = null; }
        if (!b) continue;
        lines.push(
            "text=\"" + U.textOf(n) + "\"" +
            " desc=\"" + U.descOf(n) + "\"" +
            " clickable=" + (n.clickable ? n.clickable() : "?") +
            " bounds=[" + b.left + "," + b.top + "," + b.right + "," + b.bottom + "]"
        );
    }

    // 描述单独扫一遍（有些控件只有 desc）
    var dnodes = [];
    try {
        dnodes = descMatches(/.+/).find();
    } catch (e) {
        dnodes = [];
    }
    for (var j = 0; j < dnodes.length; j++) {
        var dn = dnodes[j];
        if (!U.inScreen(dn)) continue;
        var db = null;
        try { db = dn.bounds(); } catch (e) { db = null; }
        if (!db) continue;
        lines.push(
            "desc-only desc=\"" + U.descOf(dn) + "\"" +
            " bounds=[" + db.left + "," + db.top + "," + db.right + "," + db.bottom + "]"
        );
    }
    return lines;
}

function dumpOcr() {
    var lines = ["--- OCR 结果 ---"];
    if (!SC.ocrAvailable()) {
        lines.push("（当前环境没有 ocr 模块）");
        return lines;
    }
    var items = SC.detect();
    if (items.length === 0) {
        lines.push("（没有识别到文字）");
        return lines;
    }
    for (var i = 0; i < items.length; i++) {
        var b = items[i].bounds;
        var box = "-";
        if (b) {
            var l = b.left !== undefined ? b.left : b[0];
            var t = b.top !== undefined ? b.top : b[1];
            var r = b.right !== undefined ? b.right : b[2];
            var bt = b.bottom !== undefined ? b.bottom : b[3];
            box = "[" + l + "," + t + "," + r + "," + bt + "] @" + Math.round((l + r) / 2) + "," + Math.round((t + bt) / 2);
        }
        lines.push("\"" + items[i].text + "\"  conf=" + items[i].confidence + "  " + box);
    }
    return lines;
}

function main() {
    LOG.init();
    auto.waitFor();
    SC.ensureCapture();
    sleep(1000);

    var tag = stamp();
    var shot = OUT_DIR + "/shot-" + tag + ".png";
    SC.saveShot(shot);

    var lines = [];
    lines.push("=== 界面采集 " + tag + " ===");
    lines.push("包名: " + U.currentPkg());
    lines.push("屏幕: " + device.width + "x" + device.height + "  SDK=" + (device.sdkInt || "?"));
    lines.push("截图: " + shot);
    lines.push("");
    lines = lines.concat(dumpWidgets());
    lines.push("");
    lines = lines.concat(dumpOcr());

    var outFile = OUT_DIR + "/dump-" + tag + ".txt";
    files.write(outFile, lines.join("\n"));
    console.log(lines.join("\n"));
    toast("已保存: " + outFile);
    LOG.info("界面采集完成 → " + outFile);
}

main();
