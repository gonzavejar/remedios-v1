'use client'
// components/EnviarEmail.tsx
// Componente reutilizable: campo de email + botón enviar.
// Se usa en la pantalla de éxito de boleta y receta.

import { useState } from 'react'

interface Props {
  asunto: string
  html: string
  emailDefault?: string        // pre-rellenar con email del usuario
  labelBoton?: string
}

export default function EnviarEmail({ asunto, html, emailDefault = '', labelBoton = 'Enviar por email' }: Props) {
  const [email, setEmail]     = useState(emailDefault)
  const [enviando, setEnviando] = useState(false)
  const [ok, setOk]           = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function handleEnviar() {
    if (!email.includes('@')) { setError('Escribe un email válido.'); return }
    setEnviando(true)
    setError(null)

    try {
      const res = await fetch('/api/enviar-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinatario: email, asunto, html }),
      })
      const data = await res.json()
      if (data.ok) {
        setOk(true)
      } else {
        setError(data.error ?? 'No se pudo enviar. Intenta de nuevo.')
      }
    } catch {
      setError('Error de conexión.')
    } finally {
      setEnviando(false)
    }
  }

  if (ok) return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{ background: 'rgba(29,158,117,0.1)' }}>
      <span className="text-xl">✅</span>
      <p className="text-base font-medium" style={{ color: '#1D9E75' }}>
        Email enviado a {email}
      </p>
    </div>
  )

  return (
    <div className="space-y-2">
      <p className="text-base font-semibold text-gray-700">Enviar resumen por email</p>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="correo@ejemplo.com"
          className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 text-base outline-none focus:border-[#0B5966]"
          style={{ color: '#1A2E2E' }}
        />
        <button
          onClick={handleEnviar}
          disabled={enviando || !email}
          className="px-4 py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50 flex-shrink-0"
          style={{ background: '#0B5966' }}
        >
          {enviando ? '...' : '📧 Enviar'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
