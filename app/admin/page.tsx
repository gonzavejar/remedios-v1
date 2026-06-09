'use client'
// app/admin/page.tsx
// Panel de administración — solo accesible para el email de administrador
// definido en NEXT_PUBLIC_ADMIN_EMAIL

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { obtenerUsuario } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ErrorBar
} from 'recharts'

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? ''

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface EstadisticaMed {
  producto_id: number
  nombre_comercial: string
  dosis_forma: string
  total_registros: number
  pendientes_validacion: number
  validados: number
  precio_promedio: number
  precio_min: number
  precio_max: number
  desviacion_std: number
  usuarios_distintos: number
  ultima_compra: string
  precio_cenabast: number | null
}

interface PrecioPendiente {
  id: number
  producto_id: number
  nombre_comercial: string
  dosis_forma: string
  valor_clp: number
  fecha_compra: string
  farmacia_nombre: string | null
  farmacia_comuna: string | null
  tipo_registro: string
  foto_boleta_url: string | null
  tipo_descuento: string
  credencial_usada: string | null
  created_at: string
}

interface Resumen {
  total_usuarios: number
  total_registros: number
  pendientes: number
  medicamentos_cubiertos: number
  registros_con_foto: number
  registros_manual: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clp(v: number | null) {
  if (!v) return '—'
  return '$' + Math.round(v).toLocaleString('es-CL')
}

function formatFecha(f: string) {
  if (!f) return '—'
  return f.slice(0, 10).split('-').reverse().join('/')
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter()
  const [acceso, setAcceso]           = useState<'cargando' | 'ok' | 'denegado'>('cargando')
  const [tab, setTab]                 = useState<'resumen' | 'pendientes' | 'estadisticas'>('resumen')
  const [resumen, setResumen]         = useState<Resumen | null>(null)
  const [estadisticas, setEstadisticas] = useState<EstadisticaMed[]>([])
  const [pendientes, setPendientes]   = useState<PrecioPendiente[]>([])
  const [cargando, setCargando]       = useState(false)
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null)
  const [busqueda, setBusqueda]       = useState('')

  useEffect(() => {
    obtenerUsuario().then(async u => {
      if (!u) { router.push('/auth'); return }
      if (!ADMIN_EMAIL || u.email !== ADMIN_EMAIL) {
        setAcceso('denegado'); return
      }
      setAcceso('ok')
      await cargarTodo()
    })
  }, [router])

  async function cargarTodo() {
    setCargando(true)
    try {
      await Promise.all([
        cargarResumen(),
        cargarEstadisticas(),
        cargarPendientes(),
      ])
    } finally {
      setCargando(false)
    }
  }

  async function cargarResumen() {
    const [
      { count: usuarios },
      { count: registros },
      { count: pend },
      { count: meds },
      { count: conFoto },
      { count: manual },
    ] = await Promise.all([
      supabase.from('perfil_usuario').select('*', { count: 'exact', head: true }),
      supabase.from('precio_usuario').select('*', { count: 'exact', head: true }),
      supabase.from('precio_usuario').select('*', { count: 'exact', head: true })
        .eq('validado', false).in('tipo_registro', ['foto', 'ocr']),
      supabase.from('precio_usuario').select('producto_id', { count: 'exact', head: true })
        .not('producto_id', 'is', null),
      supabase.from('precio_usuario').select('*', { count: 'exact', head: true })
        .eq('tipo_registro', 'foto'),
      supabase.from('precio_usuario').select('*', { count: 'exact', head: true })
        .eq('tipo_registro', 'manual'),
    ])
    setResumen({
      total_usuarios:       usuarios ?? 0,
      total_registros:      registros ?? 0,
      pendientes:           pend ?? 0,
      medicamentos_cubiertos: meds ?? 0,
      registros_con_foto:   conFoto ?? 0,
      registros_manual:     manual ?? 0,
    })
  }

  async function cargarEstadisticas() {
    const { data } = await supabase
      .from('v_admin_precios')
      .select('*')
      .order('total_registros', { ascending: false })
    setEstadisticas((data ?? []) as EstadisticaMed[])
  }

  async function cargarPendientes() {
    const { data } = await supabase
      .from('v_admin_pendientes')
      .select('*')
      .limit(100)
    setPendientes((data ?? []) as PrecioPendiente[])
  }

  async function validar(id: number) {
    await supabase.from('precio_usuario').update({ validado: true }).eq('id', id)
    setPendientes(prev => prev.filter(p => p.id !== id))
    setResumen(prev => prev ? { ...prev, pendientes: prev.pendientes - 1 } : prev)
  }

  async function rechazar(id: number) {
    if (!confirm('¿Eliminar este registro de precio?')) return
    await supabase.from('precio_usuario').delete().eq('id', id)
    setPendientes(prev => prev.filter(p => p.id !== id))
    setResumen(prev => prev ? {
      ...prev,
      pendientes:     prev.pendientes - 1,
      total_registros: prev.total_registros - 1,
    } : prev)
  }

  const estFiltradas = estadisticas.filter(e =>
    !busqueda || e.nombre_comercial.toLowerCase().includes(busqueda.toLowerCase())
  )

  // ── Render estados de acceso ──────────────────────────────────────────────

  if (acceso === 'cargando') return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#EFF4F0' }}>
      <div className="w-10 h-10 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: '#0B5966', borderTopColor: 'transparent', borderWidth: 3 }}/>
    </div>
  )

  if (acceso === 'denegado') return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#EFF4F0' }}>
      <div className="text-center">
        <p className="text-4xl mb-4">🔒</p>
        <p className="text-xl font-bold text-gray-800 mb-2">Acceso restringido</p>
        <p className="text-gray-500 mb-5">Esta sección es solo para administradores.</p>
        <button onClick={() => router.push('/')}
          className="px-6 py-3 rounded-xl text-white font-bold"
          style={{ background: '#0B5966' }}>
          Volver al inicio
        </button>
      </div>
    </div>
  )

  // ── Render panel ──────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen pb-12" style={{ background: '#EFF4F0' }}>

      {/* Header */}
      <div style={{ background: '#1A2E2E' }} className="px-6 pt-12 pb-6 text-white">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => router.push('/')} className="text-sm opacity-70 hover:opacity-100">
            ← Salir
          </button>
          <span className="text-xs px-2 py-1 rounded-full"
            style={{ background: 'rgba(255,255,255,0.15)' }}>
            Admin
          </span>
        </div>
        <h1 className="text-2xl font-bold">Panel de administración</h1>
        <p className="text-sm mt-1 opacity-70">Remedios Chile · Monitoreo de precios</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mx-4 mt-4 mb-5 bg-white rounded-xl p-1 shadow-sm">
        {([
          { key: 'resumen',       label: '📊 Resumen'    },
          { key: 'pendientes',    label: `✅ Validar (${resumen?.pendientes ?? 0})` },
          { key: 'estadisticas',  label: '📈 Precios'    },
        ] as const).map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex-1 py-2.5 rounded-lg text-xs font-semibold transition-colors"
            style={tab === key
              ? { background: '#1A2E2E', color: '#FFFFFF' }
              : { color: '#6B7280' }}>
            {label}
          </button>
        ))}
      </div>

      <div className="max-w-2xl mx-auto px-4 space-y-4">

        {/* ── Tab Resumen ── */}
        {tab === 'resumen' && resumen && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Usuarios registrados', valor: resumen.total_usuarios,       emoji: '👤' },
                { label: 'Precios registrados',  valor: resumen.total_registros,      emoji: '🧾' },
                { label: 'Pendientes de validar',valor: resumen.pendientes,           emoji: '⏳', alerta: resumen.pendientes > 0 },
                { label: 'Medicamentos cubiertos',valor: resumen.medicamentos_cubiertos, emoji: '💊' },
                { label: 'Registros con foto',   valor: resumen.registros_con_foto,   emoji: '📷' },
                { label: 'Registros manuales',   valor: resumen.registros_manual,     emoji: '✏️' },
              ].map(({ label, valor, emoji, alerta }) => (
                <div key={label} className="bg-white rounded-2xl p-4 shadow-sm"
                  style={alerta ? { borderLeft: '4px solid #EF9F27' } : {}}>
                  <p className="text-xs text-gray-500 mb-1">{emoji} {label}</p>
                  <p className="text-3xl font-bold" style={{ color: alerta ? '#B45309' : '#1A2E2E' }}>
                    {valor.toLocaleString('es-CL')}
                  </p>
                </div>
              ))}
            </div>

            {/* Gráfico de actividad — top 10 medicamentos más registrados */}
            {estadisticas.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <h2 className="text-base font-bold text-gray-800 mb-3">
                  Top medicamentos por registros
                </h2>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={estadisticas.slice(0, 10).map(e => ({
                      nombre: e.nombre_comercial.split(' ')[0],
                      registros: e.total_registros,
                    }))}
                    margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6"/>
                    <XAxis dataKey="nombre" tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false}/>
                    <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false}/>
                    <Tooltip
                      formatter={(v: any) => [`${v} registros`, '']}
                      contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,.1)' }}
                    />
                    <Bar dataKey="registros" fill="#0B5966" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}

        {/* ── Tab Validación pendiente ── */}
        {tab === 'pendientes' && (
          <>
            {pendientes.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center shadow-sm">
                <p className="text-4xl mb-3">✅</p>
                <p className="text-gray-700 font-semibold text-lg">Sin pendientes</p>
                <p className="text-gray-500 text-sm mt-1">Todos los precios con foto están validados</p>
              </div>
            ) : (
              pendientes.map(p => (
                <div key={p.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-4 py-3 flex items-start gap-3">

                    {/* Foto */}
                    {p.foto_boleta_url ? (
                      <button onClick={() => setFotoAmpliada(p.foto_boleta_url!)}
                        className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
                        <img src={p.foto_boleta_url} alt="boleta" className="w-full h-full object-cover"/>
                      </button>
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-2xl">🧾</span>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-base" style={{ color: '#1A2E2E' }}>
                        {p.nombre_comercial}
                      </p>
                      <p className="text-sm text-gray-500">{p.dosis_forma}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <p className="text-xl font-bold" style={{ color: '#0B5966' }}>
                          {clp(p.valor_clp)}
                        </p>
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: p.tipo_registro === 'foto'
                            ? 'rgba(29,158,117,0.1)' : '#FEF3C7',
                            color: p.tipo_registro === 'foto' ? '#1D9E75' : '#92400E' }}>
                          {p.tipo_registro === 'foto' ? '📷 con foto' : '✏️ manual'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatFecha(p.fecha_compra)}
                        {p.farmacia_nombre && ` · ${p.farmacia_nombre}`}
                        {p.farmacia_comuna && `, ${p.farmacia_comuna}`}
                      </p>
                      {p.tipo_descuento !== 'ninguno' && (
                        <p className="text-xs text-amber-600 mt-0.5">
                          Con descuento: {p.tipo_descuento}
                          {p.credencial_usada ? ` (${p.credencial_usada})` : ''}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="flex border-t border-gray-100">
                    <button onClick={() => rechazar(p.id)}
                      className="flex-1 py-3 text-sm font-medium text-red-500 hover:bg-red-50">
                      🗑 Rechazar
                    </button>
                    <div className="w-px bg-gray-100"/>
                    <button onClick={() => validar(p.id)}
                      className="flex-1 py-3 text-sm font-bold hover:bg-emerald-50"
                      style={{ color: '#1D9E75' }}>
                      ✓ Validar precio
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* ── Tab Estadísticas ── */}
        {tab === 'estadisticas' && (
          <>
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Filtrar por medicamento..."
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-base outline-none focus:border-[#0B5966] bg-white"
              style={{ color: '#1A2E2E' }}
            />

            {estFiltradas.map(e => {
              const variabilidad = e.precio_max && e.precio_min
                ? Math.round(((e.precio_max - e.precio_min) / e.precio_promedio) * 100)
                : 0
              const sobrePrecio = e.precio_cenabast && e.precio_promedio
                ? Math.round(((e.precio_promedio - e.precio_cenabast) / e.precio_cenabast) * 100)
                : null

              return (
                <div key={e.producto_id} className="bg-white rounded-2xl shadow-sm p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-bold text-base" style={{ color: '#1A2E2E' }}>
                        {e.nombre_comercial}
                      </p>
                      <p className="text-sm text-gray-500">{e.dosis_forma}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">{e.total_registros} registros</p>
                      <p className="text-xs text-gray-400">{e.usuarios_distintos} usuarios</p>
                      {e.pendientes_validacion > 0 && (
                        <p className="text-xs font-medium" style={{ color: '#EF9F27' }}>
                          {e.pendientes_validacion} pendiente{e.pendientes_validacion !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Métricas de precio */}
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {[
                      { label: 'Promedio',  valor: clp(e.precio_promedio), color: '#1A2E2E' },
                      { label: 'Mínimo',    valor: clp(e.precio_min),      color: '#1D9E75' },
                      { label: 'Máximo',    valor: clp(e.precio_max),      color: '#EF4444' },
                      { label: 'CENABAST',  valor: clp(e.precio_cenabast), color: '#0B5966' },
                    ].map(({ label, valor, color }) => (
                      <div key={label} className="text-center">
                        <p className="text-xs text-gray-400">{label}</p>
                        <p className="text-sm font-bold" style={{ color }}>{valor}</p>
                      </div>
                    ))}
                  </div>

                  {/* Indicadores */}
                  <div className="flex gap-2 flex-wrap">
                    {variabilidad > 0 && (
                      <span className="text-xs px-2 py-1 rounded-lg font-medium"
                        style={{
                          background: variabilidad > 50
                            ? 'rgba(239,68,68,0.1)' : variabilidad > 20
                            ? 'rgba(239,159,39,0.1)' : 'rgba(29,158,117,0.1)',
                          color: variabilidad > 50 ? '#DC2626' : variabilidad > 20 ? '#B45309' : '#1D9E75'
                        }}>
                        Variabilidad: {variabilidad}%
                      </span>
                    )}
                    {sobrePrecio !== null && sobrePrecio > 0 && (
                      <span className="text-xs px-2 py-1 rounded-lg font-medium"
                        style={{ background: 'rgba(239,159,39,0.1)', color: '#B45309' }}>
                        {sobrePrecio}% sobre CENABAST
                      </span>
                    )}
                    {e.validados > 0 && (
                      <span className="text-xs px-2 py-1 rounded-lg font-medium"
                        style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75' }}>
                        ✓ {e.validados} validado{e.validados !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-400 mt-2">
                    Última compra: {formatFecha(e.ultima_compra)}
                  </p>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* Foto ampliada */}
      {fotoAmpliada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.9)' }}
          onClick={() => setFotoAmpliada(null)}>
          <img src={fotoAmpliada} alt="Boleta" className="max-w-full max-h-full rounded-2xl"/>
          <button className="absolute top-6 right-6 text-white text-2xl font-bold">✕</button>
        </div>
      )}
    </main>
  )
}
