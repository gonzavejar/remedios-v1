'use client'
// app/registrar/page.tsx — versión 3
// Flujo: foto (OCR) o entrada manual.
// Precios manuales se marcan como tipo_registro='manual' para análisis posterior.

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { obtenerUsuario, obtenerCredenciales, subirFotoBoleta } from '../../lib/auth'
import EnviarEmail from '../../components/EnviarEmail'
import { htmlResumenCompra } from '../api/enviar-email/route'
import { supabase } from '../../lib/supabase'

interface ProductoBoleta {
  nombre_boleta: string
  nombre_generico: string
  precio_unitario: number
  cantidad: number
  producto_id: number | null
  nombre_confirmado: string
  tipo_descuento: string
  credencial_usada: string
  incluir: boolean
}

interface DatosBoleta {
  farmacia: string
  comuna: string | null
  fecha: string
  productos: ProductoBoleta[]
}

type Modo  = 'inicio' | 'foto' | 'manual'
type Paso  = 'inicio' | 'procesando' | 'revision' | 'enviando' | 'listo'

const PROD_VACIO: ProductoBoleta = {
  nombre_boleta: '', nombre_generico: '', precio_unitario: 0, cantidad: 1,
  producto_id: null, nombre_confirmado: '', tipo_descuento: 'ninguno',
  credencial_usada: '', incluir: true,
}

function RegistrarContent() {
  const router       = useRouter()
  const params       = useSearchParams()
  const productoId   = parseInt(params.get('producto') ?? '0')
  const fileRef      = useRef<HTMLInputElement>(null)

  const [paso, setPaso]             = useState<Paso>('inicio')
  const [modo, setModo]             = useState<Modo>('inicio')
  const [usuario, setUsuario]       = useState<any>(null)
  const [creds, setCreds]           = useState<any>(null)
  const [foto, setFoto]             = useState<File | null>(null)
  const [preview, setPreview]       = useState<string | null>(null)
  const [datos, setDatos]           = useState<DatosBoleta | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [emailHtml, setEmailHtml]   = useState('')
  const [emailUsuario, setEmailUsuario] = useState('')
  const [nombreProductoInicial, setNombreProductoInicial] = useState('')

  useEffect(() => {
    obtenerUsuario().then(u => {
      if (!u) { router.push('/auth'); return }
      setUsuario(u)
      obtenerCredenciales(u.id).then(setCreds)
    })
    if (productoId) {
      supabase.from('producto').select('nombre_comercial').eq('id', productoId).single()
        .then(({ data }) => { if (data) setNombreProductoInicial(data.nombre_comercial) })
    }
  }, [productoId, router])

  function opcionesDescuento(): { value: string; label: string }[] {
    const opts = [{ value: 'ninguno', label: 'Sin descuento (precio lista)' }]
    if (creds?.prevision?.startsWith('fonasa')) opts.push({ value: 'fonasa', label: 'Fonasa precio preferente' })
    if (creds?.prevision === 'isapre')          opts.push({ value: 'isapre', label: `Isapre ${creds.isapre_nombre ?? ''}` })
    if (creds?.caja_nombre)                     opts.push({ value: 'caja',   label: 'Caja de Compensación' })
    if (creds?.club_cruz_verde)                 opts.push({ value: 'club',   label: 'Club Cruz Verde' })
    if (creds?.club_ahumada)                    opts.push({ value: 'club',   label: 'Club Ahumada' })
    if (creds?.club_salcobrand)                 opts.push({ value: 'club',   label: 'Club Salcobrand' })
    if (creds?.club_dr_simi)                    opts.push({ value: 'club',   label: 'Club Dr. Simi' })
    if (creds?.tiene_seguro_comp)               opts.push({ value: 'isapre', label: `Seguro ${creds.seguro_comp_nombre ?? ''}` })
    opts.push({ value: 'otro', label: 'Otro descuento' })
    return opts
  }

  // ── Modo foto: OCR ────────────────────────────────────────────────────────
  async function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setFoto(archivo)
    setPreview(URL.createObjectURL(archivo))
    setError(null)
    setPaso('procesando')
    setModo('foto')

    try {
      const base64 = await archivoABase64(archivo)
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagenBase64: base64.split(',')[1], mediaType: archivo.type })
      })
      const json = await res.json()

      if (json.ok && json.datos) {
        const d = json.datos
        let productos: ProductoBoleta[] = (d.productos ?? []).map((p: any) => ({
          nombre_boleta:     p.nombre_boleta ?? '',
          nombre_generico:   p.nombre_generico ?? '',
          precio_unitario:   p.precio_unitario ?? 0,
          cantidad:          p.cantidad ?? 1,
          producto_id:       null,
          nombre_confirmado: p.nombre_generico ?? p.nombre_boleta ?? '',
          tipo_descuento:    d.tipo_descuento_detectado === 'club' ? 'club' : 'ninguno',
          credencial_usada:  '',
          incluir:           true,
        }))
        if (productoId && productos.length === 0) {
          productos = [{ ...PROD_VACIO, producto_id: productoId, nombre_confirmado: nombreProductoInicial, nombre_boleta: nombreProductoInicial }]
        }
        setDatos({ farmacia: d.farmacia ?? '', comuna: d.comuna ?? null, fecha: d.fecha ?? new Date().toISOString().split('T')[0], productos })
      } else {
        setError(json.error ?? 'No se pudo leer la boleta. Completa los datos manualmente.')
        iniciarManual()
        return
      }
      setPaso('revision')
    } catch {
      setError('Error al procesar la imagen.')
      setPaso('inicio')
    }
  }

  // ── Modo manual ───────────────────────────────────────────────────────────
  function iniciarManual() {
    setModo('manual')
    setFoto(null)
    setPreview(null)
    setDatos({
      farmacia: '',
      comuna: null,
      fecha: new Date().toISOString().split('T')[0],
      productos: productoId
        ? [{ ...PROD_VACIO, producto_id: productoId, nombre_confirmado: nombreProductoInicial, nombre_boleta: nombreProductoInicial }]
        : [{ ...PROD_VACIO }],
    })
    setError(null)
    setPaso('revision')
  }

  function archivoABase64(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(r.result as string)
      r.onerror = () => rej(new Error('error'))
      r.readAsDataURL(file)
    })
  }

  function actualizarProducto(idx: number, campo: string, valor: any) {
    setDatos(prev => {
      if (!prev) return prev
      const productos = [...prev.productos]
      productos[idx] = { ...productos[idx], [campo]: valor }
      return { ...prev, productos }
    })
  }

  function agregarProducto() {
    setDatos(prev => prev ? { ...prev, productos: [...prev.productos, { ...PROD_VACIO }] } : prev)
  }

  // ── Guardar ───────────────────────────────────────────────────────────────
  async function handleGuardar() {
    if (!usuario || !datos) return
    const incluidos = datos.productos.filter(p => p.incluir && p.precio_unitario > 0)
    if (incluidos.length === 0) { setError('Ingresa al menos un precio válido.'); return }

    setPaso('enviando')
    setError(null)

    try {
      let fotoUrl: string | null = null
      if (foto) {
        fotoUrl = await subirFotoBoleta(usuario.id, foto)
      }

      const tipoRegistro = foto ? 'foto' : 'manual'

      const inserts = incluidos.map(p => ({
        usuario_id:      usuario.id,
        producto_id:     p.producto_id ?? null,
        valor_clp:       p.precio_unitario,
        fecha_compra:    datos.fecha,
        farmacia_nombre: datos.farmacia,
        farmacia_comuna: datos.comuna ?? '',
        foto_boleta_url: fotoUrl,
        canal:           'lista',
        tipo_descuento:  p.tipo_descuento,
        credencial_usada: p.credencial_usada || null,
        tipo_registro:   tipoRegistro,
      }))

      const { error } = await supabase.from('precio_usuario').insert(inserts)
      if (error) throw error

      // Generar HTML del resumen
      const htmlEmail = htmlResumenCompra({
        farmacia: datos?.farmacia ?? '',
        fecha: datos?.fecha ?? '',
        productos: incluidos.map(p => ({
          nombre: p.nombre_confirmado || p.nombre_boleta,
          precio: p.precio_unitario,
          descuento: p.tipo_descuento,
          credencial: p.credencial_usada,
        })),
        total: incluidos.reduce((s, p) => s + p.precio_unitario, 0),
      })
      setEmailHtml(htmlEmail)
      setEmailUsuario(usuario.email ?? '')
      setPaso('listo')
    } catch (e: any) {
      setError(e.message ?? 'Error al guardar.')
      setPaso('revision')
    }
  }

  if (!usuario) return null
  const opts = opcionesDescuento()

  return (
    <main className="min-h-screen" style={{ background: '#EFF4F0' }}>
      <div style={{ background: '#0B5966' }} className="px-6 pt-12 pb-8 text-white">
        <button onClick={() => paso === 'inicio' ? router.back() : setPaso('inicio')}
          className="flex items-center gap-2 mb-4 opacity-80">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
          <span className="text-base">Volver</span>
        </button>
        <h1 className="text-2xl font-bold">Registrar compra</h1>
        <p className="text-base mt-1" style={{ color: '#A8D8CE' }}>
          {paso === 'inicio'     && 'Elige cómo ingresar los datos'}
          {paso === 'procesando' && 'Leyendo la boleta...'}
          {paso === 'revision'   && (modo === 'manual' ? 'Ingresa los datos manualmente' : 'Confirma los datos')}
          {paso === 'enviando'   && 'Guardando...'}
          {paso === 'listo'      && '¡Registrado!'}
        </p>
      </div>

      <div className="max-w-md mx-auto px-4 py-6">

        {/* Inicio: elegir modo */}
        {paso === 'inicio' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => fileRef.current?.click()}
                className="py-8 border-2 border-dashed border-gray-300 rounded-2xl bg-white flex flex-col items-center gap-2">
                <span className="text-4xl">📷</span>
                <p className="text-base font-bold text-gray-800">Cámara</p>
                <p className="text-xs text-gray-500 text-center px-2">Fotografía la boleta</p>
              </button>
              <button onClick={() => fileRef.current?.click()}
                className="py-8 border-2 border-dashed border-gray-300 rounded-2xl bg-white flex flex-col items-center gap-2">
                <span className="text-4xl">📁</span>
                <p className="text-base font-bold text-gray-800">Archivo</p>
                <p className="text-xs text-gray-500 text-center px-2">Galería o PDF</p>
              </button>
            </div>

            <button onClick={iniciarManual}
              className="w-full py-6 border-2 border-dashed border-gray-300 rounded-2xl bg-white flex items-center gap-5 px-6">
              <span className="text-4xl flex-shrink-0">✏️</span>
              <div className="text-left">
                <p className="text-lg font-bold text-gray-800">Ingresar sin boleta</p>
                <p className="text-base text-gray-500">Precio aproximado o recordado</p>
              </div>
            </button>

            {/* Aviso precios manuales */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm text-amber-800">
                ⚠️ Los precios sin foto de boleta se registran como referenciales y se usan con cautela en el análisis comunitario.
              </p>
            </div>

            <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={handleFoto} className="hidden"/>
          </div>
        )}

        {/* Procesando */}
        {paso === 'procesando' && (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
            <div className="w-12 h-12 border-t-transparent rounded-full animate-spin mx-auto mb-4"
              style={{ borderColor: '#0B5966', borderTopColor: 'transparent', borderWidth: 3 }}/>
            <p className="text-gray-800 font-semibold text-lg">Leyendo la boleta...</p>
          </div>
        )}

        {/* Revisión */}
        {paso === 'revision' && datos && (
          <div className="space-y-4">
            {modo === 'manual' && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm text-amber-800">
                  ✏️ Modo manual — Este precio quedará marcado como referencial sin boleta.
                </p>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Previsualización foto */}
            {preview && (
              <div className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm">
                <img src={preview} alt="Boleta" className="w-14 h-14 object-cover rounded-lg flex-shrink-0"/>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm">{datos.farmacia || 'Farmacia'}</p>
                  <p className="text-xs text-gray-500">{datos.fecha}</p>
                </div>
                <button onClick={() => { setFoto(null); setPreview(null); setPaso('inicio') }}
                  className="text-xs text-gray-400">Cambiar</button>
              </div>
            )}

            {/* Farmacia y fecha */}
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <h3 className="font-semibold text-gray-800">Datos de la compra</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Farmacia</label>
                  <input type="text" value={datos.farmacia}
                    onChange={e => setDatos(prev => prev ? { ...prev, farmacia: e.target.value } : prev)}
                    placeholder="Ej: Cruz Verde"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0B5966]"
                    style={{ color: '#1A2E2E' }}/>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fecha</label>
                  <input type="date" value={datos.fecha}
                    onChange={e => setDatos(prev => prev ? { ...prev, fecha: e.target.value } : prev)}
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0B5966]"
                    style={{ color: '#1A2E2E' }}/>
                </div>
              </div>
            </div>

            {/* Productos */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <h3 className="font-semibold text-gray-800 mb-3">Remedios</h3>
              <div className="space-y-4">
                {datos.productos.map((p, i) => (
                  <div key={i} className={`p-3 rounded-xl border ${p.incluir ? 'border-[#0B5966]/20' : 'border-gray-100 opacity-60'}`}>
                    <label className="flex items-start gap-2 cursor-pointer mb-3">
                      <input type="checkbox" checked={p.incluir}
                        onChange={e => actualizarProducto(i, 'incluir', e.target.checked)}
                        className="mt-1 w-4 h-4" style={{ accentColor: '#0B5966' }}/>
                      <input type="text" value={p.nombre_confirmado}
                        onChange={e => actualizarProducto(i, 'nombre_confirmado', e.target.value)}
                        placeholder="Nombre del remedio"
                        className="flex-1 text-base font-medium bg-transparent border-b border-gray-200 outline-none focus:border-[#0B5966]"
                        style={{ color: '#1A2E2E' }}/>
                    </label>
                    {p.incluir && (
                      <div className="space-y-2 pl-6">
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-500 w-16 flex-shrink-0">Precio $</label>
                          <input type="number" value={p.precio_unitario || ''}
                            onChange={e => actualizarProducto(i, 'precio_unitario', parseInt(e.target.value) || 0)}
                            placeholder="0" min={0}
                            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#0B5966]"
                            style={{ color: '#1A2E2E' }}/>
                        </div>
                        <select
                          value={`${p.tipo_descuento}|${p.credencial_usada}`}
                          onChange={e => {
                            const [tipo, cred] = e.target.value.split('|')
                            actualizarProducto(i, 'tipo_descuento', tipo)
                            actualizarProducto(i, 'credencial_usada', cred === 'undefined' ? '' : cred)
                          }}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs outline-none bg-white"
                          style={{ color: '#1A2E2E' }}>
                          {opts.map((op, j) => (
                            <option key={j} value={`${op.value}|${op.label}`}>{op.label}</option>
                          ))}
                        </select>
                        {p.tipo_descuento === 'ninguno' && !foto && (
                          <p className="text-xs text-amber-600">⚠️ Sin foto — precio referencial</p>
                        )}
                        {p.tipo_descuento === 'ninguno' && foto && (
                          <p className="text-xs text-emerald-600">✓ Contribuirá al precio comunitario</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={agregarProducto}
                className="mt-3 w-full py-2.5 rounded-xl border border-dashed border-gray-300 text-xs text-gray-500 hover:border-[#0B5966]">
                + Agregar remedio
              </button>
            </div>

            <button onClick={handleGuardar}
              disabled={datos.productos.filter(p => p.incluir && p.precio_unitario > 0).length === 0}
              className="w-full py-5 rounded-2xl text-white font-bold text-lg disabled:opacity-40"
              style={{ background: '#0B5966' }}>
              Guardar {datos.productos.filter(p => p.incluir && p.precio_unitario > 0).length} remedio(s)
            </button>
          </div>
        )}

        {/* Enviando */}
        {paso === 'enviando' && (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3"
              style={{ borderColor: '#0B5966', borderTopColor: 'transparent' }}/>
            <p className="text-gray-500 text-sm">Guardando...</p>
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
              <p className="text-gray-900 font-bold text-xl">¡Registrado!</p>
              <p className="text-gray-500 text-base mt-1">Compra guardada correctamente</p>
            </div>
            {emailHtml && (
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <EnviarEmail
                  asunto="Resumen de tu compra — Mis Remedios Chile"
                  html={emailHtml}
                  emailDefault={emailUsuario}
                  labelBoton="Enviar resumen por email"
                />
              </div>
            )}
            <button onClick={() => router.push('/')}
              className="w-full py-4 rounded-2xl text-white font-bold text-base"
              style={{ background: '#0B5966' }}>
              Volver al inicio →
            </button>
          </div>
        )}
      </div>
    </main>
  )
}

export default function RegistrarPage() {
  return (
    <Suspense fallback={
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#EFF4F0' }}>
        <div style={{ width:32, height:32, border:'2px solid #0B5966', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 1s linear infinite' }}/>
      </div>
    }>
      <RegistrarContent />
    </Suspense>
  )
}
