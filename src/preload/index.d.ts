import { ElectronAPI } from '@electron-toolkit/preload'

export interface SolvedAssignmentResult {
  id: string
  title: string
  course_name: string
  status: string
  score: string | null
  error: string | null
}

export interface AvailableModel {
  id: string
  name: string
  provider: string
  tag: string
  default?: boolean
}

export interface AssignmentHistoryItem {
  id: string
  title: string
  course_name: string
  status: string
  score: string | null
  error: string | null
  created_at: string
  submitted_at: string | null
  details: string | null
}

export interface AssignmentDetailItem {
  question: string
  options: string[]
  selectedIndex: number
  selectedAnswer: string
}

export interface NptelApi {
  loginNptel: () => Promise<{ success: boolean; email?: string; error?: string }>
  importSession: (sessionData: string) => Promise<{ success: boolean; email?: string; error?: string }>
  checkAuth: () => Promise<{ nptel: boolean; email?: string }>
  solveAssignment: (url: string, model: string) => Promise<SolvedAssignmentResult>
  getModels: () => Promise<AvailableModel[]>
  getHistory: () => Promise<AssignmentHistoryItem[]>
  logout: () => Promise<{ success: boolean }>
  onSolverLog: (callback: (_event: unknown, message: string) => void) => void
  offSolverLog: () => void
  getAssignmentDetail: (id: string) => Promise<AssignmentDetailItem[] | null>
  getSetting: (key: string) => Promise<string | null>
  setSetting: (key: string, value: string) => Promise<void>
  deleteHistoryItem: (id: string) => Promise<{ success: boolean; error?: string }>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: NptelApi
    electronAPI?: {
      isElectron: boolean
      loginNptel: () => Promise<{ success: boolean; email?: string; error?: string }>
    }
  }
}
