export const IPC = {
  chooseVault: 'vault:choose',
  reopenRecentVault: 'vault:reopen-recent',
  refreshTree: 'vault:refresh-tree',
  readNote: 'note:read',
  saveNote: 'note:save',
  createNote: 'note:create',
  renameNote: 'note:rename',
  deleteNote: 'note:delete',
  searchNotes: 'note:search',
  listTrash: 'trash:list',
  restoreTrash: 'trash:restore'
} as const

export interface FileTreeNode {
  name: string
  relativePath: string
  type: 'directory' | 'note'
  children?: FileTreeNode[]
}

export interface VaultSnapshot {
  displayName: string
  tree: FileTreeNode[]
}

export interface NoteDocument {
  relativePath: string
  title: string
  content: string
  version: string
}

export interface SaveNoteInput {
  relativePath: string
  content: string
  baseVersion: string
}

export interface CreateNoteInput {
  title: string
}

export interface RenameNoteInput {
  relativePath: string
  title: string
}

export interface DeleteNoteInput {
  relativePath: string
}

export interface SearchNotesInput {
  query: string
}

export interface SearchNoteMatch {
  relativePath: string
  snippet: string
}

export interface TrashNote {
  id: string
  title: string
  originalPath: string
  deletedAt: string
}

export interface RestoreTrashInput {
  id: string
}

export interface PkmApi {
  chooseVault(): Promise<VaultSnapshot | null>
  reopenRecentVault(): Promise<VaultSnapshot | null>
  refreshTree(): Promise<VaultSnapshot>
  readNote(relativePath: string): Promise<NoteDocument>
  saveNote(input: SaveNoteInput): Promise<NoteDocument>
  createNote(input: CreateNoteInput): Promise<NoteDocument>
  renameNote(input: RenameNoteInput): Promise<NoteDocument>
  deleteNote(input: DeleteNoteInput): Promise<VaultSnapshot>
  searchNotes(input: SearchNotesInput): Promise<SearchNoteMatch[]>
  listTrash(): Promise<TrashNote[]>
  restoreTrash(input: RestoreTrashInput): Promise<NoteDocument>
}
