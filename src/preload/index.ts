import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  loginNptel: (): Promise<{ success: boolean; email?: string; error?: string }> =>
    ipcRenderer.invoke('login-nptel'),
  importSession: (
    sessionData: string
  ): Promise<{ success: boolean; email?: string; error?: string }> =>
    ipcRenderer.invoke('import-session', sessionData),
  checkAuth: (): Promise<{ nptel: boolean; email?: string }> =>
    ipcRenderer.invoke('check-auth'),
  solveAssignment: (
    url: string,
    model: string
  ): Promise<{
    id: string
    title: string
    course_name: string
    status: string
    score: string | null
    error: string | null
  }> => ipcRenderer.invoke('solve-assignment', url, model),
  getModels: (): Promise<
    Array<{ id: string; name: string; provider: string; tag: string; default?: boolean }>
  > => ipcRenderer.invoke('get-models'),
  getHistory: (): Promise<
    Array<{
      id: string
      title: string
      course_name: string
      status: string
      score: string | null
      error: string | null
      created_at: string
      submitted_at: string | null
      details: string | null
    }>
  > => ipcRenderer.invoke('get-history'),
  logout: (): Promise<{ success: boolean }> => ipcRenderer.invoke('logout'),
  onSolverLog: (callback: (_event: unknown, message: string) => void): void => {
    ipcRenderer.on('solver-log', callback)
  },
  offSolverLog: (): void => {
    ipcRenderer.removeAllListeners('solver-log')
  },
  getAssignmentDetail: (id: string): Promise<Array<{
    question: string
    options: string[]
    selectedIndex: number
    selectedAnswer: string
  }> | null> => ipcRenderer.invoke('get-assignment-detail', id),
  getSetting: (key: string): Promise<string | null> => ipcRenderer.invoke('get-setting', key),
  setSetting: (key: string, value: string): Promise<void> => ipcRenderer.invoke('set-setting', key, value),
  deleteHistoryItem: (id: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('delete-history', id)
}

const electronAPIWrapper = {
  isElectron: true,
  loginNptel: (): Promise<{ success: boolean; email?: string; error?: string }> =>
    ipcRenderer.invoke('login-nptel')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('electronAPI', electronAPIWrapper)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.electronAPI = electronAPIWrapper
}
