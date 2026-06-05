'use client'
// app/registrar/page.tsx

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { obtenerUsuario, obtenerCredenciales, registrarPrecio } from '../../lib/auth'
import { supabase } from '../../lib/supabase'

function RegistrarContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const productoId   = parseInt(searchParams.get('producto') ?? '0')
  const fileRef      = useRef<HTMLInputElement>(null)

  const [usuario, setUsuario]               = useState<any>(null)
  const [creds, setCreds]                   = useState<any>(null)
  const [nombreProducto, setNombreProducto] = useState('')
  const [valorClp, setValorClp]             = useState('')
  const [fechaCompra, setFechaCompra]       = useState(new Date().toISOString().split('T')[0])
  const [farmaciaNombre, setFarmaciaNombre] = useState('')
  const [farmaciaComuna, setFarmaciaComuna] = useState('')
  const [canal, setCanal]                   = useState('lista')
  const [tipoDescuento, setTipoDescuento]   = useState('ninguno')
  const [credencialUsada, setCredencialUsada] = useState('')
  const [foto, setFoto]                     = useState<File | null>(null)
  const [preview, setPreview]               = useState<string | null>(null)
  const [enviando, setEnviando]             = useState(false)
  const [error, setError]                   = useState<string | null>(null)

  useEffect(() => {
    obtenerUsuario().then(u => {
      if (!u) { router.push('/auth'); return }
      setUsuario(u)
      obtenerCredenciales(u.id).then(setCreds)
    })
    if (productoId) {
      supabase.from('producto').select('nombre_comercial').eq('id', productoId).single()
        .then(({ data }) => { if (data) setNombreProducto(data.nombre_comercial) })
    }
  }, [productoId, router])

  // Opciones de credencial según el perfil del usuario
  function opcionesCredencial() {
    const opts: { value: string; label: string }[] = [
      { value: 'ninguno', label: 'Sin descuento (precio lista)' }
    ]
    if (creds?.prevision?.startsWith('fonasa'))     opts.push({ value: 'fonasa',  label: 'Fonasa precio preferente' })
    if (creds?.prevision === 'isapre')              opts.push({ value: 'isapre',  label: `Convenio Isapre ${creds.isapre_nombre ?? ''}` })
    if (creds?.caja_nombre)                         opts.push({ value: 'caja',    label: `Caja de Compensación` })
    if (creds?.club_cruz_verde)                     opts.push({ value: 'club',    label: 'Club Cruz Verde' })
    if (creds?.club_ahumada)                        opts.push({ value: 'club',    label: 'Club Ahumada' })
    if (creds?.club_salcobrand)                     opts.push({ value: 'club',    label: 'Club Salcobrand' })
    if (creds?.club_dr_simi)                        opts.push({ value: 'club',    label: 'Club Dr. Simi' })
    if (creds?.tiene_seguro_comp)                   opts.push({ value: 'isapre',  label: `Seguro complementario ${creds.seguro_comp_nombre ?? ''}` })
    opts.push({ value: 'otro', label: 'Otro descuento' })
    return opts
  }

  function seleccionarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    if (!archivo) return
    setFoto(archivo)
    setPreview(URL.createObjectURL(archivo))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!foto) { setError('La foto de boleta es obligatoria.'); return }
    if (!usuario) return
    setEnviando(true); setError(null)

    const resultado = await registrarPrecio({
      usuarioId: usuario.id,
      productoId,
      valorClp:       parseInt(valorClp.replace(/\D/g, '')),
      fechaCompra,
      farmaciaNombre,
      farmaciaComuna,
      fotoBoleta:     foto,
      canal,
      tipoDescuento,
      credencialUsada,
    })

    if (resultado.error) { setError(resultado.error); setEnviando(false) }
    else router.push('/?registrado=1')
  }

  if (!usuario) return null

  const opts = opcionesCredencial()

  return (
    <main className="min-h-screen" style={{ background: '#EFF4F0' }}>
      <div style={{ background: '#0B5966' }} className="px-6 pt-12 pb-8 text-white">
        <button onClick={() => router.back()} className="flex items-center gap-2 mb-4 opacity-70 hover:opacity-100">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
          <span className="text-sm">Volver</span>
        </button>
        <h1 className="text-2xl font-bold">Registrar precio</h1>
        {nombreProducto && <p className="text-sm mt-1" style={{ color: '#A8D8CE' }}>{nombreProducto}</p>}
      </div>

      <div className="max-w-md mx-auto px-4 py-6">
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4"><p className="text-sm text-red-700">{error}</p></div>}

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Foto boleta */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">
              Foto de la boleta <span className="text-red-500">*</span>
            </label>
            {preview ? (
              <div className="relative rounded-xl overflow-hidden border border-gray-200">
                <img src={preview} alt="Boleta" className="w-full max-h-48 object-cover"/>
                <button type="button" onClick={() => { setFoto(null); setPreview(null) }}
                  className="absolute top-2 right-2 bg-white rounded-full p-1 shadow text-gray-600">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()}
                className="w-full py-8 border-2 border-dashed border-gray-300 rounded-xl bg-white flex flex-col items-center gap-2 hover:border-[#0B5966]">
                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                <span className="text-sm text-gray-500">Fotografiar o adjuntar boleta</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment"
              onChange={seleccionarFoto} className="hidden"/>
          </div>

          {/* Precio */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Precio pagado (en pesos) <span className="text-red-500">*</span>
            </label>
            <input type="number" value={valorClp} onChange={e => setValorClp(e.target.value)}
              required placeholder="Ej: 8500" min={1}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-[#0B5966]"/>
          </div>

          {/* Fecha */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de compra</label>
            <input type="date" value={fechaCompra} onChange={e => setFechaCompra(e.target.value)}
              required max={new Date().toISOString().split('T')[0]}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-[#0B5966]"/>
          </div>

          {/* Canal */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Canal de compra</label>
            <select value={canal} onChange={e => setCanal(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-[#0B5966]">
              <option value="lista">Precio lista</option>
              <option value="cenabast">Canal CENABAST</option>
              <option value="bioequivalente">Bioequivalente</option>
              <option value="fonasa_preferente">Precio preferente Fonasa</option>
            </select>
          </div>

          {/* Farmacia */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Farmacia</label>
              <input type="text" value={farmaciaNombre} onChange={e => setFarmaciaNombre(e.target.value)}
                placeholder="Ej: Cruz Verde" required
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-[#0B5966]"/>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Comuna</label>
              <input type="text" value={farmaciaComuna} onChange={e => setFarmaciaComuna(e.target.value)}
                placeholder="Ej: Providencia" required
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-[#0B5966]"/>
            </div>
          </div>

          {/* Descuento / credencial usada */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              ¿Usaste algún descuento o convenio?
            </label>
            <div className="space-y-2">
              {opts.map((op, i) => (
                <label key={i} className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border transition-colors"
                  style={{ borderColor: tipoDescuento === op.value && credencialUsada === op.label ? '#0B5966' : '#e5e7eb',
                           background: tipoDescuento === op.value && credencialUsada === op.label ? 'rgba(11,89,102,0.05)' : 'white' }}>
                  <input type="radio" name="descuento"
                    checked={tipoDescuento === op.value && credencialUsada === op.label}
                    onChange={() => { setTipoDescuento(op.value); setCredencialUsada(op.label === 'Sin descuento (precio lista)' ? '' : op.label) }}
                    className="accent-[#0B5966]"/>
                  <span className="text-sm text-gray-700">{op.label}</span>
                </label>
              ))}
            </div>
            {tipoDescuento === 'ninguno' && (
              <p className="text-xs text-emerald-700 mt-2 px-1">
                ✓ Este precio contribuirá al precio comunitario si 3 o más usuarios reportan lo mismo.
              </p>
            )}
            {tipoDescuento !== 'ninguno' && (
              <p className="text-xs text-amber-600 mt-2 px-1">
                Este precio se guardará en tu historial personal pero no afectará el precio comunitario.
              </p>
            )}
          </div>

          <button type="submit" disabled={enviando || !foto}
            className="w-full py-4 rounded-xl text-white font-medium text-sm disabled:opacity-60"
            style={{ background: '#0B5966' }}>
            {enviando ? 'Registrando...' : 'Registrar precio'}
          </button>
        </form>
      </div>
    </main>
  )
}

export default function RegistrarPage() {
  return (
    <Suspense fallback={
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#EFF4F0' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ width:32, height:32, border:'2px solid #0B5966', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 1s linear infinite', margin:'0 auto 12px' }}/>
          <p style={{ color:'#6b7280', fontSize:14 }}>Cargando...</p>
        </div>
      </div>
    }>
      <RegistrarContent />
    </Suspense>
  )
}
