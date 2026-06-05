'use client'
// app/perfil/page.tsx
// Perfil del usuario: mis remedios + credenciales de descuento

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  obtenerUsuario, obtenerCredenciales, guardarCredenciales,
  obtenerMisRemedios, cerrarSesion
} from '../../lib/auth'

const ISAPRES = ['Banmédica','Colmena','Consalud','Cruz Blanca','Más Vida','Nueva Masvida','Vida Tres','Otra']
const CAJAS   = [
  { value: 'los_andes',       label: 'Los Andes'       },
  { value: 'los_heroes',      label: 'Los Héroes'       },
  { value: '18_septiembre',   label: '18 de Septiembre' },
  { value: 'araucana',        label: 'La Araucana'      },
  { value: 'serviestado',     label: 'ServiEstado'      },
  { value: 'otra',            label: 'Otra'             },
]

export default function PerfilPage() {
  const router = useRouter()
  const [usuario, setUsuario]       = useState<any>(null)
  const [remedios, setRemedios]     = useState<any[]>([])
  const [creds, setCreds]           = useState<any>({
    prevision: '', isapre_nombre: '', caja_nombre: '',
    club_cruz_verde: false, club_ahumada: false,
    club_salcobrand: false, club_dr_simi: false,
    tiene_seguro_comp: false, seguro_comp_nombre: '',
  })
  const [guardando, setGuardando]   = useState(false)
  const [guardadoOk, setGuardadoOk] = useState(false)
  const [tab, setTab]               = useState<'remedios'|'credenciales'>('credenciales')

  useEffect(() => {
    obtenerUsuario().then(u => {
      if (!u) { router.push('/auth'); return }
      setUsuario(u)
      obtenerCredenciales(u.id).then(c => { if (c) setCreds(c) })
      obtenerMisRemedios(u.id).then(setRemedios)
    })
  }, [router])

  async function handleGuardar() {
    if (!usuario) return
    setGuardando(true)
    await guardarCredenciales(usuario.id, creds)
    setGuardadoOk(true)
    setGuardando(false)
    setTimeout(() => setGuardadoOk(false), 3000)
  }

  function toggle(field: string) {
    setCreds((prev: any) => ({ ...prev, [field]: !prev[field] }))
  }

  if (!usuario) return null

  return (
    <main className="min-h-screen" style={{ background: '#EFF4F0' }}>
      <div style={{ background: '#0B5966' }} className="px-6 pt-12 pb-6 text-white">
        <button onClick={() => router.push('/')} className="flex items-center gap-2 mb-4 opacity-70 hover:opacity-100">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
          <span className="text-sm">Volver</span>
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{usuario.nombre ?? 'Mi perfil'}</h1>
            <p className="text-sm mt-0.5" style={{ color: '#A8D8CE' }}>{usuario.email}</p>
          </div>
          <button onClick={async () => { await cerrarSesion(); router.push('/') }}
            className="text-xs px-3 py-1.5 rounded-lg border border-white/20 hover:bg-white/10">
            Salir
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-lg mx-auto px-4">
        <div className="flex gap-1 mt-4 mb-4 bg-white rounded-xl p-1 shadow-sm">
          {([
            { key: 'credenciales', label: '🎫 Mis convenios' },
            { key: 'remedios',     label: `💊 Mis remedios (${remedios.length})` },
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === key ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
              style={tab === key ? { background: '#0B5966' } : {}}>
              {label}
            </button>
          ))}
        </div>

        {/* Tab: Credenciales */}
        {tab === 'credenciales' && (
          <div className="space-y-4 pb-8">
            <p className="text-xs text-gray-500 px-1">
              Configura tus convenios para que la app te muestre los descuentos que te corresponden.
            </p>

            {/* Previsión */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <h3 className="font-semibold text-gray-800 mb-3">Previsión de salud</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'fonasa_a', label: 'Fonasa A' },
                  { value: 'fonasa_b', label: 'Fonasa B' },
                  { value: 'fonasa_c', label: 'Fonasa C' },
                  { value: 'fonasa_d', label: 'Fonasa D' },
                  { value: 'isapre',   label: 'Isapre'   },
                  { value: 'capredena',label: 'Capredena'},
                  { value: 'ninguna',  label: 'Ninguna'  },
                ].map(op => (
                  <button key={op.value} onClick={() => setCreds((p: any) => ({ ...p, prevision: op.value }))}
                    className={`py-2.5 px-3 rounded-xl text-sm font-medium transition-colors text-left ${
                      creds.prevision === op.value ? 'text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                    style={creds.prevision === op.value ? { background: '#0B5966' } : {}}>
                    {op.label}
                  </button>
                ))}
              </div>
              {creds.prevision === 'isapre' && (
                <div className="mt-3">
                  <label className="block text-xs text-gray-500 mb-1">¿Cuál Isapre?</label>
                  <select value={creds.isapre_nombre ?? ''} onChange={e => setCreds((p: any) => ({ ...p, isapre_nombre: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0B5966]">
                    <option value="">Selecciona</option>
                    {ISAPRES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Caja de Compensación */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <h3 className="font-semibold text-gray-800 mb-3">Caja de Compensación</h3>
              <div className="grid grid-cols-2 gap-2">
                {CAJAS.map(c => (
                  <button key={c.value} onClick={() => setCreds((p: any) => ({ ...p, caja_nombre: p.caja_nombre === c.value ? null : c.value }))}
                    className={`py-2.5 px-3 rounded-xl text-sm font-medium transition-colors ${
                      creds.caja_nombre === c.value ? 'text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                    style={creds.caja_nombre === c.value ? { background: '#0B5966' } : {}}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Clubes de farmacia */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <h3 className="font-semibold text-gray-800 mb-1">Clubes de farmacia</h3>
              <p className="text-xs text-gray-400 mb-3">Gratis inscribirse — actívalos si ya tienes la tarjeta</p>
              <div className="space-y-2">
                {[
                  { field: 'club_cruz_verde', label: 'Club Cruz Verde' },
                  { field: 'club_ahumada',    label: 'Club Ahumada'    },
                  { field: 'club_salcobrand', label: 'Club Salcobrand' },
                  { field: 'club_dr_simi',    label: 'Club Dr. Simi'   },
                ].map(({ field, label }) => (
                  <label key={field} className="flex items-center gap-3 cursor-pointer">
                    <div onClick={() => toggle(field)}
                      className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${
                        creds[field] ? 'bg-[#0B5966]' : 'bg-gray-200'
                      }`}>
                      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${creds[field] ? 'translate-x-4' : ''}`}/>
                    </div>
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Seguro complementario */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <h3 className="font-semibold text-gray-800 mb-3">Seguro complementario</h3>
              <label className="flex items-center gap-3 cursor-pointer mb-3">
                <div onClick={() => toggle('tiene_seguro_comp')}
                  className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${creds.tiene_seguro_comp ? 'bg-[#0B5966]' : 'bg-gray-200'}`}>
                  <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${creds.tiene_seguro_comp ? 'translate-x-4' : ''}`}/>
                </div>
                <span className="text-sm text-gray-700">Tengo seguro complementario</span>
              </label>
              {creds.tiene_seguro_comp && (
                <input type="text" value={creds.seguro_comp_nombre ?? ''} placeholder="Ej: SURA, Consorcio, Bice Vida..."
                  onChange={e => setCreds((p: any) => ({ ...p, seguro_comp_nombre: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0B5966]"/>
              )}
            </div>

            {/* Guardar */}
            {guardadoOk && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                <p className="text-sm text-emerald-700">✓ Convenios guardados</p>
              </div>
            )}
            <button onClick={handleGuardar} disabled={guardando}
              className="w-full py-4 rounded-xl text-white font-medium text-sm disabled:opacity-60"
              style={{ background: '#0B5966' }}>
              {guardando ? 'Guardando...' : 'Guardar mis convenios'}
            </button>
          </div>
        )}

        {/* Tab: Mis remedios */}
        {tab === 'remedios' && (
          <div className="pb-8">
            {remedios.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-gray-500 text-sm">Aún no tienes remedios guardados.</p>
                <button onClick={() => router.push('/')} className="mt-3 text-sm underline" style={{ color: '#0B5966' }}>
                  Busca un remedio para agregarlo
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {remedios.map((r: any) => (
                  <div key={r.id} className="bg-white rounded-2xl px-4 py-3.5 shadow-sm flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{(r.producto as any)?.nombre_comercial}</p>
                      <p className="text-xs text-gray-400">{(r.producto as any)?.dosis_forma}</p>
                    </div>
                    <button onClick={() => router.push(`/?buscar=${encodeURIComponent((r.producto as any)?.nombre_comercial ?? '')}`)}
                      className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(11,89,102,0.08)', color: '#0B5966' }}>
                      Consultar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
