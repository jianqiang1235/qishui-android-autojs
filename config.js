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

    AD_TIMEOUT_BASE: 28,
    AD_TIMEOUT_MAX: 150,
    // 连续几轮拿不到广告，就长休息 + 重启 App（广告池没货时死磕只会白白挨风控）
    NOAD_RESTART_COUNT: 6,
    NOAD_RESTART_SLEEP: 300000,

    // 倒计时到多少秒就认为可以领奖。实测到 0 才变「领取成功」，所以取 0
    CLAIM_BEFORE_SEC: 0,

    // 实测文案：`14秒后可领取奖励`、`01秒后可领取奖励`
    // 注意：这段文字在 content-desc 里，不在 text 里
    COUNTDOWN_PATTERN: "\\d+\\s*秒\\s*后",

    // 出现这个描述就说明已经可以领奖
    CLAIM_READY_DESC: "领取成功",

    /* ========== 「免N天」免费畅听入口（主路径） ==========
     *
     * 【2026-11-21 真机实测，这是本版能用的真正入口】
     *   发现页右上角「免18天」→ 点它【直接进激励视频】
     *   → 倒计时结束出现「领取成功，关闭，按钮」→ 点右上角
     *   → 弹「再看X秒继续解锁 / 第N日免费听」→ 点「坚持退出」
     *   → 回 App 弹「再看N个提前享第M天畅听」面板（desc: `第19天畅听` / `已领取`）
     *   → 点 × 关掉，右上角变成「免19天」
     *
     * 也就是【每看一条广告 +1 天免费畅听】。实测 18 → 19 天整条链路走通。
     * 关键优势：VIP 期间福利中心会消失，但这个入口一直都在。
     */

    // 这个按钮是 Flutter 自绘，控件树里没有文字，只能 OCR 认「免18天」
    FREE_ENTRY_PATTERN: "免\\s*\\d+\\s*天",
    // OCR 认不出来时的兜底坐标（实测点 643,92 能进）
    FREE_ENTRY_RATIO: [0.893, 0.057],
    // 从 OCR 文本里抠天数
    FREE_DAYS_PATTERN: "免\\s*(\\d+)\\s*天",
    // 免费畅听的封顶天数：非 VIP 用户最多免 30 天，到顶后当天不再给广告
    // （用户 2026-11-21 明确确认：「非VIP用户，目前最多免费30天」）
    FREE_DAYS_MAX: 30,

    // 点入口后进广告的等待上限（毫秒）
    // 点入口后等广告出现的最长等待：正常 3~6 秒就进来，等太久只会在空壳页白耗
    FREE_AD_WAIT: 18000,

    // 「再看X秒继续解锁」弹窗里的「坚持退出」按钮（广告 Activity 内）
    // 实测位置 (360,1006) → 比例
    CONTINUE_DIALOG_RATIO: [0.500, 0.624],
    CONTINUE_DIALOG_KEYWORDS: ["再看", "继续解锁", "坚持退出"],

    // 领完后 App 内的「再看N个提前享第M天畅听」面板
    PANEL_KEYWORDS: ["天畅听", "提前享", "日畅听", "提醒我每天来"],
    // 面板右上角的 ×（实测 (650,1005) → 比例）
    PANEL_CLOSE_RATIO: [0.903, 0.623],
    // 另一种「恭喜获得 第N日畅听」面板的 ×（实测 (650,1086)）
    PANEL_CLOSE_RATIO_ALT: [0.903, 0.674],
    // 面板里「已领取」的判定文字
    PANEL_CLAIMED_DESC: "第%d天畅听",
    PANEL_CLAIMED_KEYWORD: "已领取",
    // 【实测】还有第二种面板：「恭喜获得 / 第30日畅听 / 提醒我每天来 / 看2个视频 享今日无损音质」，
    // 控件树里只有一条 desc `第30日畅听`（是「日」不是「天」），没有「已领取」，
    // 但它出现本身就说明今天这条已经领到了。
    PANEL_DAY_PATTERN: "第\\s*(\\d+)\\s*[天日]\\s*畅听",
    PANEL_BONUS_DESC_PATTERN: "第\\s*\\d+\\s*日\\s*畅听",

    /* ---------- 直播间形式广告 ---------- */
    // 广告有时不是 19 秒激励视频，而是「直播间」，Activity 是
    // com.luna.music/com.luna.biz.live.plugin.LunaDefaultLivePlayerActivity 或 android.app.Dialog。
    // 【2026-11-21 实测修正】直播间形式【同样计时计奖励】：看够时长后广告容器里同样出现
    // 「领取成功，关闭，按钮」，点浮层「坚持退出」能正常回 App 并 +1 进度。
    // 所以不再「退出换一条」，改成等它播完（下面的 LIVE_WATCH_SEC）。
    LIVE_KEYWORDS: ["本场点赞", "更多直播", "说点什么", "小时榜", "人气榜", "直播间同价"],
    LIVE_ACTIVITY_KEY: "live",
    LIVE_CLOSE_RATIO: [0.936, 0.062],
    // 直播间播放器 Activity（浮在广告容器之上，需要 back 才能露出广告容器的倒计时/领取成功）
    LIVE_PLAYER_ACTIVITY_KEY: "luna.biz.live.plugin",

    /* ---------- 直播间上层的「悬浮窗播放功能上线啦」引导弹窗 ---------- */
    // 实测：退出直播间时这个弹窗会盖在最上层，点直播间的 × 全部打在它身上 → 死循环。
    // 必须先点「暂不使用」把它关掉。实测「暂不使用」中心 (199,963) → 比例 (0.277,0.598)
    FLOAT_GUIDE_KEYWORD: "悬浮窗播放功能上线啦",
    FLOAT_GUIDE_DECLINE_KEYWORDS: ["暂不使用"],
    FLOAT_GUIDE_DECLINE_RATIO: [0.277, 0.598],

    // 直播间形式广告的等待时长（秒），到时再 back 露出广告容器检查「领取成功」
    LIVE_WATCH_SEC: 34,
    // 露出广告容器后最多再等几轮（每轮 6 秒）
    LIVE_PROBE_ROUNDS: 8,

    /* ========== 福利中心（旧路径，会员态下不可用） ========== */

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
