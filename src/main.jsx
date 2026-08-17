import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './analytics.js'
import PrepVault from './PrepVault.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PrepVault />
  </StrictMode>,
)
