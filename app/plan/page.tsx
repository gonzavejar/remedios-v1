'use client'
// app/plan/page.tsx
// Plan de toma diario: organiza los remedios del usuario por momento del día.
// Diseño accesible: texto grande, alto contraste, secciones claras.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { obtenerUsuario, obtenerPlanToma } from '../../lib/auth'

interface RemedioPlan {
  id: number
  producto_id: number | null
  dosis_texto: string | null
  posologia: string | null
  momento_toma: string[] | null
  notas: string | null
  producto: { nombre_comercial: string; dosis_forma: string } | null
}

const MOMENTOS = [
  { value: 'mañana',   label: 'En la mañana',   emoji: '🌅', hora: 'Al despertar' },
  { value: 'mediodia', label: 'Al mediodía',    emoji: '☀️', hora: 'Con el almuerzo' },
  { value: 'noche',    label: 'En la noche',    emoji: '🌙', hora: 'Antes de dormir' },
]

export default function PlanPage() {
  const router = useRouter()
  const [usuario, setUsuario] = useState<any>(null)
  const [remedios, setRemedios] = useState<RemedioPlan[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    obtenerUsuario().then(u => {
      if (!u) { router.push('/auth'); return }
      setUsuario(u)
      obtenerPlanToma(u.id).then(data => {
        setRemedios(data as any)
        setCargando(false)
      })
    })
  }, [router])

  function nombreRemedio(r: RemedioPlan): string {
    return r.producto?.nombre_comercial ?? r.notas ?? 'Remedio'
  }

  function remediosPorMomento(momento: string): RemedioPlan[] {
    return remedios.filter(r => (r.momento_toma ?? []).includes(momento))
  }

  const sinHorario = remedios.filter(r => !r.momento_toma || r.momento_toma.length === 0)

  if (!usuario) return null

  return (
    <main className="min-h-screen pb-12" style={{ background: '#EFF4F0' }}>
      {/* Header */}
      <div style={{ background: '#0B5966' }} className="px-6 pt-12 pb-8 text-white">
        <button onClick={() => router.push('/')} className="flex items-center gap-2 mb-4 opacity-80">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
          <span className="text-base">Volver</span>
        </button>
        <h1 className="text-2xl font-bold">Mi plan de remedios</h1>
        <p className="text-base mt-1" style={{ color: '#A8D8CE' }}>Qué tomar y cuándo</p>
      </div>

      <div className="max-w-md mx-auto px-4 py-6">

        {cargando && (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
            <div className="w-10 h-10 border-t-transparent rounded-full animate-spin mx-auto mb-3"
              style={{ borderColor: '#0B5966', borderTopColor: 'transparent', borderWidth: 3 }}/>
            <p className="text-gray-600 text-base">Cargando tu plan...</p>
          </div>
        )}

        {/* Sin remedios */}
        {!cargando && remedios.length === 0 && (
          <div className="text-center py-10">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
              style={{ background: 'rgba(11,89,102,0.1)' }}>
              <svg className="w-10 h-10" style={{ color: '#0B5966' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            </div>
            <p className="text-gray-700 text-lg font-medium mb-2">Aún no tienes un plan</p>
            <p className="text-gray-500 text-base mb-5">Escanea tu receta médica para crear tu plan de toma</p>
            <button onClick={() => router.push('/receta')}
              className="px-6 py-4 rounded-2xl text-white font-bold text-lg"
              style={{ background: '#0B5966' }}>
              📄 Escanear receta
            </button>
          </div>
        )}

        {/* Plan por momentos */}
        {!cargando && remedios.length > 0 && (
          <div className="space-y-5">
            {MOMENTOS.map(mom => {
              const lista = remediosPorMomento(mom.value)
              if (lista.length === 0) return null
              return (
                <div key={mom.value} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  {/* Cabecera del momento */}
                  <div className="px-5 py-4 flex items-center gap-3" style={{ background: 'rgba(11,89,102,0.06)' }}>
                    <span className="text-3xl">{mom.emoji}</span>
                    <div>
                      <p className="text-lg font-bold" style={{ color: '#0B5966' }}>{mom.label}</p>
                      <p className="text-sm text-gray-500">{mom.hora}</p>
                    </div>
                    <span className="ml-auto text-2xl font-bold" style={{ color: '#0B5966' }}>{lista.length}</span>
                  </div>
                  {/* Remedios de este momento */}
                  <div className="divide-y divide-gray-100">
                    {lista.map(r => (
                      <div key={r.id} className="px-5 py-4 flex items-center gap-4">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: '#1D9E75' }}/>
                        <div className="flex-1 min-w-0">
                          <p className="text-lg font-semibold text-gray-900" style={{ color: '#1A2E2E' }}>
                            {nombreRemedio(r)}
                          </p>
                          <p className="text-base text-gray-600">
                            {r.dosis_texto && <span>{r.dosis_texto} · </span>}
                            {r.posologia ?? '1 dosis'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Remedios sin horario asignado */}
            {sinHorario.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-4" style={{ background: '#F3F4F6' }}>
                  <p className="text-lg font-bold text-gray-600">Sin horario definido</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {sinHorario.map(r => (
                    <div key={r.id} className="px-5 py-4 flex items-center gap-4">
                      <div className="w-3 h-3 rounded-full flex-shrink-0 bg-gray-300"/>
                      <div className="flex-1 min-w-0">
                        <p className="text-lg font-semibold text-gray-900">{nombreRemedio(r)}</p>
                        <p className="text-base text-gray-600">{r.dosis_texto ?? ''} {r.posologia ?? ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Botón escanear otra receta */}
            <button onClick={() => router.push('/receta')}
              className="w-full py-4 rounded-2xl border-2 text-lg font-bold flex items-center justify-center gap-2"
              style={{ borderColor: '#0B5966', color: '#0B5966', background: 'white' }}>
              📄 Escanear otra receta
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
