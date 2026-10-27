# 协作说明

## 分支

- `main`：可演示版本；禁止直接进行大规模开发。
- `feature/<issue>-<short-name>`：功能分支。
- `fix/<issue>-<short-name>`：缺陷修复分支。
- `docs/<issue>-<short-name>`：文档、手册和报告分支。

## 提交

提交格式采用 `<type>: <结果>`，例如：

- `feat: add vault folder selection`
- `fix: preserve note content when save fails`
- `test: cover note create and restore flow`
- `docs: add Windows operation guide`

每次提交必须对应一个可说明的结果。禁止通过修改空格、反复改名或空提交凑足课程要求的签入次数。

## Pull Request

合并前至少检查：

1. 对应 Issue 和验收条件已经更新；
2. 本地构建和相关测试通过；
3. 没有把 `node_modules`、测试知识库或个人绝对路径提交到仓库；
4. 文件保存、删除和恢复功能已手工检查真实磁盘结果；
5. 至少一名其他成员完成审查。

