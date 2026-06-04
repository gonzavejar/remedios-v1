'use client'
// app/page.tsx — Pantalla principal de la app

import { useState, useEffect, useRef, useCallback } from 'react'

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

// ─── Configuración de colores por tipo de resultado ──────────────────────────

const COLOR: Record<string, { bg: string; text: string; pill: string; border: string; icon: string }> = {
  danger:  { bg: 'bg-red-50',    text: 'text-red-700',    pill: 'bg-red-100 text-red-700',    border: 'border-red-200',    icon: '🔒' },
  success: { bg: 'bg-emerald-50',text: 'text-emerald-700',pill: 'bg-emerald-100 text-emerald-700',border: 'border-emerald-200',icon: '✓'  },
  warning: { bg: 'bg-amber-50',  text: 'text-amber-700',  pill: 'bg-amber-100 text-amber-700', border: 'border-amber-200',  icon: '⚠'  },
  info:    { bg: 'bg-blue-50',   text: 'text-blue-700',   pill: 'bg-blue-100 text-blue-700',   border: 'border-blue-200',   icon: 'ℹ'  },
  neutral: { bg: 'bg-gray-50',   text: 'text-gray-600',   pill: 'bg-gray-100 text-gray-600',   border: 'border-gray-200',   icon: '–'  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clp(v: number) {
  return '$' + v.toLocaleString('es-CL')
}

const EJEMPLOS = ['losartán', 'levotiroxina', 'adalimumab', 'iltuxam', 'clotiazepam']

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Home() {
  const [query, setQuery]           = useState('')
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  const [tarjeta, setTarjeta]       = useState<TarjetaResultado | null>(null)
  const [cargando, setCargando]     = useState(false)
  const [mostrarDrop, setMostrarDrop] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef    = useRef<HTMLInputElement>(null)
  const dropRef     = useRef<HTMLDivElement>(null)

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setMostrarDrop(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Autocompletado con debounce
  useEffect(() => {
    if (query.length < 2) { setSugerencias([]); setMostrarDrop(false); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/buscar?q=${encodeURIComponent(query)}`)
        if (res.ok) {
          const data = await res.json()
          setSugerencias(data.resultados ?? [])
          setMostrarDrop(true)
        }
      } catch { /* silencioso */ }
    }, 300)
  }, [query])

  // Seleccionar producto del dropdown
  const seleccionar = useCallback(async (s: Sugerencia) => {
    setQuery(s.nombre_comercial)
    setSugerencias([])
    setMostrarDrop(false)
    setCargando(true)
    setTarjeta(null)
    try {
      const res = await fetch(`/api/remedio?id=${s.id}`)
      if (res.ok) {
        const data = await res.json()
        setTarjeta(data.tarjeta ?? null)
      }
    } finally {
      setCargando(false)
    }
  }, [])

  // Limpiar búsqueda
  function limpiar() {
    setQuery('')
    setTarjeta(null)
    setSugerencias([])
    setMostrarDrop(false)
    inputRef.current?.focus()
  }

  const col = tarjeta ? COLOR[tarjeta.color] : null

  return (
    <main className="min-h-screen" style={{ background: '#EFF4F0', fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ background: '#0B5966' }} className="px-6 pt-14 pb-10 text-white">
        <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: '#7DD4BC' }}>
          Medicamentos · Chile
        </p>
        <h1 className="text-3xl font-bold leading-snug">
          ¿Cuánto debería<br />costar tu remedio?
        </h1>
        <p className="text-sm mt-2" style={{ color: '#A8D8CE' }}>
          Beneficios reales · Fuentes oficiales
        </p>
      </div>

      <div className="max-w-lg mx-auto px-4 pb-16">

        {/* ── Buscador ── */}
        <div className="relative -mt-5 mb-5" ref={dropRef}>
          <div className="bg-white rounded-2xl shadow-lg flex items-center gap-3 px-4 py-3.5">
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => sugerencias.length > 0 && setMostrarDrop(true)}
              placeholder="Nombre del remedio o principio activo..."
              className="flex-1 outline-none text-gray-900 placeholder-gray-400 text-base bg-transparent"
              autoComplete="off"
            />
            {query && (
              <button onClick={limpiar} className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Dropdown de sugerencias */}
          {mostrarDrop && sugerencias.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-20">
              {sugerencias.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => seleccionar(s)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${i > 0 ? 'border-t border-gray-50' : ''}`}
                >
                  <div className="font-semibold text-gray-900 text-sm">{s.nombre_comercial}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{s.principios} · {s.dosis_forma}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Cargando ── */}
        {cargando && (
          <div className="bg-white rounded-2xl p-10 text-center shadow-sm">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3"
              style={{ borderColor: '#0B5966', borderTopColor: 'transparent' }} />
            <p className="text-gray-400 text-sm">Consultando beneficios...</p>
          </div>
        )}

        {/* ── Tarjeta de resultado ── */}
        {tarjeta && col && !cargando && (
          <div className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${col.border}`}>

            {/* Encabezado de color */}
            <div className={`${col.bg} px-5 py-3 flex items-center justify-between gap-3`}>
              <span className="text-xs text-gray-500 font-medium truncate">{tarjeta.principios}</span>
              <span className={`text-xs font-bold px-3 py-1 rounded-full flex-shrink-0 ${col.pill}`}>
                {col.icon} {tarjeta.tag}
              </span>
            </div>

            <div className="px-5 py-5">

              {/* Nombre del producto */}
              <h2 className="text-lg font-bold text-gray-900 mb-4">{tarjeta.nombreComercial}</h2>

              {/* Precio de referencia — siempre visible para cualquier medicamento */}
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
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    )}
                  </>
                )}
                {!tarjeta.controlado && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Deberías pagar</p>
                    <p className={`text-2xl font-bold ${col.text}`}>
                      {typeof tarjeta.precioObjetivo === 'number'
                        ? clp(tarjeta.precioObjetivo)
                        : tarjeta.precioObjetivo}
                    </p>
                  </div>
                )}
              </div>

              {/* Ahorro anual (solo cuando hay dos precios numéricos) */}
              {!tarjeta.controlado && tarjeta.precioLista && typeof tarjeta.precioObjetivo === 'number' && tarjeta.precioObjetivo < tarjeta.precioLista && (
                <div className="mb-4 px-3 py-2 rounded-lg bg-gray-50 flex items-center gap-2">
                  <span className="text-xs text-gray-500">Ahorro estimado al año:</span>
                  <span className="text-sm font-bold text-gray-700">
                    {clp((tarjeta.precioLista - (tarjeta.precioObjetivo as number)) * 12)}
                  </span>
                </div>
              )}

              {/* Siguiente paso */}
              <div className={`rounded-xl p-4 mb-3 ${col.bg}`}>
                <div className="flex gap-3 items-start">
                  <svg className={`w-5 h-5 mt-0.5 flex-shrink-0 ${col.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  <p className={`text-sm font-medium ${col.text}`}>{tarjeta.paso}</p>
                </div>
              </div>

              {/* Nota de contexto */}
              {tarjeta.contexto && (
                <div className="flex gap-2 items-start mb-3">
                  <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-gray-500">{tarjeta.contexto}</p>
                </div>
              )}

              {/* Nota de convenios (fase 2) */}
              <div className="flex gap-2 items-start pt-3 border-t border-gray-100">
                <svg className="w-4 h-4 text-gray-300 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                <p className="text-xs text-gray-400">
                  Tu Isapre o Caja podrían tener un convenio adicional — pregunta en caja.
                </p>
              </div>
            </div>

            {/* Regla aplicada (transparencia) */}
            <div className="px-5 pb-4 border-t border-gray-50 pt-3">
              <p className="text-xs text-gray-300">Regla: {tarjeta.reglaAplicada}</p>
            </div>
          </div>
        )}

        {/* ── Estado vacío ── */}
        {!tarjeta && !cargando && (
          <div className="text-center py-10">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(11,89,102,0.08)' }}>
              <svg className="w-8 h-8" style={{ color: '#0B5966' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-gray-500 text-sm">
              Escribe el nombre de tu remedio<br />para ver sus beneficios reales
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-5">
              {EJEMPLOS.map(ej => (
                <button
                  key={ej}
                  onClick={() => { setQuery(ej); inputRef.current?.focus() }}
                  className="text-xs px-3 py-1.5 rounded-full transition-colors"
                  style={{ background: 'rgba(11,89,102,0.08)', color: '#0B5966' }}
                >
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
