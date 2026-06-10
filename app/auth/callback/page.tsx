'use client'
// app/auth/callback/page.tsx
// Procesa el token de Google OAuth antes de redirigir al inicio

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    // Supabase detecta automáticamente el ?code= o #access_token en la URL
    // gracias a detectSessionInUrl: true en supabase.ts
    // Solo esperamos a que la sesión esté lista y redirigimos
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        subscription.unsubscribe()
        router.replace('/')
      }
    })

    // Fallback: si en 3 segundos no hay evento, igual redirigimos
    const timeout = setTimeout(() => {
      router.replace('/')
    }, 3000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [router])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4"
      style={{ background: '#EFF4F0' }}>
      <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: '#0B5966', borderTopColor: 'transparent' }} />
      <p className="text-sm text-gray-500">Iniciando sesión...</p>
    </div>
  )
}
