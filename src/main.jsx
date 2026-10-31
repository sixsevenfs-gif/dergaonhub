import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { captureRefFromUrl } from './lib/wallet.js'

// An invite link (?ref=CODE) is remembered before the login page opens.
captureRefFromUrl()

// The opening logo animation (index.html) plays for SPLASH_MS from the first paint (when it starts),
// then fades out. Admin and rider pages close it right away.
const SPLASH_MS = 1800
const splash = document.getElementById('splash')
if (splash) {
  const painted = performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint')?.startTime
  const shown = painted === undefined ? 0 : performance.now() - painted
  const wait = /^\/(admin|partner)/.test(window.location.pathname) ? 0 : Math.max(0, SPLASH_MS - shown)
  setTimeout(() => {
    splash.classList.add('sp-hide')
    setTimeout(() => splash.remove(), 500)
  }, wait)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
