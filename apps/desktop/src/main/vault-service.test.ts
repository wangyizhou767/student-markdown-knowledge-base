import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { toBeijingIso, updateNoteTimestamp, VaultService } from './vault-service'

describe('VaultService', () => {
  it('使用带 +08:00 偏移的北京时间', () => {
    expect(toBeijingIso(new Date('2026-10-27T07:52:09.968Z'))).toBe('2026-10-27T15:52:09.968+08:00')
  })

  it('只更新已有 YAML 头部的 updated 并保留其他内容', () => {
    const original = [
      '---',
      'id: note-1',
      'title: 软件工程',
      'created: 2026-10-20T09:00:00.000+08:00',
      'updated: 2026-10-21T10:00:00.000+08:00',
      '---',
      '',
      '# 软件工程',
      '',
      '正文中的 updated: 不应被替换。'
    ].join('\n')

    const updated = updateNoteTimestamp(original, new Date('2026-10-28T08:30:00.000Z'))

    expect(updated).toContain('id: note-1')
    expect(updated).toContain('created: 2026-10-20T09:00:00.000+08:00')
    expect(updated).toContain('updated: 2026-10-28T16:30:00.000+08:00')
    expect(updated).toContain('正文中的 updated: 不应被替换。')
    expect(updated.match(/^updated:/gm)).toHaveLength(1)
  })

  it('为无 YAML 的旧笔记补充 updated 且完整保留原正文', () => {
    const original = '# 旧笔记\r\n\r\n- 第一行\r\n- 第二行'

    const updated = updateNoteTimestamp(original, new Date('2026-10-28T09:15:00.000Z'))

    expect(updated).toBe(
      '---\r\nupdated: 2026-10-28T17:15:00.000+08:00\r\n---\r\n\r\n# 旧笔记\r\n\r\n- 第一行\r\n- 第二行'
    )
  })

  it('扫描 Markdown 文件并忽略 .pkm 目录', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pkm-vault-'))
    await writeFile(join(root, '课堂笔记.md'), '# 课堂笔记', 'utf8')
    const service = new VaultService()
    const snapshot = await service.open(root)

    expect(snapshot.tree).toHaveLength(1)
    expect(snapshot.tree[0]).toMatchObject({ name: '课堂笔记.md', type: 'note' })
  })

  it('拒绝读取知识库之外的路径', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pkm-vault-'))
    const service = new VaultService()
    await service.open(root)

    await expect(service.readNote('../outside.md')).rejects.toMatchObject({ code: 'E_PATH_OUTSIDE' })
  })

  it('使用版本哈希阻止静默覆盖外部修改', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pkm-vault-'))
    const notePath = join(root, 'note.md')
    await writeFile(notePath, 'v1', 'utf8')
    const service = new VaultService()
    await service.open(root)
    const opened = await service.readNote('note.md')
    await writeFile(notePath, 'external change', 'utf8')

    await expect(service.saveNote('note.md', 'local change', opened.version)).rejects.toMatchObject({ code: 'E_VERSION_CONFLICT' })
    expect(await readFile(notePath, 'utf8')).toBe('external change')
  })

  it('重复保存时维护 updated 并保持 id、created 和正文正确', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pkm-vault-'))
    const notePath = join(root, 'note.md')
    const original = [
      '---',
      'id: stable-id',
      'created: 2026-10-20T09:00:00.000+08:00',
      'updated: 2026-10-20T09:00:00.000+08:00',
      '---',
      '',
      '# 初始正文'
    ].join('\n')
    await writeFile(notePath, original, 'utf8')
    const service = new VaultService()
    await service.open(root)
    const opened = await service.readNote('note.md')

    const first = await service.saveNote('note.md', opened.content.replace('# 初始正文', '# 第一次保存'), opened.version)
    const second = await service.saveNote('note.md', first.content.replace('# 第一次保存', '# 第二次保存'), first.version)

    expect(second.content).toContain('id: stable-id')
    expect(second.content).toContain('created: 2026-10-20T09:00:00.000+08:00')
    expect(second.content).toMatch(/^updated: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+08:00$/m)
    expect(second.content).toContain('# 第二次保存')
    expect(second.content.match(/^updated:/gm)).toHaveLength(1)
    expect(await readFile(notePath, 'utf8')).toBe(second.content)
  })

  it('创建笔记并在重名时自动追加序号', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pkm-vault-'))
    const service = new VaultService()
    await service.open(root)

    const first = await service.createNote('软件工程')
    const second = await service.createNote('软件工程')

    expect(first.relativePath).toBe('软件工程.md')
    expect(second.relativePath).toBe('软件工程 2.md')
    const savedContent = await readFile(join(root, first.relativePath), 'utf8')
    expect(savedContent).toContain('# 软件工程')
    expect(savedContent).toMatch(/created: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+08:00/)
    expect(savedContent).toMatch(/updated: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+08:00/)
  })
})
