import { app, shell, BrowserWindow, ipcMain, session, nativeImage } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'path'
import fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { chromium, type BrowserContext } from 'playwright'

const DB_PATH = join(app.getPath('userData'), 'fuck-nptel.sqlite')
const PROFILE_PATH = join(app.getPath('userData'), 'nptel-profile')

if (app.isPackaged) {
  const bundledBrowser = join(process.resourcesPath, 'ms-playwright')
  if (fs.existsSync(bundledBrowser)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = bundledBrowser
  }
}

let dbInstance: DatabaseSync | null = null

function getDb(): DatabaseSync {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(DB_PATH)
    dbInstance.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS auth_session (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        session_data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS assignment_history (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        course_name TEXT NOT NULL,
        status TEXT NOT NULL,
        score TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        submitted_at TEXT,
        details TEXT
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)
    try {
      dbInstance.exec('ALTER TABLE assignment_history ADD COLUMN details TEXT')
    } catch {
      // Column already exists
    }
  }
  return dbInstance
}

const LOCAL_MODELS = [
  {
    id: 'openai/gpt-oss-120b',
    name: 'GPT OSS 120B',
    provider: 'Groq',
    tag: 'Flagship',
    default: true
  },
  { id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B', provider: 'Groq', tag: 'Balanced' },
  { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', provider: 'Groq', tag: 'Fast' },
  { id: 'groq/compound', name: 'Compound', provider: 'Groq', tag: 'Agentic' },
  { id: 'groq/compound-mini', name: 'Compound Mini', provider: 'Groq', tag: 'Lightweight' }
]

const SYSTEM_PROMPT = `You are an expert at answering multiple-choice questions from NPTEL courses.
You will be given a list of questions, each with options.
For each question, select the 0-based index (0, 1, 2, or 3) of the correct answer.

Respond in this exact JSON format:
{"answers": [0, 2, 1, 3]}

Where each number in the array corresponds to the 0-based index of the option for Question 1, Question 2, etc.
Do NOT include any markdown formatting, explanations, or extra text outside the JSON object.`

interface SavedSession {
  email: string
  sessionData: string
  updatedAt: string
}

function loadSavedSession(): SavedSession | null {
  try {
    const row = getDb()
      .prepare("SELECT email, session_data, updated_at FROM auth_session WHERE id = 'current'")
      .get() as { email: string; session_data: string; updated_at: string } | undefined

    if (!row) return null
    return {
      email: String(row.email),
      sessionData: String(row.session_data),
      updatedAt: String(row.updated_at)
    }
  } catch {
    return null
  }
}

function saveSavedSession(session: SavedSession): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO auth_session (id, email, session_data, updated_at)
         VALUES ('current', @email, @sessionData, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           email = excluded.email,
           session_data = excluded.session_data,
           updated_at = excluded.updated_at`
      )
      .run({
        email: session.email,
        sessionData: session.sessionData,
        updatedAt: session.updatedAt
      })
  } catch (err) {
    console.warn('[AUTH] Failed to save session to sqlite:', err)
  }
}

function clearSavedSession(): void {
  try {
    getDb().prepare("DELETE FROM auth_session WHERE id = 'current'").run()
  } catch {}
}

function getSetting(key: string): string | null {
  try {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      { value: string } | undefined
    return row ? String(row.value) : null
  } catch {
    return null
  }
}

function setSetting(key: string, value: string): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO settings (key, value) VALUES (@key, @value)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run({ key, value })
  } catch (err) {
    console.warn('[SETTINGS] Failed to save setting:', err)
  }
}

function loadHistory(): Array<{
  id: string
  title: string
  course_name: string
  status: string
  score: string | null
  error: string | null
  created_at: string
  submitted_at: string | null
  details: string | null
}> {
  try {
    const rows = getDb()
      .prepare(
        `SELECT id, title, course_name, status, score, error, created_at, submitted_at, details
         FROM assignment_history
         ORDER BY created_at DESC`
      )
      .all() as Array<{
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

    return rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      course_name: String(row.course_name),
      status: String(row.status),
      score: row.score ?? null,
      error: row.error ?? null,
      created_at: String(row.created_at),
      submitted_at: row.submitted_at ?? null,
      details: row.details ?? null
    }))
  } catch {
    return []
  }
}

function saveHistory(
  items: Array<{
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
): void {
  try {
    const db = getDb()
    db.exec('BEGIN')
    db.prepare('DELETE FROM assignment_history').run()
    const insert = db.prepare(
      `INSERT INTO assignment_history (id, title, course_name, status, score, error, created_at, submitted_at, details)
       VALUES (@id, @title, @course_name, @status, @score, @error, @created_at, @submitted_at, @details)`
    )
    for (const item of items) {
      insert.run({
        id: item.id,
        title: item.title,
        course_name: item.course_name,
        status: item.status,
        score: item.score,
        error: item.error,
        created_at: item.created_at,
        submitted_at: item.submitted_at,
        details: item.details ?? null
      })
    }
    db.exec('COMMIT')
  } catch (err) {
    console.warn('[HISTORY] Failed to save history to sqlite:', err)
  }
}

async function clearNptelAuthState(): Promise<void> {
  try {
    await session.defaultSession.clearStorageData({
      storages: [
        'cookies',
        'filesystem',
        'indexdb',
        'localstorage',
        'shadercache',
        'serviceworkers',
        'cachestorage'
      ]
    })
  } catch {}
}

function clearNptelBrowserProfile(): void {
  // This profile is used exclusively by Playwright for NPTEL/Google login. Removing
  // it clears cookies, IndexedDB and saved Google/NPTEL sessions from the popup too.
  try {
    if (fs.existsSync(PROFILE_PATH)) {
      fs.rmSync(PROFILE_PATH, { recursive: true, force: true, maxRetries: 2, retryDelay: 150 })
    }
  } catch (err) {
    console.warn('[AUTH] Failed to clear the NPTEL browser profile:', err)
  }
}

async function restoreStorageState(context: BrowserContext, storageState: string): Promise<void> {
  try {
    const parsed = JSON.parse(storageState)
    if (!parsed || typeof parsed !== 'object') return

    // setStorageState restores the complete Playwright snapshot, including IndexedDB.
    // Firebase commonly keeps its persisted user/token data there, so manually adding
    // only cookies and localStorage loses the part of the NPTEL login that matters.
    await context.setStorageState(parsed)
    console.log('[AUTH] Restored complete session state from local cache')
  } catch (err) {
    console.warn('[AUTH] Could not restore storage state:', err)
  }
}

async function captureStorageState(context: BrowserContext): Promise<string> {
  // IndexedDB is deliberately included: Firebase Auth uses it for durable sessions.
  return JSON.stringify(await context.storageState({ indexedDB: true }))
}

async function detectLoggedInUser(context: BrowserContext): Promise<string | null> {
  for (const page of context.pages()) {
    try {
      const origin = new URL(page.url()).origin
      if (!origin.endsWith('nptel.ac.in') && !origin.endsWith('swayam.gov.in')) continue

      const email = await page.evaluate(() => {
        // Firebase's local persistence includes the account email when it is available.
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i) || ''
          if (!key.startsWith('firebase:authUser')) continue
          try {
            const user = JSON.parse(localStorage.getItem(key) || '')
            if (typeof user?.email === 'string' && user.email.includes('@')) return user.email
          } catch {
            // Ignore an incomplete value while Firebase is writing the auth record.
          }
        }

        // Some NPTEL views display the signed-in account without exposing Firebase keys.
        const text = document.body?.innerText || ''
        return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || ''
      })

      if (email) return email

      // Recent Firebase Auth versions persist the user in IndexedDB instead of
      // localStorage. NPTEL's landing page does not always render the account email,
      // so inspect Firebase's own records before deciding the popup is logged out.
      const indexedDbEmail = await page.evaluate(async () => {
        const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
        const databaseNames = await indexedDB.databases().catch(() => [])

        for (const database of databaseNames) {
          if (!database.name?.toLowerCase().includes('firebase')) continue

          const records = await new Promise<unknown[]>((resolve) => {
            const request = indexedDB.open(database.name!)
            request.onerror = () => resolve([])
            request.onsuccess = () => {
              const db = request.result
              const storeNames = Array.from(db.objectStoreNames)
              if (storeNames.length === 0) {
                db.close()
                resolve([])
                return
              }

              const transaction = db.transaction(storeNames, 'readonly')
              const values: unknown[] = []
              for (const storeName of storeNames) {
                const getAll = transaction.objectStore(storeName).getAll()
                getAll.onsuccess = () => values.push(...getAll.result)
                getAll.onerror = () => undefined
              }
              transaction.oncomplete = () => {
                db.close()
                resolve(values)
              }
              transaction.onerror = () => {
                db.close()
                resolve([])
              }
            }
          })

          for (const record of records) {
            const email = JSON.stringify(record).match(emailPattern)?.[0]
            if (email) return email
          }
        }
        return ''
      })

      if (indexedDbEmail) return indexedDbEmail
    } catch {
      // A page can be navigating while Google redirects back to NPTEL; try again next tick.
    }
  }
  return null
}

async function hasNptelAuthCookie(context: BrowserContext): Promise<boolean> {
  const cookies = await context.cookies()
  return cookies.some((cookie) => {
    const isNptelDomain =
      cookie.domain.includes('nptel.ac.in') || cookie.domain.includes('swayam.gov.in')
    // Deliberately exclude generic cookies (including CSRF/analytics). A real session
    // cookie is enough to retain a login that does not expose an email in the UI.
    const isAuthCookie = /(^|[_-])(session|sessionid|auth|token|jwt)([_-]|$)/i.test(cookie.name)
    return isNptelDomain && isAuthCookie && Boolean(cookie.value)
  })
}

async function createPersistentContext(headless = true): Promise<BrowserContext> {
  fs.mkdirSync(PROFILE_PATH, { recursive: true })

  const baseOptions = {
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ],
    viewport: { width: 1280, height: 800 }
  }

  // Priority order:
  // 1. Playwright Chromium (default / bundled)
  // 2. Installed Google Chrome ('chrome')
  // 3. Installed Microsoft Edge ('msedge')
  const attempts: { label: string; channel?: string }[] = [
    { label: 'Playwright Chromium' },
    { label: 'Google Chrome', channel: 'chrome' },
    { label: 'Microsoft Edge', channel: 'msedge' }
  ]

  let lastError: unknown = null
  for (const attempt of attempts) {
    try {
      const opts = attempt.channel ? { ...baseOptions, channel: attempt.channel } : baseOptions
      const ctx = await chromium.launchPersistentContext(PROFILE_PATH, opts)
      console.log(`[BROWSER] Successfully launched ${attempt.label}`)
      return ctx
    } catch (err) {
      lastError = err
      console.log(`[BROWSER] ${attempt.label} launch attempt failed, trying fallback...`)
    }
  }

  const errorMsg =
    'No compatible browser found. Please install Google Chrome or Microsoft Edge.'
  sendLog(`[BROWSER] Error: ${errorMsg}`)
  console.error('[BROWSER] All browser launch options failed:', lastError)
  throw new Error(errorMsg)
}

async function launchBrowser(headless = true): Promise<BrowserContext> {
  const context = await createPersistentContext(headless)

  try {
    const saved = loadSavedSession()
    if (saved?.sessionData) {
      await restoreStorageState(context, saved.sessionData)
    }
  } catch (err) {
    console.warn('[AUTH] Could not hydrate browser context from saved session:', err)
  }

  return context
}

async function performPlaywrightLogin(): Promise<{
  success: boolean
  email?: string
  error?: string
  storageState?: string
}> {
  try {
    const rememberedEmail = loadSavedSession()?.email
    const context = await createPersistentContext(false)

    try {
      const page = context.pages()[0] || (await context.newPage())
      let responseEmail = ''

      // NPTEL's own authenticated-user API is the strongest signal. This mirrors
      // the original desktop/server implementation, which observed a JSON response
      // containing `loggedIn: true` and the user's email after the Google redirect.
      context.on('response', async (response) => {
        if (responseEmail) return
        try {
          const contentType = response.headers()['content-type'] || ''
          if (!contentType.includes('application/json') && !contentType.includes('text/plain'))
            return

          const text = await response.text()
          if (
            !text.includes('loggedIn') ||
            (!text.includes('email') && !text.includes('user_email'))
          )
            return

          const payload = JSON.parse(text) as {
            loggedIn?: boolean | string
            email?: unknown
            user_email?: unknown
          }
          if (payload.loggedIn !== true && payload.loggedIn !== 'true') return

          const email = payload.email || payload.user_email
          if (typeof email === 'string' && email.includes('@')) {
            responseEmail = email
            console.log('[AUTH] Verified NPTEL login from authenticated-user response')
          }
        } catch {
          // Ignore non-JSON responses and bodies that cannot be read while navigating.
        }
      })

      // Do not wait for every landing-page resource. The popup must remain available
      // for the Google redirect and for the response listener above.
      await page
        .goto('https://onlinecourses.nptel.ac.in/', { waitUntil: 'commit', timeout: 60_000 })
        .catch((err) => console.warn('[AUTH] Initial NPTEL navigation did not complete:', err))

      const deadline = Date.now() + 15 * 60_000
      let capturedEmail = ''
      let capturedSessionCookie = false

      // Do this continuously, not only when the user closes the popup. Previously a
      // successful sign-in sat undetected until the full 15-minute timeout elapsed.
      while (Date.now() < deadline && context.pages().length > 0) {
        capturedEmail = responseEmail || (await detectLoggedInUser(context)) || ''
        if (capturedEmail) break
        capturedSessionCookie = await hasNptelAuthCookie(context)
        if (capturedSessionCookie) break
        await new Promise((resolve) => setTimeout(resolve, 750))
      }

      const result = await captureStorageState(context)

      if (capturedEmail && capturedEmail.includes('@')) {
        saveSavedSession({
          email: capturedEmail,
          sessionData: result,
          updatedAt: new Date().toISOString()
        })
        return { success: true, email: capturedEmail, storageState: result }
      }

      if (capturedSessionCookie || (await hasNptelAuthCookie(context))) {
        // A pre-existing popup session can be valid even when NPTEL does not render
        // the email. Retain the previously captured account label in that case.
        const fallbackEmail =
          rememberedEmail && rememberedEmail !== 'nptel-user@authenticated'
            ? rememberedEmail
            : 'nptel-user@authenticated'
        saveSavedSession({
          email: fallbackEmail,
          sessionData: result,
          updatedAt: new Date().toISOString()
        })
        return { success: true, email: fallbackEmail, storageState: result }
      }

      return {
        success: false,
        error:
          'Login was not detected in the popup window. Please complete sign-in before closing the window.'
      }
    } finally {
      await context.close().catch(() => undefined)
    }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Login failed'
    }
  }
}

const DEFAULT_BACKEND_URL = 'https://fuck-nptel-electron.vercel.app/api/solve'
const DEFAULT_BACKEND_SECRET = 'fd304965-f132-4708-85e8-66921a42d44b'

async function solveWithBackend(prompt: string, modelName: string): Promise<string> {
  const env = (import.meta as any).env || {}
  let rawUrl =
    (env.VITE_BACKEND_URL as string | undefined) ||
    process.env.VITE_BACKEND_URL ||
    getSetting('backend_url') ||
    DEFAULT_BACKEND_URL
  const backendSecret =
    (env.VITE_BACKEND_SECRET as string | undefined) ||
    process.env.VITE_BACKEND_SECRET ||
    DEFAULT_BACKEND_SECRET

  if (!rawUrl || !rawUrl.trim()) {
    throw new Error(
      'Backend server URL is not configured. Please set VITE_BACKEND_URL in your environment or settings.'
    )
  }

  const backendUrl = rawUrl
    .trim()
    .replace(/^http::\/\//i, 'http://')
    .replace(/^https::\/\//i, 'https://')

  const response = await fetch(backendUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${backendSecret}`
    },
    body: JSON.stringify({ prompt, model: modelName })
  })
  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText)
    throw new Error(`Backend error (${response.status}): ${errorText || response.statusText}`)
  }
  const data = await response.json()
  return data.text || data.result || ''
}

async function solveWithGroq(prompt: string, modelName?: string): Promise<string> {
  const model = modelName || 'openai/gpt-oss-120b'
  const useCustomKey = getSetting('use_custom_api_key') === 'true'

  if (!useCustomKey) {
    return solveWithBackend(prompt, model)
  }

  const { Groq } = await import('groq-sdk')
  const apiKey = getSetting('groq_api_key')?.trim()
  if (!apiKey) {
    throw new Error('Custom API key mode is enabled, but no Groq API key is set.')
  }

  const groq = new Groq({ apiKey })
  const response = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ],
    model,
    response_format: { type: 'json_object' },
    temperature: 0.1
  })

  return response.choices[0]?.message?.content || '{}'
}

async function solveQuestions(
  questions: Array<{ text: string; options: string[] }>,
  selectedModel?: string
): Promise<Array<{ text: string; options: string[]; answerIndex: number }>> {
  if (questions.length === 0) return []

  const prompt = questions
    .map((q, i) => {
      const optionsStr = q.options.map((opt, j) => `  ${j}. ${opt}`).join('\n')
      return `Question ${i + 1}: ${q.text}\n${optionsStr}`
    })
    .join('\n\n')

  const model = selectedModel || 'openai/gpt-oss-120b'

  sendLog(`[SOLVER] Sending ${questions.length} questions to ${model}...`)
  const responseText = await solveWithGroq(prompt, model)
  sendLog('[SOLVER] Received response from model')

  let answerIndices: number[]
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    const jsonStr = jsonMatch ? jsonMatch[0] : responseText
    const parsed = JSON.parse(jsonStr)

    if (Array.isArray(parsed.answers)) {
      answerIndices = parsed.answers
    } else if (Array.isArray(parsed)) {
      answerIndices = parsed
    } else {
      throw new Error(`Invalid JSON schema in model response`)
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    sendLog(`[SOLVER] Failed to parse model output: ${errMsg}`)
    throw new Error(`Model returned an invalid JSON response. Aborting assignment solve. Raw output: ${responseText.slice(0, 100)}`)
  }

  if (answerIndices.length < questions.length) {
    throw new Error(
      `Model returned answers for only ${answerIndices.length} of ${questions.length} questions. Aborting assignment solve.`
    )
  }

  sendLog(`[SOLVER] Answer indices determined for ${questions.length} questions`)
  return questions.map((q, i) => ({
    ...q,
    answerIndex: answerIndices[i]
  }))
}

async function scrapeAssignment(
  assignmentUrl: string
): Promise<{
  title: string
  courseTitle: string
  questions: Array<{ text: string; options: string[] }>
}> {
  sendLog(`[NPTEL] Scraping assignment: ${assignmentUrl}`)
  const context = await launchBrowser(true)

  try {
    const page = await context.newPage()

    sendLog(`[NPTEL] Navigating to: ${assignmentUrl}`)
    await page.goto(assignmentUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForTimeout(4000)

    let title = await page.title()
    let currentUrl = page.url()
    sendLog(`[NPTEL] Page loaded: "${title}" (${currentUrl})`)

    if (
      currentUrl.includes('/preview/') ||
      currentUrl.includes('accounts.google.com') ||
      currentUrl.includes('login')
    ) {
      sendLog('[NPTEL] Detected unauthenticated page (preview/login). Attempting auto sign-in...')
      const signInBtn = await page.$(
        'a:has-text("Sign-In"), a:has-text("Sign-in"), a:has-text("Sign In"), a:has-text("Login"), button:has-text("Sign In"), button:has-text("Login"), .login-btn, [href*="login"]'
      )

      if (signInBtn) {
        sendLog('[NPTEL] Found Sign In button. Clicking...')
        await signInBtn.click()
        await page.waitForTimeout(4000)

        try {
          const googleAccount = await page.$(
            '[data-email], [class*="account-item"], [class*="identity"]'
          )
          if (googleAccount) {
            sendLog('[NPTEL] Choosing Google account...')
            await googleAccount.click()
            await page.waitForTimeout(5000)
          }
        } catch {}

        sendLog(`[NPTEL] Re-navigating to assignment: ${assignmentUrl}`)
        await page.goto(assignmentUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        await page.waitForTimeout(4000)
        currentUrl = page.url()
      }

      if (currentUrl.includes('/preview/') || currentUrl.includes('accounts.google.com')) {
        throw new Error(
          'Not signed in on onlinecourses.nptel.ac.in. Please go to Settings -> Reconnect NPTEL and sign into your Google account in the popup window.'
        )
      }
    }

    sendLog('[NPTEL] Waiting for assessment content to load...')
    await page.waitForTimeout(6000)

    const pageData = await page.evaluate(() => {
      const questions: Array<{ text: string; options: string[] }> = []
      const sections = document.querySelectorAll('section')

      sections.forEach((sec) => {
        const qContentEl = sec.querySelector('.question-content, .question-text, .problem-text')
        const radios = sec.querySelectorAll('input[type="radio"]')

        if (qContentEl && radios.length >= 2) {
          const qText = qContentEl.textContent?.trim() || ''
          const opts: string[] = []

          const labels = sec.querySelectorAll('label')
          labels.forEach((lbl) => {
            const span = lbl.querySelector('span')
            const optText = span?.textContent?.trim() || lbl.textContent?.trim() || ''
            if (optText) opts.push(optText)
          })

          if (qText && opts.length >= 2) {
            questions.push({ text: qText, options: opts.slice(0, 4) })
          }
        }
      })

      const assignmentTitle =
        document
          .querySelector(
            '.assessment-header-title, [class*="assessment-header-title"], [class*="header-title"]'
          )
          ?.textContent?.trim() || ''
      return { assignmentTitle, questions }
    })

    const parsedTitle = pageData.assignmentTitle || 'Assignment'
    const parsedCourse = (await page.title())
      .replace(/Course:\s*|Preview:\s*|\|\s*SWAYAM/gi, '')
      .trim()

    sendLog(
      `[NPTEL] Successfully parsed "${parsedTitle}" (${parsedCourse}) with ${pageData.questions.length} questions!`
    )

    return {
      title: parsedTitle,
      courseTitle: parsedCourse,
      questions: pageData.questions.map((q) => ({
        text: q.text,
        options: q.options.length >= 4 ? q.options : [...q.options, '', '', ''].slice(0, 4)
      }))
    }
  } finally {
    await context.close()
  }
}

async function submitAssignment(
  assignmentUrl: string,
  answerIndices: number[]
): Promise<{ success: boolean; score?: string }> {
  sendLog(`[NPTEL] Submitting assignment: ${assignmentUrl}`)
  const context = await launchBrowser(true)

  try {
    const page = await context.newPage()
    sendLog(`[NPTEL] Navigating for submission to: ${assignmentUrl}`)
    await page.goto(assignmentUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForTimeout(5000)

    const sections = await page.$$('section:has(input[type="radio"])')
    sendLog(`[NPTEL] Found ${sections.length} question sections to select answers for.`)

    for (let i = 0; i < Math.min(sections.length, answerIndices.length); i++) {
      const sec = sections[i]
      const radios = await sec.$$('input[type="radio"]')
      const targetIndex = answerIndices[i]

      if (radios[targetIndex]) {
        sendLog(`[NPTEL] Question ${i + 1}: selecting option index ${targetIndex}`)
        await radios[targetIndex].click({ force: true })
        await page.waitForTimeout(300)
      }
    }

    const submitBtn = await page.$(
      'button:has-text("Submit"), button:has-text("Submit Answers"), button[class*="bg-[#187ae2]"], input[type="submit"]'
    )

    if (submitBtn) {
      sendLog('[NPTEL] Found Submit button. Clicking...')
      await submitBtn.click()
      await page.waitForTimeout(4000)

      const score = await page.evaluate(() => {
        const text = document.body?.innerText || ''
        const submissionMatch = text.match(/last recorded submission was on\s*([^\n\r.]+)/i)
        if (submissionMatch) return `Submitted (${submissionMatch[1].trim()})`
        const scoreEl = document.querySelector(
          '[class*="score"], [class*="result"], [class*="grade"]'
        )
        return scoreEl?.textContent?.trim() || null
      })

      sendLog(`[NPTEL] Submission completed! Result: ${score || 'Submitted'}`)
      return { success: true, score: score || 'Submitted' }
    }

    sendLog('[NPTEL] Could not find Submit button on page.')
    return { success: false }
  } finally {
    await context.close()
  }
}

let mainWindow: BrowserWindow | null = null

function sendLog(message: string): void {
  const timestamp = new Date().toISOString().slice(11, 19)
  const line = `[${timestamp}] ${message}`
  console.log(message)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('solver-log', line)
  }
}

function createWindow(): void {
  const appIcon = nativeImage.createFromPath(icon)
  mainWindow = new BrowserWindow({
    title: 'FuckNptel',
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: true,
    autoHideMenuBar: true,
    backgroundColor: '#1a1b26',
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  mainWindow.setIcon(appIcon)

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

ipcMain.handle('login-nptel', async () => {
  await clearNptelAuthState()
  const result = await performPlaywrightLogin()

  if (result.success) {
    return { success: true, email: result.email }
  }

  return { success: false, error: result.error || 'Login was not detected.' }
})

ipcMain.handle('import-session', async (_event, sessionData: string) => {
  try {
    const trimmed = String(sessionData || '').trim()
    if (!trimmed) {
      return { success: false, error: 'Please provide sessionData.' }
    }

    let email = 'connected-user@nptel.ac.in'
    try {
      const parsed = JSON.parse(trimmed)
      if (
        parsed &&
        typeof parsed === 'object' &&
        parsed.email &&
        typeof parsed.email === 'string'
      ) {
        email = parsed.email
      }
    } catch {}

    saveSavedSession({ email, sessionData: trimmed, updatedAt: new Date().toISOString() })
    return { success: true, email }
  } catch (err: unknown) {
    return { success: false, error: (err as Error)?.message || 'Import failed' }
  }
})

ipcMain.handle('check-auth', async () => {
  const saved = loadSavedSession()
  if (saved && saved.email) {
    return { nptel: true, email: saved.email }
  }
  return { nptel: false }
})

ipcMain.handle('solve-assignment', async (_event, url: string, model: string) => {
  try {
    const assignment = await scrapeAssignment(url)
    const solved = await solveQuestions(
      assignment.questions,
      model || 'openai/gpt-oss-120b'
    )

    sendLog('[SOLVER] Preparing submission...')
    const answerIndices = solved.map((entry) => entry.answerIndex)
    const submitRes = await submitAssignment(url, answerIndices)
    sendLog(
      submitRes.success ? '[NPTEL] Assignment submitted successfully!' : '[NPTEL] Submission failed'
    )

    const details = JSON.stringify(
      solved.map((q) => ({
        question: q.text,
        options: q.options,
        selectedIndex: q.answerIndex,
        selectedAnswer: q.options[q.answerIndex] || ''
      }))
    )

    const result = {
      id: `${Date.now()}`,
      title: assignment.title || 'Assignment',
      course_name: assignment.courseTitle || 'NPTEL',
      status: submitRes.success ? 'submitted' : 'failed',
      score: submitRes.score || null,
      error: submitRes.success ? null : 'Failed to submit assignment',
      created_at: new Date().toISOString(),
      submitted_at: submitRes.success ? new Date().toISOString() : null,
      details
    }

    const history = loadHistory()
    history.unshift(result)
    saveHistory(history)

    return {
      id: result.id,
      title: result.title,
      course_name: result.course_name,
      status: result.status,
      score: result.score,
      error: result.error
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[IPC] solve-assignment failed:', message)
    throw new Error(message)
  }
})

ipcMain.handle('get-models', async () => {
  return LOCAL_MODELS
})

ipcMain.handle('get-history', async () => {
  return loadHistory()
})

ipcMain.handle('get-assignment-detail', async (_event, id: string) => {
  try {
    const row = getDb().prepare('SELECT details FROM assignment_history WHERE id = ?').get(id) as
      { details: string | null } | undefined
    if (!row?.details) return null
    return JSON.parse(row.details)
  } catch {
    return null
  }
})

ipcMain.handle('delete-history', (_event, id: string) => {
  try {
    getDb().prepare('DELETE FROM assignment_history WHERE id = ?').run(id)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('minimize-window', () => {
  mainWindow?.minimize()
})

ipcMain.handle('maximize-window', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

ipcMain.handle('close-window', () => {
  mainWindow?.close()
})

ipcMain.handle('logout', async () => {
  clearSavedSession()
  await clearNptelAuthState()
  clearNptelBrowserProfile()
  return { success: true }
})

ipcMain.handle('get-setting', (_event, key: string) => {
  return getSetting(key)
})

ipcMain.handle('set-setting', (_event, key: string, value: string) => {
  setSetting(key, value)
})

app.whenReady().then(() => {
  app.setName('FuckNptel')
  electronApp.setAppUserModelId('com.fucknptel.desktop')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
