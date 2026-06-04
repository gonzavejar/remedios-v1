// app/api/farmacias/route.ts
// Proxy al MINSAL que filtra las farmacias más cercanas al usuario.
// Recibe: ?lat=X&lng=Y&radio=5 (radio en km, default 5)
// Devuelve: array de farmacias ordenadas por distancia, con flag cenabast y turno.

import { NextRequest, NextResponse } from 'next/server'

// Cadenas oficialmente adheridas a Ley CENABAST
const CADENAS_CENABAST = ['SALCOBRAND']

// Fórmula Haversine para distancia entre dos coordenadas (en km)
function distancia(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export interface Farmacia {
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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lng = parseFloat(searchParams.get('lng') ?? '')
  const radio = parseFloat(searchParams.get('radio') ?? '5')

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json(
      { error: 'Faltan coordenadas. Usa ?lat=X&lng=Y' },
      { status: 400 }
    )
  }

  try {
    // Llamar ambas APIs en paralelo
    const [resLocales, resTurnos] = await Promise.all([
      fetch('https://midas.minsal.cl/farmacia_v2/WS/getLocales.php', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        next: { revalidate: 3600 } // cachear 1 hora
      }),
      fetch('https://midas.minsal.cl/farmacia_v2/WS/getLocalesTurnos.php', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        next: { revalidate: 1800 } // cachear 30 min
      })
    ])

    if (!resLocales.ok) {
      throw new Error('Error al consultar MINSAL')
    }

    const locales: any[] = await resLocales.json()
    const turnos: any[] = resTurnos.ok ? await resTurnos.json() : []

    // IDs de farmacias de turno hoy
    const idsTurno = new Set(turnos.map((t: any) => String(t.local_id)))

    // Filtrar por distancia y construir resultado
    const cercanas: Farmacia[] = locales
      .filter((l: any) => {
        const latn = parseFloat(l.local_lat)
        const lngn = parseFloat(l.local_lng)
        if (isNaN(latn) || isNaN(lngn)) return false
        return distancia(lat, lng, latn, lngn) <= radio
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
        es_cenabast: CADENAS_CENABAST.some(c => String(l.local_nombre ?? '').toUpperCase().includes(c)),
        es_turno: idsTurno.has(String(l.local_id)),
        distancia_km: Math.round(distancia(lat, lng, parseFloat(l.local_lat), parseFloat(l.local_lng)) * 10) / 10
      }))
      .sort((a, b) => a.distancia_km - b.distancia_km)
      .slice(0, 30) // máximo 30 farmacias

    return NextResponse.json({ farmacias: cercanas, total: cercanas.length })

  } catch (error) {
    console.error('Error consultando MINSAL:', error)
    return NextResponse.json(
      { error: 'No se pudo consultar el servicio del MINSAL. Intenta de nuevo.' },
      { status: 503 }
    )
  }
}
