import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { FileTreeNode, NoteDocument, VaultSnapshot } from '../shared/contracts'

const INVALID_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i
const INVALID_FILE_CHARS = /[<>:"/\\|?*\u0000-\u001f]/

export class VaultError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export class VaultService {
  private vaultRoot: string | null = null

  async open(root: string): Promise<VaultSnapshot> {
    const info = await stat(root)
    if (!info.isDirectory()) throw new VaultError('E_NOT_DIRECTORY', '请选择一个文件夹。')

    this.vaultRoot = resolve(root)
    await this.ensureMetadata()
    return this.snapshot()
  }

  get currentRoot(): string | null {
    return this.vaultRoot
  }

  async snapshot(): Promise<VaultSnapshot> {
    const root = this.requireRoot()
    return {
      displayName: basename(root),
      tree: await this.scanDirectory(root, '')
    }
  }

  async readNote(relativePath: string): Promise<NoteDocument> {
    const fullPath = this.resolveNotePath(relativePath)
    const content = await readFile(fullPath, 'utf8')
    return this.toDocument(relativePath, content)
  }

  async saveNote(relativePath: string, content: string, baseVersion: string): Promise<NoteDocument> {
    const fullPath = this.resolveNotePath(relativePath)
    const currentContent = await readFile(fullPath, 'utf8')
    if (this.hash(currentContent) !== baseVersion) {
      throw new VaultError('E_VERSION_CONFLICT', '文件已被其他程序修改，为避免覆盖，本次保存已停止。')
    }

    const tempPath = `${fullPath}.pkm-${randomUUID()}.tmp`
    await writeFile(tempPath, content, 'utf8')
    await rename(tempPath, fullPath)
    return this.toDocument(relativePath, content)
  }

  async createNote(title: string): Promise<NoteDocument> {
    const root = this.requireRoot()
    const normalized = title.trim() || '未命名笔记'
    this.assertValidName(normalized)

    let candidate = `${normalized}.md`
    let suffix = 2
    while (await this.pathExists(join(root, candidate))) {
      candidate = `${normalized} ${suffix}.md`
      suffix += 1
    }

    const now = new Date().toISOString()
    const content = `---\nid: ${randomUUID()}\ntitle: ${normalized}\ntags: []\ncreated: ${now}\nupdated: ${now}\n---\n\n# ${normalized}\n`
    await writeFile(join(root, candidate), content, { encoding: 'utf8', flag: 'wx' })
    return this.toDocument(candidate, content)
  }

  private async ensureMetadata(): Promise<void> {
    const root = this.requireRoot()
    const pkmDir = join(root, '.pkm')
    const configPath = join(pkmDir, 'vault.json')
    await mkdir(pkmDir, { recursive: true })

    if (!(await this.pathExists(configPath))) {
      const config = {
        schemaVersion: 1,
        vaultId: randomUUID(),
        displayName: basename(root),
        createdAt: new Date().toISOString(),
        appVersionCreated: '0.1.0'
      }
      await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    }
  }

  private async scanDirectory(absoluteDirectory: string, relativeDirectory: string): Promise<FileTreeNode[]> {
    const entries = await readdir(absoluteDirectory, { withFileTypes: true })
    const nodes: FileTreeNode[] = []

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))) {
      if (entry.name === '.pkm' || entry.name.startsWith('.')) continue

      const childRelativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
      const childAbsolutePath = join(absoluteDirectory, entry.name)

      if (entry.isDirectory()) {
        const children = await this.scanDirectory(childAbsolutePath, childRelativePath)
        if (children.length > 0) {
          nodes.push({ name: entry.name, relativePath: childRelativePath, type: 'directory', children })
        }
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
        nodes.push({ name: entry.name, relativePath: childRelativePath, type: 'note' })
      }
    }

    return nodes
  }

  private resolveNotePath(relativePath: string): string {
    const root = this.requireRoot()
    if (!relativePath || isAbsolute(relativePath) || extname(relativePath).toLowerCase() !== '.md') {
      throw new VaultError('E_INVALID_PATH', '笔记路径无效。')
    }

    const target = resolve(root, relativePath)
    const boundary = `${root}${sep}`.toLowerCase()
    if (!target.toLowerCase().startsWith(boundary) || relative(root, target).startsWith('..')) {
      throw new VaultError('E_PATH_OUTSIDE', '拒绝访问知识库之外的文件。')
    }
    return target
  }

  private requireRoot(): string {
    if (!this.vaultRoot) throw new VaultError('E_NO_VAULT', '请先选择知识库。')
    return this.vaultRoot
  }

  private assertValidName(name: string): void {
    if (name.length > 120 || INVALID_FILE_CHARS.test(name) || INVALID_WINDOWS_NAMES.test(name) || /[. ]$/.test(name)) {
      throw new VaultError('E_INVALID_NAME', '名称包含 Windows 不允许的字符或保留名。')
    }
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await stat(path)
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw error
    }
  }

  private toDocument(relativePath: string, content: string): NoteDocument {
    return {
      relativePath: relativePath.replaceAll('\\', '/'),
      title: basename(relativePath, extname(relativePath)),
      content,
      version: this.hash(content)
    }
  }

  private hash(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex')
  }
}
