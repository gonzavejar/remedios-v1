'use client'
// app/page.tsx — versión semana 6

import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import {
  obtenerUsuario, cerrarSesion, obtenerCredenciales,
  agregarRemedio, tieneRemedio, ultimoPrecioUsuario,
  generarHints, type UsuarioActual
} from '../lib/auth'

const MapaFarmacias = dynamic(() => import('../components/MapaFarmacias'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-6">
      <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: '#0B5966', borderTopColor: 'transparent' }} />
    </div>
  )
})

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Sugerencia {
  id: number
  nombre_comercial: string
  principios: string
  dosis_forma: string
}

interface TarjetaResultado {
  tag: string
  color: 'danger' | 'success' | 'warning' | 'info' | 'neutral'
  nombreComercial: string
  principios: string
  precioLista: number | null
  precioObjetivo: number | string
  paso: string
  reglaAplicada: string
  contexto?: string
  esCombinacion: boolean
  controlado: boolean
}

const COLOR: Record<string, { bg: string; text: string; pill: string; border: string; icon: string }> = {
  danger:  { bg: 'bg-red-50',    text: 'text-red-700',    pill: 'bg-red-100 text-red-700',    border: 'border-red-200',    icon: '🔒' },
  success: { bg: 'bg-emerald-50',text: 'text-emerald-700',pill: 'bg-emerald-100 text-emerald-700',border: 'border-emerald-200',icon: '✓'  },
  warning: { bg: 'bg-amber-50',  text: 'text-amber-700',  pill: 'bg-amber-100 text-amber-700', border: 'border-amber-200',  icon: '⚠'  },
  info:    { bg: 'bg-blue-50',   text: 'text-blue-700',   pill: 'bg-blue-100 text-blue-700',   border: 'border-blue-200',   icon: 'ℹ'  },
  neutral: { bg: 'bg-gray-50',   text: 'text-gray-600',   pill: 'bg-gray-100 text-gray-600',   border: 'border-gray-200',   icon: '–'  },
}

function clp(v: number) { return '$' + v.toLocaleString('es-CL') }
const EJEMPLOS = ['losartán', 'metformina', 'adalimumab', 'iltuxam', 'clotiazepam']

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Home() {
  const router = useRouter()

  const [usuario, setUsuario]               = useState<UsuarioActual | null>(null)
  const [hints, setHints]                   = useState<string[]>([])
  const [query, setQuery]                   = useState('')
  const [sugerencias, setSugerencias]       = useState<Sugerencia[]>([])
  const [productoSel, setProductoSel]       = useState<Sugerencia | null>(null)
  const [tarjeta, setTarjeta]               = useState<TarjetaResultado | null>(null)
  const [cargando, setCargando]             = useState(false)
  const [mostrarDrop, setMostrarDrop]       = useState(false)
  const [mostrarMapa, setMostrarMapa]       = useState(false)
  const [enMisRemedios, setEnMisRemedios]   = useState(false)
  const [ultimoPrecio, setUltimoPrecio]     = useState<any>(null)
  const [agregando, setAgregando]           = useState(false)
  const [registradoOk, setRegistradoOk]     = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef    = useRef<HTMLInputElement>(null)
  const dropRef     = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Limpiar ?code= de la URL si viene del callback de Google
    // detectSessionInUrl:true en supabase.ts lo procesa automáticamente
    if (window.location.search.includes('code=')) {
      window.history.replaceState({}, '', '/')
    }

    // Leer sesión inicial
    obtenerUsuario().then(async u => {
      setUsuario(u)
      if (u) {
        const creds = await obtenerCredenciales(u.id)
        if (creds) setHints(generarHints(creds))
      }
    })

    // Escuchar cambios de auth (necesario para callback de Google)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          const u = {
            id: session.user.id,
            email: session.user.email ?? null,
            nombre: session.user.user_metadata?.full_name
              ?? session.user.email?.split('@')[0] ?? null,
            avatar_url: session.user.user_metadata?.avatar_url ?? null,
          }
          setUsuario(u)
          const creds = await obtenerCredenciales(u.id)
          if (creds) setHints(generarHints(creds))
        } else if (event === 'SIGNED_OUT') {
          setUsuario(null)
          setHints([])
        }
      }
    )

    const url = new URL(window.location.href)
    if (url.searchParams.get('registrado') === '1') {
      setRegistradoOk(true)
      window.history.replaceState({}, '', '/')
      setTimeout(() => setRegistradoOk(false), 4000)
    }

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setMostrarDrop(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (query.length < 2) { setSugerencias([]); setMostrarDrop(false); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/buscar?q=${encodeURIComponent(query)}`)
        if (res.ok) { const data = await res.json(); setSugerencias(data.resultados ?? []); setMostrarDrop(true) }
      } catch { /* silencioso */ }
    }, 300)
  }, [query])

  const seleccionar = useCallback(async (s: Sugerencia) => {
    setQuery(s.nombre_comercial)
    setSugerencias([]); setMostrarDrop(false)
    setCargando(true); setTarjeta(null); setMostrarMapa(false)
    setEnMisRemedios(false); setUltimoPrecio(null); setProductoSel(s)
    try {
      const res = await fetch(`/api/remedio?id=${s.id}`)
      if (res.ok) { const data = await res.json(); setTarjeta(data.tarjeta ?? null) }
      const u = await obtenerUsuario()
      if (u) {
        const [enLista, precio] = await Promise.all([
          tieneRemedio(u.id, s.id),
          ultimoPrecioUsuario(u.id, s.id),
        ])
        setEnMisRemedios(enLista)
        setUltimoPrecio(precio ?? null)
      }
    } finally { setCargando(false) }
  }, [])

  async function handleAgregarRemedio() {
    if (!usuario || !productoSel) return
    setAgregando(true)
    await agregarRemedio(usuario.id, productoSel.id)
    setEnMisRemedios(true); setAgregando(false)
  }

  function limpiar() {
    setQuery(''); setTarjeta(null); setSugerencias([])
    setMostrarDrop(false); setMostrarMapa(false)
    setProductoSel(null); setUltimoPrecio(null)
    inputRef.current?.focus()
  }

  const col = tarjeta ? COLOR[tarjeta.color] : null
  const principioActivo = tarjeta?.principios?.split(' + ')[0] ?? ''

  return (
    <main className="min-h-screen" style={{ background: '#EFF4F0', fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ background: '#0B5966' }} className="px-6 pt-14 pb-10 text-white">
        <div className="flex justify-between items-start mb-4">
          <div/>
          {usuario ? (
            <div className="flex items-center gap-2">
              <button onClick={() => router.push('/perfil')}
                className="text-xs px-3 py-1.5 rounded-lg border border-white/20 hover:bg-white/10 transition-colors"
                style={{ color: '#A8D8CE' }}>
                {usuario.nombre ?? 'Perfil'}
              </button>
              <button onClick={async () => { await cerrarSesion(); setUsuario(null); setHints([]) }}
                className="text-xs px-2 py-1.5 rounded-lg border border-white/20 hover:bg-white/10">
                Salir
              </button>
            </div>
          ) : (
            <button onClick={() => router.push('/auth')}
              className="text-xs px-3 py-1.5 rounded-lg border border-white/30 hover:bg-white/10 font-medium">
              Ingresar
            </button>
          )}
        </div>
        <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: '#7DD4BC' }}>
          Medicamentos · Chile
        </p>
        <h1 className="text-3xl font-bold leading-snug">¿Cuánto debería<br/>costar tu remedio?</h1>
        <p className="text-sm mt-2" style={{ color: '#A8D8CE' }}>Beneficios reales · Fuentes oficiales</p>

        {/* Accesos rápidos cuando está autenticado */}
        {/* Accesos rápidos - siempre visibles */}
        <div className="grid grid-cols-3 gap-2 mt-5">
          <button onClick={() => router.push('/farmacias')}
            className="py-3 rounded-xl text-sm font-semibold flex flex-col items-center gap-1"
            style={{ background: 'rgba(255,255,255,0.18)', color: '#FFFFFF' }}>
            🗺 <span>Farmacias</span>
          </button>
          {usuario ? (
            <>
              <button onClick={() => router.push('/plan')}
                className="py-3 rounded-xl text-sm font-semibold flex flex-col items-center gap-1"
                style={{ background: 'rgba(255,255,255,0.18)', color: '#FFFFFF' }}>
                💊 <span>Mi plan</span>
              </button>
              <button onClick={() => router.push('/receta')}
                className="py-3 rounded-xl text-sm font-semibold flex flex-col items-center gap-1"
                style={{ background: 'rgba(255,255,255,0.18)', color: '#FFFFFF' }}>
                📄 <span>Receta</span>
              </button>
              <button onClick={() => router.push('/historial')}
                className="py-3 rounded-xl text-sm font-semibold flex flex-col items-center gap-1"
                style={{ background: 'rgba(255,255,255,0.18)', color: '#FFFFFF' }}>
                🧾 <span>Historial</span>
              </button>
              <button onClick={() => router.push('/registrar')}
                className="py-3 rounded-xl text-sm font-semibold flex flex-col items-center gap-1"
                style={{ background: 'rgba(255,255,255,0.18)', color: '#FFFFFF' }}>
                📷 <span>Registrar</span>
              </button>
              <button onClick={() => router.push('/perfil')}
                className="py-3 rounded-xl text-sm font-semibold flex flex-col items-center gap-1"
                style={{ background: 'rgba(255,255,255,0.18)', color: '#FFFFFF' }}>
                🎫 <span>Convenios</span>
              </button>
            </>
          ) : (
            <>
              <div/>
              <button onClick={() => router.push('/auth')}
                className="col-span-2 py-3 rounded-xl text-sm font-bold"
                style={{ background: 'rgba(255,255,255,0.25)', color: '#FFFFFF' }}>
                Ingresar / Registrarse
              </button>
            </>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pb-16">

        {/* Confirmación registro */}
        {registradoOk && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4 -mt-2 flex items-center gap-2">
            <span className="text-emerald-600 text-sm">✓ Precio registrado correctamente</span>
          </div>
        )}

        {/* Buscador */}
        <div className="relative -mt-5 mb-5" ref={dropRef}>
          <div className="bg-white rounded-2xl shadow-lg flex items-center gap-3 px-4 py-3.5">
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input ref={inputRef} type="text" value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => sugerencias.length > 0 && setMostrarDrop(true)}
              placeholder="Nombre del remedio o principio activo..."
              className="flex-1 outline-none text-gray-900 placeholder-gray-400 text-base bg-transparent"
              autoComplete="off"/>
            {query && (
              <button onClick={limpiar} className="text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            )}
          </div>
          {mostrarDrop && sugerencias.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-20">
              {sugerencias.map((s, i) => (
                <button key={s.id} onClick={() => seleccionar(s)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                  <div className="font-semibold text-gray-900 text-sm">{s.nombre_comercial}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{s.principios} · {s.dosis_forma}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {cargando && (
          <div className="bg-white rounded-2xl p-10 text-center shadow-sm">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3"
              style={{ borderColor: '#0B5966', borderTopColor: 'transparent' }} />
            <p className="text-gray-400 text-sm">Consultando beneficios...</p>
          </div>
        )}

        {/* Tarjeta */}
        {tarjeta && col && !cargando && (
          <div className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${col.border}`}>

            <div className={`${col.bg} px-5 py-3 flex items-center justify-between gap-3`}>
              <span className="text-xs text-gray-500 font-medium truncate">{tarjeta.principios}</span>
              <span className={`text-xs font-bold px-3 py-1 rounded-full flex-shrink-0 ${col.pill}`}>
                {col.icon} {tarjeta.tag}
              </span>
            </div>

            <div className="px-5 py-5">
              <h2 className="text-lg font-bold text-gray-900 mb-4">{tarjeta.nombreComercial}</h2>

              {/* Precios */}
              <div className="flex items-end gap-5 mb-5">
                {tarjeta.precioLista && (
                  <>
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Precio de referencia</p>
                      <p className={`text-xl font-medium ${tarjeta.controlado ? 'text-gray-700' : 'text-gray-400 line-through'}`}>
                        {clp(tarjeta.precioLista)}
                      </p>
                    </div>
                    {!tarjeta.controlado && (
                      <svg className="w-5 h-5 text-gray-300 mb-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                      </svg>
                    )}
                  </>
                )}
                {!tarjeta.controlado && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Deberías pagar</p>
                    <p className={`text-2xl font-bold ${col.text}`}>
                      {typeof tarjeta.precioObjetivo === 'number' ? clp(tarjeta.precioObjetivo) : tarjeta.precioObjetivo}
                    </p>
                  </div>
                )}
              </div>

              {/* Ahorro anual */}
              {!tarjeta.controlado && tarjeta.precioLista && typeof tarjeta.precioObjetivo === 'number' &&
                tarjeta.precioObjetivo < tarjeta.precioLista && (
                <div className="mb-4 px-3 py-2 rounded-lg bg-gray-50 flex items-center gap-2">
                  <span className="text-xs text-gray-500">Ahorro estimado al año:</span>
                  <span className="text-sm font-bold text-gray-700">
                    {clp((tarjeta.precioLista - (tarjeta.precioObjetivo as number)) * 12)}
                  </span>
                </div>
              )}

              {/* Último precio del usuario */}
              {ultimoPrecio && (
                <div className="mb-4 px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-100">
                  <p className="text-xs text-blue-600 font-medium">Tu último precio registrado</p>
                  <p className="text-lg font-bold text-blue-800">{clp(ultimoPrecio.valor_clp)}</p>
                  <p className="text-xs text-blue-500">
                    {ultimoPrecio.fecha_compra} · {ultimoPrecio.farmacia_nombre ?? 'farmacia'}
                    {ultimoPrecio.credencial_usada && ` · ${ultimoPrecio.credencial_usada}`}
                    {ultimoPrecio.validado && ' ✓ validado'}
                  </p>
                </div>
              )}

              {/* Paso */}
              <div className={`rounded-xl p-4 mb-3 ${col.bg}`}>
                <div className="flex gap-3 items-start">
                  <svg className={`w-5 h-5 mt-0.5 flex-shrink-0 ${col.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                  </svg>
                  <p className={`text-sm font-medium ${col.text}`}>{tarjeta.paso}</p>
                </div>
              </div>

              {tarjeta.contexto && (
                <div className="flex gap-2 items-start mb-3">
                  <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  <p className="text-xs text-gray-500">{tarjeta.contexto}</p>
                </div>
              )}

              {/* Hints personalizados según credenciales */}
              {hints.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
                  <p className="text-xs font-medium text-gray-500 mb-2">Con tu perfil, considera además:</p>
                  {hints.map((h, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <span className="text-[#0B5966] mt-0.5 flex-shrink-0">→</span>
                      <p className="text-xs text-gray-600">{h}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Nota convenios */}
              {hints.length === 0 && (
                <div className="flex gap-2 items-start pt-3 border-t border-gray-100">
                  <svg className="w-4 h-4 text-gray-300 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
                  </svg>
                  <p className="text-xs text-gray-400">
                    Tu Isapre o Caja podrían tener un convenio adicional — pregunta en caja.{' '}
                    {usuario && (
                      <button onClick={() => router.push('/perfil')} className="underline" style={{ color: '#0B5966' }}>
                        Configura tus convenios
                      </button>
                    )}
                  </p>
                </div>
              )}
            </div>

            {/* Acciones usuario */}
            {usuario && productoSel && (
              <div className="px-5 pb-4 pt-2 border-t border-gray-100 flex gap-2">
                <button onClick={handleAgregarRemedio} disabled={enMisRemedios || agregando}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 ${
                    enMisRemedios ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d={enMisRemedios ? 'M5 13l4 4L19 7' : 'M12 4v16m8-8H4'}/>
                  </svg>
                  {enMisRemedios ? 'En mis remedios' : agregando ? 'Agregando...' : 'Mis remedios'}
                </button>
                <button onClick={() => router.push(`/registrar?producto=${productoSel.id}`)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5"
                  style={{ background: 'rgba(11,89,102,0.08)', color: '#0B5966' }}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                  </svg>
                  Registrar precio
                </button>
              </div>
            )}

            {/* Mapa */}
            <div className="border-t border-gray-100">
              <button onClick={() => setMostrarMapa(!mostrarMapa)}
                className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-medium hover:bg-gray-50"
                style={{ color: '#0B5966' }}>
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                  Ver farmacias cercanas
                </div>
                <svg className={`w-4 h-4 transition-transform ${mostrarMapa ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                </svg>
              </button>
              {mostrarMapa && (
                <div className="px-5 pb-5 pt-2">
                  <MapaFarmacias nombreMedicamento={principioActivo}/>
                </div>
              )}
            </div>

            <div className="px-5 pb-4 border-t border-gray-50 pt-3">
              <p className="text-xs text-gray-300">Regla: {tarjeta.reglaAplicada}</p>
            </div>
          </div>
        )}

        {/* Estado vacío */}
        {!tarjeta && !cargando && (
          <div className="text-center py-10">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(11,89,102,0.08)' }}>
              <svg className="w-8 h-8" style={{ color: '#0B5966' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            </div>
            <p className="text-gray-500 text-sm">Escribe el nombre de tu remedio<br/>para ver sus beneficios reales</p>
            {!usuario && (
              <p className="text-xs text-gray-400 mt-2">
                <button onClick={() => router.push('/auth')} className="underline" style={{ color: '#0B5966' }}>Ingresa</button>
                {' '}para guardar tus remedios y ver descuentos personalizados
              </p>
            )}
            <div className="flex flex-wrap gap-2 justify-center mt-5">
              {EJEMPLOS.map(ej => (
                <button key={ej} onClick={() => { setQuery(ej); inputRef.current?.focus() }}
                  className="text-xs px-3 py-1.5 rounded-full"
                  style={{ background: 'rgba(11,89,102,0.08)', color: '#0B5966' }}>
                  {ej}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
