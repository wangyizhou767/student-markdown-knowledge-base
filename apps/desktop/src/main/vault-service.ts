import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { FileTreeNode, NoteDocument, SearchNoteMatch, VaultSnapshot } from '../shared/contracts'
import { findSearchTextRanges, normalizeSearchText } from '../shared/search'

const INVALID_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i
const INVALID_FILE_CHARS = /[<>:"/\\|?*\u0000-\u001f]/
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

export function toBeijingIso(date = new Date()): string {
  return new Date(date.getTime() + BEIJING_OFFSET_MS).toISOString().replace('Z', '+08:00')
}

export function updateNoteTimestamp(content: string, date = new Date()): string {
  const hasBom = content.startsWith('\uFEFF')
  const source = hasBom ? content.slice(1) : content
  const bom = hasBom ? '\uFEFF' : ''
  const lineEnding = source.includes('\r\n') ? '\r\n' : '\n'
  const updatedLine = `updated: ${toBeijingIso(date)}`
  const frontmatter = /^(---[ \t]*\r?\n)([\s\S]*?)(^---[ \t]*(?:\r?\n|$))/m.exec(source)

  if (!frontmatter || frontmatter.index !== 0) {
    return `${bom}---${lineEnding}${updatedLine}${lineEnding}---${lineEnding}${lineEnding}${source}`
  }

  const header = frontmatter[2]
  const updatedPattern = /^updated[ \t]*:.*(?:\r?\n|$)/m
  const nextHeader = updatedPattern.test(header)
    ? header.replace(updatedPattern, `${updatedLine}${lineEnding}`)
    : `${header}${updatedLine}${lineEnding}`

  return `${bom}${frontmatter[1]}${nextHeader}${frontmatter[3]}${source.slice(frontmatter[0].length)}`
}

export function updateNoteTitle(content: string, title: string): string {
  const hasBom = content.startsWith('\uFEFF')
  const source = hasBom ? content.slice(1) : content
  const bom = hasBom ? '\uFEFF' : ''
  const lineEnding = source.includes('\r\n') ? '\r\n' : '\n'
  const titleLine = `title: ${title}`
  const frontmatter = /^(---[ \t]*\r?\n)([\s\S]*?)(^---[ \t]*(?:\r?\n|$))/m.exec(source)

  if (!frontmatter || frontmatter.index !== 0) return content

  const header = frontmatter[2]
  const titlePattern = /^title[ \t]*:.*(?:\r?\n|$)/m
  const nextHeader = titlePattern.test(header)
    ? header.replace(titlePattern, `${titleLine}${lineEnding}`)
    : `${header}${titleLine}${lineEnding}`

  return `${bom}${frontmatter[1]}${nextHeader}${frontmatter[3]}${source.slice(frontmatter[0].length)}`
}

export function createSearchSnippet(content: string, query: string, maxLength = 140): string | null {
  const source = content.startsWith('\uFEFF') ? content.slice(1) : content
  const match = findSearchTextRanges(source, query)[0]
  if (!match) return null

  const boundaries = /[。！？!?；;\n\r]/
  let start = match.start
  let end = match.end
  while (start > 0 && !boundaries.test(source[start - 1]) && match.start - start < maxLength) start -= 1
  while (end < source.length && !boundaries.test(source[end]) && end - match.start < maxLength) end += 1
  if (end < source.length && boundaries.test(source[end])) end += 1

  let snippet = source.slice(start, end).replace(/\s+/g, ' ').trim()
  if (snippet.length > maxLength) {
    const phraseIndex = findSearchTextRanges(snippet, query)[0]?.start ?? 0
    const windowStart = Math.max(0, Math.min(phraseIndex - 36, snippet.length - maxLength))
    const windowEnd = Math.min(snippet.length, windowStart + maxLength)
    snippet = `${windowStart > 0 ? '…' : ''}${snippet.slice(windowStart, windowEnd).trim()}${windowEnd < snippet.length ? '…' : ''}`
  } else {
    if (start > 0 && !boundaries.test(source[start - 1])) snippet = `…${snippet}`
    if (end < source.length && !boundaries.test(source[end - 1])) snippet = `${snippet}…`
  }
  return snippet
}

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

    const contentWithUpdatedTimestamp = updateNoteTimestamp(content)
    const tempPath = `${fullPath}.pkm-${randomUUID()}.tmp`
    await writeFile(tempPath, contentWithUpdatedTimestamp, 'utf8')
    await rename(tempPath, fullPath)
    return this.toDocument(relativePath, contentWithUpdatedTimestamp)
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

    const now = toBeijingIso()
    const content = `---\nid: ${randomUUID()}\ntitle: ${normalized}\ntags: []\ncreated: ${now}\nupdated: ${now}\n---\n\n# ${normalized}\n`
    await writeFile(join(root, candidate), content, { encoding: 'utf8', flag: 'wx' })
    return this.toDocument(candidate, content)
  }

  async renameNote(relativePath: string, title: string): Promise<NoteDocument> {
    const root = this.requireRoot()
    const sourcePath = this.resolveNotePath(relativePath)
    const normalized = title.trim()
    if (!normalized) throw new VaultError('E_INVALID_NAME', '笔记名称不能为空。')
    this.assertValidName(normalized)

    const targetPath = join(dirname(sourcePath), `${normalized}.md`)
    const targetRelativePath = relative(root, targetPath).split(sep).join('/')
    if (targetPath.toLowerCase() !== sourcePath.toLowerCase() && await this.pathExists(targetPath)) {
      throw new VaultError('E_ALREADY_EXISTS', '同一文件夹中已经存在同名笔记。')
    }

    const currentContent = await readFile(sourcePath, 'utf8')
    const nextContent = updateNoteTitle(currentContent, normalized)
    if (targetPath !== sourcePath) {
      if (targetPath.toLowerCase() === sourcePath.toLowerCase()) {
        const intermediatePath = `${sourcePath}.pkm-${randomUUID()}.tmp`
        await rename(sourcePath, intermediatePath)
        await rename(intermediatePath, targetPath)
      } else {
        await rename(sourcePath, targetPath)
      }
    }
    if (nextContent !== currentContent) {
      const tempPath = `${targetPath}.pkm-${randomUUID()}.tmp`
      await writeFile(tempPath, nextContent, 'utf8')
      await rename(tempPath, targetPath)
    }
    return this.toDocument(targetRelativePath, nextContent)
  }

  async deleteNote(relativePath: string): Promise<VaultSnapshot> {
    const root = this.requireRoot()
    const sourcePath = this.resolveNotePath(relativePath)
    const trashDirectory = join(root, '.pkm', 'trash')
    await mkdir(trashDirectory, { recursive: true })

    const timestamp = toBeijingIso().replace(/[:.]/g, '-')
    let candidate = join(trashDirectory, `${timestamp}-${basename(sourcePath)}`)
    let suffix = 2
    while (await this.pathExists(candidate)) {
      candidate = join(trashDirectory, `${timestamp}-${suffix}-${basename(sourcePath)}`)
      suffix += 1
    }

    await rename(sourcePath, candidate)
    return this.snapshot()
  }

  async searchNotes(query: string): Promise<SearchNoteMatch[]> {
    const normalized = normalizeSearchText(query.trim())
    if (!normalized) return []

    const snapshot = await this.snapshot()
    const paths = this.collectNotePaths(snapshot.tree)
    const matches: SearchNoteMatch[] = []
    await Promise.all(paths.map(async (relativePath) => {
      const content = await readFile(this.resolveNotePath(relativePath), 'utf8')
      const snippet = createSearchSnippet(content, normalized)
      if (snippet) matches.push({ relativePath, snippet })
    }))
    return matches.sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'zh-CN'))
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
        createdAt: toBeijingIso(),
        appVersionCreated: '0.2.0'
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

  private collectNotePaths(nodes: FileTreeNode[]): string[] {
    return nodes.flatMap((node) => node.type === 'note'
      ? [node.relativePath]
      : this.collectNotePaths(node.children ?? []))
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
