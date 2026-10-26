import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PrepVault from './PrepVault.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import LocationSharingPage from './LocationSharingPage.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>{window.location.pathname.replace(/\/$/, '') === '/share-location' ? <LocationSharingPage /> : <PrepVault />}</ErrorBoundary>
  </StrictMode>,
)
