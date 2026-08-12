import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PrepVault from './PrepVault.jsx'
import FamilyEmergencyPlan from './FamilyEmergencyPlan.jsx'

const path = window.location.pathname.replace(/\/+$/, '') || '/'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {path === '/family-emergency-plan' ? <FamilyEmergencyPlan /> : <PrepVault />}
  </StrictMode>,
)
