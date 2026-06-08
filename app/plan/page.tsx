'use client'
// app/plan/page.tsx — versión 3
// Agrega: horas de toma por momento, exportar a calendario (.ics),
// y recordatorio en el navegador.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { obtenerUsuario, obtenerPlanToma, generarICS, descargarICS } from '../../lib/auth'
import { usePWA } from '../../lib/usePWA'
import { supabase } from '../../lib/supabase'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface RemedioPlan {
  id: number
  producto_id: number | null
  dosis_texto: string | null
  posologia: string | null
  momento_toma: string[] | null
  dias_semana: string[] | null
  duracion_dias: number | null
  permanente: boolean | null
  hora_manana: string | null
  hora_mediodia: string | null
  hora_noche: string | null
  notas: string | null
  producto: { nombre_comercial: string; dosis_forma: string } | null
}

interface FormRemedio {
  id: number | null
  nombre: string
  dosis: string
  posologia: string
  momento: string[]
  diasSemana: string[]
  todosLosDias: boolean
  cronico: boolean
  duracionDias: string
  horaManana: string
  horaMediodia: string
  horaNoche: string
  alarma_mañana: boolean
  alarma_mediodia: boolean
  alarma_noche: boolean
}

const FORM_VACIO: FormRemedio = {
  id: null, nombre: '', dosis: '', posologia: '',
  momento: [], diasSemana: [], todosLosDias: true,
  cronico: true, duracionDias: '',
  horaManana: '08:00', horaMediodia: '13:00', horaNoche: '21:00',
  alarma_mañana: false, alarma_mediodia: false, alarma_noche: false,
}

const MOMENTOS = [
  { value: 'mañana',   label: 'Mañana',   emoji: '🌅', horaKey: 'horaManana',   default: '08:00' },
  { value: 'mediodia', label: 'Mediodía', emoji: '☀️', horaKey: 'horaMediodia', default: '13:00' },
  { value: 'noche',    label: 'Noche',    emoji: '🌙', horaKey: 'horaNoche',    default: '21:00' },
]

const DIAS = [
  { value: 'lunes',     label: 'Lu' },
  { value: 'martes',    label: 'Ma' },
  { value: 'miercoles', label: 'Mi' },
  { value: 'jueves',    label: 'Ju' },
  { value: 'viernes',   label: 'Vi' },
  { value: 'sabado',    label: 'Sá' },
  { value: 'domingo',   label: 'Do' },
]

// ─── Componente ───────────────────────────────────────────────────────────────

export default function PlanPage() {
  const router = useRouter()
  const [usuario, setUsuario]       = useState<any>(null)
  const [remedios, setRemedios]     = useState<RemedioPlan[]>([])
  const [cargando, setCargando]     = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm]             = useState<FormRemedio>(FORM_VACIO)
  const [guardando, setGuardando]   = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [busqueda, setBusqueda]     = useState('')
  const [sugerencias, setSugerencias] = useState<any[]>([])
  const [exportando, setExportando] = useState(false)
  const [notifOk, setNotifOk]       = useState(false)
  const { puedeInstalar, notifActivas, instalarApp, activarNotificaciones, programarAlarmas } = usePWA()

  useEffect(() => {
    obtenerUsuario().then(u => {
      if (!u) { router.push('/auth'); return }
      setUsuario(u)
      cargarRemedios(u.id)
    })
  }, [router])

  async function cargarRemedios(uid: string) {
    setCargando(true)
    const data = await obtenerPlanToma(uid)
    setRemedios(data as any)
    setCargando(false)
  }

  // Autocompletado
  useEffect(() => {
    if (busqueda.length < 2) { setSugerencias([]); return }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/buscar?q=${encodeURIComponent(busqueda)}`)
      if (res.ok) { const d = await res.json(); setSugerencias(d.resultados ?? []) }
    }, 300)
    return () => clearTimeout(t)
  }, [busqueda])

  function abrirNuevo() {
    setForm(FORM_VACIO); setBusqueda(''); setSugerencias([]); setError(null); setMostrarForm(true)
  }

  function abrirEditar(r: RemedioPlan) {
    setForm({
      id: r.id,
      nombre: r.producto?.nombre_comercial ?? r.notas ?? '',
      dosis: r.dosis_texto ?? '',
      posologia: r.posologia ?? '',
      momento: r.momento_toma ?? [],
      diasSemana: r.dias_semana ?? [],
      todosLosDias: !r.dias_semana || r.dias_semana.length === 0,
      cronico: !r.duracion_dias,
      duracionDias: r.duracion_dias?.toString() ?? '',
      horaManana: r.hora_manana ?? '08:00',
      horaMediodia: r.hora_mediodia ?? '13:00',
      horaNoche: r.hora_noche ?? '21:00',
    })
    setBusqueda(r.producto?.nombre_comercial ?? r.notas ?? '')
    setSugerencias([]); setError(null); setMostrarForm(true)
  }

  function toggleMomento(m: string) {
    setForm(prev => ({
      ...prev,
      momento: prev.momento.includes(m) ? prev.momento.filter(x => x !== m) : [...prev.momento, m]
    }))
  }

  function toggleDia(d: string) {
    setForm(prev => ({
      ...prev,
      diasSemana: prev.diasSemana.includes(d) ? prev.diasSemana.filter(x => x !== d) : [...prev.diasSemana, d]
    }))
  }

  async function handleGuardar() {
    if (!usuario) return
    if (!form.nombre.trim()) { setError('Escribe el nombre del remedio.'); return }
    if (form.momento.length === 0) { setError('Selecciona al menos un horario.'); return }
    setGuardando(true); setError(null)

    try {
      let productoId: number | null = null
      const res = await fetch(`/api/buscar?q=${encodeURIComponent(form.nombre)}`)
      if (res.ok) { const d = await res.json(); productoId = d.resultados?.[0]?.id ?? null }

      const registro = {
        usuario_id:    usuario.id,
        producto_id:   productoId,
        dosis_texto:   form.dosis || null,
        posologia:     form.posologia || null,
        momento_toma:  form.momento,
        dias_semana:   form.todosLosDias ? null : form.diasSemana,
        duracion_dias: form.cronico ? null : (parseInt(form.duracionDias) || null),
        permanente:    form.cronico,
        hora_manana:   form.momento.includes('mañana')   ? form.horaManana   : null,
        hora_mediodia: form.momento.includes('mediodia') ? form.horaMediodia : null,
        hora_noche:    form.momento.includes('noche')    ? form.horaNoche    : null,
        notas:         productoId ? null : form.nombre,
        activo:        true,
      }

      if (form.id) {
        const { error } = await supabase.from('usuario_remedio').update(registro).eq('id', form.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('usuario_remedio')
          .upsert(registro, { onConflict: 'usuario_id,producto_id' })
        if (error) throw error
      }

      setMostrarForm(false)
      const actualizados = await obtenerPlanToma(usuario.id) as any[]
      setRemedios(actualizados)
      // Programar alarmas si el usuario las activó
      const tieneAlarmas = form.alarma_mañana || form.alarma_mediodia || form.alarma_noche
      if (tieneAlarmas) await programarAlarmas(actualizados)
    } catch (e: any) {
      setError(e.message ?? 'Error al guardar.')
    } finally {
      setGuardando(false)
    }
  }

  async function handleEliminar(id: number) {
    if (!confirm('¿Eliminar este remedio del plan?')) return
    await supabase.from('usuario_remedio').update({ activo: false }).eq('id', id)
    setRemedios(prev => prev.filter(r => r.id !== id))
  }

  // ── Exportar a calendario ──────────────────────────────────────────────────
  function handleExportarCalendario() {
    setExportando(true)
    try {
      const datos = remedios.map(r => ({
        nombre:       r.producto?.nombre_comercial ?? r.notas ?? 'Remedio',
        dosis:        r.dosis_texto ?? '',
        posologia:    r.posologia ?? '1 dosis',
        momento_toma: r.momento_toma ?? [],
        hora_manana:   r.hora_manana,
        hora_mediodia: r.hora_mediodia,
        hora_noche:    r.hora_noche,
      }))
      const ics = generarICS(datos)
      descargarICS(ics)
    } finally {
      setExportando(false)
    }
  }

  // ── Notificaciones via Service Worker ─────────────────────────────────────
  async function handleActivarNotificaciones() {
    const ok = await activarNotificaciones()
    if (ok) {
      setNotifOk(true)
      await programarAlarmas(remedios)
    } else {
      alert('No se pudo activar las notificaciones. Verifica los permisos del navegador.')
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function nombreRemedio(r: RemedioPlan) {
    return r.producto?.nombre_comercial ?? r.notas ?? 'Remedio'
  }

  function descDias(r: RemedioPlan) {
    if (!r.dias_semana || r.dias_semana.length === 0) return 'Todos los días'
    return r.dias_semana.map(d => d.slice(0,2)).join(', ')
  }

  function descDuracion(r: RemedioPlan) {
    if (r.permanente || !r.duracion_dias) return 'Crónico'
    return `${r.duracion_dias} días`
  }

  function horaRemedio(r: RemedioPlan, momento: string): string | null {
    if (momento === 'mañana')   return r.hora_manana
    if (momento === 'mediodia') return r.hora_mediodia
    if (momento === 'noche')    return r.hora_noche
    return null
  }

  function remediosPorMomento(momento: string) {
    return remedios.filter(r => (r.momento_toma ?? []).includes(momento))
  }

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
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold">Mi plan de remedios</h1>
            <p className="text-base mt-1" style={{ color: '#A8D8CE' }}>Qué tomar y cuándo</p>
          </div>
          <button onClick={abrirNuevo}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm"
            style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
            <span className="text-lg">+</span> Agregar
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-4">

        {cargando && (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
            <div className="w-10 h-10 border-t-transparent rounded-full animate-spin mx-auto mb-3"
              style={{ borderColor: '#0B5966', borderTopColor: 'transparent', borderWidth: 3 }}/>
            <p className="text-gray-600 text-base">Cargando tu plan...</p>
          </div>
        )}

        {/* Sin remedios */}
        {!cargando && remedios.length === 0 && (
          <div className="text-center py-10">
            <p className="text-gray-700 text-lg font-medium mb-2">Aún no tienes remedios en tu plan</p>
            <p className="text-gray-500 text-base mb-5">Escanea tu receta o agrégalos manualmente</p>
            <div className="flex gap-3">
              <button onClick={() => router.push('/receta')}
                className="flex-1 py-4 rounded-2xl text-white font-bold text-base"
                style={{ background: '#0B5966' }}>
                📄 Escanear receta
              </button>
              <button onClick={abrirNuevo}
                className="flex-1 py-4 rounded-2xl font-bold text-base border-2"
                style={{ borderColor: '#0B5966', color: '#0B5966', background: 'white' }}>
                + Agregar
              </button>
            </div>
          </div>
        )}

        {/* Alarmas (solo si hay remedios) */}
        {!cargando && remedios.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <p className="text-base font-bold text-gray-800 mb-3">🔔 Recordatorios</p>
            <div className="flex gap-3">
              <button onClick={handleExportarCalendario} disabled={exportando}
                className="flex-1 py-3.5 rounded-xl text-sm font-semibold border-2 flex items-center justify-center gap-2"
                style={{ borderColor: '#0B5966', color: '#0B5966', background: 'white' }}>
                📅 Al calendario
              </button>
              <button onClick={handleActivarNotificaciones}
                className="flex-1 py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 text-white"
                style={{ background: (notifOk || notifActivas) ? '#1D9E75' : '#0B5966' }}>
                {(notifOk || notifActivas) ? '✓ Alarmas activas' : '🔔 Activar alarmas'}
              </button>
            </div>
            {puedeInstalar && (
              <button onClick={instalarApp}
                className="w-full py-3.5 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2"
                style={{ background: '#1D9E75' }}>
                📲 Instalar app en este teléfono
              </button>
            )}
            <p className="text-xs text-gray-400 mt-1 text-center">
              Las alarmas funcionan aunque la app esté cerrada
            </p>
          </div>
        )}

        {/* Plan por momentos */}
        {!cargando && MOMENTOS.map(mom => {
          const lista = remediosPorMomento(mom.value)
          if (lista.length === 0) return null
          return (
            <div key={mom.value} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 flex items-center gap-3" style={{ background: 'rgba(11,89,102,0.06)' }}>
                <span className="text-3xl">{mom.emoji}</span>
                <div className="flex-1">
                  <p className="text-lg font-bold" style={{ color: '#0B5966' }}>{mom.label}</p>
                </div>
                {/* Hora por defecto del momento */}
                <p className="text-base font-bold" style={{ color: '#0B5966' }}>
                  {lista[0] ? (horaRemedio(lista[0], mom.value) ?? mom.default) : mom.default}
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {lista.map(r => (
                  <div key={r.id} className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <div className="w-3 h-3 rounded-full mt-2 flex-shrink-0" style={{ background: '#1D9E75' }}/>
                      <div className="flex-1 min-w-0">
                        <p className="text-lg font-semibold" style={{ color: '#1A2E2E' }}>{nombreRemedio(r)}</p>
                        <p className="text-base text-gray-600">
                          {r.dosis_texto && <span>{r.dosis_texto} · </span>}
                          {r.posologia ?? '1 dosis'}
                        </p>
                        <div className="flex gap-3 mt-1 flex-wrap">
                          <span className="text-sm text-gray-500">{descDias(r)}</span>
                          <span className="text-sm font-medium"
                            style={{ color: r.permanente || !r.duracion_dias ? '#0B5966' : '#EF9F27' }}>
                            {descDuracion(r)}
                          </span>
                          {horaRemedio(r, mom.value) && (
                            <span className="text-sm font-bold text-gray-700">
                              🕐 {horaRemedio(r, mom.value)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => abrirEditar(r)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 text-lg">✏️</button>
                        <button onClick={() => handleEliminar(r.id)} className="p-2 rounded-lg text-gray-400 hover:bg-red-50 text-lg">🗑</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {/* Botones al fondo */}
        {!cargando && remedios.length > 0 && (
          <div className="flex gap-3 pt-2">
            <button onClick={() => router.push('/receta')}
              className="flex-1 py-4 rounded-2xl font-bold text-base border-2"
              style={{ borderColor: '#0B5966', color: '#0B5966', background: 'white' }}>
              📄 Escanear receta
            </button>
            <button onClick={abrirNuevo}
              className="flex-1 py-4 rounded-2xl text-white font-bold text-base"
              style={{ background: '#0B5966' }}>
              + Agregar
            </button>
          </div>
        )}
      </div>

      {/* ── Modal agregar/editar ── */}
      {mostrarForm && (
        <div className="fixed inset-0 z-50 flex items-end"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget) setMostrarForm(false) }}>
          <div className="w-full bg-white rounded-t-3xl max-h-[92vh] overflow-y-auto">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold" style={{ color: '#1A2E2E' }}>
                {form.id ? 'Editar remedio' : 'Agregar remedio'}
              </h2>
              <button onClick={() => setMostrarForm(false)} className="text-gray-400 text-2xl">✕</button>
            </div>

            <div className="px-6 py-5 space-y-5">

              {/* Nombre */}
              <div>
                <label className="block text-base font-semibold text-gray-700 mb-2">Nombre del remedio</label>
                <input type="text" value={busqueda}
                  onChange={e => { setBusqueda(e.target.value); setForm(prev => ({ ...prev, nombre: e.target.value })) }}
                  placeholder="Ej: Losartán, Metformina..."
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-base outline-none focus:border-[#0B5966]"
                  style={{ color: '#1A2E2E' }}/>
                {sugerencias.length > 0 && (
                  <div className="mt-1 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
                    {sugerencias.slice(0, 4).map((s: any) => (
                      <button key={s.id} onClick={() => {
                        setBusqueda(s.nombre_comercial)
                        setForm(prev => ({ ...prev, nombre: s.nombre_comercial }))
                        setSugerencias([])
                      }} className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                        <p className="font-semibold text-base" style={{ color: '#1A2E2E' }}>{s.nombre_comercial}</p>
                        <p className="text-sm text-gray-500">{s.principios} · {s.dosis_forma}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Dosis e instrucción */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-base font-semibold text-gray-700 mb-2">Dosis</label>
                  <input type="text" value={form.dosis}
                    onChange={e => setForm(prev => ({ ...prev, dosis: e.target.value }))}
                    placeholder="Ej: 5 mg"
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-base outline-none focus:border-[#0B5966]"
                    style={{ color: '#1A2E2E' }}/>
                </div>
                <div>
                  <label className="block text-base font-semibold text-gray-700 mb-2">Cantidad</label>
                  <input type="text" value={form.posologia}
                    onChange={e => setForm(prev => ({ ...prev, posologia: e.target.value }))}
                    placeholder="Ej: 1 comprimido"
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-base outline-none focus:border-[#0B5966]"
                    style={{ color: '#1A2E2E' }}/>
                </div>
              </div>

              {/* Horario con hora */}
              <div>
                <label className="block text-base font-semibold text-gray-700 mb-3">Horario de toma</label>
                <div className="space-y-2">
                  {MOMENTOS.map(m => {
                    const activo = form.momento.includes(m.value)
                    const horaKey = m.horaKey as keyof FormRemedio
                    const alarmaKey = `alarma_${m.value}` as keyof FormRemedio
                    return (
                      <div key={m.value} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleMomento(m.value)}
                            className="flex-1 py-3.5 rounded-xl text-base font-bold transition-colors flex items-center justify-center gap-2"
                            style={activo
                              ? { background: '#0B5966', color: '#FFFFFF' }
                              : { background: '#F3F4F6', color: '#6B7280' }}>
                            {m.emoji} {m.label}
                          </button>
                          {activo && (
                            <input type="time" value={form[horaKey] as string}
                              onChange={e => setForm(prev => ({ ...prev, [horaKey]: e.target.value }))}
                              className="px-3 py-3 rounded-xl border-2 border-gray-200 text-base font-bold outline-none focus:border-[#0B5966] w-28"
                              style={{ color: '#1A2E2E' }}/>
                          )}
                        </div>
                        {activo && (
                          <div className="flex items-center gap-3 px-1">
                            <div
                              onClick={async () => {
                                if (!form[alarmaKey]) {
                                  const ok = notifActivas || await activarNotificaciones()
                                  if (ok) setForm(prev => ({ ...prev, [alarmaKey]: true }))
                                } else {
                                  setForm(prev => ({ ...prev, [alarmaKey]: false }))
                                }
                              }}
                              className="w-10 h-6 rounded-full transition-colors flex items-center px-1 cursor-pointer flex-shrink-0"
                              style={{ background: form[alarmaKey] ? '#EF9F27' : '#d1d5db' }}>
                              <div className="w-4 h-4 rounded-full bg-white shadow transition-transform"
                                style={{ transform: form[alarmaKey] ? 'translateX(16px)' : 'none' }}/>
                            </div>
                            <span className="text-sm text-gray-600">
                              🔔 Alarma a las {form[horaKey] as string}
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Días */}
              <div>
                <label className="block text-base font-semibold text-gray-700 mb-3">Días de toma</label>
                <label className="flex items-center gap-3 cursor-pointer mb-3">
                  <div onClick={() => setForm(prev => ({ ...prev, todosLosDias: !prev.todosLosDias }))}
                    className="w-12 h-7 rounded-full transition-colors flex items-center px-1"
                    style={{ background: form.todosLosDias ? '#0B5966' : '#d1d5db' }}>
                    <div className="w-5 h-5 rounded-full bg-white shadow transition-transform"
                      style={{ transform: form.todosLosDias ? 'translateX(20px)' : 'none' }}/>
                  </div>
                  <span className="text-base text-gray-700 font-medium">Todos los días</span>
                </label>
                {!form.todosLosDias && (
                  <div className="flex gap-1.5">
                    {DIAS.map(d => {
                      const activo = form.diasSemana.includes(d.value)
                      return (
                        <button key={d.value} onClick={() => toggleDia(d.value)}
                          className="flex-1 py-3 rounded-xl text-sm font-bold"
                          style={activo
                            ? { background: '#0B5966', color: '#FFFFFF' }
                            : { background: '#F3F4F6', color: '#6B7280' }}>
                          {d.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Duración */}
              <div>
                <label className="block text-base font-semibold text-gray-700 mb-3">Duración</label>
                <div className="flex gap-3 mb-3">
                  <button onClick={() => setForm(prev => ({ ...prev, cronico: true }))}
                    className="flex-1 py-3.5 rounded-xl text-base font-bold"
                    style={form.cronico
                      ? { background: '#0B5966', color: '#FFFFFF' }
                      : { background: '#F3F4F6', color: '#6B7280' }}>
                    ♾ Crónico
                  </button>
                  <button onClick={() => setForm(prev => ({ ...prev, cronico: false }))}
                    className="flex-1 py-3.5 rounded-xl text-base font-bold"
                    style={!form.cronico
                      ? { background: '#EF9F27', color: '#FFFFFF' }
                      : { background: '#F3F4F6', color: '#6B7280' }}>
                    📅 Por días
                  </button>
                </div>
                {!form.cronico && (
                  <div className="flex items-center gap-3">
                    <input type="number" value={form.duracionDias}
                      onChange={e => setForm(prev => ({ ...prev, duracionDias: e.target.value }))}
                      placeholder="30" min={1} max={365}
                      className="w-28 px-4 py-3 rounded-xl border-2 border-gray-200 text-base outline-none focus:border-[#0B5966] text-center font-bold"
                      style={{ color: '#1A2E2E' }}/>
                    <span className="text-base text-gray-600">días de tratamiento</span>
                  </div>
                )}
              </div>

              {error && <p className="text-base text-red-700 font-medium">{error}</p>}

              <button onClick={handleGuardar} disabled={guardando}
                className="w-full py-5 rounded-2xl text-white font-bold text-lg disabled:opacity-50"
                style={{ background: '#0B5966' }}>
                {guardando ? 'Guardando...' : form.id ? 'Guardar cambios' : 'Agregar al plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
