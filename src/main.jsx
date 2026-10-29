import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Welcome from './Welcome.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import LocationSharingPage from './LocationSharingPage.jsx'
import './design-system.css'
import './dark-mode.css'
import { applyTheme, preferredTheme } from './theme.js'
import { isLocalEdition } from './runtime-mode.js'

applyTheme(preferredTheme())

const PublicBoardPage = lazy(() => import('./PublicBoardPage.jsx'))
const PrepVault = lazy(() => import('./PrepVault.jsx'))
const DemoExperience = lazy(() => import('./DemoExperience.jsx'))
const path = window.location.pathname.replace(/\/$/, '')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary><Suspense fallback={<p role="status">Opening PrepVault…</p>}>{path === '/share-location' ? <LocationSharingPage /> : path === '/community' ? <PublicBoardPage /> : path === '/demo' ? <DemoExperience /> : path === '/app' || (isLocalEdition() && (path === '' || path === '/index.html')) ? <PrepVault /> : <Welcome />}</Suspense></ErrorBoundary>
  </StrictMode>,
)
