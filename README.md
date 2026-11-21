# 汽水音乐 · 自动领取广告福利（安卓 / AutoJs6）

用 [AutoJs6](https://github.com/SuperMonster003/AutoJs6) 在安卓手机上自动做汽水音乐的「看广告赚金币」任务。
纯手机内运行，不需要电脑，不需要数据线。

> 这是 [qishui-music-welfare-auto](https://github.com/jianqiang1235/qishui-music-welfare-auto)（iOS/AScript 版）的安卓版本。
> 本版**已按荣耀畅玩40（WDY-AN00 / Android 13 / 720×1612 / AutoJs6 6.8.0）真机实测重写**，
> 下面所有界面文案、坐标、Activity 名都来自真机 dump，不是推断。

---

## 真机实测得到的硬事实

| # | 事实 | 影响 |
|---|---|---|
| 1 | 入口不是 iOS 的「免费听歌」，而是 **福利中心 → 看广告赚金币 → 去完成** | 主流程整体重写 |
| 2 | 福利中心是 **Flutter 自绘**，页面里**没有任何 clickable 按钮节点**，dump 只有描述文字 | 按钮只能按坐标点，比例化后换机型自动缩放 |
| 3 | 倒计时文案在 **content-desc** 里：`14秒后可领取奖励，关闭，按钮`，`text` 是空的 | 只按 text 找必然失败，先 desc 再 text 再 OCR |
| 4 | 广告 Activity 是 `com.ss.android.excitingvideo.ExcitingVideoActivity` | 用它判定「是否在广告里」，比文案可靠 |
| 5 | 广告正片**自带**「商家推荐 / 精彩应用 / 立即下载」面板 | 这几个词**不能**作为落地页判据，否则每轮误判 |
| 6 | 点右上角 X **不是关闭而是下一条广告**（连播） | 退出广告要循环点 + 返回键 + 重启兜底 |
| 7 | 点「去完成」可能弹 `bdturing` 短信验证（`BdTuringVerifyActivity`） | 脚本停下等人输码，不硬闯 |
| 8 | 底部第 4 个 tab 坐标恒为 (504,1532)，但**名字会在「福利」和「会员」之间切换** | 不能硬编码 tab 名字；会员态要单独识别 |
| 9 | 每次无障碍查询要 2~3 秒 | 全部查询改「一次抓快照 + 本地匹配」 |
| 10 | tab 按钮 y 超过 ~1570 会落进手势区，直接回桌面 | 所有点击坐标都要留安全边距 |

---

## 特性

| 能力 | 说明 |
|---|---|
| Flutter 坐标适配 | 福利中心按钮无节点，按 `device.width/height` 比例点击，换分辨率自动缩放 |
| 倒计时自适应 | 先读 `desc` 再读 `text` 再 OCR；按显示秒数续期；同一秒数连续 10 次判定卡死 |
| 快照查询 | 一次抓全界面文字，后续判断全在本地，避免一轮几十次无障碍查询拖成两分钟 |
| 领奖进度校验 | 用任务行的「已完成N次」真实增长判成功，不只信屏幕上的「领取成功」 |
| 落地页三层兜底 | Activity 优先（还在广告 Activity 就不是落地页）→「完成」→ 返回键 → 重启 App |
| 会员态识别 | 底部 tab 变「会员」且全 App 无金币入口时，明确拒绝并退出，**一次都不乱点** |
| 风控待人 | 出现 `bdturing` 短信验证就停下，toast 提示人工输码，不盲试 |
| 全程落盘日志 | `/sdcard/qishui-autoqishui/run.log` |
| 无设备回归 | `node mock/run-mock.js`，五场景全绿（含会员态零点击断言） |

---

## 快速开始

```text
1. 手机装 AutoJs6 6.x（GitHub Releases 下载 APK）
2. 打开 AutoJs6 → 左侧菜单 → 无障碍服务 → 打开
3. 把整个 qishui-android-autojs 文件夹拷到 /sdcard/qishui-android-autojs/
4. AutoJs6 里打开 tools/自检.js 跑一遍，确认各项通过
5. 打开 main.js，点运行
```

首次运行会弹「是否允许 AutoJs6 录制/投射您的屏幕」，**必须点「允许」**，否则 OCR 兜底不可用。

详细步骤见 [docs/安装与使用.md](docs/安装与使用.md)。

---

## 目录结构

```
qishui-android-autojs/
├── main.js              主流程：前台 → 会员态识别 → 福利中心 → 去完成 → 倒计时 → 领奖 → 校验进度
├── config.js            所有关键词/比例/超时，适配只改这个
├── lib/
│   ├── ui.js            控件选择器封装（查找 / 排序 / 点击）
│   ├── screen.js        截图与 OCR 兜底
│   ├── app.js           启动、前台校验、唤醒、重启、返回手势
│   ├── ads.js           广告业务：倒计时、落地页判定、领奖
│   ├── welfare.js       福利中心适配：快照查询、会员态识别、坐标任务入口
│   └── logger.js        控制台 + toast + 文件三路日志
├── tools/
│   ├── 自检.js          环境逐项检查
│   └── 采集界面.js       dump 当前界面文字，用于适配新版本
├── mock/
│   ├── stub.js          假 AutoJs6 运行时 + 虚拟时钟 + 六阶段界面状态机（720×1612）
│   ├── run-mock.js      五场景回归（normal / landing / noad / risk / member）
│   └── 测试结果.md      回归结果记录
└── docs/
    ├── 安装与使用.md
    ├── 适配说明.md
    └── 常见问题.md
```

---

## 关键参数（config.js）

| 参数 | 默认 | 作用 |
|---|---|---|
| `APP_PACKAGE` | `com.luna.music` | 汽水音乐安卓包名 |
| `AD_ACTIVITY_KEY` | `ExcitingVideoActivity` | 广告页 Activity 关键字 |
| `RISK_ACTIVITY_KEY` | `bdturing` | 字节风控验证页关键字 |
| `MAX_LOOP_COUNT` | `0` | 最多跑几轮，`0` = 不限 |
| `AD_TIMEOUT_BASE/MAX` | `40 / 150` | 等广告的基础/封顶秒数 |
| `CLAIM_BEFORE_SEC` | `0` | 倒计时到 0 才认为可领（实测如此） |
| `AD_TASK_BTN_RATIO` | `[0.840, 0.535]` | 「看广告赚金币」右侧按钮位置（比例） |
| `AD_CLAIM_RATIO` | `[0.838, 0.050]` | 广告右上角领取/关闭位置 |
| `MEMBER_RETRY_SLEEP` | `300000` | 会员态下每 5 分钟回来探一次 |
| `MEMBER_RETRY_MAX` | `3` | 连续探测几次仍无入口就退出 |

界面文案、比例全部集中在 `config.js`，换成别的机型先改 `BASE_WIDTH/BASE_HEIGHT`。

---

## 无设备回归（电脑上跑）

```bash
node mock/run-mock.js
```

| 场景 | 验证什么 | 结果 |
|---|---|---|
| normal | 20 秒激励视频，3 轮领奖 + 进度增长 | PASS，3/3 领奖，金币 7110 |
| landing | 广告结束跳电商落地页，能否退出 | PASS，3 次全部退出 |
| noad | 点「去完成」没反应，能否快速失败 | PASS，76 秒退出 |
| risk | 触发 bdturing 短信验证，能否停下等人 | PASS，不乱点 |
| member | VIP 态无福利入口，能否一次都不点 | PASS，0 次点击 |

详见 [mock/测试结果.md](mock/测试结果.md)。

---

## 必须说明的两件事

**1. VIP 期间做不了这个任务（业务限制，不是 bug）。**

实测账号 VIP 生效中（首次登录赠送，至 2026-11-22）时：

- 底部第 4 个 tab 从「福利」变成「会员」
- 播放页右上角**没有金币入口**
- 会员充值页只有套餐，没有任何福利/金币节点
- 「我的」页也没有福利中心入口

也就是说**会员期间整个 App 里找不到福利中心**。脚本会识别这个状态、记日志、每 5 分钟探一次，
连续 3 次仍无入口就退出并提示「VIP 到期后再运行」。

**2. 这类自动化可能违反应用的用户协议。**

自动看广告领金币属于对平台的机械化操作，账号存在被风控/限制的可能，
实测点「去完成」已出现过一次短信验证拦截。本项目仅供学习 AutoJs6 与安卓无障碍自动化的技术实践，
请自行评估风险，不要用于商业用途或批量账号操作。

---

## 许可

MIT，见 [LICENSE](LICENSE)。
