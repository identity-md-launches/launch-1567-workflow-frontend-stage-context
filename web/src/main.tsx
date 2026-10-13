import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { DeploymentProvider } from './hooks/useDeployment'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DeploymentProvider>
      <App />
    </DeploymentProvider>
  </StrictMode>,
)
