import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { IPC, type CreateNoteInput, type SaveNoteInput } from '../shared/contracts'
import { VaultService } from './vault-service'

const vault = new VaultService()
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    show: true,
    title: '学生 Markdown 知识库',
    backgroundColor: '#f5f3ee',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function saveRecentVault(path: string): Promise<void> {
  await writeFile(join(app.getPath('userData'), 'recent-vault.json'), JSON.stringify({ path }), 'utf8')
}

async function readRecentVault(): Promise<string | null> {
  try {
    const value = JSON.parse(await readFile(join(app.getPath('userData'), 'recent-vault.json'), 'utf8')) as { path?: unknown }
    return typeof value.path === 'string' ? value.path : null
  } catch {
    return null
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.chooseVault, async () => {
    const result = await dialog.showOpenDialog({
      title: '选择或创建 Markdown 知识库',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    const snapshot = await vault.open(result.filePaths[0])
    await saveRecentVault(result.filePaths[0])
    return snapshot
  })

  ipcMain.handle(IPC.reopenRecentVault, async () => {
    const recent = await readRecentVault()
    if (!recent) return null
    try {
      return await vault.open(recent)
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC.refreshTree, () => vault.snapshot())
  ipcMain.handle(IPC.readNote, (_event, relativePath: string) => vault.readNote(relativePath))
  ipcMain.handle(IPC.saveNote, (_event, input: SaveNoteInput) =>
    vault.saveNote(input.relativePath, input.content, input.baseVersion)
  )
  ipcMain.handle(IPC.createNote, (_event, input: CreateNoteInput) => vault.createNote(input.title))
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
