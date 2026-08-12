import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PrepVault from './PrepVault.jsx'
import FoodStorageCalculator from './FoodStorageCalculator.jsx'

const isCalculator = () => {
  const p = window.location.pathname.replace(/^\/|\/$/g, '')
  const h = window.location.hash.replace(/^#\/?/, '').split('?')[0]
  return p === 'calculator' || h === 'calculator'
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isCalculator() ? <FoodStorageCalculator /> : <PrepVault />}
  </StrictMode>,
)
