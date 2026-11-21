/**
 * 控件层封装：安卓的最大优势是有控件树，能直接按文字找按钮，
 * 不用像 iOS 那样靠 OCR 猜坐标。OCR 只作为兜底放在 screen.js 里。
 */

var LOG = require("./logger.js");

/* ---------- 基础取值 ---------- */

function textOf(node) {
    try {
        var t = node.text();
        return t === null || t === undefined ? "" : String(t).trim();
    } catch (e) {
        return "";
    }
}

function descOf(node) {
    try {
        var d = node.desc();
        return d === null || d === undefined ? "" : String(d).trim();
    } catch (e) {
        return "";
    }
}

function labelOf(node) {
    var t = textOf(node);
    if (t) return t;
    return descOf(node);
}

/* ---------- 选择器 ---------- */

function safeFind(selector) {
    try {
        var arr = selector.find();
        return arr || [];
    } catch (e) {
        return [];
    }
}

function pushUnique(list, nodes) {
    for (var i = 0; i < nodes.length; i++) {
        list.push(nodes[i]);
    }
}

function boundsOf(node) {
    try {
        return node.bounds();
    } catch (e) {
        return null;
    }
}

function inScreen(node) {
    var b = boundsOf(node);
    if (!b) return false;
    if (b.width() <= 0 || b.height() <= 0) return false;
    var w = device.width;
    var h = device.height;
    if (b.right <= 0 || b.bottom <= 0 || b.left >= w || b.top >= h) return false;
    return true;
}

function areaOf(node) {
    var b = boundsOf(node);
    if (!b) return 0;
    return b.width() * b.height();
}

function isClickable(node) {
    try {
        return !!node.clickable();
    } catch (e) {
        return false;
    }
}

/**
 * 按关键词列表查找控件，返回排好序的候选数组。
 * 排序规则：可点击优先 → 面积小优先（按钮通常比整段说明文字小）→ 靠上优先
 */
function findCandidates(keywords) {
    if (!keywords || keywords.length === 0) return [];
    var raw = [];
    for (var i = 0; i < keywords.length; i++) {
        var kw = keywords[i];
        if (!kw) continue;
        pushUnique(raw, safeFind(text(kw)));
        pushUnique(raw, safeFind(textContains(kw)));
        pushUnique(raw, safeFind(desc(kw)));
        pushUnique(raw, safeFind(descContains(kw)));
    }

    var seen = {};
    var out = [];
    for (var j = 0; j < raw.length; j++) {
        var n = raw[j];
        if (!n) continue;
        if (!inScreen(n)) continue;
        var b = boundsOf(n);
        if (!b) continue;
        var key = labelOf(n) + "@" + b.left + "," + b.top + "," + b.right + "," + b.bottom;
        if (seen[key]) continue;
        seen[key] = true;
        out.push(n);
    }

    out.sort(function (a, b) {
        var ca = isClickable(a) ? 0 : 1;
        var cb = isClickable(b) ? 0 : 1;
        if (ca !== cb) return ca - cb;
        var aa = areaOf(a);
        var ab = areaOf(b);
        if (aa !== ab) return aa - ab;
        var ba = boundsOf(a);
        var bb = boundsOf(b);
        return (ba ? ba.top : 0) - (bb ? bb.top : 0);
    });
    return out;
}

function findOneByKeywords(keywords) {
    var c = findCandidates(keywords);
    return c.length > 0 ? c[0] : null;
}

/**
 * 在 timeout 毫秒内反复查找，找到就返回控件，超时返回 null
 */
function waitKeywords(keywords, timeout) {
    var deadline = Date.now() + (timeout || 0);
    var node = findOneByKeywords(keywords);
    while (!node && Date.now() < deadline) {
        sleep(250);
        node = findOneByKeywords(keywords);
    }
    return node;
}

function existsKeywords(keywords) {
    return findOneByKeywords(keywords) !== null;
}

/* ---------- 点击 ---------- */

function tapNode(node) {
    if (!node) return false;
    var b = boundsOf(node);
    if (!b) return false;
    var x = Math.round(b.left + b.width() / 2);
    var y = Math.round(b.top + b.height() / 2);
    if (x <= 0 || y <= 0 || x >= device.width || y >= device.height) return false;

    // 先试控件自身点击，失败再退回坐标点击
    try {
        if (isClickable(node) && node.click()) return true;
    } catch (e) {
        // 继续走坐标点击
    }
    try {
        return click(x, y);
    } catch (e) {
        LOG.warn("坐标点击失败 " + x + "," + y + ": " + e);
        return false;
    }
}

/**
 * 找到关键词控件并点击。返回 true 表示点了。
 */
function tapKeywords(keywords, timeout) {
    var node = waitKeywords(keywords, timeout || 2000);
    if (!node) return false;
    var ok = tapNode(node);
    if (ok) {
        LOG.info("点击「" + labelOf(node) + "」");
    }
    return ok;
}

function tapPoint(x, y) {
    try {
        return click(Math.round(x), Math.round(y));
    } catch (e) {
        return false;
    }
}

/* ---------- 界面信息采集 ---------- */

/**
 * 返回当前界面上所有可见文本（用于日志、调试和采集工具）
 */
function visibleTexts() {
    var out = [];
    var seen = {};
    var lists = [safeFind(textMatches(/.+/)), safeFind(descMatches(/.+/))];
    for (var i = 0; i < lists.length; i++) {
        for (var j = 0; j < lists[i].length; j++) {
            var n = lists[i][j];
            if (!inScreen(n)) continue;
            var s = labelOf(n);
            if (!s || seen[s]) continue;
            seen[s] = true;
            out.push(s);
        }
    }
    return out;
}

/**
 * 当前前台包名
 */
function currentPkg() {
    try {
        return currentPackage();
    } catch (e) {
        return "";
    }
}

module.exports = {
    textOf: textOf,
    descOf: descOf,
    labelOf: labelOf,
    findCandidates: findCandidates,
    findOneByKeywords: findOneByKeywords,
    waitKeywords: waitKeywords,
    existsKeywords: existsKeywords,
    tapNode: tapNode,
    tapKeywords: tapKeywords,
    tapPoint: tapPoint,
    visibleTexts: visibleTexts,
    currentPkg: currentPkg,
    inScreen: inScreen,
};
