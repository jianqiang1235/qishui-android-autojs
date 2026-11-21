/**
 * 截图与 OCR 兜底层。
 *
 * 安卓优先用控件树（ui.js），OCR 只在两种情况下用：
 *   1. 控件树里找不到文字（自绘控件 / WebView 里的文字）
 *   2. 倒计时这种纯展示文本，控件可能被合并成一整段
 */

var LOG = require("./logger.js");

var captureReady = false;
var ocrUsable = null; // null=未探测 true/false
var ocrBroken = false; // 插件缺失时置 true，之后一律不再尝试
var ocrWarned = false;

/* ---------- 截图 ---------- */

/**
 * 申请截图权限。AutoJs6 用 images.requestScreenCapture，旧版 Auto.js 用 requestScreenCapture
 */
function ensureCapture() {
    if (captureReady) return true;
    var ok = false;
    try {
        ok = images.requestScreenCapture();
    } catch (e) {
        ok = false;
    }
    if (!ok) {
        try {
            ok = requestScreenCapture();
        } catch (e2) {
            ok = false;
        }
    }
    captureReady = !!ok;
    if (captureReady) {
        LOG.info("截图权限已获取");
    } else {
        LOG.warn("截图权限未获取，OCR 兜底不可用（控件层仍可工作）");
    }
    return captureReady;
}

function grab() {
    if (!ensureCapture()) return null;
    try {
        return images.captureScreen();
    } catch (e) {
        LOG.warn("截图失败: " + e);
        return null;
    }
}

function saveShot(path) {
    var img = grab();
    if (!img) return false;
    return images.save(img, path);
}

/* ---------- OCR ---------- */

function ocrAvailable() {
    if (ocrUsable !== null) return ocrUsable;
    if (ocrBroken) return false;
    var ok = false;
    try {
        // 不同版本字段不一，先看方法是否存在
        ok = typeof ocr !== "undefined" && ocr !== null;
    } catch (e) {
        ok = false;
    }
    ocrUsable = ok;
    if (!ok) LOG.warn("当前环境没有 ocr 模块，跳过 OCR 兜底");
    return ok;
}

/** 真正试一次识别：插件没装时 AutoJs6 会抛 IllegalStateException，这里一次性降级 */
function probeOcr() {
    if (ocrBroken || ocrUsable === false) return false;
    var img = grab();
    if (!img) {
        ocrBroken = true;
        return false;
    }
    try {
        ocr.detect(img);
        return true;
    } catch (e) {
        ocrBroken = true;
        ocrUsable = false;
        if (!ocrWarned) {
            ocrWarned = true;
            LOG.warn("OCR 引擎不可用（AutoJs6 插件中心未安装 OCR 插件），已自动降级为纯控件/坐标模式");
        }
        return false;
    }
}

function normalize(item) {
    var t = "";
    try {
        t = item.label || item.text || item.words || "";
        t = String(t).trim();
    } catch (e) {
        t = "";
    }
    var b = null;
    try {
        b = item.bounds || item.boundsRect || null;
    } catch (e) {
        b = null;
    }
    var conf = 1;
    try {
        if (item.confidence !== undefined && item.confidence !== null) conf = item.confidence;
    } catch (e) {
        conf = 1;
    }
    return { text: t, bounds: b, confidence: conf };
}

/**
 * 识别当前屏幕，返回 [{text, bounds, confidence}]
 */
function detect() {
    if (ocrBroken) return [];
    if (!ocrAvailable()) return [];
    var img = grab();
    if (!img) return [];
    try {
        var raw = ocr.detect(img);
        var out = [];
        for (var i = 0; i < (raw ? raw.length : 0); i++) {
            var r = normalize(raw[i]);
            if (r.text) out.push(r);
        }
        return out;
    } catch (e) {
        ocrBroken = true;
        ocrUsable = false;
        if (!ocrWarned) {
            ocrWarned = true;
            LOG.warn("OCR 引擎不可用（AutoJs6 插件中心未安装 OCR 插件），已自动降级为纯控件/坐标模式");
        }
        return [];
    }
}

/**
 * OCR 结果里按正则找一条，返回中心坐标 {x, y, text}
 */
function findPoint(pattern) {
    var items = detect();
    var re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
    for (var i = 0; i < items.length; i++) {
        if (!re.test(items[i].text)) continue;
        var b = items[i].bounds;
        if (!b) continue;
        var left = b.left !== undefined ? b.left : b[0];
        var top = b.top !== undefined ? b.top : b[1];
        var right = b.right !== undefined ? b.right : b[2];
        var bottom = b.bottom !== undefined ? b.bottom : b[3];
        return {
            x: (left + right) / 2,
            y: (top + bottom) / 2,
            text: items[i].text,
        };
    }
    return null;
}

/**
 * OCR 命中就点击，返回是否点到了
 */
function tapPattern(pattern) {
    var p = findPoint(pattern);
    if (!p) return false;
    LOG.info("OCR 命中「" + p.text + "」@(" + Math.round(p.x) + "," + Math.round(p.y) + ")");
    try {
        return click(Math.round(p.x), Math.round(p.y));
    } catch (e) {
        return false;
    }
}

/**
 * OCR 里是否出现匹配文本
 */
function hasPattern(pattern) {
    return findPoint(pattern) !== null;
}

module.exports = {
    ensureCapture: ensureCapture,
    grab: grab,
    saveShot: saveShot,
    ocrAvailable: ocrAvailable,
    probeOcr: probeOcr,
    detect: detect,
    findPoint: findPoint,
    tapPattern: tapPattern,
    hasPattern: hasPattern,
};
