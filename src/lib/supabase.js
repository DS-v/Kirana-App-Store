import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Warn clearly in dev if env vars aren't set yet
if (!url || url.includes('placeholder') || !key || key.includes('placeholder')) {
  console.warn(
    '[Kirana] Supabase not configured.\n' +
    'Copy .env.example → .env and fill in your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  )
}

// createClient requires valid-looking values even if auth calls will fail
const safeUrl = (url && !url.includes('placeholder')) ? url : 'https://placeholder.supabase.co'
const safeKey = (key && !key.includes('placeholder')) ? key : 'placeholder'

const supabase = createClient(safeUrl, safeKey)

export const isConfigured = !!(
  url && !url.includes('placeholder') &&
  key && !key.includes('placeholder')
)

export default supabase
