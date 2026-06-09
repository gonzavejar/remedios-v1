'use client'
// components/BuscadorRemedio.tsx
// Campo de búsqueda con autocompletado para encontrar remedios del catálogo.
// Tolera typos: "lozartan" → sugiere "Losartán 50mg", "Losartán 100mg", etc.

import { useState, useEffect, useRef } from 'react'

interface Resultado {
  id: number
  nombre_comercial: string
  principios: string
  dosis_forma: string
  cenabast: boolean
  precio_cenabast: number | null
  precio_lista: number | null
}

interface Props {
  placeholder?: string
  onSeleccionar: (resultado: Resultado) => void
  onTextoLibre?: (texto: string) => void  // si el usuario escribe sin seleccionar
  valorInicial?: string
  label?: string
  autoFocus?: boolean
}

function clp(v: number) { return '$' + v.toLocaleString('es-CL') }

export default function BuscadorRemedio({
  placeholder = 'Ej: losartán, metformina...',
  onSeleccionar,
  onTextoLibre,
  valorInicial = '',
  label,
  autoFocus = false,
}: Props) {
  const [query, setQuery]           = useState(valorInicial)
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [cargando, setCargando]     = useState(false)
  const [abierto, setAbierto]       = useState(false)
  const [sugerencia, setSugerencia] = useState<string | null>(null)
  const [seleccionado, setSeleccionado] = useState(false)
  const inputRef  = useRef<HTMLInputElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    if (seleccionado) return
    if (query.length < 2) { setResultados([]); setAbierto(false); setSugerencia(null); return }

    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(async () => {
      setCargando(true)
      try {
        const res = await fetch(`/api/buscar?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResultados(data.resultados ?? [])
        setSugerencia(data.sugerencia ?? null)
        setAbierto((data.resultados?.length ?? 0) > 0)
      } finally {
        setCargando(false)
      }
    }, 280)

    return () => if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [query, seleccionado])

  function handleSeleccionar(r: Resultado) {
    setQuery(r.nombre_comercial)
    setResultados([])
    setAbierto(false)
    setSugerencia(null)
    setSeleccionado(true)
    onSeleccionar(r)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value)
    setSeleccionado(false)
    onTextoLibre?.(e.target.value)
  }

  function handleBlur() {
    // Esperar un momento para permitir click en sugerencias
    setTimeout(() => setAbierto(false), 180)
  }

  function handleSugerenciaClick() {
    if (sugerencia) {
      setQuery(sugerencia)
      setSeleccionado(false)
      setSugerencia(null)
    }
  }

  return (
    <div className="relative">
      {label && (
        <label className="block text-base font-semibold text-gray-700 mb-2">{label}</label>
      )}

      {/* Input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => resultados.length > 0 && setAbierto(true)}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-base outline-none focus:border-[#0B5966] pr-10"
          style={{ color: '#1A2E2E' }}
          autoComplete="off"
        />
        {/* Ícono / spinner */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {cargando
            ? <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: '#0B5966', borderTopColor: 'transparent' }}/>
            : <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
          }
        </div>
      </div>

      {/* Sugerencia de corrección */}
      {sugerencia && !abierto && query.length > 2 && (
        <button onClick={handleSugerenciaClick}
          className="mt-1 text-sm px-3 py-1 rounded-lg"
          style={{ color: '#0B5966', background: 'rgba(11,89,102,0.06)' }}>
          ¿Quisiste decir <strong>{sugerencia}</strong>?
        </button>
      )}

      {/* Dropdown de resultados */}
      {abierto && resultados.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          {resultados.map((r, i) => (
            <button
              key={r.id}
              onMouseDown={() => handleSeleccionar(r)}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors
                ${i > 0 ? 'border-t border-gray-50' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-base" style={{ color: '#1A2E2E' }}>
                    {r.nombre_comercial}
                  </p>
                  <p className="text-sm text-gray-500 truncate">
                    {r.principios}
                    {r.dosis_forma && ` · ${r.dosis_forma}`}
                  </p>
                </div>
                <div className="flex-shrink-0 text-right">
                  {r.cenabast && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium block mb-1"
                      style={{ background: 'rgba(11,89,102,0.1)', color: '#0B5966' }}>
                      CENABAST
                    </span>
                  )}
                  {r.precio_cenabast && (
                    <p className="text-sm font-bold" style={{ color: '#0B5966' }}>
                      {clp(r.precio_cenabast)}
                    </p>
                  )}
                  {!r.precio_cenabast && r.precio_lista && (
                    <p className="text-sm text-gray-500">{clp(r.precio_lista)}</p>
                  )}
                </div>
              </div>
            </button>
          ))}

          {/* Opción de ingresar manualmente si no encuentra */}
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-400 text-center">
              ¿No aparece? Escribe el nombre y continúa igual
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
