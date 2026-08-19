import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PrepVault from './PrepVault.jsx'
import GuideDaysOfSupply from './GuideDaysOfSupply.jsx'

const GUIDE_ROUTES = ['/guides/days-of-supply-per-person']

function resolveRoute() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  return GUIDE_ROUTES.includes(path) ? 'guide-days-of-supply' : 'app'
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {resolveRoute() === 'guide-days-of-supply' ? <GuideDaysOfSupply /> : <PrepVault />}
  </StrictMode>,
)
