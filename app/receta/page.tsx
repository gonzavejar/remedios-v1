'use client'
// app/receta/page.tsx — versión 3
// Agrega opción de ingresar remedios manualmente sin escanear.

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { obtenerUsuario, agregarRemedioConPosologia } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import EnviarEmail, { textoPlanToma } from '../../components/EnviarEmail'

interface MedReceta {
  nombre: string
  dosis: string
  posologia: string
  momento: string[]
  incluir: boolean
}

type Paso = 'inicio' | 'procesando' | 'revision' | 'guardando' | 'listo'

const MOMENTOS = [
  { value: 'mañana',   label: 'Mañana',   emoji: '🌅' },
  { value: 'mediodia', label: 'Mediodía', emoji: '☀️' },
  { value: 'noche',    label: 'Noche',    emoji: '🌙' },
]

const MED_VACIA: MedReceta = {
  nombre: '', dosis: '', posologia: '', momento: [], incluir: true
}

export default function RecetaPage() {
  const router  = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [usuario, setUsuario]       = useState<any>(null)
  const [paso, setPaso]             = useState<Paso>('inicio')
  const [preview, setPreview]       = useState<string | null>(null)
  const [meds, setMeds]             = useState<MedReceta[]>([MED_VACIA])
  const [permanente, setPermanente] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [emailTexto, setEmailTexto] = useState('')
  const [emailUsuario, setEmailUsuario] = useState('')

  useEffect(() => {
    obtenerUsuario().then(u => {
      if (!u) { router.push('/auth'); return }
      setUsuario(u)
    })
  }, [router])

  // ── Modo manual: ir directo a revisión ───────────────────────────────────
  function iniciarManual() {
    setMeds([MED_VACIA])
    setPreview(null)
    setError(null)
    setPaso('revision')
  }

  // ── Modo foto: OCR ────────────────────────────────────────────────────────
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

      if (json.ok && json.datos?.medicamentos?.length > 0) {
        setMeds(json.datos.medicamentos.map((m: any) => ({
          nombre:   m.nombre ?? '',
          dosis:    m.dosis ?? '',
          posologia: m.posologia ?? '',
          momento:  Array.isArray(m.momento) ? m.momento : ['mañana'],
          incluir:  true,
        })))
        setPermanente(json.datos.permanente ?? false)
      } else {
        setError('No se pudo leer la receta. Puedes completar los datos manualmente.')
        setMeds([MED_VACIA])
      }
      setPaso('revision')
    } catch {
      setError('Error al procesar la imagen.')
      setMeds([MED_VACIA])
      setPaso('revision')
    }
  }

  function archivoABase64(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const r = new FileReader()
      r.onload  = () => res(r.result as string)
      r.onerror = () => rej(new Error('error'))
      r.readAsDataURL(file)
    })
  }

  function actualizar(idx: number, campo: string, valor: any) {
    setMeds(prev => {
      const c = [...prev]; c[idx] = { ...c[idx], [campo]: valor }; return c
    })
  }

  function toggleMomento(idx: number, momento: string) {
    setMeds(prev => {
      const c = [...prev]
      const actuales = c[idx].momento
      c[idx] = {
        ...c[idx],
        momento: actuales.includes(momento)
          ? actuales.filter(m => m !== momento)
          : [...actuales, momento]
      }
      return c
    })
  }

  function agregarMed() {
    setMeds(prev => [...prev, { ...MED_VACIA }])
  }

  function eliminarMed(idx: number) {
    setMeds(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleGuardar() {
    if (!usuario) return
    const incluidos = meds.filter(m => m.incluir && m.nombre.trim())
    if (incluidos.length === 0) { setError('Agrega al menos un remedio con nombre.'); return }

    setPaso('guardando')
    try {
      for (const m of incluidos) {
        // 1. Buscar por nombre + dosis para mayor precisión
        const queryBusqueda = m.dosis
          ? `${m.nombre} ${m.dosis}`.trim()
          : m.nombre.trim()
        const res = await fetch(`/api/buscar?q=${encodeURIComponent(queryBusqueda)}`)
        const data = await res.json()

        // 2. Verificar que el resultado tenga dosis compatible
        let productoId: number | null = null
        if (data.resultados?.length > 0) {
          const dosisNum = m.dosis?.match(/\d+/)?.[0]
          const match = dosisNum
            ? data.resultados.find((r: any) =>
                r.dosis_forma?.includes(dosisNum) ||
                r.nombre_comercial?.includes(dosisNum)
              ) ?? null
            : data.resultados[0]
          productoId = match?.id ?? null
        }

        // 3. Si no hay coincidencia exacta, crear producto nuevo (solo desde recetas escaneadas)
        if (!productoId && preview) {
          const nombreLimpio = m.nombre.trim()
          const { data: nuevo, error: errInsert } = await supabase
            .from('producto')
            .insert({
              nombre_comercial:     nombreLimpio,
              dosis_forma:          m.dosis || null,
              registro_isp:         'RECETA-AUTO',
              tiene_bioequivalente: false,
              condicion_venta:      'receta',
            })
            .select('id')
            .single()

          if (!errInsert && nuevo) {
            productoId = nuevo.id
            console.log(`Producto creado: ${nombreLimpio} ${m.dosis} (id: ${productoId})`)
          }
        }

        await agregarRemedioConPosologia({
          usuarioId:    usuario.id,
          productoId,
          nombreManual: m.nombre,
          dosisTexto:   m.dosis,
          posologia:    m.posologia,
          momentoToma:  m.momento,
          permanente,
        })
      }
      const emailTexto = textoPlanToma({
        medicamentos: incluidos.map(m => ({
          nombre:    m.nombre,
          dosis:     m.dosis,
          posologia: m.posologia,
          momento:   m.momento,
        })),
        permanente,
      })
      setEmailTexto(emailTexto)
      setEmailUsuario(usuario.email ?? '')
      setPaso('listo')
    } catch {
      setError('Error al guardar. Intenta de nuevo.')
      setPaso('revision')
    }
  }

  if (!usuario) return null

  return (
    <main className="min-h-screen" style={{ background: '#EFF4F0' }}>
      <div style={{ background: '#0B5966' }} className="px-6 pt-12 pb-8 text-white">
        <button onClick={() => paso === 'inicio' ? router.push('/') : setPaso('inicio')}
          className="flex items-center gap-2 mb-4 opacity-80">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
          <span className="text-base">Volver</span>
        </button>
        <h1 className="text-2xl font-bold">Mis remedios de receta</h1>
        <p className="text-base mt-1" style={{ color: '#A8D8CE' }}>
          {paso === 'inicio'      && 'Escanea o ingresa manualmente'}
          {paso === 'procesando'  && 'Leyendo la receta...'}
          {paso === 'revision'    && 'Revisa y confirma'}
          {paso === 'guardando'   && 'Guardando...'}
          {paso === 'listo'       && '¡Listo!'}
        </p>
      </div>

      <div className="max-w-md mx-auto px-4 py-6">

        {/* Inicio: elegir modo */}
        {paso === 'inicio' && (
          <div className="space-y-3">
            {/* Opción 1: Fotografiar */}
            <button onClick={() => fileRef.current?.click()}
              className="w-full py-8 border-2 border-dashed border-gray-300 rounded-2xl bg-white flex items-center gap-5 px-6">
              <span className="text-4xl flex-shrink-0">📷</span>
              <div className="text-left">
                <p className="text-lg font-bold text-gray-800">Fotografiar receta</p>
                <p className="text-base text-gray-500">La app lee los remedios automáticamente</p>
              </div>
            </button>

            {/* Opción 2: Subir archivo */}
            <button onClick={() => fileRef.current?.click()}
              className="w-full py-6 border-2 border-dashed border-gray-300 rounded-2xl bg-white flex items-center gap-5 px-6">
              <span className="text-4xl flex-shrink-0">📁</span>
              <div className="text-left">
                <p className="text-lg font-bold text-gray-800">Subir archivo</p>
                <p className="text-base text-gray-500">Foto de galería o PDF</p>
              </div>
            </button>

            {/* Opción 3: Manual */}
            <button onClick={iniciarManual}
              className="w-full py-6 border-2 border-dashed border-gray-300 rounded-2xl bg-white flex items-center gap-5 px-6">
              <span className="text-4xl flex-shrink-0">✏️</span>
              <div className="text-left">
                <p className="text-lg font-bold text-gray-800">Ingresar manualmente</p>
                <p className="text-base text-gray-500">Escribe los remedios y sus horarios</p>
              </div>
            </button>

            <input ref={fileRef} type="file" accept="image/*,application/pdf"
              onChange={handleFoto} className="hidden"/>

            {/* Privacidad */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm text-blue-800">
                🔒 Solo guardamos tus medicamentos y horarios. No almacenamos tu nombre, RUT ni datos del médico.
              </p>
            </div>
          </div>
        )}

        {/* Procesando */}
        {paso === 'procesando' && (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
            <div className="w-12 h-12 border-t-transparent rounded-full animate-spin mx-auto mb-4"
              style={{ borderColor: '#0B5966', borderTopColor: 'transparent', borderWidth: 3 }}/>
            <p className="text-gray-800 font-semibold text-lg">Leyendo la receta...</p>
          </div>
        )}

        {/* Revisión */}
        {paso === 'revision' && (
          <div className="space-y-4">
            {error && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-base text-amber-800">{error}</p>
              </div>
            )}

            {preview && (
              <div className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm">
                <img src={preview} alt="Receta" className="w-14 h-14 object-cover rounded-lg flex-shrink-0"/>
                <div>
                  <p className="font-medium text-gray-900 text-sm">Receta escaneada</p>
                  <button onClick={() => { setPreview(null); setPaso('inicio') }}
                    className="text-xs underline" style={{ color: '#0B5966' }}>
                    Cambiar
                  </button>
                </div>
              </div>
            )}

            <p className="text-base font-semibold text-gray-700 px-1">
              {preview ? 'Remedios detectados — revisa que estén correctos:' : 'Agrega tus remedios:'}
            </p>

            {meds.map((m, i) => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border-2"
                style={{ borderColor: m.incluir ? '#0B5966' : '#e5e7eb' }}>

                {/* Header con checkbox */}
                <div className="flex items-center gap-3 mb-3">
                  <input type="checkbox" checked={m.incluir}
                    onChange={e => actualizar(i, 'incluir', e.target.checked)}
                    className="w-5 h-5" style={{ accentColor: '#0B5966' }}/>
                  <input type="text" value={m.nombre}
                    onChange={e => actualizar(i, 'nombre', e.target.value)}
                    placeholder="Nombre del remedio"
                    className="flex-1 text-lg font-bold bg-transparent border-b-2 border-gray-200 outline-none focus:border-[#0B5966] py-1"
                    style={{ color: '#1A2E2E' }}/>
                  {meds.length > 1 && (
                    <button onClick={() => eliminarMed(i)}
                      className="text-gray-400 hover:text-red-500 text-xl">✕</button>
                  )}
                </div>

                {m.incluir && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" value={m.dosis}
                        onChange={e => actualizar(i, 'dosis', e.target.value)}
                        placeholder="Dosis: 5 mg"
                        className="px-3 py-2.5 rounded-xl border-2 border-gray-200 text-base outline-none focus:border-[#0B5966]"
                        style={{ color: '#1A2E2E' }}/>
                      <input type="text" value={m.posologia}
                        onChange={e => actualizar(i, 'posologia', e.target.value)}
                        placeholder="Ej: 1 por noche"
                        className="px-3 py-2.5 rounded-xl border-2 border-gray-200 text-base outline-none focus:border-[#0B5966]"
                        style={{ color: '#1A2E2E' }}/>
                    </div>
                    <div className="flex gap-2">
                      {MOMENTOS.map(mom => {
                        const activo = m.momento.includes(mom.value)
                        return (
                          <button key={mom.value} onClick={() => toggleMomento(i, mom.value)}
                            className="flex-1 py-3 rounded-xl text-sm font-bold"
                            style={activo
                              ? { background: '#0B5966', color: '#FFFFFF' }
                              : { background: '#F3F4F6', color: '#6B7280' }}>
                            {mom.emoji} {mom.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}

            <button onClick={agregarMed}
              className="w-full py-3.5 rounded-2xl border-2 border-dashed text-base font-semibold"
              style={{ borderColor: '#0B5966', color: '#0B5966', background: 'white' }}>
              + Agregar otro remedio
            </button>

            <label className="flex items-center gap-3 cursor-pointer bg-white rounded-2xl p-4 shadow-sm">
              <div onClick={() => setPermanente(!permanente)}
                className="w-12 h-7 rounded-full transition-colors flex items-center px-1"
                style={{ background: permanente ? '#0B5966' : '#d1d5db' }}>
                <div className="w-5 h-5 rounded-full bg-white shadow transition-transform"
                  style={{ transform: permanente ? 'translateX(20px)' : 'none' }}/>
              </div>
              <span className="text-base text-gray-800 font-medium">Tratamiento permanente / crónico</span>
            </label>

            {error && <p className="text-base text-red-700 font-medium text-center">{error}</p>}

            <button onClick={handleGuardar}
              disabled={meds.filter(m => m.incluir && m.nombre.trim()).length === 0}
              className="w-full py-5 rounded-2xl text-white font-bold text-lg disabled:opacity-40"
              style={{ background: '#0B5966' }}>
              Agregar al plan de toma
            </button>
          </div>
        )}

        {/* Guardando */}
        {paso === 'guardando' && (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
            <div className="w-12 h-12 border-t-transparent rounded-full animate-spin mx-auto mb-4"
              style={{ borderColor: '#0B5966', borderTopColor: 'transparent', borderWidth: 3 }}/>
            <p className="text-gray-800 font-semibold text-lg">Guardando tu plan...</p>
          </div>
        )}

        {/* Listo */}
        {paso === 'listo' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-9 h-9 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <p className="text-gray-900 font-bold text-xl">¡Plan guardado!</p>
            </div>
            {emailTexto && (
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <EnviarEmail
                  asunto="Tu plan de remedios — Mis Remedios Chile"
                  textoPlano={emailTexto}
                  emailDefault={emailUsuario}
                  labelBoton="Enviar plan por email"
                />
              </div>
            )}
            <button onClick={() => router.push('/plan')}
              className="w-full py-4 rounded-2xl text-white font-bold text-base"
              style={{ background: '#0B5966' }}>
              Ver mi plan →
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
