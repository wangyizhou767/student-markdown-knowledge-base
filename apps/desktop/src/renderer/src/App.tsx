import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { FileTreeNode, NoteDocument, SearchNoteMatch, TrashNote, VaultSnapshot } from '../../shared/contracts'
import { findSearchTextRanges, normalizeSearchText } from '../../shared/search'

type SaveState = 'clean' | 'dirty' | 'saving' | 'error'

/** Filter notes by title, relative path, or paths returned by full-content search. */
export function filterFileTree(nodes: FileTreeNode[], keyword: string, contentMatches: string[] = []): FileTreeNode[] {
  const query = normalizeSearchText(keyword.trim())
  if (!query) return nodes
  const matchingPaths = new Set(contentMatches.map(normalizeSearchText))

  function filter(currentNodes: FileTreeNode[]): FileTreeNode[] {
    return currentNodes.flatMap((node) => {
      if (node.type === 'directory') {
        const children = filter(node.children ?? [])
        return children.length > 0 ? [{ ...node, children }] : []
      }

      const title = normalizeSearchText(node.name.replace(/\.md$/i, ''))
      const relativePath = normalizeSearchText(node.relativePath)
      return title.includes(query) || relativePath.includes(query) || matchingPaths.has(relativePath) ? [node] : []
    })
  }

  return filter(nodes)
}

function messageFrom(error: unknown): string {
  if (error instanceof Error) return error.message
  return '操作失败，请重试。'
}

function countNotes(nodes: FileTreeNode[]): number {
  return nodes.reduce((total, node) => total + (node.type === 'note' ? 1 : countNotes(node.children ?? [])), 0)
}

function savedTimeFromContent(content: string): string {
  const value = /^updated[ \t]*:[ \t]*(.+)$/m.exec(content)?.[1]?.trim()
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date)
}

function formatTrashTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date)
}

function HighlightedSnippet({ text, keyword }: { text: string; keyword: string }) {
  const ranges = findSearchTextRanges(text, keyword)
  if (ranges.length === 0) return <>{text}</>
  const parts = []
  let cursor = 0
  for (const range of ranges) {
    if (range.start > cursor) parts.push(text.slice(cursor, range.start))
    parts.push(<mark key={`${range.start}-${parts.length}`}>{text.slice(range.start, range.end)}</mark>)
    cursor = range.end
  }
  if (cursor < text.length) parts.push(text.slice(cursor))
  return <>{parts}</>
}

function Tree({
  nodes,
  activePath,
  onOpen,
  snippets,
  keyword
}: {
  nodes: FileTreeNode[]
  activePath?: string
  onOpen: (path: string) => void
  snippets: Map<string, string>
  keyword: string
}) {
  return (
    <ul className="tree-list">
      {nodes.map((node) => (
        <li key={node.relativePath}>
          {node.type === 'directory' ? (
            <details open>
              <summary><span className="tree-icon">◇</span>{node.name}</summary>
              <Tree nodes={node.children ?? []} activePath={activePath} onOpen={onOpen} snippets={snippets} keyword={keyword} />
            </details>
          ) : (
            <button className={`note-row ${activePath === node.relativePath ? 'active' : ''}`} onClick={() => onOpen(node.relativePath)}>
              <span className="tree-icon">□</span>
              <span className="note-copy">
                <span className="note-title">{node.name.replace(/\.md$/i, '')}</span>
                {snippets.get(node.relativePath) && (
                  <span className="note-snippet"><HighlightedSnippet text={snippets.get(node.relativePath) ?? ''} keyword={keyword} /></span>
                )}
              </span>
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

export default function App() {
  const [vault, setVault] = useState<VaultSnapshot | null>(null)
  const [note, setNote] = useState<NoteDocument | null>(null)
  const [content, setContent] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('clean')
  const [error, setError] = useState('')
  const [newNoteOpen, setNewNoteOpen] = useState(false)
  const [newNoteTitle, setNewNoteTitle] = useState('')
  const [creatingNote, setCreatingNote] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [contentMatches, setContentMatches] = useState<SearchNoteMatch[]>([])
  const [searching, setSearching] = useState(false)
  const [managingNote, setManagingNote] = useState(false)
  const [lastSavedTime, setLastSavedTime] = useState('')
  const [trashOpen, setTrashOpen] = useState(false)
  const [trashItems, setTrashItems] = useState<TrashNote[]>([])
  const [trashLoading, setTrashLoading] = useState(false)
  const [restoringTrashId, setRestoringTrashId] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    window.pkm.reopenRecentVault().then(setVault).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!note || saveState !== 'dirty') return
    const timer = window.setTimeout(() => void save(), 5000)
    return () => window.clearTimeout(timer)
  }, [content, note, saveState])

  useEffect(() => {
    const query = searchKeyword.trim()
    if (!query) {
      setContentMatches([])
      setSearching(false)
      return
    }

    setContentMatches([])
    let active = true
    const timer = window.setTimeout(() => {
      setSearching(true)
      window.pkm.searchNotes({ query })
        .then((matches) => {
          if (active) setContentMatches(matches)
        })
        .catch((caught) => {
          if (active) setError(messageFrom(caught))
        })
        .finally(() => {
          if (active) setSearching(false)
        })
    }, 250)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [searchKeyword, vault?.tree])

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLocaleLowerCase()
      if (key === 's') {
        event.preventDefault()
        void save()
      } else if (key === 'f') {
        event.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      } else if (key === 'n') {
        event.preventDefault()
        beginCreateNote()
      } else if (document.activeElement === editorRef.current && key === 'b') {
        event.preventDefault()
        wrapSelection('**', '**', '粗体文字')
      } else if (document.activeElement === editorRef.current && key === 'i') {
        event.preventDefault()
        wrapSelection('*', '*', '斜体文字')
      } else if (document.activeElement === editorRef.current && key === 'k') {
        event.preventDefault()
        wrapSelection('[', '](https://)', '链接文字')
      }
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [note, content, saveState])

  useEffect(() => {
    function warnBeforeClose(event: BeforeUnloadEvent) {
      if (saveState !== 'dirty' && saveState !== 'saving') return
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', warnBeforeClose)
    return () => window.removeEventListener('beforeunload', warnBeforeClose)
  }, [saveState])

  const filteredTree = useMemo(
    () => filterFileTree(vault?.tree ?? [], searchKeyword, contentMatches.map((match) => match.relativePath)),
    [vault?.tree, searchKeyword, contentMatches],
  )

  const snippets = useMemo(
    () => new Map(contentMatches.map((match) => [match.relativePath, match.snippet])),
    [contentMatches]
  )

  const editorStats = useMemo(() => ({
    characters: content.length,
    lines: content ? content.split(/\r?\n/).length : 0
  }), [content])

  const previewHtml = useMemo(() => {
    const parsed = marked.parse(content, { async: false }) as string
    return DOMPurify.sanitize(parsed, { FORBID_TAGS: ['style', 'iframe', 'object', 'embed'] })
  }, [content])

  async function chooseVault() {
    if (note && saveState !== 'clean' && !(await save())) return
    setError('')
    try {
      const selected = await window.pkm.chooseVault()
      if (selected) {
        setVault(selected)
        setNote(null)
        setContent('')
        setSearchKeyword('')
        setLastSavedTime('')
      }
    } catch (caught) {
      setError(messageFrom(caught))
    }
  }

  async function refreshTree() {
    try {
      setVault(await window.pkm.refreshTree())
    } catch (caught) {
      setError(messageFrom(caught))
    }
  }

  async function openNote(relativePath: string) {
    if (relativePath === note?.relativePath) return
    if (note && saveState !== 'clean' && !(await save())) return
    try {
      const opened = await window.pkm.readNote(relativePath)
      setNote(opened)
      setContent(opened.content)
      setSaveState('clean')
      setLastSavedTime(savedTimeFromContent(opened.content))
      setError('')
    } catch (caught) {
      setError(messageFrom(caught))
    }
  }

  function beginCreateNote() {
    setNewNoteTitle('')
    setNewNoteOpen(true)
    setError('')
  }

  async function createNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (creatingNote) return
    setCreatingNote(true)
    try {
      const created = await window.pkm.createNote({ title: newNoteTitle })
      setVault(await window.pkm.refreshTree())
      setNote(created)
      setContent(created.content)
      setSearchKeyword('')
      setSaveState('clean')
      setLastSavedTime(savedTimeFromContent(created.content))
      setError('')
      setNewNoteOpen(false)
    } catch (caught) {
      setError(messageFrom(caught))
    } finally {
      setCreatingNote(false)
    }
  }

  async function save(): Promise<boolean> {
    if (!note || saveState === 'clean') return true
    if (saveState === 'saving') return false
    setSaveState('saving')
    try {
      const saved = await window.pkm.saveNote({ relativePath: note.relativePath, content, baseVersion: note.version })
      setNote(saved)
      setContent(saved.content)
      setSaveState('clean')
      setLastSavedTime(savedTimeFromContent(saved.content))
      setError('')
      return true
    } catch (caught) {
      setSaveState('error')
      setError(messageFrom(caught))
      return false
    }
  }

  async function renameCurrentNote() {
    if (!note || managingNote) return
    if (saveState !== 'clean' && !(await save())) return
    const title = window.prompt('请输入新的笔记名称（不需要 .md 后缀）', note.title)?.trim()
    if (!title || title === note.title) return

    setManagingNote(true)
    try {
      const renamed = await window.pkm.renameNote({ relativePath: note.relativePath, title })
      setVault(await window.pkm.refreshTree())
      setNote(renamed)
      setContent(renamed.content)
      setSaveState('clean')
      setLastSavedTime(savedTimeFromContent(renamed.content))
      setError('')
    } catch (caught) {
      setError(messageFrom(caught))
    } finally {
      setManagingNote(false)
    }
  }

  async function deleteCurrentNote() {
    if (!note || managingNote) return
    if (saveState !== 'clean' && !(await save())) return
    const confirmed = window.confirm(`确定删除“${note.title}”吗？\n\n文件会移动到知识库的 .pkm/trash 回收站，可以手动恢复。`)
    if (!confirmed) return

    setManagingNote(true)
    try {
      const snapshot = await window.pkm.deleteNote({ relativePath: note.relativePath })
      setVault(snapshot)
      setNote(null)
      setContent('')
      setSaveState('clean')
      setLastSavedTime('')
      setError('')
    } catch (caught) {
      setError(messageFrom(caught))
    } finally {
      setManagingNote(false)
    }
  }

  function wrapSelection(prefix: string, suffix: string, placeholder: string) {
    const editor = editorRef.current
    if (!note || !editor) return
    const start = editor.selectionStart
    const end = editor.selectionEnd
    const selected = content.slice(start, end) || placeholder
    const replacement = `${prefix}${selected}${suffix}`
    setContent(`${content.slice(0, start)}${replacement}${content.slice(end)}`)
    setSaveState('dirty')
    window.requestAnimationFrame(() => {
      editor.focus()
      editor.setSelectionRange(start + prefix.length, start + prefix.length + selected.length)
    })
  }

  function prefixSelectedLines(prefix: string) {
    const editor = editorRef.current
    if (!note || !editor) return
    const selectionStart = editor.selectionStart
    const selectionEnd = editor.selectionEnd
    const blockStart = content.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1
    const nextLineBreak = content.indexOf('\n', selectionEnd)
    const blockEnd = nextLineBreak < 0 ? content.length : nextLineBreak
    const block = content.slice(blockStart, blockEnd)
    const replacement = block.split('\n').map((line) => `${prefix}${line}`).join('\n')
    setContent(`${content.slice(0, blockStart)}${replacement}${content.slice(blockEnd)}`)
    setSaveState('dirty')
    window.requestAnimationFrame(() => {
      editor.focus()
      editor.setSelectionRange(blockStart, blockStart + replacement.length)
    })
  }

  async function openTrash() {
    setTrashOpen(true)
    setTrashLoading(true)
    setError('')
    try {
      setTrashItems(await window.pkm.listTrash())
    } catch (caught) {
      setError(messageFrom(caught))
    } finally {
      setTrashLoading(false)
    }
  }

  async function restoreTrashItem(item: TrashNote) {
    if (restoringTrashId) return
    setRestoringTrashId(item.id)
    try {
      const restored = await window.pkm.restoreTrash({ id: item.id })
      setVault(await window.pkm.refreshTree())
      setTrashItems(await window.pkm.listTrash())
      setNote(restored)
      setContent(restored.content)
      setSearchKeyword('')
      setSaveState('clean')
      setLastSavedTime(savedTimeFromContent(restored.content))
      setError('')
    } catch (caught) {
      setError(messageFrom(caught))
    } finally {
      setRestoringTrashId('')
    }
  }

  if (!vault) {
    return (
      <main className="welcome-shell">
        <section className="welcome-card">
          <div className="brand-mark">M</div>
          <p className="eyebrow">本地优先 · 你的文件由你掌控</p>
          <h1>学生 Markdown<br />知识库</h1>
          <p className="welcome-copy">把课堂笔记、专业资料和灵感收进一个普通文件夹，随时可以用其他编辑器打开。</p>
          <button className="primary-action" onClick={chooseVault}>选择或创建知识库</button>
          {error && <p className="error-banner">{error}</p>}
        </section>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-mark small">M</span><strong>{vault.displayName}</strong></div>
        <div className="top-actions">
          <button onClick={chooseVault}>切换知识库</button>
          <button onClick={refreshTree}>刷新</button>
          <button onClick={() => void openTrash()}>回收站</button>
          <button className="accent-button" onClick={beginCreateNote} title="快捷键 Ctrl+N">+  新建笔记</button>
        </div>
      </header>

      {error && <div className="error-banner inline">{error}<button onClick={() => setError('')}>关闭</button></div>}

      <main className="workspace">
        <aside className="sidebar">
          <div className="section-label">笔记</div>
          <div className="note-search">
            <input
              ref={searchInputRef}
              type="search"
              aria-label="搜索笔记"
              placeholder="搜索标题、路径或正文…"
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
            />
            {searchKeyword && (
              <button type="button" className="clear-search" onClick={() => { setSearchKeyword(''); searchInputRef.current?.focus() }} aria-label="清空搜索">清空</button>
            )}
          </div>
          {searchKeyword.trim() && <div className="search-status">{searching ? '正在搜索正文…' : `找到 ${countNotes(filteredTree)} 篇笔记`}</div>}
          {filteredTree.length > 0 ? (
            <Tree nodes={filteredTree} activePath={note?.relativePath} onOpen={openNote} snippets={snippets} keyword={searchKeyword} />
          ) : searchKeyword.trim() ? (
            <p className="empty-copy search-empty">未找到笔记</p>
          ) : (
            <p className="empty-copy">还没有 Markdown 笔记。<br />点击“新建笔记”开始。</p>
          )}
        </aside>

        {note ? (
          <section className="editor-area">
            <div className="document-bar">
              <div><h2>{note.title}</h2><span>{note.relativePath}</span></div>
              <div className="document-actions">
                <div className="note-management">
                  <button onClick={() => void renameCurrentNote()} disabled={managingNote}>重命名</button>
                  <button className="danger-button" onClick={() => void deleteCurrentNote()} disabled={managingNote}>移到回收站</button>
                </div>
                <div className={`save-state ${saveState}`}>
                  {saveState === 'clean' && `已保存${lastSavedTime ? ` · ${lastSavedTime}` : ''}`}
                  {saveState === 'dirty' && '等待自动保存'}
                  {saveState === 'saving' && '正在保存…'}
                  {saveState === 'error' && '保存失败'}</div>
                <button className="save-button" onClick={() => void save()} disabled={saveState === 'clean' || saveState === 'saving'} title="快捷键 Ctrl+S">保存</button>
              </div>
            </div>
            <div className="split-view">
              <div className="pane">
                <div className="pane-label"><span>MARKDOWN</span><span className="editor-stats">{editorStats.lines} 行 · {editorStats.characters} 字符</span></div>
                <div className="editor-toolbar" aria-label="Markdown 快捷编辑">
                  <button type="button" title="粗体 Ctrl+B" onMouseDown={(event) => event.preventDefault()} onClick={() => wrapSelection('**', '**', '粗体文字')}><strong>B</strong></button>
                  <button type="button" title="斜体 Ctrl+I" onMouseDown={(event) => event.preventDefault()} onClick={() => wrapSelection('*', '*', '斜体文字')}><em>I</em></button>
                  <button type="button" title="链接 Ctrl+K" onMouseDown={(event) => event.preventDefault()} onClick={() => wrapSelection('[', '](https://)', '链接文字')}>链接</button>
                  <button type="button" title="一级标题" onMouseDown={(event) => event.preventDefault()} onClick={() => prefixSelectedLines('# ')}>H1</button>
                  <button type="button" title="无序列表" onMouseDown={(event) => event.preventDefault()} onClick={() => prefixSelectedLines('- ')}>列表</button>
                </div>
                <textarea ref={editorRef} value={content} onChange={(event) => { setContent(event.target.value); setSaveState('dirty') }} spellCheck={false} />
              </div>
              <div className="pane preview-pane">
                <div className="pane-label">预览</div>
                <article className="markdown-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>
            </div>
          </section>
        ) : (
          <section className="blank-state"><div><span>↖</span><h2>选择一篇笔记</h2><p>从左侧打开笔记，或新建一篇开始记录。</p></div></section>
        )}
      </main>

      {newNoteOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !creatingNote) setNewNoteOpen(false)
        }}>
          <form className="new-note-dialog" role="dialog" aria-modal="true" aria-labelledby="new-note-title" onSubmit={createNote}>
            <p className="eyebrow">新建 MARKDOWN 笔记</p>
            <h2 id="new-note-title">给这篇笔记起个名字</h2>
            <p>文件会直接保存在当前知识库中，不用输入 <code>.md</code> 后缀。</p>
            <label htmlFor="note-name">笔记名称</label>
            <input
              id="note-name"
              autoFocus
              maxLength={120}
              placeholder="例如：软件工程第一课"
              value={newNoteTitle}
              onChange={(event) => setNewNoteTitle(event.target.value)}
            />
            <div className="dialog-actions">
              <button type="button" onClick={() => setNewNoteOpen(false)} disabled={creatingNote}>取消</button>
              <button className="accent-button" type="submit" disabled={creatingNote}>
                {creatingNote ? '正在创建…' : '创建并打开'}
              </button>
            </div>
          </form>
        </div>
      )}

      {trashOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !restoringTrashId) setTrashOpen(false)
        }}>
          <section className="trash-dialog" role="dialog" aria-modal="true" aria-labelledby="trash-title">
            <div className="trash-heading">
              <div><p className="eyebrow">安全删除</p><h2 id="trash-title">回收站</h2></div>
              <button type="button" onClick={() => setTrashOpen(false)} disabled={Boolean(restoringTrashId)}>关闭</button>
            </div>
            <p className="trash-description">删除的笔记保存在知识库的 <code>.pkm/trash</code> 中。恢复时会优先放回原来的位置。</p>
            {trashLoading ? (
              <p className="trash-empty">正在读取回收站…</p>
            ) : trashItems.length === 0 ? (
              <p className="trash-empty">回收站是空的。</p>
            ) : (
              <ul className="trash-list">
                {trashItems.map((item) => (
                  <li key={item.id}>
                    <div><strong>{item.title}</strong><span>{item.originalPath} · 删除于 {formatTrashTime(item.deletedAt)}</span></div>
                    <button type="button" className="accent-button" onClick={() => void restoreTrashItem(item)} disabled={Boolean(restoringTrashId)}>
                      {restoringTrashId === item.id ? '正在恢复…' : '恢复'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
