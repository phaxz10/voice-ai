import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

async function start() {
  // Opt-in render profiler. Keep it out of normal dev sessions and production.
  if (import.meta.env.DEV && import.meta.env.VITE_REACT_SCAN === '1') {
    const { scan } = await import('react-scan')
    scan({ enabled: true })
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
