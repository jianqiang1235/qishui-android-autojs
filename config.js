/**
 * 全局配置 —— 适配新机型 / 新版本时，先改这里
 *
 * 【2026-11-21 真机实测修订】荣耀畅玩40 (WDY-AN00) / Android 13 / 720x1612 / AutoJs6 6.8.0
 *
 * 实测得到的硬事实（改代码前必读）：
 *   1. 入口不是 iOS 版的「免费听歌」，而是「福利 tab → 福利中心 → 看广告赚金币 → 去完成」
 *   2. 底部第 4 个 tab 会在 VIP 即将到期时被换成「会员」，所以不能硬编码位置，要先按文字找「福利」
 *   3. 福利中心是 Flutter 渲染，【按钮没有任何无障碍节点】，只能按坐标点
 *   4. 广告页是 com.ss.android.excitingvideo.ExcitingVideoActivity
 *   5. 倒计时文案在 content-desc 里：`14秒后可领取奖励，关闭，按钮`，text 是空的
 *   6. 广告正片自带的落地页面板就有「商家推荐 / 精彩应用 / 立即下载」，
 *      所以这几个词【绝对不能】当成落地页判据，否则每轮都误判
 *   7. 点「去完成」可能弹 bdturing 短信验证（BdTuringVerifyActivity），必须人工输码
 */

module.exports = {
    /* ========== 应用 ========== */

    APP_PACKAGE: "com.luna.music",
    APP_NAME: "汽水音乐",

    APP_LAUNCH_SETTLE: 6000,

    // 主界面 Activity（用来判断是否回到 App 首页）
    MAIN_ACTIVITY: "MainActivity",
    // 激励视频广告 Activity（出现它就说明进了广告）
    AD_ACTIVITY_KEY: "ExcitingVideoActivity",
    // 字节风控验证 Activity（出现它说明要人工输验证码）
    RISK_ACTIVITY_KEY: "bdturing",

    /* ========== 主循环 ========== */

    MAX_LOOP_COUNT: 0,
    IDLE_BEFORE_RESTART: 3,
    IDLE_SLEEP: 8000,
    ROUND_TIMEOUT: 200000,

    /* ========== 广告倒计时（自适应） ========== */

    AD_TIMEOUT_BASE: 40,
    AD_TIMEOUT_MAX: 150,

    // 倒计时到多少秒就认为可以领奖。实测到 0 才变「领取成功」，所以取 0
    CLAIM_BEFORE_SEC: 0,

    // 实测文案：`14秒后可领取奖励`、`01秒后可领取奖励`
    // 注意：这段文字在 content-desc 里，不在 text 里
    COUNTDOWN_PATTERN: "\\d+\\s*秒\\s*后",

    // 出现这个描述就说明已经可以领奖
    CLAIM_READY_DESC: "领取成功",

    /* ========== 福利中心（Flutter 页，只能按坐标点） ========== */

    // 基准分辨率（实测机），坐标比例都按它换算，换机型会自动缩放
    BASE_WIDTH: 720,
    BASE_HEIGHT: 1612,

    // 底部第 4 个 tab（文字优先，坐标兜底）
    WELFARE_TAB_KEYWORDS: ["福利"],
    // 实测：第 4 个 tab 的坐标在任何状态下都是 (504,1532)，只是名字会变
    WELFARE_TAB_RATIO: [0.700, 0.950],

    // 播放页右上角的金币入口（点它直接进福利中心，比底部 tab 稳，不受 tab 变动影响）
    COIN_ENTRY_RATIO: [0.789, 0.057],
    COIN_ENTRY_DESC: "金币入口",

    /* ---- 会员(VIP)状态识别 ----
     * 实测（2026-11-21，VIP 生效中至 2026-11-22）：
     *   账号一旦有 VIP，底部第 4 个 tab 从「福利」变成「会员」，
     *   会员充值页里【没有】金币入口，福利中心在整个 App 里都找不到入口。
     *   这个状态下硬点只会把页面点乱（实测点偏会跳进荣耀系统管家）。
     *   所以先识别、再决定要不要继续，不要盲目坐标点击。
     */
    MEMBER_TAB_KEYWORDS: ["会员"],
    MEMBER_STATE_HINT: "当前账号是会员(VIP)状态，福利中心入口未开放",
    // VIP 期间每隔多久回来探一次（毫秒），连续探测失败就退出
    MEMBER_RETRY_SLEEP: 300000,
    MEMBER_RETRY_MAX: 3,

    // 底部 tab 文字所在的纵向带（占屏高比例），用来读当前是哪几个 tab
    TAB_BAND_TOP_RATIO: 0.920,
    TAB_BAND_BOTTOM_RATIO: 0.990,

    // 「发现」tab（回播放页找金币入口用）
    DISCOVER_TAB_KEYWORDS: ["发现"],
    DISCOVER_TAB_RATIO: [0.100, 0.950],

    // 判断"已经在福利中心"的特征文字
    WELFARE_TITLE_KEYWORDS: ["做任务", "我的资产", "金币收益", "现金收益"],
    WELFARE_TITLE_DESC: "做任务",

    // 广告任务的标题文字（用于确认这行是广告任务）
    AD_TASK_KEYWORDS: ["看广告赚金币"],
    // 「看广告赚金币」那条右侧按钮的位置
    AD_TASK_BTN_RATIO: [0.840, 0.535],

    // 逛街任务（浏览商品 30 秒，每日 15 次，风控比激励视频低）
    STREET_TASK_KEYWORDS: ["逛街赚金币"],
    STREET_TASK_BTN_RATIO: [0.840, 0.434],

    // 签到任务
    SIGN_TASK_KEYWORDS: ["签到得金币"],
    SIGN_TASK_BTN_RATIO: [0.840, 0.335],

    // 任务按钮上的通用文字（这些同样没有无障碍节点，仅用于日志与 OCR 兜底）
    TASK_GO_KEYWORDS: ["去完成", "去逛街", "去签到", "去领取"],

    // 广告右上角的「领取/关闭」按钮（实测 bounds [518,48][688,112]，中心 603,80）
    AD_CLAIM_RATIO: [0.838, 0.050],

    /* ========== 兜底关键词 ========== */

    // 老版本/其他入口的进广告按钮（保留，命中就用，不命中就走福利中心）
    AD_ENTRY_KEYWORDS: [
        "免费听歌",
        "免费畅听",
        "看广告免费听",
        "立即解锁",
        "免费解锁",
    ],

    SKIP_KEYWORDS: ["跳过", "跳过广告", "关闭广告"],

    CLAIM_KEYWORDS: [
        "领取奖励",
        "立即领取",
        "开心收下",
        "领取",
    ],

    CLAIM_OK_KEYWORDS: [
        "领取成功",
        "已领取",
        "奖励已到账",
        "金币已到账",
    ],

    // 会员/开通弹窗（VIP 到期前后频繁出现，必须关掉）
    MEMBER_POPUP_KEYWORDS: ["元开通", "开通会员", "立即开通", "限时特惠"],
    POPUP_CLOSE_KEYWORDS: ["关闭", "暂不", "以后再说", "取消", "我知道了"],

    /**
     * 落地页特征（真正跳出广告的电商/下载页才用）
     *
     * 【重要】不要把「商家推荐 / 精彩应用 / 立即下载」放进来：
     * 广告正片自带的落地页面板就有这三个词，实测每条广告都有。
     * 把它们当判据会让每轮都误判成落地页，然后疯狂滑动。
     *
     * 实际判定改为「Activity 优先」：只要还在 ExcitingVideoActivity 里，
     * 就一定是广告正片，不是落地页。
     */
    LANDING_KEYWORDS: [
        "向上滑动浏览落地页",
        "领券购买",
        "申请额度",
        "打开APP",
        "去淘宝购买",
        "加入购物车",
    ],

    // 落地页左上角的「完成 / 关闭」
    LANDING_CLOSE_KEYWORDS: ["完成", "关闭", "返回"],

    /* ========== 兜底与手势 ========== */

    SWIPE_BACK_MAX: 2,
    SWIPE_START_X_RATIO: 0.003,
    SWIPE_END_X_RATIO: 0.75,

    // 出现这些文案说明必须人工处理，脚本会暂停等待
    MANUAL_KEYWORDS: ["登录", "手机号登录", "验证码", "同意并继续"],
    // 风控验证页的特征（出现就停下等人）
    MANUAL_DESC_KEYWORDS: ["输入验证码", "验证码已发送至", "验证码"],

    /* ========== 日志与统计 ========== */

    LOG_DIR: "/sdcard/qishui-autoqishui",
    LOG_FILE: "/sdcard/qishui-autoqishui/run.log",
    LOG_OVERWRITE: true,
    TOAST_EACH_ROUND: true,
};
