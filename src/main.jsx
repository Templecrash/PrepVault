import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { initAnalytics } from './analytics.js'
import PrepVault from './PrepVault.jsx'

initAnalytics()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PrepVault />
  </StrictMode>,
)
