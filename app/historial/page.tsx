'use client'
// app/historial/page.tsx — versión 4
// Una fila por remedio, columnas por tipo de precio

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { obtenerUsuario } from '../../lib/auth'
import { supabase } from '../../lib/supabase'

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

function clp(v: number | null | undefined) {
  if (!v) return '—'
  return '$' + v.toLocaleString('es-CL')
}

function formatFecha(f: string) {
  if (!f) return ''
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}`
}

export default function HistorialPage() {
  const router = useRouter()
  const [usuario, setUsuario]     = useState<any>(null)
  const [medicinas, setMedicinas] = useState<MedicinaConPrecios[]>([])
  const [cargando, setCargando]   = useState(true)
  const [tab, setTab]             = useState<'referencia' | 'compras'>('referencia')
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
      const { data: remedios } = await supabase
        .from('usuario_remedio')
        .select('producto_id, producto (nombre_comercial, dosis_forma)')
        .eq('usuario_id', uid).eq('activo', true)

      if (!remedios || remedios.length === 0) { setCargando(false); return }

      const ids = remedios.map((r: any) => r.producto_id).filter(Boolean)

      const { data: preciosRef } = await supabase
        .from('precio')
        .select('producto_id, canal, valor_clp, fuente, fecha, disponible')
        .in('producto_id', ids).eq('disponible', true)
        .order('valor_clp', { ascending: true })

      const { data: preciosUsuario } = await supabase
        .from('precio_usuario')
        .select('*, producto (nombre_comercial)')
        .eq('usuario_id', uid).in('producto_id', ids)
        .order('fecha_compra', { ascending: false })

      const mapa: Record<number, MedicinaConPrecios> = {}
      remedios.forEach((r: any) => {
        if (!r.producto_id) return
        mapa[r.producto_id] = {
          producto_id: r.producto_id,
          nombre: (r.producto as any)?.nombre_comercial ?? 'Remedio',
          dosis_forma: (r.producto as any)?.dosis_forma ?? '',
          precios_referencia: [],
          precios_usuario: [],
        }
      })
      ;(preciosRef ?? []).forEach((p: any) => { if (mapa[p.producto_id]) mapa[p.producto_id].precios_referencia.push(p) })
      ;(preciosUsuario ?? []).forEach((p: any) => { if (p.producto_id && mapa[p.producto_id]) mapa[p.producto_id].precios_usuario.push(p) })
      setMedicinas(Object.values(mapa))
    } finally {
      setCargando(false)
    }
  }

  const totalCompras = medicinas.reduce((acc, m) => acc + m.precios_usuario.length, 0)

  // Helpers para extraer precios por canal
  function getPrecio(m: MedicinaConPrecios, canal: string) {
    return m.precios_referencia.find(p => p.canal === canal)?.valor_clp ?? null
  }

  function getUltimaCompra(m: MedicinaConPrecios) {
    if (m.precios_usuario.length === 0) return null
    return m.precios_usuario[0]
  }

  function getPromedio(m: MedicinaConPrecios) {
    if (m.precios_usuario.length === 0) return null
    const vals = m.precios_usuario.map((p: any) => p.valor_clp)
    return Math.round(vals.reduce((a: number, b: number) => a + b, 0) / vals.length)
  }

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
          {totalCompras} compra{totalCompras !== 1 ? 's' : ''} registrada{totalCompras !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5">

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-white rounded-xl p-1 shadow-sm">
          <button onClick={() => setTab('referencia')}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            style={tab === 'referencia' ? { background: '#0B5966', color: '#fff' } : { color: '#6B7280' }}>
            📊 Precios
          </button>
          <button onClick={() => setTab('compras')}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            style={tab === 'compras' ? { background: '#0B5966', color: '#fff' } : { color: '#6B7280' }}>
            🧾 Compras
          </button>
          <button onClick={() => router.push('/analisis')}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            style={{ color: '#6B7280' }}>
            📈 Análisis
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

        {/* ── Tab: Precios vigentes ── */}
        {!cargando && tab === 'referencia' && medicinas.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: '#F0F7F8' }}>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 min-w-[140px]">Remedio</th>
                  <th className="text-right px-3 py-3 font-semibold whitespace-nowrap" style={{ color: '#0B5966' }}>CENABAST</th>
                  <th className="text-right px-3 py-3 font-semibold text-gray-500 whitespace-nowrap">Lista</th>
                  <th className="text-right px-3 py-3 font-semibold whitespace-nowrap" style={{ color: '#1D9E75' }}>Bioequiv.</th>
                  <th className="text-right px-4 py-3 font-semibold whitespace-nowrap" style={{ color: '#7C3AED' }}>Promedio<br/>compras</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 whitespace-nowrap">Última<br/>compra</th>
                </tr>
              </thead>
              <tbody>
                {medicinas.map((m, i) => {
                  const ultima = getUltimaCompra(m)
                  const promedio = getPromedio(m)
                  return (
                    <tr key={m.producto_id}
                      className={`${i > 0 ? 'border-t border-gray-100' : ''} hover:bg-gray-50 transition-colors`}>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-gray-800 block">{m.nombre}</span>
                        {m.dosis_forma && <span className="text-xs text-gray-400">{m.dosis_forma}</span>}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold" style={{ color: '#0B5966' }}>
                        {clp(getPrecio(m, 'cenabast'))}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-500">
                        {clp(getPrecio(m, 'lista'))}
                      </td>
                      <td className="px-3 py-3 text-right" style={{ color: '#1D9E75' }}>
                        {clp(getPrecio(m, 'bioequivalente'))}
                      </td>
                      <td className="px-4 py-3 text-right" style={{ color: '#7C3AED' }}>
                        {clp(promedio)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {ultima ? (
                          <>
                            <span className="font-semibold text-gray-800 block">{clp(ultima.valor_clp)}</span>
                            {ultima.foto_boleta_url ? (
                              <button onClick={() => setFotoAmpliada(ultima.foto_boleta_url)}
                                className="text-xs underline" style={{ color: '#0B5966' }}>
                                🧾 boleta
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">{formatFecha(ultima.fecha_compra)}</span>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Tab: Mis compras ── */}
        {!cargando && tab === 'compras' && (
          <>
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
              <p className="text-sm text-amber-800">
                ⚠️ Precios sin boleta se muestran con cautela.
              </p>
            </div>

            {totalCompras > 0 ? (
              <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: '#F0F7F8' }}>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Remedio</th>
                      <th className="text-left px-3 py-3 font-semibold text-gray-600">Fecha</th>
                      <th className="text-left px-3 py-3 font-semibold text-gray-600">Farmacia</th>
                      <th className="text-left px-3 py-3 font-semibold text-gray-600">Descuento</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-600">Precio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {medicinas.map(m =>
                      m.precios_usuario.map((r: any) => (
                        <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <span className="font-semibold text-gray-800">{m.nombre}</span>
                            {r.foto_boleta_url ? (
                              <button onClick={() => setFotoAmpliada(r.foto_boleta_url)}
                                className="block text-xs underline mt-0.5" style={{ color: '#0B5966' }}>
                                🧾 ver boleta
                              </button>
                            ) : (
                              <span className="block text-xs text-amber-600 mt-0.5">✏️ sin boleta</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-gray-500 whitespace-nowrap">
                            {formatFecha(r.fecha_compra)}
                          </td>
                          <td className="px-3 py-3 text-gray-500 text-xs max-w-[100px]">
                            <span className="block truncate">{r.farmacia_nombre || '—'}</span>
                            {r.farmacia_comuna && <span className="text-gray-400">{r.farmacia_comuna}</span>}
                          </td>
                          <td className="px-3 py-3">
                            {r.tipo_descuento && r.tipo_descuento !== 'ninguno' ? (
                              <span className="text-xs px-2 py-0.5 rounded-full"
                                style={{ background: 'rgba(239,159,39,0.12)', color: '#B45309' }}>
                                {r.credencial_usada || r.tipo_descuento}
                              </span>
                            ) : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-bold" style={{ color: '#1A2E2E' }}>{clp(r.valor_clp)}</span>
                            {r.validado && <span className="block text-xs" style={{ color: '#1D9E75' }}>✓</span>}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500 text-base">No tienes compras registradas aún.</p>
              </div>
            )}

            <button onClick={() => router.push('/registrar')}
              className="w-full py-4 rounded-2xl text-white font-bold text-base mt-4"
              style={{ background: '#0B5966' }}>
              📷 Registrar nueva compra
            </button>
          </>
        )}
      </div>

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
