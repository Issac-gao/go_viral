# 小猪替你顶一会儿 · 桌面情绪代班处

你歇会儿，我先顶着。

这是独立运行的 Windows / macOS 桌面宠物：同一只粉色小猪，有牛马、气鼓、躺平、下班四种形态，可以拖动、戳一戳、换装，演一段职场小剧场。

喝水、休息和下班提醒由使用者主动开启。提醒只在小猪旁边举牌，全程静音；锁屏、休眠、隐身时暂停，恢复后不补发积压提醒。无需账号，断网可用；设置仅保存在本机，不读取工作内容。

## 下载试用包

在 [Actions → Desktop installers](../../actions/workflows/desktop.yml) 打开当前分支最新一次**全部成功**的运行，从 Artifacts 下载：

- **PainPig-Windows-x64**：Windows 11 x64，打开其中的 Setup.exe 安装。
- **PainPig-Mac-AppleSilicon**：M 系列芯片 Mac，打开 DMG 后把应用拖到 Applications。
- **PainPig-Mac-Intel**：Intel Mac，安装方式相同。

每个压缩包附安装说明、SHA-256 校验和及构建状态说明。GitHub 下载构建产物通常需要登录；你下载后可以把安装文件直接发给朋友。产物保留 30 天。

**当前是熟人试用版：Windows 尚未签名，Mac 仅本机签名，未做开发者身份签名和公证。系统可能拦截，企业电脑也可能禁止安装；详见 [安装说明](docs/INSTALL.zh-CN.md)。** 自动检查通过不代表桌面互动或安装验收已经人工完成。

## 使用

- 单击小猪：戳一戳；按住拖动：换位置。
- 右键小猪：选择形态、播放小剧场、隐藏、设置、退出。
- 鼠标靠近小猪：显示快捷按钮。
- 隐藏以后：Windows 托盘或 Mac 菜单栏点小猪图标叫回来。
- “陪我缓两分钟”：小猪安静陪着，不要求你按时结束休息。
- 设置中可开启提醒、改变提醒日期和时段、取消置顶或开启登录启动。默认不开启提醒或登录启动。

第一版使用本项目内绘制的分层 SVG 小猪，延续原站的粉色、疲惫但愿意陪伴的气质；未从网站提取或覆盖原素材。原站保持独立。

## 本地开发与打包

需要 Node.js 24、npm；Windows 构建在 Windows 运行，Mac DMG 构建在 macOS 运行。

```sh
npm install
npm test
npm start
npm run smoke
npm run make
```

有 package-lock.json 时用 npm ci。首次 CI 生成依赖锁文件，后续平台复用同一份锁文件；根依赖的 Electron 和 Forge 版本已固定。把成功构建的 dependency-lock 产物中的 package-lock.json 加入版本管理，可固定今后的完整依赖图。

运行时代码在 src/；主进程负责桌面窗口和本地调度，sandbox preload 只暴露受限调用，界面不具备 Node.js 权限。动画和图标随安装包提供，不依赖远程页面。Electron / TypeScript / Electron Forge 负责应用与安装包构建。

`npm test` 编译并验证提醒合并、暂停、时间跳变、下班边界、跨日和多屏位置恢复。`npm run smoke` 在真实 Electron 渲染器中验证 preload、SVG、动作事件、设置窗口和隐藏恢复。CI 另对打包后的可执行文件执行同样检查。完整人工验收清单见 [QA](docs/QA.zh-CN.md)。

不包含服务端 API、聊天模型、自动更新或公开发布步骤。退出应用后提醒不会运行。卸载应用可能保留本地设置，位置见安装说明。
