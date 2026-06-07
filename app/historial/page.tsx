'use client'
// app/historial/page.tsx
// Historial de precios registrados por el usuario, agrupados por remedio.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { obtenerUsuario } from '../../lib/auth'
import { supabase } from '../../lib/supabase'

interface RegistroPrecio {
  id: number
  producto_id: number | null
  valor_clp: number
  fecha_compra: string
  farmacia_nombre: string | null
  farmacia_comuna: string | null
  canal: string
  tipo_descuento: string
  credencial_usada: string | null
  validado: boolean
  foto_boleta_url: string | null
  producto: { nombre_comercial: string } | null
  notas?: string
}

const CANAL_LABEL: Record<string, string> = {
  lista:             'Precio lista',
  cenabast:          'Canal CENABAST',
  bioequivalente:    'Bioequivalente',
  fonasa_preferente: 'Fonasa preferente',
  comunitario:       'Precio comunitario',
}

const DESCUENTO_LABEL: Record<string, string> = {
  ninguno: 'Sin descuento',
  club:    'Club farmacia',
  caja:    'Caja Compensación',
  isapre:  'Isapre / Seguro',
  fonasa:  'Fonasa',
  otro:    'Otro descuento',
}

function clp(v: number) { return '$' + v.toLocaleString('es-CL') }

function formatFecha(f: string) {
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}`
}

export default function HistorialPage() {
  const router = useRouter()
  const [usuario, setUsuario]   = useState<any>(null)
  const [registros, setRegistros] = useState<RegistroPrecio[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtro, setFiltro]     = useState<'todos' | 'sin_descuento' | 'con_descuento'>('todos')
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null)

  useEffect(() => {
    obtenerUsuario().then(async u => {
      if (!u) { router.push('/auth'); return }
      setUsuario(u)
      const { data } = await supabase
        .from('precio_usuario')
        .select('*, producto (nombre_comercial)')
        .eq('usuario_id', u.id)
        .order('fecha_compra', { ascending: false })
      setRegistros((data ?? []) as any)
      setCargando(false)
    })
  }, [router])

  function nombreRemedio(r: RegistroPrecio) {
    return r.producto?.nombre_comercial ?? `Remedio ${r.producto_id ?? ''}`
  }

  const filtrados = registros.filter(r => {
    if (filtro === 'sin_descuento')  return r.tipo_descuento === 'ninguno'
    if (filtro === 'con_descuento')  return r.tipo_descuento !== 'ninguno'
    return true
  })

  // Agrupar por remedio
  const porRemedio = filtrados.reduce((acc, r) => {
    const key = r.producto_id?.toString() ?? 'sin-producto'
    if (!acc[key]) acc[key] = { nombre: nombreRemedio(r), registros: [] }
    acc[key].registros.push(r)
    return acc
  }, {} as Record<string, { nombre: string; registros: RegistroPrecio[] }>)

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
        <h1 className="text-2xl font-bold">Historial de precios</h1>
        <p className="text-base mt-1" style={{ color: '#A8D8CE' }}>
          {registros.length} {registros.length === 1 ? 'registro' : 'registros'} guardados
        </p>
      </div>

      <div className="max-w-md mx-auto px-4 py-5">

        {/* Filtros */}
        <div className="flex gap-2 mb-5">
          {([
            { key: 'todos',          label: 'Todos'         },
            { key: 'sin_descuento',  label: 'Sin descuento' },
            { key: 'con_descuento',  label: 'Con descuento' },
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={() => setFiltro(key)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              style={filtro === key
                ? { background: '#0B5966', color: '#FFFFFF' }
                : { background: 'white', color: '#6B7280' }}>
              {label}
            </button>
          ))}
        </div>

        {cargando && (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
            <div className="w-10 h-10 border-t-transparent rounded-full animate-spin mx-auto mb-3"
              style={{ borderColor: '#0B5966', borderTopColor: 'transparent', borderWidth: 3 }}/>
            <p className="text-gray-600 text-base">Cargando historial...</p>
          </div>
        )}

        {!cargando && registros.length === 0 && (
          <div className="text-center py-10">
            <p className="text-gray-700 text-lg font-medium mb-2">Sin registros aún</p>
            <p className="text-gray-500 text-base mb-5">Registra tus compras para ver el historial</p>
            <button onClick={() => router.push('/registrar')}
              className="px-6 py-4 rounded-2xl text-white font-bold text-base"
              style={{ background: '#0B5966' }}>
              📷 Registrar compra
            </button>
          </div>
        )}

        {/* Registros por remedio */}
        {!cargando && Object.entries(porRemedio).map(([key, grupo]) => (
          <div key={key} className="mb-5">
            <p className="text-base font-bold px-1 mb-2" style={{ color: '#1A2E2E' }}>
              💊 {grupo.nombre}
            </p>
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {grupo.registros.map((r, i) => (
                <div key={r.id} className={`px-5 py-4 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                  <div className="flex items-start gap-3">
                    {/* Foto miniatura */}
                    {r.foto_boleta_url ? (
                      <button onClick={() => setFotoAmpliada(r.foto_boleta_url!)}
                        className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
                        <img src={r.foto_boleta_url} alt="Boleta" className="w-full h-full object-cover"/>
                      </button>
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-2xl">🧾</span>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      {/* Precio principal */}
                      <div className="flex items-baseline gap-2">
                        <p className="text-xl font-bold" style={{ color: '#1A2E2E' }}>{clp(r.valor_clp)}</p>
                        {r.validado && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75' }}>
                            ✓ validado
                          </span>
                        )}
                      </div>

                      {/* Fecha y farmacia */}
                      <p className="text-base text-gray-600 mt-0.5">
                        {formatFecha(r.fecha_compra)}
                        {r.farmacia_nombre && ` · ${r.farmacia_nombre}`}
                        {r.farmacia_comuna && `, ${r.farmacia_comuna}`}
                      </p>

                      {/* Canal y descuento */}
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        <span className="text-xs px-2 py-1 rounded-lg font-medium"
                          style={{ background: 'rgba(11,89,102,0.08)', color: '#0B5966' }}>
                          {CANAL_LABEL[r.canal] ?? r.canal}
                        </span>
                        {r.tipo_descuento !== 'ninguno' && (
                          <span className="text-xs px-2 py-1 rounded-lg font-medium"
                            style={{ background: 'rgba(239,159,39,0.1)', color: '#B45309' }}>
                            {r.credencial_usada ?? DESCUENTO_LABEL[r.tipo_descuento] ?? 'Con descuento'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Botón registrar nueva compra */}
        {!cargando && registros.length > 0 && (
          <button onClick={() => router.push('/registrar')}
            className="w-full py-4 rounded-2xl text-white font-bold text-base"
            style={{ background: '#0B5966' }}>
            📷 Registrar nueva compra
          </button>
        )}
      </div>

      {/* Foto ampliada */}
      {fotoAmpliada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setFotoAmpliada(null)}>
          <img src={fotoAmpliada} alt="Boleta" className="max-w-full max-h-full rounded-2xl"/>
        </div>
      )}
    </main>
  )
}
