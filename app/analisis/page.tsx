'use client'
// app/analisis/page.tsx
// Análisis de la canasta de remedios del usuario:
// — Costo total actual vs precio CENABAST
// — Gráfico de evolución mensual
// — Desglose por medicamento

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Area, AreaChart
} from 'recharts'
import { obtenerUsuario } from '../../lib/auth'
import { supabase } from '../../lib/supabase'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Medicina {
  producto_id: number
  nombre: string
  dosis_forma: string
  precio_cenabast: number | null
  precio_lista: number | null
  ultimo_precio_usuario: number | null
  ultima_fecha: string | null
  historial: { mes: string; valor: number }[]
}

interface PuntoGrafico {
  mes: string
  pagado: number | null
  cenabast: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clp(v: number) { return '$' + Math.round(v).toLocaleString('es-CL') }
function clpCorto(v: number) {
  if (v >= 1000000) return `$${(v/1000000).toFixed(1)}M`
  if (v >= 1000)    return `$${Math.round(v/1000)}K`
  return `$${v}`
}

function mesLabel(fechaStr: string) {
  const [y, m] = fechaStr.split('-')
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${meses[parseInt(m)-1]} ${y.slice(2)}`
}

// Tooltip personalizado para el gráfico
function TooltipCustom({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white rounded-xl shadow-lg p-3 border border-gray-100 text-sm">
      <p className="font-bold text-gray-800 mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-medium">
          {p.name}: {clp(p.value)}
        </p>
      ))}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AnalisisPage() {
  const router = useRouter()
  const [usuario, setUsuario]     = useState<any>(null)
  const [medicinas, setMedicinas] = useState<Medicina[]>([])
  const [grafico, setGrafico]     = useState<PuntoGrafico[]>([])
  const [cargando, setCargando]   = useState(true)
  const [vista, setVista]         = useState<'canasta' | 'detalle'>('canasta')

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
      // 1. Remedios del usuario
      const { data: remedios } = await supabase
        .from('usuario_remedio')
        .select('producto_id, producto (nombre_comercial, dosis_forma)')
        .eq('usuario_id', uid)
        .eq('activo', true)

      if (!remedios?.length) { setCargando(false); return }

      const ids = remedios.map((r: any) => r.producto_id).filter(Boolean)

      // 2. Precios de referencia (CENABAST y lista)
      const { data: preciosRef } = await supabase
        .from('precio')
        .select('producto_id, canal, valor_clp')
        .in('producto_id', ids)
        .in('canal', ['cenabast', 'lista'])
        .eq('disponible', true)

      // 3. Historial de precios del usuario (solo sin descuento personal para ser representativo)
      const { data: historial } = await supabase
        .from('precio_usuario')
        .select('producto_id, valor_clp, fecha_compra, tipo_descuento')
        .eq('usuario_id', uid)
        .in('producto_id', ids)
        .order('fecha_compra', { ascending: true })

      // 4. Construir datos por medicina
      const medicinasData: Medicina[] = remedios.map((r: any) => {
        const pid = r.producto_id
        const nombre = (r.producto as any)?.nombre_comercial ?? 'Remedio'
        const dosis_forma = (r.producto as any)?.dosis_forma ?? ''

        const refCenabast = preciosRef?.find(p => p.producto_id === pid && p.canal === 'cenabast')
        const refLista    = preciosRef?.find(p => p.producto_id === pid && p.canal === 'lista')

        const registros = (historial ?? []).filter(h => h.producto_id === pid)

        // Último precio registrado
        const ultimo = registros[registros.length - 1]

        // Agrupar por mes (YYYY-MM)
        const porMes: Record<string, number[]> = {}
        registros.forEach(h => {
          const mes = h.fecha_compra.slice(0, 7)
          if (!porMes[mes]) porMes[mes] = []
          porMes[mes].push(h.valor_clp)
        })
        const historialMensual = Object.entries(porMes).map(([mes, valores]) => ({
          mes,
          valor: Math.round(valores.reduce((a, b) => a + b, 0) / valores.length)
        }))

        return {
          producto_id:          pid,
          nombre,
          dosis_forma,
          precio_cenabast:      refCenabast?.valor_clp ?? null,
          precio_lista:         refLista?.valor_clp ?? null,
          ultimo_precio_usuario: ultimo?.valor_clp ?? null,
          ultima_fecha:         ultimo?.fecha_compra ?? null,
          historial:            historialMensual,
        }
      })

      setMedicinas(medicinasData)

      // 5. Construir datos para el gráfico de canasta total
      // Obtener todos los meses con al menos un registro
      const todosMeses = new Set<string>()
      medicinasData.forEach(m => m.historial.forEach(h => todosMeses.add(h.mes)))
      const mesesOrdenados = Array.from(todosMeses).sort()

      // Para cada mes, calcular el total pagado (usando último precio conocido para gaps)
      const puntosGrafico: PuntoGrafico[] = mesesOrdenados.map(mes => {
        let totalPagado = 0
        let tieneAlgunDato = false

        medicinasData.forEach(m => {
          // Buscar precio de este mes o el más reciente anterior
          const pMes = m.historial.find(h => h.mes === mes)
          if (pMes) {
            totalPagado += pMes.valor
            tieneAlgunDato = true
          } else {
            // Usar último precio conocido hasta ese mes
            const anteriores = m.historial.filter(h => h.mes < mes)
            if (anteriores.length > 0) {
              totalPagado += anteriores[anteriores.length - 1].valor
              tieneAlgunDato = true
            } else if (m.precio_lista) {
              totalPagado += m.precio_lista
            }
          }
        })

        // Total CENABAST: suma de precios CENABAST de todos los medicamentos
        const totalCenabast = medicinasData.reduce((s, m) => s + (m.precio_cenabast ?? m.precio_lista ?? 0), 0)

        return {
          mes: mesLabel(mes),
          pagado:   tieneAlgunDato ? totalPagado : null,
          cenabast: totalCenabast > 0 ? totalCenabast : null,
        }
      })

      // Si no hay historial, agregar al menos un punto con los precios actuales
      if (puntosGrafico.length === 0) {
        const totalLista    = medicinasData.reduce((s, m) => s + (m.ultimo_precio_usuario ?? m.precio_lista ?? 0), 0)
        const totalCenabast = medicinasData.reduce((s, m) => s + (m.precio_cenabast ?? 0), 0)
        const hoy = new Date().toISOString().slice(0, 7)
        puntosGrafico.push({
          mes: mesLabel(hoy),
          pagado:   totalLista > 0 ? totalLista : null,
          cenabast: totalCenabast > 0 ? totalCenabast : null,
        })
      }

      setGrafico(puntosGrafico)
    } finally {
      setCargando(false)
    }
  }

  // ── Cálculos resumen ──────────────────────────────────────────────────────

  const totalActual   = medicinas.reduce((s, m) => s + (m.ultimo_precio_usuario ?? m.precio_lista ?? 0), 0)
  const totalCenabast = medicinas.reduce((s, m) => s + (m.precio_cenabast ?? 0), 0)
  const totalLista    = medicinas.reduce((s, m) => s + (m.precio_lista ?? 0), 0)
  const ahorroMensual = totalActual - totalCenabast
  const ahorroAnual   = ahorroMensual * 12

  const hayDatosCenabast = totalCenabast > 0
  const hayHistorial     = grafico.some(p => p.pagado !== null)

  // ── Render ────────────────────────────────────────────────────────────────

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
        <h1 className="text-2xl font-bold">Mi canasta de remedios</h1>
        <p className="text-base mt-1" style={{ color: '#A8D8CE' }}>
          Evolución de precios y oportunidades de ahorro
        </p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {cargando && (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
            <div className="w-10 h-10 border-t-transparent rounded-full animate-spin mx-auto mb-3"
              style={{ borderColor: '#0B5966', borderTopColor: 'transparent', borderWidth: 3 }}/>
            <p className="text-gray-600 text-base">Calculando tu canasta...</p>
          </div>
        )}

        {!cargando && medicinas.length === 0 && (
          <div className="text-center py-10">
            <p className="text-gray-700 text-lg font-medium mb-2">Sin datos aún</p>
            <p className="text-gray-500 text-base mb-5">
              Agrega remedios a tu plan y registra tus compras para ver el análisis.
            </p>
            <div className="flex gap-3">
              <button onClick={() => router.push('/plan')}
                className="flex-1 py-4 rounded-2xl text-white font-bold"
                style={{ background: '#0B5966' }}>
                💊 Mi plan
              </button>
              <button onClick={() => router.push('/registrar')}
                className="flex-1 py-4 rounded-2xl font-bold border-2"
                style={{ borderColor: '#0B5966', color: '#0B5966', background: 'white' }}>
                📷 Registrar
              </button>
            </div>
          </div>
        )}

        {!cargando && medicinas.length > 0 && (
          <>
            {/* ── Tarjetas resumen ── */}
            <div className="grid grid-cols-2 gap-3">
              {/* Costo actual */}
              <div className="bg-white rounded-2xl p-4 shadow-sm col-span-2">
                <p className="text-sm text-gray-500 mb-1">Costo mensual de tu canasta</p>
                <p className="text-3xl font-bold" style={{ color: '#1A2E2E' }}>{clp(totalActual)}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {medicinas.length} remedio{medicinas.length !== 1 ? 's' : ''}
                  {' · '}al año: <strong style={{ color: '#1A2E2E' }}>{clp(totalActual * 12)}</strong>
                </p>
              </div>

              {/* Precio CENABAST */}
              {hayDatosCenabast && (
                <div className="bg-white rounded-2xl p-4 shadow-sm"
                  style={{ borderLeft: '4px solid #0B5966' }}>
                  <p className="text-xs text-gray-500 mb-1">Con CENABAST</p>
                  <p className="text-2xl font-bold" style={{ color: '#0B5966' }}>{clp(totalCenabast)}</p>
                  <p className="text-xs text-gray-500 mt-1">por mes</p>
                </div>
              )}

              {/* Ahorro potencial */}
              {hayDatosCenabast && ahorroMensual > 0 && (
                <div className="bg-emerald-50 rounded-2xl p-4 shadow-sm"
                  style={{ borderLeft: '4px solid #1D9E75' }}>
                  <p className="text-xs text-gray-500 mb-1">Podrías ahorrar</p>
                  <p className="text-2xl font-bold" style={{ color: '#1D9E75' }}>{clp(ahorroMensual)}</p>
                  <p className="text-xs text-gray-500 mt-1">al mes · {clp(ahorroAnual)}/año</p>
                </div>
              )}
            </div>

            {/* ── Tabs ── */}
            <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm">
              <button onClick={() => setVista('canasta')}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                style={vista === 'canasta'
                  ? { background: '#0B5966', color: '#FFFFFF' }
                  : { color: '#6B7280' }}>
                📊 Evolución
              </button>
              <button onClick={() => setVista('detalle')}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                style={vista === 'detalle'
                  ? { background: '#0B5966', color: '#FFFFFF' }
                  : { color: '#6B7280' }}>
                💊 Por remedio
              </button>
            </div>

            {/* ── Gráfico de evolución ── */}
            {vista === 'canasta' && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <h2 className="text-base font-bold text-gray-800 mb-1">
                  Evolución del costo total
                </h2>
                <p className="text-xs text-gray-500 mb-4">
                  Lo que pagas vs lo que pagarías con precios CENABAST
                </p>

                {!hayHistorial ? (
                  <div className="py-8 text-center">
                    <p className="text-gray-500 text-sm">
                      Registra tus compras para ver la evolución de precios.
                    </p>
                    <button onClick={() => router.push('/registrar')}
                      className="mt-3 px-4 py-2 rounded-xl text-sm font-medium text-white"
                      style={{ background: '#0B5966' }}>
                      Registrar compra
                    </button>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={grafico} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <defs>
                        <linearGradient id="gradPagado" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#EF4444" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="gradCenabast" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#0B5966" stopOpacity={0.12}/>
                          <stop offset="95%" stopColor="#0B5966" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6"/>
                      <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false}/>
                      <YAxis
                        tick={{ fontSize: 11, fill: '#9CA3AF' }}
                        tickFormatter={clpCorto}
                        tickLine={false}
                        axisLine={false}
                        width={52}
                      />
                      <Tooltip content={<TooltipCustom/>}/>
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: 12 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="pagado"
                        name="Lo que pagas"
                        stroke="#EF4444"
                        strokeWidth={2.5}
                        fill="url(#gradPagado)"
                        connectNulls
                        dot={{ r: 4, fill: '#EF4444' }}
                        activeDot={{ r: 6 }}
                      />
                      {hayDatosCenabast && (
                        <Area
                          type="monotone"
                          dataKey="cenabast"
                          name="Precio CENABAST"
                          stroke="#0B5966"
                          strokeWidth={2}
                          strokeDasharray="5 3"
                          fill="url(#gradCenabast)"
                          connectNulls
                          dot={false}
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                )}

                {hayDatosCenabast && ahorroMensual > 0 && (
                  <div className="mt-3 p-3 rounded-xl flex items-center gap-3"
                    style={{ background: 'rgba(29,158,117,0.08)' }}>
                    <span className="text-2xl">💡</span>
                    <p className="text-sm text-gray-700">
                      Comprando en farmacias con <strong>Sello CENABAST</strong> podrías ahorrar{' '}
                      <strong style={{ color: '#1D9E75' }}>{clp(ahorroAnual)} al año</strong>.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── Tabla por remedio ── */}
            {vista === 'detalle' && (
              <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: '#F0F7F8' }}>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 min-w-[140px]">Remedio</th>
                      <th className="text-right px-3 py-3 font-semibold whitespace-nowrap" style={{ color: '#0B5966' }}>CENABAST</th>
                      <th className="text-right px-3 py-3 font-semibold text-gray-500 whitespace-nowrap">Lista</th>
                      <th className="text-right px-3 py-3 font-semibold text-gray-700 whitespace-nowrap">Último<br/>pagado</th>
                      <th className="text-right px-4 py-3 font-semibold whitespace-nowrap" style={{ color: '#1D9E75' }}>Ahorro<br/>potencial</th>
                    </tr>
                  </thead>
                  <tbody>
                    {medicinas.map((m, i) => {
                      const precioActual = m.ultimo_precio_usuario ?? m.precio_lista ?? 0
                      const ahorro = m.precio_cenabast ? precioActual - m.precio_cenabast : null
                      const pct = ahorro && precioActual ? Math.round((ahorro / precioActual) * 100) : null
                      return (
                        <tr key={m.producto_id}
                          className={`${i > 0 ? 'border-t border-gray-100' : ''} hover:bg-gray-50 transition-colors`}>
                          <td className="px-4 py-3">
                            <span className="font-semibold text-gray-800 block">{m.nombre}</span>
                            {m.dosis_forma && <span className="text-xs text-gray-400">{m.dosis_forma}</span>}
                          </td>
                          <td className="px-3 py-3 text-right font-semibold" style={{ color: '#0B5966' }}>
                            {m.precio_cenabast ? clp(m.precio_cenabast) : '—'}
                          </td>
                          <td className="px-3 py-3 text-right text-gray-500">
                            {m.precio_lista ? clp(m.precio_lista) : '—'}
                          </td>
                          <td className="px-3 py-3 text-right text-gray-800 font-medium">
                            {m.ultimo_precio_usuario ? (
                              <>
                                <span className="block">{clp(m.ultimo_precio_usuario)}</span>
                                {m.ultima_fecha && <span className="text-xs text-gray-400">{m.ultima_fecha.slice(0,7)}</span>}
                              </>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {ahorro && ahorro > 0 ? (
                              <>
                                <span className="font-bold block" style={{ color: '#1D9E75' }}>{clp(ahorro)}</span>
                                {pct && <span className="text-xs" style={{ color: '#1D9E75' }}>-{pct}%</span>}
                              </>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      )
                    })}
                    {/* Fila total */}
                    <tr className="border-t-2 border-gray-200" style={{ background: '#F0F7F8' }}>
                      <td className="px-4 py-3 font-bold text-gray-800">Total canasta</td>
                      <td className="px-3 py-3 text-right font-bold" style={{ color: '#0B5966' }}>
                        {hayDatosCenabast ? clp(totalCenabast) : '—'}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-gray-500">
                        {totalLista > 0 ? clp(totalLista) : '—'}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-gray-800">
                        {clp(totalActual)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold" style={{ color: '#1D9E75' }}>
                        {hayDatosCenabast && ahorroMensual > 0 ? clp(ahorroMensual) : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
