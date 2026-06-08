'use client'
// app/historial/page.tsx — versión 2
// Muestra precios de referencia (CENABAST, lista, comunitario)
// más las compras registradas por el usuario.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { obtenerUsuario } from '../../lib/auth'
import { supabase } from '../../lib/supabase'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PrecioReferencia {
  canal: string
  valor_clp: number
  fuente: string
  fecha: string
  disponible: boolean
}

interface MedicinaConPrecios {
  producto_id: number
  nombre: string
  dosis_forma: string
  precios_referencia: PrecioReferencia[]
  precios_usuario: any[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clp(v: number) { return '$' + v.toLocaleString('es-CL') }

function formatFecha(f: string) {
  if (!f) return ''
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}`
}

const CANAL_INFO: Record<string, { label: string; emoji: string; color: string }> = {
  lista:             { label: 'Precio lista',       emoji: '🏪', color: '#6B7280' },
  cenabast:          { label: 'Sello CENABAST',      emoji: '🏥', color: '#0B5966' },
  bioequivalente:    { label: 'Bioequivalente',      emoji: '💊', color: '#1D9E75' },
  fonasa_preferente: { label: 'Fonasa preferente',   emoji: '🏛', color: '#2563EB' },
  comunitario:       { label: 'Precio comunitario',  emoji: '👥', color: '#7C3AED' },
}

const DESCUENTO_LABEL: Record<string, string> = {
  ninguno: 'Sin descuento',
  club:    'Club farmacia',
  caja:    'Caja Compensación',
  isapre:  'Isapre / Seguro',
  fonasa:  'Fonasa',
  otro:    'Otro descuento',
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function HistorialPage() {
  const router = useRouter()
  const [usuario, setUsuario]         = useState<any>(null)
  const [medicinas, setMedicinas]     = useState<MedicinaConPrecios[]>([])
  const [cargando, setCargando]       = useState(true)
  const [tab, setTab]                 = useState<'referencia' | 'compras'>('referencia')
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null)

  useEffect(() => {
    obtenerUsuario().then(async u => {
      if (!u) { router.push('/auth'); return }
      setUsuario(u)
      await cargarDatos(u.id)
    })
  }, [router])

  async function cargarDatos(uid: string) {
    setCargando(true)
    try {
      // 1. Obtener remedios del usuario
      const { data: remedios } = await supabase
        .from('usuario_remedio')
        .select('producto_id, producto (nombre_comercial, dosis_forma)')
        .eq('usuario_id', uid)
        .eq('activo', true)

      if (!remedios || remedios.length === 0) {
        setCargando(false)
        return
      }

      const ids = remedios.map((r: any) => r.producto_id).filter(Boolean)

      // 2. Obtener precios de referencia (tabla precio — fuentes oficiales)
      const { data: preciosRef } = await supabase
        .from('precio')
        .select('producto_id, canal, valor_clp, fuente, fecha, disponible')
        .in('producto_id', ids)
        .eq('disponible', true)
        .order('valor_clp', { ascending: true })

      // 3. Obtener precios registrados por el usuario
      const { data: preciosUsuario } = await supabase
        .from('precio_usuario')
        .select('*, producto (nombre_comercial)')
        .eq('usuario_id', uid)
        .in('producto_id', ids)
        .order('fecha_compra', { ascending: false })

      // 4. Combinar por producto
      const mapa: Record<number, MedicinaConPrecios> = {}
      remedios.forEach((r: any) => {
        if (!r.producto_id) return
        mapa[r.producto_id] = {
          producto_id:        r.producto_id,
          nombre:             (r.producto as any)?.nombre_comercial ?? 'Remedio',
          dosis_forma:        (r.producto as any)?.dosis_forma ?? '',
          precios_referencia: [],
          precios_usuario:    [],
        }
      })

      ;(preciosRef ?? []).forEach((p: any) => {
        if (mapa[p.producto_id]) {
          mapa[p.producto_id].precios_referencia.push(p)
        }
      })

      ;(preciosUsuario ?? []).forEach((p: any) => {
        if (p.producto_id && mapa[p.producto_id]) {
          mapa[p.producto_id].precios_usuario.push(p)
        }
      })

      setMedicinas(Object.values(mapa))
    } finally {
      setCargando(false)
    }
  }

  const totalCompras = medicinas.reduce((acc, m) => acc + m.precios_usuario.length, 0)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen pb-12" style={{ background: '#EFF4F0' }}>

      <div style={{ background: '#0B5966' }} className="px-6 pt-12 pb-8 text-white">
        <button onClick={() => router.push('/')} className="flex items-center gap-2 mb-4 opacity-80">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
          <span className="text-base">Volver</span>
        </button>
        <h1 className="text-2xl font-bold">Historial de precios</h1>
        <p className="text-base mt-1" style={{ color: '#A8D8CE' }}>
          {totalCompras} compra{totalCompras !== 1 ? 's' : ''} registrada{totalCompras !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="max-w-md mx-auto px-4 py-5">

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-white rounded-xl p-1 shadow-sm">
          <button onClick={() => setTab('referencia')}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            style={tab === 'referencia'
              ? { background: '#0B5966', color: '#FFFFFF' }
              : { color: '#6B7280' }}>
            📊 Precios vigentes
          </button>
          <button onClick={() => setTab('compras')}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            style={tab === 'compras'
              ? { background: '#0B5966', color: '#FFFFFF' }
              : { color: '#6B7280' }}>
            🧾 Mis compras
          </button>
        </div>

        {cargando && (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
            <div className="w-10 h-10 border-t-transparent rounded-full animate-spin mx-auto mb-3"
              style={{ borderColor: '#0B5966', borderTopColor: 'transparent', borderWidth: 3 }}/>
            <p className="text-gray-600 text-base">Cargando...</p>
          </div>
        )}

        {!cargando && medicinas.length === 0 && (
          <div className="text-center py-10">
            <p className="text-gray-700 text-lg font-medium mb-2">Sin datos aún</p>
            <p className="text-gray-500 text-base mb-5">Agrega remedios a tu plan para ver sus precios</p>
            <button onClick={() => router.push('/plan')}
              className="px-6 py-4 rounded-2xl text-white font-bold text-base"
              style={{ background: '#0B5966' }}>
              💊 Ir al plan
            </button>
          </div>
        )}

        {/* Tab: Precios de referencia */}
        {!cargando && tab === 'referencia' && medicinas.map(m => (
          <div key={m.producto_id} className="mb-5">
            <p className="text-base font-bold px-1 mb-2" style={{ color: '#1A2E2E' }}>
              💊 {m.nombre}
              {m.dosis_forma && <span className="text-sm font-normal text-gray-500"> · {m.dosis_forma}</span>}
            </p>

            {m.precios_referencia.length === 0 ? (
              <div className="bg-white rounded-2xl px-5 py-4 shadow-sm">
                <p className="text-base text-gray-400 italic">Sin precios de referencia disponibles</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {m.precios_referencia.map((p, i) => {
                  const info = CANAL_INFO[p.canal] ?? { label: p.canal, emoji: '💰', color: '#6B7280' }
                  return (
                    <div key={i} className={`px-5 py-4 flex items-center gap-4 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                      <span className="text-2xl flex-shrink-0">{info.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-semibold" style={{ color: '#1A2E2E' }}>{info.label}</p>
                        <p className="text-sm text-gray-500">
                          {p.fuente}
                          {p.fecha && ` · ${formatFecha(p.fecha)}`}
                        </p>
                      </div>
                      <p className="text-xl font-bold flex-shrink-0" style={{ color: info.color }}>
                        {clp(p.valor_clp)}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}

        {/* Tab: Mis compras */}
        {!cargando && tab === 'compras' && (
          <>
            {/* Aviso precios manuales */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
              <p className="text-sm text-amber-800">
                ⚠️ Los precios ingresados sin foto de boleta se muestran con cautela — pueden no reflejar el precio real de lista.
              </p>
            </div>

            {medicinas.map(m => {
              if (m.precios_usuario.length === 0) return null
              return (
                <div key={m.producto_id} className="mb-5">
                  <p className="text-base font-bold px-1 mb-2" style={{ color: '#1A2E2E' }}>
                    💊 {m.nombre}
                  </p>
                  <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    {m.precios_usuario.map((r: any, i: number) => {
                      const esManual = r.tipo_registro === 'manual' || !r.foto_boleta_url
                      return (
                        <div key={r.id} className={`px-5 py-4 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                          <div className="flex items-start gap-3">
                            {/* Foto o ícono */}
                            {r.foto_boleta_url ? (
                              <button onClick={() => setFotoAmpliada(r.foto_boleta_url)}
                                className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0">
                                <img src={r.foto_boleta_url} alt="Boleta" className="w-full h-full object-cover"/>
                              </button>
                            ) : (
                              <div className="w-14 h-14 rounded-xl flex-shrink-0 flex items-center justify-center"
                                style={{ background: esManual ? '#FEF3C7' : '#F3F4F6' }}>
                                <span className="text-2xl">{esManual ? '✏️' : '🧾'}</span>
                              </div>
                            )}

                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <p className="text-xl font-bold" style={{ color: '#1A2E2E' }}>
                                  {clp(r.valor_clp)}
                                </p>
                                {esManual && (
                                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                    style={{ background: '#FEF3C7', color: '#92400E' }}>
                                    Sin boleta
                                  </span>
                                )}
                                {r.validado && (
                                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                    style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75' }}>
                                    ✓ validado
                                  </span>
                                )}
                              </div>
                              <p className="text-base text-gray-600 mt-0.5">
                                {formatFecha(r.fecha_compra)}
                                {r.farmacia_nombre && ` · ${r.farmacia_nombre}`}
                                {r.farmacia_comuna && `, ${r.farmacia_comuna}`}
                              </p>
                              <div className="flex flex-wrap gap-2 mt-1.5">
                                <span className="text-xs px-2 py-1 rounded-lg font-medium"
                                  style={{ background: 'rgba(11,89,102,0.08)', color: '#0B5966' }}>
                                  {CANAL_INFO[r.canal]?.label ?? r.canal}
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
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {totalCompras === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500 text-base">No tienes compras registradas aún.</p>
              </div>
            )}

            <button onClick={() => router.push('/registrar')}
              className="w-full py-4 rounded-2xl text-white font-bold text-base mt-2"
              style={{ background: '#0B5966' }}>
              📷 Registrar nueva compra
            </button>
          </>
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
