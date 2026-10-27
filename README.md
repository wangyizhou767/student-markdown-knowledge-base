# 大学生个人 Markdown 知识库

这是一个面向大学生的 Windows 本地 Markdown 笔记与知识管理工具。项目采用 Electron、React 和 TypeScript，用户数据直接保存在所选本地目录中，不依赖账号或云服务。

## 本周交付目标

项目必须在 2026 年 11 月 1 日晚完成可验收版本，为 11 月 2 日前提交保留缓冲。最终程序至少能够完成以下闭环：

1. 选择或创建本地知识库；
2. 查看 Markdown 文件树；
3. 新建、打开、编辑和保存笔记；
4. 实时预览 Markdown；
5. 按标题和正文搜索笔记；
6. 使用 Wiki 链接打开关联笔记并查看基础反向链接；
7. 将笔记移入应用回收站并恢复；
8. 关闭并重启后继续读取原有 Markdown 文件；
9. 生成可独立运行的 Windows 程序。

完整需求和架构设计继续保存在 `docs/baseline/`。未进入本周版本的功能不是删除，而是列入后续实现范围。

## 仓库结构

```text
student-markdown-knowledge-base/
├─ apps/desktop/              Electron 桌面程序
├─ docs/baseline/             已确认的需求与架构设计
├─ docs/project/              范围、分工、排期和测试材料
├─ docs/user-feedback/        真实用户试用记录
├─ .github/ISSUE_TEMPLATE/    GitHub 任务和缺陷模板
└─ README.md
```

## 项目管理要求

- 三名成员均加入同一个 GitHub 仓库；
- 功能和缺陷通过 GitHub Issues 管理；
- 每项任务必须产生代码、测试、文档、截图或反馈记录等可见结果；
- 团队总计至少保留 10 次具有实际修改量的提交，不拆分空提交凑数；
- `main` 始终保持可运行，功能通过短分支和 Pull Request 合入；
- 11 月 1 日只允许修复阻塞问题，不再扩大范围。

详细安排见 `docs/project/`。

