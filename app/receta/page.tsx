'use client'
// app/receta/page.tsx
// Escanea una receta médica, extrae medicamentos + posología (sin datos personales)
// y los agrega a Mis remedios con su horario de toma.
// Diseño accesible: texto grande, alto contraste, botones amplios.

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { obtenerUsuario, agregarRemedioConPosologia } from '../../lib/auth'

interface MedReceta {
  nombre: string
  dosis: string
  posologia: string
  momento: string[]
  incluir: boolean
}

type Paso = 'foto' | 'procesando' | 'revision' | 'guardando' | 'listo'

const MOMENTOS = [
  { value: 'mañana',   label: 'Mañana',   emoji: '🌅' },
  { value: 'mediodia', label: 'Mediodía', emoji: '☀️' },
  { value: 'noche',    label: 'Noche',    emoji: '🌙' },
]

export default function RecetaPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [usuario, setUsuario] = useState<any>(null)
  const [paso, setPaso]       = useState<Paso>('foto')
  const [preview, setPreview] = useState<string | null>(null)
  const [meds, setMeds]       = useState<MedReceta[]>([])
  const [permanente, setPermanente] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    obtenerUsuario().then(u => {
      if (!u) { router.push('/auth'); return }
      setUsuario(u)
    })
  }, [router])

  async function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setPreview(URL.createObjectURL(archivo))
    setError(null)
    setPaso('procesando')

    try {
      const base64 = await archivoABase64(archivo)
      const res = await fetch('/api/ocr-receta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagenBase64: base64.split(',')[1], mediaType: archivo.type })
      })
      const json = await res.json()

      if (json.ok && json.datos?.medicamentos) {
        setMeds(json.datos.medicamentos.map((m: any) => ({
          nombre: m.nombre ?? '',
          dosis: m.dosis ?? '',
          posologia: m.posologia ?? '',
          momento: Array.isArray(m.momento) ? m.momento : ['mañana'],
          incluir: true,
        })))
        setPermanente(json.datos.permanente ?? false)
        setPaso('revision')
      } else {
        setError(json.error ?? 'No se pudo leer la receta.')
        setPaso('foto')
      }
    } catch {
      setError('Error al procesar la imagen.')
      setPaso('foto')
    }
  }

  function archivoABase64(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(r.result as string)
      r.onerror = () => rej(new Error('error'))
      r.readAsDataURL(file)
    })
  }

  function actualizar(idx: number, campo: string, valor: any) {
    setMeds(prev => {
      const copia = [...prev]
      copia[idx] = { ...copia[idx], [campo]: valor }
      return copia
    })
  }

  function toggleMomento(idx: number, momento: string) {
    setMeds(prev => {
      const copia = [...prev]
      const actuales = copia[idx].momento
      copia[idx] = {
        ...copia[idx],
        momento: actuales.includes(momento)
          ? actuales.filter(m => m !== momento)
          : [...actuales, momento]
      }
      return copia
    })
  }

  async function handleGuardar() {
    if (!usuario) return
    const incluidos = meds.filter(m => m.incluir)
    if (incluidos.length === 0) { setError('Selecciona al menos un remedio.'); return }

    setPaso('guardando')
    try {
      for (const m of incluidos) {
        // Buscar el producto en el catálogo
        const res = await fetch(`/api/buscar?q=${encodeURIComponent(m.nombre)}`)
        const data = await res.json()
        const productoId = data.resultados?.[0]?.id ?? null

        await agregarRemedioConPosologia({
          usuarioId:   usuario.id,
          productoId,
          nombreManual: m.nombre,
          dosisTexto:  m.dosis,
          posologia:   m.posologia,
          momentoToma: m.momento,
          permanente,
        })
      }
      setPaso('listo')
      setTimeout(() => router.push('/plan'), 1500)
    } catch {
      setError('Error al guardar. Intenta de nuevo.')
      setPaso('revision')
    }
  }

  if (!usuario) return null

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
        <h1 className="text-2xl font-bold">Escanear receta</h1>
        <p className="text-base mt-1" style={{ color: '#A8D8CE' }}>
          {paso === 'foto'       && 'Fotografía tu receta médica'}
          {paso === 'procesando' && 'Leyendo la receta...'}
          {paso === 'revision'   && 'Revisa tus remedios'}
          {paso === 'guardando'  && 'Guardando...'}
          {paso === 'listo'      && '¡Listo!'}
        </p>
      </div>

      <div className="max-w-md mx-auto px-4 py-6">

        {/* Paso 1: Foto */}
        {paso === 'foto' && (
          <div>
            <button onClick={() => fileRef.current?.click()}
              className="w-full py-14 border-2 border-dashed border-gray-300 rounded-2xl bg-white flex flex-col items-center gap-3 mb-4">
              <svg className="w-14 h-14 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              <div className="text-center px-4">
                <p className="text-gray-800 font-semibold text-lg">Fotografiar receta</p>
                <p className="text-base text-gray-500 mt-1">Leeremos tus remedios y cómo tomarlos</p>
              </div>
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFoto} className="hidden"/>

            {/* Nota de privacidad */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
              <p className="text-base text-blue-800">
                🔒 Solo guardamos tus medicamentos y horarios. No almacenamos tu nombre, RUT ni datos del documento.
              </p>
            </div>

            {error && <p className="text-base text-red-700 text-center font-medium">{error}</p>}
          </div>
        )}

        {/* Paso 2: Procesando */}
        {paso === 'procesando' && (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
            <div className="w-12 h-12 border-3 border-t-transparent rounded-full animate-spin mx-auto mb-4"
              style={{ borderColor: '#0B5966', borderTopColor: 'transparent', borderWidth: 3 }}/>
            <p className="text-gray-800 font-semibold text-lg">Leyendo la receta...</p>
          </div>
        )}

        {/* Paso 3: Revisión */}
        {paso === 'revision' && (
          <div className="space-y-4">
            {error && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-base text-amber-800">{error}</p>
              </div>
            )}

            <p className="text-base text-gray-700 px-1 font-medium">
              Encontramos estos remedios. Revisa que estén correctos:
            </p>

            {meds.map((m, i) => (
              <div key={i} className={`rounded-2xl p-4 shadow-sm border-2 ${m.incluir ? 'bg-white' : 'bg-gray-50 opacity-60'}`}
                style={{ borderColor: m.incluir ? '#0B5966' : '#e5e7eb' }}>

                {/* Nombre + checkbox */}
                <label className="flex items-start gap-3 cursor-pointer mb-3">
                  <input type="checkbox" checked={m.incluir}
                    onChange={e => actualizar(i, 'incluir', e.target.checked)}
                    className="mt-1 w-5 h-5" style={{ accentColor: '#0B5966' }}/>
                  <div className="flex-1">
                    <input type="text" value={m.nombre}
                      onChange={e => actualizar(i, 'nombre', e.target.value)}
                      className="w-full text-lg font-bold text-gray-900 bg-transparent border-b-2 border-gray-200 outline-none focus:border-[#0B5966] py-1"
                      style={{ color: '#1A2E2E' }}/>
                    <input type="text" value={m.dosis}
                      onChange={e => actualizar(i, 'dosis', e.target.value)}
                      placeholder="Dosis"
                      className="w-full text-base text-gray-600 bg-transparent outline-none mt-1"/>
                  </div>
                </label>

                {m.incluir && (
                  <div className="pl-8">
                    <p className="text-base text-gray-600 mb-2">{m.posologia}</p>
                    <p className="text-sm font-medium text-gray-500 mb-2">¿Cuándo lo tomas?</p>
                    <div className="flex gap-2">
                      {MOMENTOS.map(mom => {
                        const activo = m.momento.includes(mom.value)
                        return (
                          <button key={mom.value} onClick={() => toggleMomento(i, mom.value)}
                            className="flex-1 py-3 rounded-xl text-base font-semibold transition-colors"
                            style={activo
                              ? { background: '#0B5966', color: '#FFFFFF' }
                              : { background: '#F3F4F6', color: '#4B5563' }}>
                            {mom.emoji} {mom.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Permanente */}
            <label className="flex items-center gap-3 cursor-pointer bg-white rounded-2xl p-4 shadow-sm">
              <div onClick={() => setPermanente(!permanente)}
                className="w-12 h-7 rounded-full transition-colors flex items-center px-1 flex-shrink-0"
                style={{ background: permanente ? '#0B5966' : '#d1d5db' }}>
                <div className="w-5 h-5 rounded-full bg-white shadow transition-transform"
                  style={{ transform: permanente ? 'translateX(20px)' : 'none' }}/>
              </div>
              <span className="text-base text-gray-800 font-medium">Tratamiento permanente</span>
            </label>

            {error && <p className="text-base text-red-700 text-center font-medium">{error}</p>}

            <button onClick={handleGuardar}
              className="w-full py-5 rounded-2xl text-white font-bold text-lg"
              style={{ background: '#0B5966' }}>
              Agregar a mi plan de remedios
            </button>
          </div>
        )}

        {/* Paso 4: Guardando */}
        {paso === 'guardando' && (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
            <div className="w-12 h-12 border-t-transparent rounded-full animate-spin mx-auto mb-4"
              style={{ borderColor: '#0B5966', borderTopColor: 'transparent', borderWidth: 3 }}/>
            <p className="text-gray-800 font-semibold text-lg">Guardando tu plan...</p>
          </div>
        )}

        {/* Paso 5: Listo */}
        {paso === 'listo' && (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-9 h-9 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <p className="text-gray-900 font-bold text-xl">¡Plan guardado!</p>
            <p className="text-gray-600 text-base mt-1">Mostrando tu plan de toma...</p>
          </div>
        )}
      </div>
    </main>
  )
}
