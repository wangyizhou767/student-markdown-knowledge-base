import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { VaultService } from './vault-service'

describe('VaultService', () => {
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

  it('创建笔记并在重名时自动追加序号', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pkm-vault-'))
    const service = new VaultService()
    await service.open(root)

    const first = await service.createNote('软件工程')
    const second = await service.createNote('软件工程')

    expect(first.relativePath).toBe('软件工程.md')
    expect(second.relativePath).toBe('软件工程 2.md')
    expect(await readFile(join(root, first.relativePath), 'utf8')).toContain('# 软件工程')
  })
})
