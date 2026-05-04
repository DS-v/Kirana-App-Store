import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Note: StrictMode intentionally omitted — it causes @supabase/gotrue-js
// auth lock contention that hangs the boot screen on first load.
ReactDOM.createRoot(document.getElementById('root')).render(<App />)
