'use client'
// components/MapaFarmacias.tsx — versión 3
// Llama directamente al MINSAL desde el navegador (evita bloqueo en Vercel).

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

export default function MapaFarmacias({ nombreMedicamento }: { nombreMedicamento?: string }) {
  const [pos, setPos]             = useState<{ lat: number; lng: number } | null>(null)
  const [farmacias, setFarmacias] = useState<Farmacia[]>([])
  const [cargando, setCargando]   = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [soloTurno, setSoloTurno] = useState(false)

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
        // Llamar directamente al MINSAL desde el navegador
        const [resLocales, resTurnos] = await Promise.allSettled([
          fetch('https://midas.minsal.cl/farmacia_v2/WS/getLocales.php'),
          fetch('https://midas.minsal.cl/farmacia_v2/WS/getLocalesTurnos.php'),
        ])

        if (resLocales.status === 'rejected') throw new Error('No se pudo conectar al MINSAL')

        const locales: any[] = await (resLocales.value as Response).json()
        const turnos: any[] = resTurnos.status === 'fulfilled'
          ? await (resTurnos.value as Response).json()
          : []

        const idsTurno = new Set(turnos.map((t: any) => String(t.local_id)))

        const cercanas: Farmacia[] = locales
          .filter((l: any) => {
            const latn = parseFloat(l.local_lat)
            const lngn = parseFloat(l.local_lng)
            return !isNaN(latn) && !isNaN(lngn) && distancia(lat, lng, latn, lngn) <= 5
          })
          .map((l: any) => ({
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
            distancia_km: Math.round(distancia(lat, lng, parseFloat(l.local_lat), parseFloat(l.local_lng)) * 10) / 10
          }))
          .sort((a, b) => a.distancia_km - b.distancia_km)
          .slice(0, 30)

        setFarmacias(cercanas)
      } catch (e) {
        setError('No se pudieron cargar las farmacias. Intenta de nuevo.')
      } finally {
        setCargando(false)
      }
    }, () => {
      setError('No se pudo obtener tu ubicación. Verifica los permisos del navegador.')
      setCargando(false)
    }, { timeout: 10000 })
  }, [])

  const filtradas  = soloTurno ? farmacias.filter(f => f.es_turno || f.es_cenabast) : farmacias
  const cenabast   = filtradas.filter(f => f.es_cenabast)
  const turno      = filtradas.filter(f => f.es_turno && !f.es_cenabast)
  const regular    = filtradas.filter(f => !f.es_cenabast && !f.es_turno)

  if (cargando) return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mb-3"
        style={{ borderColor: '#0B5966', borderTopColor: 'transparent' }} />
      <p className="text-sm text-gray-500">Cargando farmacias cercanas...</p>
    </div>
  )

  if (error) return (
    <div className="py-6 px-4 text-center">
      <p className="text-sm text-red-600 mb-3">{error}</p>
    </div>
  )

  if (!pos) return null

  return (
    <div>
      {/* Filtro turno */}
      <div className="flex gap-2 mb-3">
        <button onClick={() => setSoloTurno(false)}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-medium transition-colors ${!soloTurno ? 'text-white' : 'bg-gray-100 text-gray-500'}`}
          style={!soloTurno ? { background: '#0B5966' } : {}}>
          Todas las farmacias
        </button>
        <button onClick={() => setSoloTurno(true)}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-medium transition-colors ${soloTurno ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
          🌙 Solo turno ahora
        </button>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-3 mb-3 px-1">
        <span className="flex items-center gap-1.5 text-xs text-gray-600">
          <span className="w-3 h-3 rounded-full bg-[#1D9E75] inline-block"/>CENABAST ({cenabast.length})
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-600">
          <span className="w-3 h-3 rounded-full bg-[#EF9F27] inline-block"/>Turno ({turno.length})
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-600">
          <span className="w-3 h-3 rounded-full bg-gray-400 inline-block"/>Regular ({regular.length})
        </span>
      </div>

      {/* Mapa */}
      <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: 320 }}>
        <MapContainer center={[pos.lat, pos.lng]} zoom={14}
          style={{ height: '100%', width: '100%' }} zoomControl={true}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
          <CentrarMapa lat={pos.lat} lng={pos.lng} />
          <Circle center={[pos.lat, pos.lng]} radius={50}
            color="#0B5966" fillColor="#0B5966" fillOpacity={0.3} />
          <Marker position={[pos.lat, pos.lng]} icon={ICONOS.usuario}>
            <Popup>Tu ubicación</Popup>
          </Marker>
          {cenabast.map(f => (
            <Marker key={f.local_id} position={[f.local_lat, f.local_lng]} icon={ICONOS.cenabast}>
              <Popup><div className="text-sm">
                <div className="font-bold text-green-700">🟢 Sello CENABAST</div>
                <div className="font-medium mt-1">{f.local_nombre}</div>
                <div className="text-gray-600">{f.local_direccion}</div>
                <div className="text-gray-500">{f.comuna_nombre} · {f.distancia_km} km</div>
                <div className="text-gray-500">{f.funcionamiento_hora_apertura} – {f.funcionamiento_hora_cierre}</div>
                {f.local_telefono && <a href={`tel:${f.local_telefono}`} className="text-blue-600 block mt-1">{f.local_telefono}</a>}
              </div></Popup>
            </Marker>
          ))}
          {turno.map(f => (
            <Marker key={f.local_id} position={[f.local_lat, f.local_lng]} icon={ICONOS.turno}>
              <Popup><div className="text-sm">
                <div className="font-bold text-amber-700">🟡 Turno hoy</div>
                <div className="font-medium mt-1">{f.local_nombre}</div>
                <div className="text-gray-600">{f.local_direccion}</div>
                <div className="text-gray-500">{f.comuna_nombre} · {f.distancia_km} km</div>
                <div className="text-gray-500">{f.funcionamiento_hora_apertura} – {f.funcionamiento_hora_cierre}</div>
              </div></Popup>
            </Marker>
          ))}
          {regular.map(f => (
            <Marker key={f.local_id} position={[f.local_lat, f.local_lng]} icon={ICONOS.regular}>
              <Popup><div className="text-sm">
                <div className="font-medium">{f.local_nombre}</div>
                <div className="text-gray-600">{f.local_direccion}</div>
                <div className="text-gray-500">{f.comuna_nombre} · {f.distancia_km} km</div>
                <div className="text-gray-500">{f.funcionamiento_hora_apertura} – {f.funcionamiento_hora_cierre}</div>
              </div></Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Sin resultados con filtro activo */}
      {soloTurno && filtradas.length === 0 && (
        <div className="mt-3 py-4 text-center">
          <p className="text-sm text-gray-500">No hay farmacias de turno en 5 km.</p>
          <button onClick={() => setSoloTurno(false)} className="mt-2 text-xs underline" style={{ color: '#0B5966' }}>
            Ver todas las farmacias
          </button>
        </div>
      )}

      {/* Lista CENABAST más cercanas */}
      {cenabast.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-gray-600 mb-2">Más cercanas con Sello CENABAST:</p>
          {cenabast.slice(0, 3).map(f => (
            <div key={f.local_id} className="flex items-center gap-3 py-2 border-t border-gray-100">
              <span className="w-2 h-2 rounded-full bg-[#1D9E75] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{f.local_nombre}</p>
                <p className="text-xs text-gray-500 truncate">{f.local_direccion}, {f.comuna_nombre}</p>
              </div>
              <span className="text-xs font-medium text-gray-500 flex-shrink-0">{f.distancia_km} km</span>
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
