'use client'
// app/farmacias/page.tsx
// Mapa de farmacias cercanas accesible desde el menú principal.
// No requiere buscar un remedio — muestra todas las farmacias cercanas.

import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'

const MapaFarmacias = dynamic(() => import('../../components/MapaFarmacias'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="w-10 h-10 border-t-transparent rounded-full animate-spin mb-3"
        style={{ borderColor: '#0B5966', borderTopColor: 'transparent', borderWidth: 3 }}/>
      <p className="text-gray-500 text-base">Cargando mapa...</p>
    </div>
  )
})

export default function FarmaciasPage() {
  const router = useRouter()

  return (
    <main className="min-h-screen" style={{ background: '#EFF4F0' }}>

      {/* Header */}
      <div style={{ background: '#0B5966' }} className="px-6 pt-12 pb-8 text-white">
        <button onClick={() => router.push('/')} className="flex items-center gap-2 mb-4 opacity-80">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
          <span className="text-base">Volver</span>
        </button>
        <h1 className="text-2xl font-bold">Farmacias cercanas</h1>
        <p className="text-base mt-1" style={{ color: '#A8D8CE' }}>
          Sello CENABAST · Turno · Horarios
        </p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        <MapaFarmacias />
      </div>
    </main>
  )
}
