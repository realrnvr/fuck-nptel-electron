import { useState, useEffect, useCallback, useRef, FormEvent } from 'react'
import type {
  AvailableModel,
  AssignmentHistoryItem,
  AssignmentDetailItem
} from '../../preload/index.d'

function formatHistoryTime(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return String(dateStr)
    const day = d.getDate()
    const month = d.toLocaleString('en-US', { month: 'short' })
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    return `${day} ${month} ${time}`
  } catch {
    return String(dateStr)
  }
}

type ViewMode = 'welcome' | 'logs' | 'detail'

export default function App(): React.JSX.Element {
  // ── Auth state ──────────────────────────────
  const [auth, setAuth] = useState<{ nptel: boolean; email?: string }>(() => {
    try {
      const raw = localStorage.getItem('nptel_auth_cache')
      return raw ? JSON.parse(raw) : { nptel: false }
    } catch {
      return { nptel: false }
    }
  })
  const [authChecking, setAuthChecking] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [importData, setImportData] = useState('')
  const [importing, setImporting] = useState(false)

  // ── Models ──────────────────────────────────
  const [models, setModels] = useState<AvailableModel[]>([])
  const [selectedModel, setSelectedModel] = useState<string>(
    () => localStorage.getItem('nptel_model') || 'llama-3.3-70b-versatile'
  )

  // ── Solver ──────────────────────────────────
  const [url, setUrl] = useState('')
  const [solving, setSolving] = useState(false)
  const [solveError, setSolveError] = useState<string | null>(null)

  // ── History ─────────────────────────────────
  const [history, setHistory] = useState<AssignmentHistoryItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // ── Settings ────────────────────────────────
  const [apiKey, setApiKey] = useState('')
  const [isEditingKey, setIsEditingKey] = useState(false)
  const [useCustomKey, setUseCustomKey] = useState(false)
  const [showKeyModal, setShowKeyModal] = useState(false)

  // ── View state ──────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>('welcome')
  const [logs, setLogs] = useState<string[]>([])
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)
  const [assignmentDetail, setAssignmentDetail] = useState<AssignmentDetailItem[] | null>(null)
  const [detailTitle, setDetailTitle] = useState('')
  const [detailScore, setDetailScore] = useState<string | null>(null)

  const logEndRef = useRef<HTMLDivElement>(null)
  const cmdInputRef = useRef<HTMLInputElement>(null)

  // ── Callbacks ───────────────────────────────
  const loadApiKey = useCallback(async () => {
    try {
      const [key, useKey] = await Promise.all([
        window.api.getSetting('groq_api_key'),
        window.api.getSetting('use_custom_api_key')
      ])
      if (key) setApiKey(key)
      if (useKey === 'true') setUseCustomKey(true)
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
  }, [])

  const checkAuthStatus = useCallback(async () => {
    try {
      setAuthChecking(true)
      const res = await window.api.checkAuth()
      if (res?.nptel) {
        setAuth(res)
        localStorage.setItem('nptel_auth_cache', JSON.stringify(res))
      } else {
        localStorage.removeItem('nptel_auth_cache')
        setAuth({ nptel: false })
      }
    } catch (err) {
      console.error('Failed to check auth:', err)
    } finally {
      setAuthChecking(false)
    }
  }, [])

  const loadModels = useCallback(async () => {
    try {
      const list = await window.api.getModels()
      setModels(list || [])
      const savedModel = localStorage.getItem('nptel_model')
      const preferred =
        list?.find((m) => m.id === savedModel) ||
        list?.find((m) => m.default) ||
        list?.[0]
      if (preferred) setSelectedModel(preferred.id)
    } catch (err) {
      console.error('Failed to load models:', err)
    }
  }, [])

  const loadHistory = useCallback(async () => {
    try {
      setLoadingHistory(true)
      setHistory((await window.api.getHistory()) || [])
    } catch (err) {
      console.error('Failed to load history:', err)
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  // ── Init ────────────────────────────────────
  useEffect(() => {
    void checkAuthStatus()
    void loadModels()
    void loadHistory()
    void loadApiKey()
  }, [checkAuthStatus, loadModels, loadHistory, loadApiKey])

  // ── Log streaming ───────────────────────────
  useEffect(() => {
    const handler = (_event: unknown, message: string): void => {
      setLogs((prev) => [...prev, message])
    }
    window.api.onSolverLog(handler)
    return () => {
      window.api.offSolverLog()
    }
  }, [])

  // Auto-scroll logs
  useEffect(() => {
    if (viewMode === 'logs') {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, viewMode])

  // ── Model selection persistence ─────────────
  useEffect(() => {
    localStorage.setItem('nptel_model', selectedModel)
  }, [selectedModel])

  // ── Handlers ────────────────────────────────
  const handleLogin = async (): Promise<void> => {
    setLoggingIn(true)
    setAuthError(null)
    try {
      const loginFn = window.api?.loginNptel || window.electronAPI?.loginNptel
      if (!loginFn) throw new Error('Native Electron API not available')
      const res = await loginFn()
      if (!res.success) {
        localStorage.removeItem('nptel_auth_cache')
        setAuth({ nptel: false })
        setAuthError(res.error || 'Authentication cancelled or failed')
        return
      }
      const nextAuth = { nptel: true, email: res.email }
      setAuth(nextAuth)
      localStorage.setItem('nptel_auth_cache', JSON.stringify(nextAuth))
      void loadHistory()
      void loadModels()
    } catch (err: unknown) {
      setAuthError((err as Error)?.message || 'Failed to open login popup')
    } finally {
      setLoggingIn(false)
    }
  }

  const handleImportSession = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!importData.trim()) return
    setImporting(true)
    setAuthError(null)
    try {
      const res = await window.api.importSession(importData.trim())
      if (!res.success) {
        setAuthError(res.error || 'Failed to import session')
        return
      }
      const nextAuth = { nptel: true, email: res.email }
      setAuth(nextAuth)
      localStorage.setItem('nptel_auth_cache', JSON.stringify(nextAuth))
      setShowImport(false)
      setImportData('')
    } catch (err: unknown) {
      setAuthError((err as Error)?.message || 'Failed to import session')
    } finally {
      setImporting(false)
    }
  }

  const handleSaveApiKey = async (): Promise<void> => {
    try {
      await window.api.setSetting('groq_api_key', apiKey)
      setIsEditingKey(false)
    } catch (err) {
      console.error('Failed to save API key:', err)
    }
  }

  const handleLogout = async (): Promise<void> => {
    try {
      await window.api.logout()
    } catch (err) {
      console.error('Failed to logout:', err)
    } finally {
      localStorage.removeItem('nptel_auth_cache')
      sessionStorage.removeItem('nptel_assignments_cache')
      setAuth({ nptel: false })
      setAuthError(null)
      setViewMode('welcome')
    }
  }

  const handleDeleteHistory = async (e: FormEvent | React.MouseEvent, id: string): Promise<void> => {
    e.stopPropagation()
    try {
      await window.api.deleteHistoryItem(id)
      setHistory((prev) => prev.filter((item) => item.id !== id))
      if (selectedHistoryId === id) {
        setSelectedHistoryId(null)
        setViewMode('welcome')
      }
    } catch (err) {
      console.error('Failed to delete history entry:', err)
    }
  }

  const handleSolve = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!url.trim() || solving) return

    if (useCustomKey && !apiKey.trim()) {
      setShowKeyModal(true)
      return
    }

    setSolving(true)
    setSolveError(null)
    setLogs([])
    setViewMode('logs')
    try {
      const res = await window.api.solveAssignment(url.trim(), selectedModel)
      if (res.status === 'failed' || res.error) {
        setSolveError(res.error || 'Failed to complete assignment')
        setLogs((prev) => [...prev, `[ERROR] ${res.error || 'Failed to complete assignment'}`])
      } else {
        setUrl('')
        setLogs((prev) => [...prev, `[DONE] Assignment "${res.title}" completed${res.score ? ` — ${res.score}` : ''}`])
      }
      void loadHistory()
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'An error occurred while solving assignment'
      setSolveError(msg)
      setLogs((prev) => [...prev, `[ERROR] ${msg}`])
    } finally {
      setSolving(false)
    }
  }

  const handleViewDetail = async (item: AssignmentHistoryItem): Promise<void> => {
    setSelectedHistoryId(item.id)
    setDetailTitle(item.title || 'Assignment')
    setDetailScore(item.score)
    try {
      const detail = await window.api.getAssignmentDetail(item.id)
      setAssignmentDetail(detail)
      setViewMode('detail')
    } catch {
      setAssignmentDetail(null)
      setViewMode('detail')
    }
  }

  const handleBackToWelcome = (): void => {
    setViewMode('welcome')
    setSelectedHistoryId(null)
    setAssignmentDetail(null)
  }

  // ── Derived ─────────────────────────────────
  const statusText = solving ? 'solving' : authChecking ? 'checking session' : loggingIn ? 'authenticating' : viewMode === 'detail' ? 'inspecting' : 'idle'
  const statusClass = solving ? 'mode-solving' : (authChecking || loggingIn) ? 'mode-insert' : viewMode === 'detail' ? 'mode-normal' : ''

  const connectionText = authChecking
    ? 'checking'
    : auth.nptel
      ? 'connected'
      : 'disconnected'
  const connectionClass = authChecking
    ? 'checking'
    : auth.nptel
      ? 'connected'
      : 'disconnected'

  // ── Render ──────────────────────────────────
  return (
    <div className="nvim-shell">
      {/* ── Tabline ── */}
      <div className="tabline">
        <div className="tabline-left">
          <span className="tabline-title">Fuck<span>Nptel</span></span>
          <span className="tabline-sep">│</span>
          <span className="tabline-user">{auth.nptel ? auth.email || 'connected' : 'no session'}</span>
        </div>
        <div className="tabline-right">
          <span className="tabline-status">
            <span className={`tabline-dot ${connectionClass}`} />
            <span>{connectionText}</span>
          </span>
          {auth.nptel ? (
            <button className="tabline-btn danger" onClick={handleLogout}>logout</button>
          ) : (
            <button className="tabline-btn" onClick={() => void checkAuthStatus()} disabled={authChecking}>check</button>
          )}
        </div>
      </div>

      {/* ── Editor Area ── */}
      <div className="editor-area">
        {/* ── Main Panel ── */}
        <div className="main-panel">
          {!auth.nptel ? (
            /* ── Auth View ── */
            <div className="auth-view">
              <div className="auth-prompt">▸ authentication required</div>
              <h1 className="auth-title">Connect your NPTEL session</h1>
              <p className="auth-desc">
                Sign into NPTEL once. The session is stored locally on this device,
                ready to use whenever an assignment drops.
              </p>
              <div className="auth-actions">
                <button className="btn-primary" onClick={handleLogin} disabled={loggingIn || authChecking}>
                  {loggingIn ? <><span className="spinner" /> waiting for sign in...</> : 'connect nptel ↗'}
                </button>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => setShowImport((v) => !v)}
                  disabled={loggingIn || authChecking}
                >
                  {showImport ? 'close import' : 'import session'}
                </button>
              </div>
              {showImport && (
                <form className="import-section" onSubmit={handleImportSession}>
                  <label htmlFor="session-paste">session json or cookie payload</label>
                  <textarea
                    id="session-paste"
                    value={importData}
                    onChange={(e) => setImportData(e.target.value)}
                    placeholder='{"cookies": "..."}'
                    rows={5}
                    disabled={importing}
                  />
                  <button type="submit" className="btn-secondary import-submit" disabled={importing || !importData.trim()}>
                    {importing ? 'saving...' : 'save session'}
                  </button>
                </form>
              )}
              {authError && <div className="auth-error">{authError}</div>}
            </div>
          ) : viewMode === 'logs' ? (
            /* ── Log View ── */
            <div className="log-view">
              {logs.map((line, i) => {
                const parts = line.match(/^(\[[^\]]+\])\s*(\[[^\]]+\])\s*(.*)$/)
                const isError = line.includes('[ERROR]') || line.includes('error') || line.includes('Failed')
                const isSuccess = line.includes('[DONE]') || line.includes('successfully') || line.includes('Submission completed')

                return (
                  <div key={i} className="log-line">
                    <span className="log-line-number">{i + 1}</span>
                    {parts ? (
                      <>
                        <span className="log-timestamp">{parts[1]} </span>
                        <span className={`log-tag ${parts[2].includes('NPTEL') ? 'nptel' : parts[2].includes('SOLVER') ? 'solver' : parts[2].includes('AUTH') ? 'auth' : ''}`}>
                          {parts[2]}
                        </span>{' '}
                        <span className={isError ? 'log-error' : isSuccess ? 'log-success' : 'log-message'}>
                          {parts[3]}
                        </span>
                      </>
                    ) : (
                      <span className={isError ? 'log-error' : isSuccess ? 'log-success' : 'log-message'}>{line}</span>
                    )}
                  </div>
                )
              })}
              {solving && (
                <div className="log-line">
                  <span className="log-line-number">{logs.length + 1}</span>
                  <span className="log-cursor" />
                </div>
              )}
              <div ref={logEndRef} />
            </div>
          ) : viewMode === 'detail' && assignmentDetail ? (
            /* ── Detail View ── */
            <div className="detail-view">
              <div className="detail-header">
                <div>
                  <div className="detail-title">{detailTitle}</div>
                  <div className="detail-meta">{assignmentDetail.length} questions</div>
                </div>
                <button className="detail-back" onClick={handleBackToWelcome}>← back</button>
              </div>
              {assignmentDetail.map((q, qi) => (
                <div key={qi} className="detail-question">
                  <div className="detail-q-header">
                    <span className="detail-q-number">Q{qi + 1}</span>
                    <span className="detail-q-text">{q.question}</span>
                  </div>
                  <ul className="detail-options">
                    {q.options.map((opt, oi) => (
                      <li
                        key={oi}
                        className={`detail-option ${oi === q.selectedIndex ? 'selected' : ''}`}
                      >
                        <span className="detail-option-marker">
                          {oi === q.selectedIndex ? '●' : '○'}
                        </span>
                        <span>{opt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {detailScore && (
                <div className="detail-score">
                  <span className="detail-score-label">result:</span>
                  <span className="detail-score-value">{detailScore}</span>
                </div>
              )}
            </div>
          ) : viewMode === 'detail' && !assignmentDetail ? (
            <div className="detail-view">
              <div className="detail-header">
                <div>
                  <div className="detail-title">{detailTitle}</div>
                  <div className="detail-meta">no detail data available</div>
                </div>
                <button className="detail-back" onClick={handleBackToWelcome}>← back</button>
              </div>
              <p style={{ color: 'var(--fg-dark)', padding: '20px 0', fontSize: '12px' }}>
                This assignment was submitted before detail tracking was added.
                New submissions will include full question and answer data.
              </p>
            </div>
          ) : (
            /* ── Welcome View ── */
            <div className="welcome-view">
              <div className="welcome-tildes">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={`t-${i}`} className="tilde-line empty" />
                ))}
              </div>
              <div className="welcome-center">
                <div className="welcome-ascii" style={{ color: 'var(--blue)', whiteSpace: 'pre', fontFamily: 'var(--mono)', lineHeight: 1.2, margin: '0 auto 24px', display: 'inline-block', textAlign: 'left' }}>
{`    ______           __   _   __      __       __
   / ____/_  _______/ /__/ | / /___  / /____  / /
  / /_  / / / / ___/ //_/  |/ / __ \\/ __/ _ \\/ / 
 / __/ / /_/ / /__/ ,< / /|  / /_/ / /_/  __/ /  
/_/    \\__,_/\\___/_/|_/_/ |_/ .___/\\__/\\___/_/   
                           /_/                   `}
                </div>
                <div className="welcome-subtitle" style={{ color: 'var(--cyan)', marginBottom: '32px' }}>Assignment Solver</div>
                
                <div style={{ display: 'inline-grid', gridTemplateColumns: 'auto auto', gap: '8px 24px', textAlign: 'left', color: 'var(--fg-dark)', fontSize: '12px' }}>
                  <span style={{ color: 'var(--magenta)' }}>» URL</span>
                  <span>Paste NPTEL assignment link below</span>
                  
                  <span style={{ color: 'var(--green)' }}>» Model</span>
                  <span>Select an AI model from the sidebar</span>
                  
                  <span style={{ color: 'var(--yellow)' }}>» Submit</span>
                  <span>Press enter to solve automatically</span>
                </div>
              </div>
              <div className="welcome-tildes">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={`b-${i}`} className="tilde-line empty" />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="sidebar">
          {/* History Section */}
          <div className="sidebar-section">
            <div className="sidebar-header">
              <span>history</span>
              <button
                className="sidebar-header-btn"
                onClick={() => void loadHistory()}
                disabled={loadingHistory}
              >
                {loadingHistory ? '...' : '↻'}
              </button>
            </div>
            <div className="history-list">
              {history.length === 0 ? (
                <div className="history-empty">
                  <div className="history-empty-icon">∿</div>
                  <div>{loadingHistory ? 'loading...' : 'no runs yet'}</div>
                </div>
              ) : (
                history.map((item) => (
                  <button
                    key={item.id}
                    className={`history-item ${selectedHistoryId === item.id ? 'active' : ''}`}
                    onClick={() => void handleViewDetail(item)}
                  >
                    <div className="history-item-header">
                      <div className="history-item-title">{item.title || 'Untitled'}</div>
                      <button
                        className="history-trash-btn"
                        title="Delete entry"
                        onClick={(e) => void handleDeleteHistory(e, item.id)}
                      >
                        ✕
                      </button>
                    </div>
                    <div className="history-item-meta">
                      <span className={`history-badge ${item.status}`}>{item.status}</span>
                      <span className="history-item-date">
                        {formatHistoryTime(item.submitted_at || item.created_at)}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Models Section */}
          {!useCustomKey && (
            <div className="sidebar-section">
              <div className="sidebar-header">
                <span>models</span>
                <span style={{ fontSize: '9px' }}>{models.length}</span>
              </div>
              <div className="model-list">
                {models.map((model) => (
                  <button
                    key={model.id}
                    className={`model-item ${selectedModel === model.id ? 'active' : ''}`}
                    onClick={() => setSelectedModel(model.id)}
                  >
                    <span className="model-radio">
                      {selectedModel === model.id ? '●' : '○'}
                    </span>
                    <span className="model-name">{model.name}</span>
                    <span className="model-tag">{model.tag}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Settings Section */}
          <div className="sidebar-section">
            <div className="sidebar-header">
              <span>settings</span>
            </div>
            <div style={{ padding: '8px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--fg-dark)' }}>Use custom API Key</span>
                <label className="ios-toggle">
                  <input 
                    type="checkbox"
                    checked={useCustomKey}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setUseCustomKey(checked)
                      void window.api.setSetting('use_custom_api_key', checked ? 'true' : 'false')
                    }}
                  />
                  <span className="ios-slider"></span>
                </label>
              </div>

              {useCustomKey && (
                <div style={{ marginTop: '4px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--comment)', marginBottom: '6px' }}>
                    Groq API Key
                  </div>
                  {isEditingKey || !apiKey ? (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="gsk_..."
                        style={{
                          flex: 1,
                          background: 'var(--bg-dark)',
                          border: '1px solid var(--border)',
                          color: 'var(--fg)',
                          padding: '4px 6px',
                          fontSize: '11px',
                          width: '100%',
                          fontFamily: 'var(--mono)'
                        }}
                      />
                      <button
                        onClick={() => void handleSaveApiKey()}
                        style={{
                          background: 'var(--blue)',
                          color: 'var(--bg)',
                          border: 'none',
                          padding: '4px 8px',
                          fontSize: '11px',
                          cursor: 'pointer'
                        }}
                      >
                        save
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', color: 'var(--green)', fontFamily: 'var(--mono)' }}>
                        ••••••••••••{apiKey.slice(-4)}
                      </span>
                      <button
                        onClick={() => setIsEditingKey(true)}
                        style={{
                          color: 'var(--blue)',
                          fontSize: '11px',
                          padding: '2px 4px',
                          cursor: 'pointer'
                        }}
                      >
                        edit
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Command Line ── */}
      <div className="cmdline">
        {auth.nptel ? (
          <form onSubmit={handleSolve} style={{ display: 'contents' }}>
            <span className="cmdline-prompt">:</span>
            <input
              ref={cmdInputRef}
              className="cmdline-input"
              type="url"
              placeholder="paste assignment url and press enter..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={solving}
              required
            />
            <button
              type="submit"
              className={`cmdline-submit ${solving ? 'solving' : ''}`}
              disabled={solving || !url.trim()}
            >
              {solving ? <><span className="spinner" /> solving</> : 'solve ↵'}
            </button>
          </form>
        ) : (
          <div className="cmdline-login">
            <span className="cmdline-prompt">:</span>
            <span>type </span>
            <button className="cmdline-login-action" onClick={handleLogin} disabled={loggingIn}>
              :login
            </button>
            <span> to connect your NPTEL session</span>
          </div>
        )}
      </div>

      {/* ── Status Line ── */}
      <div className="statusline">
        <div className="statusline-left">
          <span className={`mode-indicator ${statusClass}`}>status: {statusText}</span>
          {solveError && <span className="statusline-item" style={{ color: 'var(--red)' }}>err: {solveError.slice(0, 60)}</span>}
        </div>
        <div className="statusline-right">
          <span className={`statusline-item ${auth.nptel ? 'active' : ''}`}>
            session: {auth.nptel ? 'active' : 'none'}
          </span>
          <span className="statusline-item">groq: ready</span>
          <span className="statusline-item">{models.length} models</span>
          {logs.length > 0 && <span className="statusline-item">{logs.length} lines</span>}
        </div>
      </div>

      {/* ── API Key Modal ── */}
      {showKeyModal && (
        <div className="modal-overlay" onClick={() => setShowKeyModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Groq API Key Required</div>
            <p className="modal-desc">
              You have custom API key mode enabled but haven't provided a key yet.
              Enter your Groq API key to continue solving.
            </p>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="gsk_..."
              className="modal-input"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && apiKey.trim()) {
                  void handleSaveApiKey()
                  setShowKeyModal(false)
                }
              }}
            />
            <div className="modal-actions">
              <button
                className="modal-btn secondary"
                onClick={() => setShowKeyModal(false)}
              >
                cancel
              </button>
              <button
                className="modal-btn primary"
                disabled={!apiKey.trim()}
                onClick={() => {
                  void handleSaveApiKey()
                  setShowKeyModal(false)
                }}
              >
                save & continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
