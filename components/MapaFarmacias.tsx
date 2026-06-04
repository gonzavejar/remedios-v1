'use client'
// components/MapaFarmacias.tsx — versión 4
// Mejoras:
// - "Solo turno": muestra TODAS las farmacias de turno, sin límite de distancia
// - "Abierta ahora": filtra por horario de apertura/cierre actual
// - Lista completa de farmacias con nombre de cadena visible

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const CENABAST_CHAINS = ['SALCOBRAND']

function crearIcono(color: string, size = 28) {
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;background:${color};border:2px solid white;transform:rotate(-45deg);box-shadow:0 2px 4px rgba(0,0,0,.3);"></div>`,
    iconSize: [size, size], iconAnchor: [size / 2, size], popupAnchor: [0, -size],
  })
}

const ICONOS = {
  cenabast: crearIcono('#1D9E75'),
  turno:    crearIcono('#EF9F27'),
  regular:  crearIcono('#9CA3AF'),
  usuario:  crearIcono('#0B5966', 24),
}

function distancia(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// Verifica si una farmacia está abierta en este momento
function estaAbierta(apertura: string, cierre: string): boolean {
  try {
    const ahora = new Date()
    const hh = ahora.getHours() * 60 + ahora.getMinutes()
    const [ah, am] = apertura.split(':').map(Number)
    const [ch, cm] = cierre.split(':').map(Number)
    const a = ah * 60 + am
    const c = ch * 60 + cm
    if (c === 0 || (ch === 23 && cm === 59)) return true // 24 horas
    if (c < a) return hh >= a || hh <= c // cruza medianoche
    return hh >= a && hh <= c
  } catch { return true }
}

function CentrarMapa({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => { map.setView([lat, lng], 14) }, [lat, lng, map])
  return null
}

interface Farmacia {
  local_id: string
  local_nombre: string
  local_direccion: string
  comuna_nombre: string
  local_lat: number
  local_lng: number
  local_telefono: string
  funcionamiento_hora_apertura: string
  funcionamiento_hora_cierre: string
  es_cenabast: boolean
  es_turno: boolean
  distancia_km: number
}

type Filtro = 'todas' | 'turno' | 'abiertas'

export default function MapaFarmacias({ nombreMedicamento }: { nombreMedicamento?: string }) {
  const [pos, setPos]               = useState<{ lat: number; lng: number } | null>(null)
  const [cercanas, setCercanas]     = useState<Farmacia[]>([])   // 5 km
  const [turnosFull, setTurnosFull] = useState<Farmacia[]>([])   // todas las de turno
  const [cargando, setCargando]     = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [filtro, setFiltro]         = useState<Filtro>('todas')

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Tu navegador no soporta geolocalización.')
      setCargando(false)
      return
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
      const lat = position.coords.latitude
      const lng = position.coords.longitude
      setPos({ lat, lng })

      try {
        const [resLocales, resTurnos] = await Promise.allSettled([
          fetch('https://midas.minsal.cl/farmacia_v2/WS/getLocales.php'),
          fetch('https://midas.minsal.cl/farmacia_v2/WS/getLocalesTurnos.php'),
        ])

        if (resLocales.status === 'rejected') throw new Error('Sin conexión al MINSAL')

        const locales: any[] = await (resLocales.value as Response).json()
        const turnos: any[]  = resTurnos.status === 'fulfilled'
          ? await (resTurnos.value as Response).json()
          : []

        const idsTurno = new Set(turnos.map((t: any) => String(t.local_id)))

        // Farmacias en radio de 5 km para la vista normal
        const farmaciasCercanas: Farmacia[] = locales
          .filter((l: any) => {
            const latn = parseFloat(l.local_lat)
            const lngn = parseFloat(l.local_lng)
            return !isNaN(latn) && !isNaN(lngn) && distancia(lat, lng, latn, lngn) <= 5
          })
          .map((l: any) => mapearFarmacia(l, lat, lng, idsTurno))
          .sort((a, b) => a.distancia_km - b.distancia_km)
          .slice(0, 30)

        setCercanas(farmaciasCercanas)

        // TODAS las de turno en Chile, con distancia calculada (sin límite de radio)
        const todasTurnos: Farmacia[] = turnos
          .filter((t: any) => {
            const latn = parseFloat(t.local_lat)
            const lngn = parseFloat(t.local_lng)
            return !isNaN(latn) && !isNaN(lngn)
          })
          .map((t: any) => mapearFarmacia(t, lat, lng, idsTurno))
          .sort((a, b) => a.distancia_km - b.distancia_km)
          .slice(0, 50)

        setTurnosFull(todasTurnos)

      } catch {
        setError('No se pudieron cargar las farmacias. Intenta de nuevo.')
      } finally {
        setCargando(false)
      }
    }, () => {
      setError('No se pudo obtener tu ubicación. Verifica los permisos del navegador.')
      setCargando(false)
    }, { timeout: 10000 })
  }, [])

  function mapearFarmacia(l: any, lat: number, lng: number, idsTurno: Set<string>): Farmacia {
    return {
      local_id: String(l.local_id),
      local_nombre: String(l.local_nombre ?? '').toUpperCase().trim(),
      local_direccion: String(l.local_direccion ?? '').trim(),
      comuna_nombre: String(l.comuna_nombre ?? '').trim(),
      local_lat: parseFloat(l.local_lat),
      local_lng: parseFloat(l.local_lng),
      local_telefono: String(l.local_telefono ?? ''),
      funcionamiento_hora_apertura: String(l.funcionamiento_hora_apertura ?? ''),
      funcionamiento_hora_cierre: String(l.funcionamiento_hora_cierre ?? ''),
      es_cenabast: CENABAST_CHAINS.some(c => String(l.local_nombre ?? '').toUpperCase().includes(c)),
      es_turno: idsTurno.has(String(l.local_id)),
      distancia_km: Math.round(distancia(lat, lng, parseFloat(l.local_lat), parseFloat(l.local_lng)) * 10) / 10,
    }
  }

  // Selección de farmacias según filtro activo
  const farmaciasMapa: Farmacia[] = (() => {
    if (filtro === 'turno')    return turnosFull
    if (filtro === 'abiertas') return cercanas.filter(f => estaAbierta(f.funcionamiento_hora_apertura, f.funcionamiento_hora_cierre))
    return cercanas
  })()

  const cenabastList = farmaciasMapa.filter(f => f.es_cenabast)
  const turnoList    = farmaciasMapa.filter(f => f.es_turno && !f.es_cenabast)
  const regularList  = farmaciasMapa.filter(f => !f.es_cenabast && !f.es_turno)

  if (cargando) return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mb-3"
        style={{ borderColor: '#0B5966', borderTopColor: 'transparent' }} />
      <p className="text-sm text-gray-500">Cargando farmacias cercanas...</p>
    </div>
  )

  if (error) return (
    <div className="py-6 px-4 text-center">
      <p className="text-sm text-red-600 mb-2">{error}</p>
    </div>
  )

  if (!pos) return null

  return (
    <div>
      {/* Filtros */}
      <div className="flex gap-1.5 mb-3">
        {([
          { key: 'todas',    label: 'Todas',          emoji: '📍' },
          { key: 'abiertas', label: 'Abierta ahora',  emoji: '🟢' },
          { key: 'turno',    label: 'Solo turno',     emoji: '🌙' },
        ] as { key: Filtro; label: string; emoji: string }[]).map(({ key, label, emoji }) => (
          <button key={key} onClick={() => setFiltro(key)}
            className={`flex-1 py-2 px-2 rounded-xl text-xs font-medium transition-colors ${
              filtro === key ? 'text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
            style={filtro === key ? { background: key === 'turno' ? '#EF9F27' : '#0B5966' } : {}}>
            {emoji} {label}
          </button>
        ))}
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-3 mb-3 px-1">
        <span className="flex items-center gap-1.5 text-xs text-gray-600">
          <span className="w-3 h-3 rounded-full bg-[#1D9E75] inline-block"/>CENABAST ({cenabastList.length})
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-600">
          <span className="w-3 h-3 rounded-full bg-[#EF9F27] inline-block"/>Turno ({turnoList.length})
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-600">
          <span className="w-3 h-3 rounded-full bg-gray-400 inline-block"/>Regular ({regularList.length})
        </span>
        {filtro === 'turno' && (
          <span className="text-xs text-amber-600 font-medium">Sin límite de distancia</span>
        )}
      </div>

      {/* Sin resultados */}
      {farmaciasMapa.length === 0 && (
        <div className="py-4 text-center">
          <p className="text-sm text-gray-500 mb-2">
            {filtro === 'turno' ? 'No hay farmacias de turno en este momento.' : 'No hay farmacias abiertas ahora en 5 km.'}
          </p>
          <button onClick={() => setFiltro('todas')} className="text-xs underline" style={{ color: '#0B5966' }}>
            Ver todas las farmacias
          </button>
        </div>
      )}

      {/* Mapa */}
      {farmaciasMapa.length > 0 && (
        <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: 300 }}>
          <MapContainer center={[pos.lat, pos.lng]} zoom={filtro === 'turno' ? 12 : 14}
            style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
            <CentrarMapa lat={pos.lat} lng={pos.lng} />
            <Circle center={[pos.lat, pos.lng]} radius={50}
              color="#0B5966" fillColor="#0B5966" fillOpacity={0.3} />
            <Marker position={[pos.lat, pos.lng]} icon={ICONOS.usuario}>
              <Popup>Tu ubicación</Popup>
            </Marker>
            {[...cenabastList, ...turnoList, ...regularList].map(f => (
              <Marker key={f.local_id} position={[f.local_lat, f.local_lng]}
                icon={f.es_cenabast ? ICONOS.cenabast : f.es_turno ? ICONOS.turno : ICONOS.regular}>
                <Popup>
                  <div className="text-sm min-w-[180px]">
                    {f.es_cenabast && <div className="font-bold text-green-700 mb-1">🟢 Sello CENABAST</div>}
                    {f.es_turno && !f.es_cenabast && <div className="font-bold text-amber-700 mb-1">🟡 Turno hoy</div>}
                    <div className="font-semibold text-gray-900">{f.local_nombre}</div>
                    <div className="text-gray-600 mt-0.5">{f.local_direccion}</div>
                    <div className="text-gray-500">{f.comuna_nombre}</div>
                    <div className="text-gray-500 mt-1">{f.funcionamiento_hora_apertura} – {f.funcionamiento_hora_cierre}</div>
                    <div className="font-medium text-gray-700 mt-1">{f.distancia_km} km</div>
                    {f.local_telefono && (
                      <a href={`tel:${f.local_telefono}`} className="text-blue-600 block mt-1">{f.local_telefono}</a>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}

      {/* Lista de farmacias */}
      {farmaciasMapa.length > 0 && (
        <div className="mt-3 max-h-48 overflow-y-auto">
          {[...cenabastList, ...turnoList, ...regularList].slice(0, 10).map(f => (
            <div key={f.local_id} className="flex items-center gap-3 py-2.5 border-t border-gray-100">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                f.es_cenabast ? 'bg-[#1D9E75]' : f.es_turno ? 'bg-[#EF9F27]' : 'bg-gray-400'
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{f.local_nombre}</p>
                <p className="text-xs text-gray-500 truncate">{f.local_direccion}, {f.comuna_nombre}</p>
                <p className="text-xs text-gray-400">{f.funcionamiento_hora_apertura} – {f.funcionamiento_hora_cierre}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs font-medium text-gray-600">{f.distancia_km} km</p>
                {f.local_telefono && (
                  <a href={`tel:${f.local_telefono}`} className="text-xs text-blue-500 block">{f.local_telefono}</a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Link remediosmasbaratos.cl */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <a href={`https://www.remediosmasbaratos.cl/${nombreMedicamento ? `?busqueda=${encodeURIComponent(nombreMedicamento)}` : ''}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs hover:underline" style={{ color: '#0B5966' }}>
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Ver todas las farmacias CENABAST en remediosmasbaratos.cl →
        </a>
      </div>
    </div>
  )
}
