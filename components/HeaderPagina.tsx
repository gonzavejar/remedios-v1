'use client'
// components/HeaderPagina.tsx
// Header reutilizable para todas las subpáginas.
// Incluye botón "Volver" y botón "🏠 Inicio" siempre visible.

import { useRouter } from 'next/navigation'

interface Props {
  titulo: string
  subtitulo?: string
  irA?: string   // ruta del botón Volver (por defecto usa router.back())
}

export default function HeaderPagina({ titulo, subtitulo, irA }: Props) {
  const router = useRouter()

  return (
    <div style={{ background: '#0B5966' }} className="px-6 pt-12 pb-8 text-white">
      <div className="flex items-center justify-between mb-4">
        {/* Volver */}
        <button
          onClick={() => irA ? router.push(irA) : router.back()}
          className="flex items-center gap-2 opacity-80 hover:opacity-100">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
          <span className="text-base">Volver</span>
        </button>

        {/* Inicio — siempre va a la raíz */}
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold"
          style={{ background: 'rgba(255,255,255,0.2)', color: '#FFFFFF' }}>
          🏠 Inicio
        </button>
      </div>

      <h1 className="text-2xl font-bold">{titulo}</h1>
      {subtitulo && (
        <p className="text-base mt-1" style={{ color: '#A8D8CE' }}>{subtitulo}</p>
      )}
    </div>
  )
}
