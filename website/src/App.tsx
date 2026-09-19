import { useState, useEffect } from 'react'

interface ReleaseAsset {
  name: string
  browser_download_url: string
  size: number
}

interface ReleaseData {
  tag_name: string
  published_at: string
  assets: ReleaseAsset[]
  html_url: string
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return ''
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function detectOS(): 'windows' | 'mac' | 'linux' {
  if (typeof window === 'undefined') return 'windows'
  const ua = window.navigator.userAgent.toLowerCase()
  if (ua.includes('mac')) return 'mac'
  if (ua.includes('linux')) return 'linux'
  return 'windows'
}

export default function App() {
  const [release, setRelease] = useState<ReleaseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [userOS, setUserOS] = useState<'windows' | 'mac' | 'linux'>('windows')

  const REPO = 'realrnvr/fuck-nptel-electron'
  const FALLBACK_VERSION = 'v1.0.0'

  useEffect(() => {
    setUserOS(detectOS())

    async function fetchRelease() {
      setLoading(true)
      try {
        const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
        if (res.ok) {
          const data: ReleaseData = await res.json()
          setRelease(data)
        } else {
          throw new Error('Fallback')
        }
      } catch {
        setRelease({
          tag_name: FALLBACK_VERSION,
          published_at: new Date().toISOString(),
          html_url: `https://github.com/${REPO}/releases/latest`,
          assets: [
            {
              name: 'FuckNptel-1.0.0-setup.exe',
              browser_download_url: `https://github.com/${REPO}/releases/download/${FALLBACK_VERSION}/FuckNptel-1.0.0-setup.exe`,
              size: 85 * 1024 * 1024
            },
            {
              name: 'FuckNptel-1.0.0.dmg',
              browser_download_url: `https://github.com/${REPO}/releases/download/${FALLBACK_VERSION}/FuckNptel-1.0.0.dmg`,
              size: 92 * 1024 * 1024
            },
            {
              name: 'FuckNptel-1.0.0.AppImage',
              browser_download_url: `https://github.com/${REPO}/releases/download/${FALLBACK_VERSION}/FuckNptel-1.0.0.AppImage`,
              size: 88 * 1024 * 1024
            },
            {
              name: 'fuck-nptel-electron_1.0.0_amd64.deb',
              browser_download_url: `https://github.com/${REPO}/releases/download/${FALLBACK_VERSION}/fuck-nptel-electron_1.0.0_amd64.deb`,
              size: 78 * 1024 * 1024
            }
          ]
        })
      } finally {
        setLoading(false)
      }
    }

    void fetchRelease()
  }, [])

  const findAsset = (ext: string) => {
    return release?.assets.find((a) => a.name.toLowerCase().endsWith(ext.toLowerCase()))
  }

  const windowsAsset = findAsset('.exe')
  const macAsset = findAsset('.dmg')
  const linuxAppImage = findAsset('.appimage')
  const linuxDeb = findAsset('.deb')

  return (
    <div className="container">
      {/* Top Bar */}
      <header className="header">
        <div className="brand">FuckNptel</div>
        <a
          href={`https://github.com/${REPO}`}
          target="_blank"
          rel="noreferrer"
          className="gh-link"
        >
          GitHub ↗
        </a>
      </header>

      {/* Main Content */}
      <main className="main">
        <div className="intro">
          <div className="version-wrapper">
            {loading ? (
              <div className="version-skeleton" />
            ) : (
              <span className="version-tag">{release?.tag_name || 'v1.0.0'}</span>
            )}
          </div>
          <h1 className="title">FUCK THOSE NPTEL ASSIGNMENT USE FN TO SOLVE THEM</h1>
          <p className="subtitle">
            Autonomous desktop app that scrapes assignments, reasons with Groq AI, and submits answers directly.
          </p>
        </div>

        {/* Build Downloads */}
        <section className="builds">
          {loading ? (
            /* Modern Skeleton Loaders */
            <>
              <div className="build-card skeleton-card">
                <div className="skeleton-title" />
                <div className="skeleton-btn" />
                <div className="skeleton-text" />
              </div>
              <div className="build-card skeleton-card">
                <div className="skeleton-title" />
                <div className="skeleton-btn" />
                <div className="skeleton-text" />
              </div>
              <div className="build-card skeleton-card">
                <div className="skeleton-title" />
                <div className="skeleton-btn" />
                <div className="skeleton-text" />
              </div>
            </>
          ) : (
            <>
              {/* Windows */}
              <div className={`build-card ${userOS === 'windows' ? 'highlighted' : ''}`}>
                <div className="card-top">
                  <div className="card-title-row">
                    <span className="platform">Windows</span>
                    {userOS === 'windows' && <span className="badge">Your OS</span>}
                  </div>
                  <p className="card-desc">
                    64-bit installer for Windows 10 & 11.
                  </p>
                </div>

                <div className="card-actions">
                  <a
                    href={
                      windowsAsset?.browser_download_url ||
                      `https://github.com/${REPO}/releases/latest`
                    }
                    className="btn primary"
                  >
                    <span className="btn-title">Download .exe</span>
                    {windowsAsset?.size ? (
                      <span className="file-meta">{formatBytes(windowsAsset.size)}</span>
                    ) : null}
                  </a>
                  <p className="note">
                    SmartScreen: click <em>More info</em> → <em>Run anyway</em>.
                  </p>
                </div>
              </div>

              {/* macOS */}
              <div className={`build-card ${userOS === 'mac' ? 'highlighted' : ''}`}>
                <div className="card-top">
                  <div className="card-title-row">
                    <span className="platform">macOS</span>
                    {userOS === 'mac' && <span className="badge">Your OS</span>}
                  </div>
                  <p className="card-desc">
                    Universal binary for Apple Silicon & Intel.
                  </p>
                </div>

                <div className="card-actions">
                  <a
                    href={
                      macAsset?.browser_download_url ||
                      `https://github.com/${REPO}/releases/latest`
                    }
                    className="btn primary"
                  >
                    <span className="btn-title">Download .dmg</span>
                    {macAsset?.size ? (
                      <span className="file-meta">{formatBytes(macAsset.size)}</span>
                    ) : null}
                  </a>
                  <p className="note">
                    Gatekeeper: Right-click → <em>Open</em> on first launch.
                  </p>
                </div>
              </div>

              {/* Linux */}
              <div className={`build-card ${userOS === 'linux' ? 'highlighted' : ''}`}>
                <div className="card-top">
                  <div className="card-title-row">
                    <span className="platform">Linux</span>
                    {userOS === 'linux' && <span className="badge">Your OS</span>}
                  </div>
                  <p className="card-desc">
                    Standalone AppImage and Debian packages.
                  </p>
                </div>

                <div className="card-actions">
                  <a
                    href={
                      linuxAppImage?.browser_download_url ||
                      `https://github.com/${REPO}/releases/latest`
                    }
                    className="btn primary"
                  >
                    <span className="btn-title">Download .AppImage</span>
                    {linuxAppImage?.size ? (
                      <span className="file-meta">{formatBytes(linuxAppImage.size)}</span>
                    ) : null}
                  </a>

                  {linuxDeb && (
                    <a href={linuxDeb.browser_download_url} className="btn secondary">
                      <span className="btn-title">.deb package</span>
                      <span className="file-meta">{formatBytes(linuxDeb.size)}</span>
                    </a>
                  )}

                  <p className="note">
                    Fedora, Ubuntu, Arch. Run <code>chmod +x</code> to execute.
                  </p>
                </div>
              </div>
            </>
          )}
        </section>
      </main>

      {/* Clean minimal footer */}
      <footer className="footer">
        <span>FuckNptel • Free & Open Source</span>
        <a
          href={`https://github.com/${REPO}/releases`}
          target="_blank"
          rel="noreferrer"
          className="footer-link"
        >
          All releases on GitHub ↗
        </a>
      </footer>
    </div>
  )
}
