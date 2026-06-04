'use client'
// components/MapaFarmacias.tsx
// Mapa Leaflet con OpenStreetMap mostrando farmacias cercanas.
// Importado dinámicamente desde page.tsx para evitar errores SSR.

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Solución al problema de íconos en Next.js + Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Íconos personalizados por tipo de farmacia
function crearIcono(color: string, size = 28) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;
      background:${color};border:2px solid white;
      transform:rotate(-45deg);box-shadow:0 2px 4px rgba(0,0,0,.3);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  })
}

const ICONOS = {
  cenabast: crearIcono('#1D9E75'),   // verde CENABAST
  turno:    crearIcono('#EF9F27'),   // naranja turno
  regular:  crearIcono('#9CA3AF'),   // gris regular
  usuario:  crearIcono('#0B5966', 24), // teal usuario
}

// Componente que centra el mapa en las coordenadas del usuario
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

interface Props {
  nombreMedicamento?: string
}

export default function MapaFarmacias({ nombreMedicamento }: Props) {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null)
  const [farmacias, setFarmacias] = useState<Farmacia[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [soloTurno, setSoloTurno] = useState(false)

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Tu navegador no soporta geolocalización.')
      setCargando(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        setPos({ lat, lng })

        try {
          const res = await fetch(`/api/farmacias?lat=${lat}&lng=${lng}&radio=5`)
          if (!res.ok) throw new Error('Error al cargar farmacias')
          const data = await res.json()
          setFarmacias(data.farmacias ?? [])
        } catch {
          setError('No se pudieron cargar las farmacias. Intenta de nuevo.')
        } finally {
          setCargando(false)
        }
      },
      () => {
        setError('No se pudo obtener tu ubicación. Verifica los permisos del navegador.')
        setCargando(false)
      },
      { timeout: 10000 }
    )
  }, [])

  // Aplicar filtro de turno si está activo
  const farmaciasFiltradas = soloTurno
    ? farmacias.filter(f => f.es_turno || f.es_cenabast)
    : farmacias

  const cenabast = farmaciasFiltradas.filter(f => f.es_cenabast)
  const turno    = farmaciasFiltradas.filter(f => f.es_turno && !f.es_cenabast)
  const regular  = farmaciasFiltradas.filter(f => !f.es_cenabast && !f.es_turno)

  if (cargando) return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mb-3"
        style={{ borderColor: '#0B5966', borderTopColor: 'transparent' }} />
      <p className="text-sm text-gray-500">Obteniendo tu ubicación...</p>
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
        <button
          onClick={() => setSoloTurno(false)}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-medium transition-colors ${
            !soloTurno
              ? 'text-white'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
          style={!soloTurno ? { background: '#0B5966' } : {}}
        >
          Todas las farmacias
        </button>
        <button
          onClick={() => setSoloTurno(true)}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-medium transition-colors ${
            soloTurno
              ? 'bg-amber-500 text-white'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          🌙 Solo turno ahora
        </button>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-3 mb-3 px-1">
        <span className="flex items-center gap-1.5 text-xs text-gray-600">
          <span className="w-3 h-3 rounded-full bg-[#1D9E75] inline-block"/>
          Sello CENABAST ({cenabast.length})
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-600">
          <span className="w-3 h-3 rounded-full bg-[#EF9F27] inline-block"/>
          Turno hoy ({turno.length})
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-600">
          <span className="w-3 h-3 rounded-full bg-gray-400 inline-block"/>
          Regular ({regular.length})
        </span>
      </div>

      {/* Mapa */}
      <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: 320 }}>
        <MapContainer
          center={[pos.lat, pos.lng]}
          zoom={14}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <CentrarMapa lat={pos.lat} lng={pos.lng} />

          {/* Tu ubicación */}
          <Circle center={[pos.lat, pos.lng]} radius={50}
            color="#0B5966" fillColor="#0B5966" fillOpacity={0.3} />
          <Marker position={[pos.lat, pos.lng]} icon={ICONOS.usuario}>
            <Popup>Tu ubicación</Popup>
          </Marker>

          {/* Farmacias CENABAST */}
          {cenabast.map(f => (
            <Marker key={f.local_id} position={[f.local_lat, f.local_lng]} icon={ICONOS.cenabast}>
              <Popup>
                <div className="text-sm">
                  <div className="font-bold text-green-700">🟢 Sello CENABAST</div>
                  <div className="font-medium mt-1">{f.local_nombre}</div>
                  <div className="text-gray-600">{f.local_direccion}</div>
                  <div className="text-gray-500">{f.comuna_nombre}</div>
                  <div className="text-gray-500 mt-1">
                    {f.funcionamiento_hora_apertura} – {f.funcionamiento_hora_cierre}
                  </div>
                  <div className="font-medium text-gray-700 mt-1">{f.distancia_km} km</div>
                  {f.local_telefono && (
                    <a href={`tel:${f.local_telefono}`} className="text-blue-600 block mt-1">
                      {f.local_telefono}
                    </a>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Farmacias de turno */}
          {turno.map(f => (
            <Marker key={f.local_id} position={[f.local_lat, f.local_lng]} icon={ICONOS.turno}>
              <Popup>
                <div className="text-sm">
                  <div className="font-bold text-amber-700">🟡 Turno hoy</div>
                  <div className="font-medium mt-1">{f.local_nombre}</div>
                  <div className="text-gray-600">{f.local_direccion}</div>
                  <div className="text-gray-500">{f.comuna_nombre}</div>
                  <div className="text-gray-500 mt-1">
                    {f.funcionamiento_hora_apertura} – {f.funcionamiento_hora_cierre}
                  </div>
                  <div className="font-medium text-gray-700 mt-1">{f.distancia_km} km</div>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Farmacias regulares */}
          {regular.map(f => (
            <Marker key={f.local_id} position={[f.local_lat, f.local_lng]} icon={ICONOS.regular}>
              <Popup>
                <div className="text-sm">
                  <div className="font-medium">{f.local_nombre}</div>
                  <div className="text-gray-600">{f.local_direccion}</div>
                  <div className="text-gray-500">{f.comuna_nombre}</div>
                  <div className="text-gray-500 mt-1">
                    {f.funcionamiento_hora_apertura} – {f.funcionamiento_hora_cierre}
                  </div>
                  <div className="font-medium text-gray-700 mt-1">{f.distancia_km} km</div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Mensaje cuando no hay resultados con el filtro activo */}
      {soloTurno && farmaciasFiltradas.length === 0 && (
        <div className="mt-3 py-4 text-center">
          <p className="text-sm text-gray-500">No hay farmacias de turno en un radio de 5 km.</p>
          <button
            onClick={() => setSoloTurno(false)}
            className="mt-2 text-xs underline"
            style={{ color: '#0B5966' }}
          >
            Ver todas las farmacias
          </button>
        </div>
      )}

      {/* Lista de las 3 CENABAST más cercanas */}
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

      {/* Link a remediosmasbaratos.cl */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <a
          href={`https://www.remediosmasbaratos.cl/${nombreMedicamento ? `?busqueda=${encodeURIComponent(nombreMedicamento)}` : ''}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-[#0B5966] hover:underline"
        >
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
