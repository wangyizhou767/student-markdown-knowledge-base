import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useEffect, useMemo, useState } from 'react'
import type { FileTreeNode, NoteDocument, VaultSnapshot } from '../../shared/contracts'

type SaveState = 'clean' | 'dirty' | 'saving' | 'error'

function messageFrom(error: unknown): string {
  if (error instanceof Error) return error.message
  return '操作失败，请重试。'
}

function Tree({ nodes, activePath, onOpen }: { nodes: FileTreeNode[]; activePath?: string; onOpen: (path: string) => void }) {
  return (
    <ul className="tree-list">
      {nodes.map((node) => (
        <li key={node.relativePath}>
          {node.type === 'directory' ? (
            <details open>
              <summary><span className="tree-icon">◇</span>{node.name}</summary>
              <Tree nodes={node.children ?? []} activePath={activePath} onOpen={onOpen} />
            </details>
          ) : (
            <button className={`note-row ${activePath === node.relativePath ? 'active' : ''}`} onClick={() => onOpen(node.relativePath)}>
              <span className="tree-icon">□</span>{node.name.replace(/\.md$/i, '')}
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

  useEffect(() => {
    window.pkm.reopenRecentVault().then(setVault).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!note || saveState !== 'dirty') return
    const timer = window.setTimeout(() => void save(), 5000)
    return () => window.clearTimeout(timer)
  }, [content, note, saveState])

  const previewHtml = useMemo(() => {
    const parsed = marked.parse(content, { async: false }) as string
    return DOMPurify.sanitize(parsed, { FORBID_TAGS: ['style', 'iframe', 'object', 'embed'] })
  }, [content])

  async function chooseVault() {
    setError('')
    try {
      const selected = await window.pkm.chooseVault()
      if (selected) {
        setVault(selected)
        setNote(null)
        setContent('')
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
    if (saveState === 'dirty') await save()
    try {
      const opened = await window.pkm.readNote(relativePath)
      setNote(opened)
      setContent(opened.content)
      setSaveState('clean')
      setError('')
    } catch (caught) {
      setError(messageFrom(caught))
    }
  }

  async function createNote() {
    const title = window.prompt('新笔记名称', '未命名笔记')
    if (title === null) return
    try {
      const created = await window.pkm.createNote({ title })
      setVault(await window.pkm.refreshTree())
      setNote(created)
      setContent(created.content)
      setSaveState('clean')
      setError('')
    } catch (caught) {
      setError(messageFrom(caught))
    }
  }

  async function save() {
    if (!note || saveState === 'saving') return
    setSaveState('saving')
    try {
      const saved = await window.pkm.saveNote({ relativePath: note.relativePath, content, baseVersion: note.version })
      setNote(saved)
      setSaveState('clean')
      setError('')
    } catch (caught) {
      setSaveState('error')
      setError(messageFrom(caught))
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
          <button className="accent-button" onClick={createNote}>+  新建笔记</button>
        </div>
      </header>

      {error && <div className="error-banner inline">{error}<button onClick={() => setError('')}>关闭</button></div>}

      <main className="workspace">
        <aside className="sidebar">
          <div className="section-label">笔记</div>
          {vault.tree.length ? <Tree nodes={vault.tree} activePath={note?.relativePath} onOpen={openNote} /> : <p className="empty-copy">还没有 Markdown 笔记。<br />点击“新建笔记”开始。</p>}
        </aside>

        {note ? (
          <section className="editor-area">
            <div className="document-bar">
              <div><h2>{note.title}</h2><span>{note.relativePath}</span></div>
              <div className={`save-state ${saveState}`}>
                {saveState === 'clean' && '已保存'}
                {saveState === 'dirty' && '等待自动保存'}
                {saveState === 'saving' && '正在保存…'}
                {saveState === 'error' && '保存失败'}
                <button onClick={() => void save()} disabled={saveState === 'clean' || saveState === 'saving'}>保存</button>
              </div>
            </div>
            <div className="split-view">
              <div className="pane">
                <div className="pane-label">MARKDOWN</div>
                <textarea value={content} onChange={(event) => { setContent(event.target.value); setSaveState('dirty') }} spellCheck={false} />
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
    </div>
  )
}
