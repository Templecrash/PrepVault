import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PrepVault from './PrepVault.jsx'
import ChecklistPage from './ChecklistPage.jsx'

const path = (window.location.pathname || '/').replace(/\/+$/, '') || '/'
const isChecklistRoute = path === '/emergency-preparedness-checklist' || path === '/checklist'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isChecklistRoute ? <ChecklistPage /> : <PrepVault />}
  </StrictMode>,
)
