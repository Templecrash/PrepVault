import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PrepVault from './PrepVault.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import LocationSharingPage from './LocationSharingPage.jsx'
import './design-system.css'

const PublicBoardPage = lazy(() => import('./PublicBoardPage.jsx'))
const path = window.location.pathname.replace(/\/$/, '')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary><Suspense fallback={<p role="status">Opening PrepVault…</p>}>{path === '/share-location' ? <LocationSharingPage /> : path === '/community' ? <PublicBoardPage /> : <PrepVault />}</Suspense></ErrorBoundary>
  </StrictMode>,
)
