# `wangyizhou767` 验收演示稿

> 适用版本：Windows 桌面版 `0.2.4`  
> 演示角色：集成与交付负责人、桌面核心功能开发  
> 建议时长：个人部分 5～7 分钟

## 一、先记住自己的职责

我的主要职责是保持主分支可运行，审查和集成两位组员的功能，并完成桌面核心、文件安全、功能增强、自动测试、Windows 打包和最终交付。

分工要如实说明：

- `luyinuo605` 负责标题和路径搜索的初版，通过 PR #6 合并；
- `Mingzi-zz` 负责保存时更新北京时间及相关测试，通过 PR #5 合并；
- 我负责项目骨架、知识库与笔记闭环、审查集成、正文搜索与上下文短语、英文数字及全角搜索兼容、重命名、回收站恢复、编辑体验、缺陷修复、测试和 Windows 打包。

不要把组员的初版搜索或时间更新说成自己独立完成。可以说：“我在组员成果基础上完成了集成和后续增强。”

## 二、演示前准备

1. 将“验收演示知识库”作为测试目录，不要使用个人真实笔记。
2. 打开 `学生 Markdown 知识库 0.2.4.exe`，提前选择测试知识库。
3. 浏览器提前登录 GitHub，并打开仓库的 Pull requests、Commits 和 Actions 页面。
4. 编辑器提前打开以下文件：
   - `apps/desktop/src/renderer/src/App.tsx`
   - `apps/desktop/src/preload/index.ts`
   - `apps/desktop/src/main/index.ts`
   - `apps/desktop/src/main/vault-service.ts`
   - `apps/desktop/src/main/vault-service.test.ts`
   - `apps/desktop/package.json`
5. 关闭无关窗口和通知，桌面缩放建议设为 100% 或 125%。
6. 准备一份本地 `.exe` 作为网络故障时的备用，不要依赖课堂网络启动软件。

## 三、个人部分逐分钟演示

### 0:00～0:35：介绍项目和本人职责

操作：显示软件主界面。

建议台词：

> 我们实现的是一款面向大学生的 Windows 本地 Markdown 知识库。它不需要账号或服务器，笔记直接保存为用户文件夹中的 Markdown 文件。我负责集成与交付，同时完成桌面核心、文件安全、搜索增强、回收站、编辑体验、测试和 Windows 打包。两位组员分别负责初版搜索和保存时间更新，我负责审查合并并继续增强。

### 0:35～1:25：展示新建、编辑和预览闭环

操作：

1. 点击“新建笔记”，名称输入“软件工程验收演示”。
2. 输入一行正文，例如：“Electron 负责桌面容器，React 负责用户界面，TypeScript 提供类型检查。”
3. 选中“React”，点击粗体；再选中“TypeScript”，点击斜体。
4. 指向右侧实时预览。

建议台词：

> 新建笔记时，主进程会生成 UUID，并记录带 `+08:00` 的北京时间。左侧是 Markdown 原文，右侧通过 `marked` 转换，再经过 `DOMPurify` 清理后显示，避免不安全 HTML 直接进入页面。编辑工具栏实际插入的是 Markdown 标记，因此文件仍可被其他编辑器正常读取。

代码定位：

- 界面新建和编辑：`App.tsx` 中的 `createNote`、`wrapSelection`；
- Markdown 预览：`App.tsx` 约第 240 行的 `marked.parse` 和 `DOMPurify.sanitize`；
- UUID 与时间：`vault-service.ts` 中的 `createNote` 和 `toBeijingIso`。

### 1:25～2:15：展示保存和数据安全

操作：点击“保存”，指出界面的“已保存”和最后保存时间；如时间允许，等待 5 秒自动保存。

建议台词：

> 保存请求不会由 React 直接访问磁盘。界面调用 preload 暴露的白名单 API，再通过 IPC 进入 Electron 主进程，最后由 `VaultService` 写文件。保存时先写临时文件再原子替换，并使用版本哈希检查外部修改，避免静默覆盖。组员 `Mingzi-zz` 实现了保存时更新 `updated` 的逻辑，我完成了审查、集成和完整回归。

代码定位：

- 界面保存：`App.tsx` 中的 `save`；
- 白名单桥接：`preload/index.ts`；
- IPC 注册：`main/index.ts` 约第 145～157 行；
- 安全写入与冲突检查：`vault-service.ts` 中的 `saveNote`；
- 时间更新：`vault-service.ts` 中的 `updateNoteTimestamp`。

### 2:15～3:10：展示搜索增强

操作：

1. 搜索“Electron”，展示命中句子和高亮词。
2. 搜索“2026”或一个英文词，证明数字和英文可用。
3. 如知识库中有全角内容，再搜索全角数字或字母。

建议台词：

> 组员 `luyinuo605` 完成了标题和路径筛选的初版。我在集成后增加了正文检索、关键词所在短语、关键词高亮，以及英文、数字和全角字符兼容。搜索统一使用 NFKC 规范化，因此全角和半角字符可以一致匹配。结果返回相对路径和短语，不把磁盘权限暴露给界面。

代码定位：

- 文件树筛选：`App.tsx` 中的 `filterFileTree`；
- 搜索请求和结果展示：`App.tsx` 中的搜索副作用、`HighlightedSnippet`；
- 正文扫描：`vault-service.ts` 中的 `searchNotes`；
- 句子截取：`vault-service.ts` 中的 `createSearchSnippet`；
- 英文、数字和全角兼容：`shared/search.ts` 中的 `normalizeSearchText`、`findSearchTextRanges`。

### 3:10～4:00：展示重命名和回收站

操作：

1. 点击“重命名”，改为“软件工程验收演示-完成”。
2. 指出文件树名称和 YAML 标题同步变化。
3. 点击“移到回收站”，再打开软件内“回收站”并恢复。

建议台词：

> 重命名会同时更新文件名和 YAML 标题，并检查 Windows 非法文件名与同名冲突。删除不是永久删除，而是移动到知识库内部的 `.pkm/trash`，同时记录原路径和删除时间；恢复时优先回到原位置，如果已有同名文件则自动避让。我们最近还修复了 Electron 不可靠支持系统输入弹窗的问题，改成应用内部的重命名窗口。

代码定位：

- 重命名界面：`App.tsx` 中的 `beginRenameNote`、`renameCurrentNote`；
- 重命名文件：`vault-service.ts` 中的 `renameNote`；
- 删除和恢复界面：`App.tsx` 中的 `deleteCurrentNote`、`openTrash`、`restoreTrashItem`；
- 回收站文件操作：`vault-service.ts` 中的 `deleteNote`、`listTrash`、`restoreTrash`。

### 4:00～4:45：解释程序架构

操作：打开 `App.tsx`、`preload/index.ts`、`main/index.ts` 和 `vault-service.ts`，按顺序指向文件。

建议台词：

> 程序是 Electron 模块化单体，运行时分为三层。第一层是 React 渲染进程，只负责界面和状态；第二层是 preload 安全桥，只暴露明确的 `window.pkm` API；第三层是 Electron 主进程和 `VaultService`，负责路径校验、文件读写、搜索和回收站。一次操作的调用链是：React 事件 → `window.pkm` → preload 的 `ipcRenderer.invoke` → 主进程 `ipcMain.handle` → `VaultService` → Windows 文件系统。渲染进程不能直接访问 Node 文件系统，窗口同时启用了 `contextIsolation` 和 `sandbox`。

一句话架构回答：

> 本地桌面模块化单体，采用“React 界面层—preload 白名单桥接层—Electron 主进程应用服务与文件层”的分层结构，Markdown 文件是真实数据。

### 4:45～5:35：展示测试、打包和 GitHub 证据

操作：

1. 打开 `package.json`，指出 `verify` 和 `package:win`；
2. 显示最近一次验证结果或现场执行 `pnpm verify`；
3. 显示 GitHub PR #4、#5、#6 和当前改进 PR；
4. 打开 Commits 页面，按作者说明三人提交。

建议台词：

> `pnpm verify` 会连续执行两套 TypeScript 检查、Vitest 自动测试和生产构建。当前共有 15 项自动测试，覆盖时间、保存、路径越界、外部修改冲突、重名新建、重命名、回收站、正文搜索和中文斜体。`package:win` 使用 electron-builder 生成不依赖 Node.js 的 Windows 便携程序。GitHub 上保留了 Issue、分支、Pull Request、提交和自动检查，能够追踪每个成员的工作。

## 四、功能与代码快速对应表

| 老师问的功能 | 界面入口 | 跨进程入口 | 文件或业务实现 | 测试证据 |
|---|---|---|---|---|
| 新建笔记 | `App.tsx/createNote` | `IPC.createNote` | `VaultService.createNote` | `创建笔记并在重名时自动追加序号` |
| 保存与自动保存 | `App.tsx/save` | `IPC.saveNote` | `VaultService.saveNote` | `重复保存时维护 updated…` |
| Markdown 预览 | `marked.parse` + `DOMPurify.sanitize` | 不需要 IPC | 渲染进程内安全转换 | `markdown-format.test.ts` |
| 重命名 | `beginRenameNote`、`renameCurrentNote` | `IPC.renameNote` | `VaultService.renameNote` | `重命名笔记文件并同步 YAML 标题` |
| 搜索 | `filterFileTree`、`HighlightedSnippet` | `IPC.searchNotes` | `searchNotes`、`createSearchSnippet` | `可以按正文内容搜索…` |
| 回收站 | `deleteCurrentNote`、`restoreTrashItem` | `deleteNote/listTrash/restoreTrash` | `.pkm/trash` 内移动和元数据 | 删除、列出和恢复测试 |
| 北京时间 | 保存后状态显示 | 保存 IPC | `toBeijingIso`、`updateNoteTimestamp` | `使用带 +08:00 偏移的北京时间` |
| 路径安全 | 错误提示 | 所有文件 IPC | `resolveNotePath` | `拒绝读取知识库之外的路径` |
| 冲突保护 | 保存失败提示 | 保存 IPC | 内容版本哈希比较 | `使用版本哈希阻止静默覆盖外部修改` |
| Windows 打包 | 无 | Electron 启动入口 | `package.json/package:win` | `.exe` 实际启动检查 |

## 五、技术栈回答

- Electron：把 Web 界面封装为 Windows 桌面程序，并提供受控的系统能力。
- React：实现文件树、编辑器、预览、搜索框、弹窗和界面状态。
- TypeScript：为 IPC 请求、笔记文档和文件树等数据提供静态类型检查。
- Node.js 文件 API：在 Electron 主进程中读取、写入、重命名和移动本地 Markdown 文件。
- `marked`：把 Markdown 转换为 HTML。
- `DOMPurify`：清理预览 HTML，降低脚本注入风险。
- Vitest：运行单元测试和文件层集成测试。
- electron-vite：负责开发启动和生产构建。
- electron-builder：生成 Windows 64 位便携 `.exe`。
- GitHub Issues、Pull Requests、Actions：任务分工、代码审查、自动检查和构建记录。

## 六、老师高频追问与回答

### 1. 为什么不用数据库保存正文？

> 我们坚持本地优先，Markdown 文件是唯一真实正文。即使软件损坏或卸载，用户仍能用任何文本编辑器读取。当前版本数据量不大，搜索通过扫描文件完成；后续数据量增长时可以增加可重建索引，但不会替代原始文件。

### 2. React 为什么不能直接读磁盘？

> 渲染进程处理用户界面，也会解析 Markdown。如果直接拥有 Node 权限，界面漏洞可能扩大成任意文件访问。因此只通过 preload 暴露按用途划分的 API，所有路径和文件操作都在主进程校验。

### 3. 如何防止写到知识库外面？

> `resolveNotePath` 会拒绝绝对路径和越过知识库根目录的相对路径，所有读取、保存、删除和恢复都先经过这个边界检查。

### 4. 保存时软件崩溃怎么办？

> 保存采用临时文件加重命名替换，避免直接写原文件导致只写了一半。同时比较内容版本哈希，发现外部程序改过文件时停止保存并提示，而不是静默覆盖。

### 5. 搜索为什么支持全角字母和数字？

> 搜索前使用 Unicode NFKC 规范化，把全角和半角等兼容形式统一，再进行不区分英文大小写的匹配；高亮时还会把规范化后的命中映射回原文本位置。

### 6. `+08:00` 是什么？

> 这是相对 UTC 快 8 小时的时区偏移，表示中国标准时间，也就是北京时间。保留偏移比只写本地时间更明确，其他程序也能正确解析。

### 7. 你们如何证明不是一个人完成的？

> GitHub 上每位成员使用自己的账号和任务分支，Issue #1、#2、#3 记录负责人，PR #5、#6 和各自提交能够对应功能、代码、测试和审查过程。最终集成由我的分支继续提交和验证。

### 8. 目前还有什么限制？

> 当前版本聚焦本地笔记闭环，没有云同步、多人实时协作和移动端；全文搜索目前采用文件扫描，超大知识库后续需要索引；程序没有商业代码签名证书，因此其他电脑首次启动可能出现 Windows 安全提示。

### 9. 为什么选择 Electron？

> 三人能够统一使用 TypeScript 开发界面与主进程，开发周期短，Windows 打包成熟，同时可以用进程隔离和 preload 白名单控制文件权限。代价是安装包比原生程序大，我们接受这个课程项目权衡。

### 10. 你的哪次修改解决了真实缺陷？

> 例如提交 `c2b82a6` 修复了重命名按钮：原实现依赖 Electron 中不可靠的系统 `prompt`，我改为应用内部受控表单；提交 `c920d58` 修复了中文斜体显示，并补充自动测试；提交 `f82f161` 修复了英文、数字和全角搜索。

## 七、GitHub 证据展示顺序

1. Issues：#1 搜索、#2 更新时间、#3 集成和交付。
2. Pull Requests：#5 `Mingzi-zz`、#6 `luyinuo605`、#4 集成与打包。
3. 当前改进分支的 7 次提交：
   - `e6e4d8f` 笔记管理与增强搜索；
   - `718eedf` 搜索上下文短语；
   - `f82f161` 英文、数字和全角搜索修复；
   - `c06e427` 版本更新；
   - `f184bc4` 回收站恢复与编辑体验；
   - `c920d58` 中文斜体修复与测试；
   - `c2b82a6` 重命名窗口修复。
4. Actions：指出自动检查步骤，不要把没有执行的跨机器测试说成已通过。
5. Release 或本地 `0.2.4.exe`：证明能够离开开发环境独立启动。

## 八、现场故障备用方案

- 软件打不开：直接运行本地保存的 `0.2.4.exe`，不要现场重新安装依赖。
- GitHub 网络不好：展示本地 `git log --oneline --all` 和提前保存的截图。
- 测试来不及跑：展示最近一次完整测试结果，不要临时中断软件演示。
- 知识库被改乱：重新复制 `docs/acceptance-vault/` 作为新的演示知识库。
- Windows 安全提示：选择“更多信息”后运行，并说明项目没有商业代码签名证书。
- 回答不确定：先指出对应函数和调用链，再说“这部分是后续范围”，不要猜测已实现功能。

## 九、演示结束语

> 我们最终交付的不只是一个界面，而是一个可独立运行、数据可直接读取、操作有安全边界、功能有测试、成员贡献可通过 GitHub 追踪的 Windows 软件。当前版本已经完成新建、编辑、预览、保存、搜索、重命名、回收站恢复和重启继续使用的核心闭环。
