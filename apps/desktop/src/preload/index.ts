import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type CreateNoteInput,
  type DeleteNoteInput,
  type PkmApi,
  type RenameNoteInput,
  type RestoreTrashInput,
  type SaveNoteInput,
  type SearchNotesInput
} from '../shared/contracts'

const api: PkmApi = {
  chooseVault: () => ipcRenderer.invoke(IPC.chooseVault),
  reopenRecentVault: () => ipcRenderer.invoke(IPC.reopenRecentVault),
  refreshTree: () => ipcRenderer.invoke(IPC.refreshTree),
  readNote: (relativePath: string) => ipcRenderer.invoke(IPC.readNote, relativePath),
  saveNote: (input: SaveNoteInput) => ipcRenderer.invoke(IPC.saveNote, input),
  createNote: (input: CreateNoteInput) => ipcRenderer.invoke(IPC.createNote, input),
  renameNote: (input: RenameNoteInput) => ipcRenderer.invoke(IPC.renameNote, input),
  deleteNote: (input: DeleteNoteInput) => ipcRenderer.invoke(IPC.deleteNote, input),
  searchNotes: (input: SearchNotesInput) => ipcRenderer.invoke(IPC.searchNotes, input),
  listTrash: () => ipcRenderer.invoke(IPC.listTrash),
  restoreTrash: (input: RestoreTrashInput) => ipcRenderer.invoke(IPC.restoreTrash, input)
}

contextBridge.exposeInMainWorld('pkm', api)
