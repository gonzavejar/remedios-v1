'use client'
// app/auth/page.tsx

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { registrarConEmail, iniciarSesionEmail, iniciarSesionGoogle } from '../../lib/auth'

type Modo = 'login' | 'registro'

export default function AuthPage() {
  const router = useRouter()
  const [modo, setModo]         = useState<Modo>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [info, setInfo]         = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault()
    setCargando(true); setError(null); setInfo(null)
    if (modo === 'registro') {
      const { error } = await registrarConEmail(email, password)
      if (error) setError(traducirError(error.message))
      else setInfo('Revisa tu email para confirmar el registro.')
    } else {
      const { error } = await iniciarSesionEmail(email, password)
      if (error) setError(traducirError(error.message))
      else { router.push('/'); router.refresh() }
    }
    setCargando(false)
  }

  async function handleGoogle() {
    setCargando(true); setError(null)
    const { error } = await iniciarSesionGoogle()
    if (error) setError(traducirError(error.message))
    setCargando(false)
  }

  return (
    <main className="min-h-screen flex flex-col" style={{ background: '#EFF4F0' }}>
      <div style={{ background: '#0B5966' }} className="px-6 pt-12 pb-8 text-white">
        <button onClick={() => router.push('/')}
          className="flex items-center gap-2 mb-4 opacity-70 hover:opacity-100">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
          <span className="text-sm">Volver</span>
        </button>
        <h1 className="text-2xl font-bold">{modo === 'login' ? 'Ingresar' : 'Crear cuenta'}</h1>
        <p className="text-sm mt-1" style={{ color: '#A8D8CE' }}>Para guardar tus remedios y registrar precios</p>
      </div>

      <div className="max-w-md mx-auto w-full px-4 py-8">
        {info && <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5"><p className="text-sm text-blue-700">{info}</p></div>}
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5"><p className="text-sm text-red-700">{error}</p></div>}

        <button onClick={handleGoogle} disabled={cargando}
          className="w-full flex items-center justify-center gap-3 bg-white border border-gray-200 rounded-xl py-3.5 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm mb-4">
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continuar con Google
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-gray-200"/><span className="text-xs text-gray-400">o con email</span><div className="flex-1 h-px bg-gray-200"/>
        </div>

        <form onSubmit={handleEmail} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="tu@email.com"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-[#0B5966]"/>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
              placeholder={modo === 'registro' ? 'Mínimo 8 caracteres' : '••••••••'}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-[#0B5966]"/>
          </div>
          <button type="submit" disabled={cargando}
            className="w-full py-3.5 rounded-xl text-white font-medium text-sm disabled:opacity-60"
            style={{ background: '#0B5966' }}>
            {cargando ? 'Cargando...' : modo === 'login' ? 'Ingresar' : 'Crear cuenta'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-5">
          {modo === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
          <button onClick={() => { setModo(modo === 'login' ? 'registro' : 'login'); setError(null); setInfo(null) }}
            className="font-medium underline" style={{ color: '#0B5966' }}>
            {modo === 'login' ? 'Regístrate' : 'Inicia sesión'}
          </button>
        </p>
      </div>
    </main>
  )
}

function traducirError(msg: string): string {
  if (msg.includes('Invalid login'))       return 'Email o contraseña incorrectos.'
  if (msg.includes('Email not confirmed')) return 'Confirma tu email antes de ingresar.'
  if (msg.includes('already registered')) return 'Este email ya está registrado.'
  if (msg.includes('Password should'))    return 'La contraseña debe tener al menos 8 caracteres.'
  return 'Algo salió mal. Intenta de nuevo.'
}
