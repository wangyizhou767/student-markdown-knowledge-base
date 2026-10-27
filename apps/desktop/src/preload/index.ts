import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type CreateNoteInput, type PkmApi, type SaveNoteInput } from '../shared/contracts'

const api: PkmApi = {
  chooseVault: () => ipcRenderer.invoke(IPC.chooseVault),
  reopenRecentVault: () => ipcRenderer.invoke(IPC.reopenRecentVault),
  refreshTree: () => ipcRenderer.invoke(IPC.refreshTree),
  readNote: (relativePath: string) => ipcRenderer.invoke(IPC.readNote, relativePath),
  saveNote: (input: SaveNoteInput) => ipcRenderer.invoke(IPC.saveNote, input),
  createNote: (input: CreateNoteInput) => ipcRenderer.invoke(IPC.createNote, input)
}

contextBridge.exposeInMainWorld('pkm', api)
