'use client'
// app/registrar/page.tsx — versión 2
// Flujo: 1) Foto → 2) OCR automático → 3) Revisar items + descuentos → 4) Guardar

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { obtenerUsuario, obtenerCredenciales, subirFotoBoleta } from '../../lib/auth'
import { supabase } from '../../lib/supabase'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ProductoBoleta {
  nombre_boleta: string
  nombre_generico: string
  precio_unitario: number
  cantidad: number
  // campos que el usuario completa/confirma
  producto_id: number | null
  nombre_confirmado: string
  tipo_descuento: string
  credencial_usada: string
  incluir: boolean
}

interface DatosBoleta {
  farmacia: string
  comuna: string | null
  fecha: string | null
  productos: ProductoBoleta[]
  descuento_detectado: boolean
  tipo_descuento_detectado: string
}

type Paso = 'foto' | 'procesando' | 'revision' | 'enviando' | 'listo'

function RegistrarContent() {
  const router     = useRouter()
  const params     = useSearchParams()
  const productoId = parseInt(params.get('producto') ?? '0')
  const fileRef    = useRef<HTMLInputElement>(null)

  const [paso, setPaso]         = useState<Paso>('foto')
  const [usuario, setUsuario]   = useState<any>(null)
  const [creds, setCreds]       = useState<any>(null)
  const [foto, setFoto]         = useState<File | null>(null)
  const [preview, setPreview]   = useState<string | null>(null)
  const [datos, setDatos]       = useState<DatosBoleta | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [nombreProductoInicial, setNombreProductoInicial] = useState('')

  useEffect(() => {
    obtenerUsuario().then(u => {
      if (!u) { router.push('/auth'); return }
      setUsuario(u)
      obtenerCredenciales(u.id).then(setCreds)
    })
    if (productoId) {
      supabase.from('producto').select('nombre_comercial, principios:producto_principio(principio_activo(nombre))')
        .eq('id', productoId).single()
        .then(({ data }) => {
          if (data) setNombreProductoInicial(data.nombre_comercial)
        })
    }
  }, [productoId, router])

  // Opciones de descuento según credenciales
  function opcionesDescuento(): { value: string; label: string }[] {
    const opts = [{ value: 'ninguno', label: 'Sin descuento (precio lista)' }]
    if (creds?.prevision?.startsWith('fonasa')) opts.push({ value: 'fonasa', label: 'Fonasa precio preferente' })
    if (creds?.prevision === 'isapre')          opts.push({ value: 'isapre', label: `Isapre ${creds.isapre_nombre ?? ''}` })
    if (creds?.caja_nombre)                     opts.push({ value: 'caja',   label: 'Caja de Compensación' })
    if (creds?.club_cruz_verde)                 opts.push({ value: 'club',   label: 'Club Cruz Verde' })
    if (creds?.club_ahumada)                    opts.push({ value: 'club',   label: 'Club Ahumada' })
    if (creds?.club_salcobrand)                 opts.push({ value: 'club',   label: 'Club Salcobrand' })
    if (creds?.club_dr_simi)                    opts.push({ value: 'club',   label: 'Club Dr. Simi' })
    if (creds?.tiene_seguro_comp)               opts.push({ value: 'isapre', label: `Seguro ${creds.seguro_comp_nombre ?? 'complementario'}` })
    opts.push({ value: 'otro', label: 'Otro descuento' })
    return opts
  }

  // ── Paso 1: seleccionar foto ──────────────────────────────────────────────

  async function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setFoto(archivo)
    setPreview(URL.createObjectURL(archivo))
    setError(null)
    await procesarOCR(archivo)
  }

  // ── Paso 2: OCR ───────────────────────────────────────────────────────────

  async function procesarOCR(archivo: File) {
    setPaso('procesando')
    try {
      // Comprimir imagen antes de enviar
      const base64 = await archivoABase64(archivo)
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagenBase64: base64.split(',')[1], mediaType: archivo.type })
      })
      const json = await res.json()

      if (json.ok && json.datos) {
        const d = json.datos as any

        // Si venimos con un producto específico y no hay productos en boleta
        let productos: ProductoBoleta[] = (d.productos ?? []).map((p: any) => ({
          nombre_boleta:    p.nombre_boleta ?? '',
          nombre_generico:  p.nombre_generico ?? '',
          precio_unitario:  p.precio_unitario ?? 0,
          cantidad:         p.cantidad ?? 1,
          producto_id:      null,
          nombre_confirmado: p.nombre_generico ?? p.nombre_boleta ?? '',
          tipo_descuento:   d.tipo_descuento_detectado === 'club' ? 'club' :
                            d.tipo_descuento_detectado === 'convenio' ? 'caja' : 'ninguno',
          credencial_usada: '',
          incluir:          true,
        }))

        // Si venimos con producto específico y no se detectó, agregar uno manual
        if (productoId && productos.length === 0) {
          productos = [{
            nombre_boleta: nombreProductoInicial,
            nombre_generico: nombreProductoInicial,
            precio_unitario: 0,
            cantidad: 1,
            producto_id: productoId,
            nombre_confirmado: nombreProductoInicial,
            tipo_descuento: 'ninguno',
            credencial_usada: '',
            incluir: true,
          }]
        }

        setDatos({
          farmacia: d.farmacia ?? '',
          comuna:   d.comuna ?? null,
          fecha:    d.fecha ?? new Date().toISOString().split('T')[0],
          productos,
          descuento_detectado:       d.descuento_detectado ?? false,
          tipo_descuento_detectado:  d.tipo_descuento_detectado ?? 'ninguno',
        })
        setPaso('revision')
      } else {
        // OCR falló — modo manual con producto si viene uno
        setDatos({
          farmacia: '', comuna: null,
          fecha: new Date().toISOString().split('T')[0],
          productos: productoId ? [{
            nombre_boleta: nombreProductoInicial, nombre_generico: nombreProductoInicial,
            precio_unitario: 0, cantidad: 1, producto_id: productoId,
            nombre_confirmado: nombreProductoInicial, tipo_descuento: 'ninguno',
            credencial_usada: '', incluir: true,
          }] : [],
          descuento_detectado: false, tipo_descuento_detectado: 'ninguno',
        })
        setError(json.error ?? 'No se pudo leer la boleta. Completa los datos manualmente.')
        setPaso('revision')
      }
    } catch {
      setError('Error al procesar la imagen.')
      setPaso('foto')
    }
  }

  function archivoABase64(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const reader = new FileReader()
      reader.onload  = () => res(reader.result as string)
      reader.onerror = () => rej(new Error('Error leyendo archivo'))
      reader.readAsDataURL(file)
    })
  }

  // ── Paso 3: actualizar un producto en la lista ────────────────────────────

  function actualizarProducto(idx: number, campo: string, valor: any) {
    setDatos(prev => {
      if (!prev) return prev
      const productos = [...prev.productos]
      productos[idx] = { ...productos[idx], [campo]: valor }
      return { ...prev, productos }
    })
  }

  function agregarProductoManual() {
    setDatos(prev => {
      if (!prev) return prev
      return {
        ...prev,
        productos: [...prev.productos, {
          nombre_boleta: '', nombre_generico: '', precio_unitario: 0,
          cantidad: 1, producto_id: null, nombre_confirmado: '',
          tipo_descuento: 'ninguno', credencial_usada: '', incluir: true,
        }]
      }
    })
  }

  // ── Paso 4: guardar ───────────────────────────────────────────────────────

  async function handleGuardar() {
    if (!usuario || !datos) return
    const incluidos = datos.productos.filter(p => p.incluir && p.precio_unitario > 0)
    if (incluidos.length === 0) { setError('Selecciona al menos un remedio con precio.'); return }

    setPaso('enviando')
    setError(null)

    try {
      // Subir foto si existe
      const fotoUrl = foto ? await subirFotoBoleta(usuario.id, foto) : null

      // Insertar un registro por cada producto incluido
      const inserts = incluidos.map(p => ({
        usuario_id:      usuario.id,
        producto_id:     p.producto_id ?? null,
        valor_clp:       p.precio_unitario,
        fecha_compra:    datos.fecha ?? new Date().toISOString().split('T')[0],
        farmacia_nombre: datos.farmacia,
        farmacia_comuna: datos.comuna ?? '',
        foto_boleta_url: fotoUrl ?? null,
        canal:           'lista',
        tipo_descuento:  p.tipo_descuento,
        credencial_usada: p.credencial_usada || null,
      }))

      const { error } = await supabase.from('precio_usuario').insert(inserts)
      if (error) throw error

      setPaso('listo')
      setTimeout(() => router.push('/?registrado=1'), 2000)
    } catch (e: any) {
      setError(e.message ?? 'Error al guardar. Intenta de nuevo.')
      setPaso('revision')
    }
  }

  if (!usuario) return null

  const opts = opcionesDescuento()

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen" style={{ background: '#EFF4F0' }}>
      <div style={{ background: '#0B5966' }} className="px-6 pt-12 pb-8 text-white">
        <button onClick={() => router.back()} className="flex items-center gap-2 mb-4 opacity-70 hover:opacity-100">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
          <span className="text-sm">Volver</span>
        </button>
        <h1 className="text-2xl font-bold">Registrar compra</h1>
        <p className="text-sm mt-1" style={{ color: '#A8D8CE' }}>
          {paso === 'foto'      && 'Fotografía tu boleta'}
          {paso === 'procesando'&& 'Leyendo la boleta...'}
          {paso === 'revision'  && 'Confirma los datos'}
          {paso === 'enviando'  && 'Guardando...'}
          {paso === 'listo'     && '¡Listo!'}
        </p>
      </div>

      <div className="max-w-md mx-auto px-4 py-6">

        {/* ── Paso 1: Foto ── */}
        {paso === 'foto' && (
          <div>
            {preview ? (
              <div className="relative rounded-2xl overflow-hidden border border-gray-200 mb-4">
                <img src={preview} alt="Boleta" className="w-full max-h-64 object-cover"/>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()}
                className="w-full py-12 border-2 border-dashed border-gray-300 rounded-2xl bg-white flex flex-col items-center gap-3 hover:border-[#0B5966] transition-colors mb-4">
                <svg className="w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                <div className="text-center">
                  <p className="text-gray-600 font-medium">Fotografiar boleta</p>
                  <p className="text-xs text-gray-400 mt-1">La app leerá automáticamente los remedios y precios</p>
                </div>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment"
              onChange={handleFoto} className="hidden"/>
            {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          </div>
        )}

        {/* ── Paso 2: Procesando ── */}
        {paso === 'procesando' && (
          <div className="bg-white rounded-2xl p-10 text-center shadow-sm">
            <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-4"
              style={{ borderColor: '#0B5966', borderTopColor: 'transparent' }}/>
            <p className="text-gray-700 font-medium">Leyendo la boleta...</p>
            <p className="text-xs text-gray-400 mt-1">Identificando remedios y precios</p>
          </div>
        )}

        {/* ── Paso 3: Revisión ── */}
        {paso === 'revision' && datos && (
          <div className="space-y-4">
            {error && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-sm text-amber-700">{error}</p>
              </div>
            )}

            {/* Miniatura de la boleta */}
            {preview && (
              <div className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm">
                <img src={preview} alt="Boleta" className="w-14 h-14 object-cover rounded-lg flex-shrink-0"/>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">
                    {datos.farmacia || 'Farmacia no detectada'}
                  </p>
                  <p className="text-xs text-gray-500">{datos.fecha ?? 'Fecha no detectada'}</p>
                </div>
                <button onClick={() => { setFoto(null); setPreview(null); setPaso('foto') }}
                  className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0">
                  Cambiar
                </button>
              </div>
            )}

            {/* Farmacia y fecha editables */}
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <h3 className="font-semibold text-gray-800 text-sm">Datos de la compra</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Farmacia</label>
                  <input type="text" value={datos.farmacia}
                    onChange={e => setDatos(prev => prev ? { ...prev, farmacia: e.target.value } : prev)}
                    placeholder="Ej: Cruz Verde" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0B5966]"/>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fecha</label>
                  <input type="date" value={datos.fecha ?? ''}
                    onChange={e => setDatos(prev => prev ? { ...prev, fecha: e.target.value } : prev)}
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0B5966]"/>
                </div>
              </div>
            </div>

            {/* Lista de productos */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <h3 className="font-semibold text-gray-800 text-sm mb-3">
                Remedios detectados ({datos.productos.filter(p => p.incluir).length} seleccionados)
              </h3>

              {datos.productos.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-2">
                  No se detectaron remedios. Agrégalos manualmente.
                </p>
              )}

              <div className="space-y-4">
                {datos.productos.map((p, i) => (
                  <div key={i} className={`p-3 rounded-xl border transition-colors ${p.incluir ? 'border-[#0B5966]/20 bg-[#0B5966]/3' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
                    {/* Checkbox + nombre */}
                    <label className="flex items-start gap-2 cursor-pointer mb-3">
                      <input type="checkbox" checked={p.incluir}
                        onChange={e => actualizarProducto(i, 'incluir', e.target.checked)}
                        className="mt-1 accent-[#0B5966]"/>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400 truncate">{p.nombre_boleta}</p>
                        <input type="text" value={p.nombre_confirmado}
                          onChange={e => actualizarProducto(i, 'nombre_confirmado', e.target.value)}
                          placeholder="Nombre del remedio"
                          className="w-full text-sm font-medium text-gray-900 bg-transparent border-b border-gray-200 outline-none focus:border-[#0B5966] py-0.5"/>
                      </div>
                    </label>

                    {p.incluir && (
                      <div className="space-y-2">
                        {/* Precio */}
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-500 w-16 flex-shrink-0">Precio $</label>
                          <input type="number" value={p.precio_unitario || ''}
                            onChange={e => actualizarProducto(i, 'precio_unitario', parseInt(e.target.value) || 0)}
                            placeholder="0" min={0}
                            className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#0B5966]"/>
                        </div>

                        {/* Descuento */}
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">¿Usaste descuento?</label>
                          <select value={`${p.tipo_descuento}|${p.credencial_usada}`}
                            onChange={e => {
                              const [tipo, cred] = e.target.value.split('|')
                              actualizarProducto(i, 'tipo_descuento', tipo)
                              actualizarProducto(i, 'credencial_usada', cred === 'undefined' ? '' : cred)
                            }}
                            className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-xs outline-none focus:border-[#0B5966] bg-white">
                            {opts.map((op, j) => (
                              <option key={j} value={`${op.value}|${op.label}`}>{op.label}</option>
                            ))}
                          </select>
                        </div>

                        {p.tipo_descuento === 'ninguno' && (
                          <p className="text-xs text-emerald-600">✓ Contribuirá al precio comunitario</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button onClick={agregarProductoManual}
                className="mt-3 w-full py-2 rounded-xl border border-dashed border-gray-300 text-xs text-gray-500 hover:border-[#0B5966] hover:text-[#0B5966] transition-colors">
                + Agregar remedio manualmente
              </button>
            </div>

            {error && <p className="text-sm text-red-600 text-center">{error}</p>}

            <button onClick={handleGuardar}
              disabled={datos.productos.filter(p => p.incluir && p.precio_unitario > 0).length === 0 || paso === 'enviando'}
              className="w-full py-4 rounded-xl text-white font-medium text-sm disabled:opacity-40"
              style={{ background: '#0B5966' }}>
              Guardar {datos.productos.filter(p => p.incluir && p.precio_unitario > 0).length} remedio(s)
            </button>
          </div>
        )}

        {/* ── Paso 4: Enviando ── */}
        {paso === 'enviando' && (
          <div className="bg-white rounded-2xl p-10 text-center shadow-sm">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3"
              style={{ borderColor: '#0B5966', borderTopColor: 'transparent' }}/>
            <p className="text-gray-500 text-sm">Guardando registros...</p>
          </div>
        )}

        {/* ── Paso 5: Listo ── */}
        {paso === 'listo' && (
          <div className="bg-white rounded-2xl p-10 text-center shadow-sm">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <p className="text-gray-900 font-semibold">¡Registrado!</p>
            <p className="text-gray-500 text-sm mt-1">Volviendo a la app...</p>
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
