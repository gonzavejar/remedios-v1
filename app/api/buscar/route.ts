// app/api/buscar/route.ts — versión 2
// Búsqueda mejorada con tolerancia a typos (pg_trgm similarity).
// "lozartan" encuentra "losartán", "metformiba" encuentra "metformina", etc.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json({ resultados: [] })

  try {
    // 1. Búsqueda exacta/parcial primero (más rápida y relevante)
    const { data: exactos } = await supabase
      .from('v_producto_detalle')
      .select('id, nombre_comercial, principios, dosis_forma, cenabast, precio_cenabast, precio_lista')
      .or(`nombre_comercial.ilike.%${q}%,principios.ilike.%${q}%`)
      .limit(8)

    // 2. Si hay suficientes resultados exactos, retornar directamente
    if (exactos && exactos.length >= 3) {
      return NextResponse.json({ resultados: exactos, fuzzy: false })
    }

    // 3. Búsqueda fuzzy con similitud de trigrams para typos
    // Usa RPC para llamar a la función de similitud de PostgreSQL
    const { data: fuzzy } = await supabase.rpc('buscar_producto_fuzzy', { 
      query: q,
      umbral: 0.2,
      limite: 8
    })

    // 4. Combinar resultados sin duplicados
    const idsExactos = new Set((exactos ?? []).map((r: any) => r.id))
    const fuzzyNuevos = (fuzzy ?? []).filter((r: any) => !idsExactos.has(r.id))
    const combinados  = [...(exactos ?? []), ...fuzzyNuevos].slice(0, 8)

    return NextResponse.json({
      resultados: combinados,
      fuzzy: fuzzyNuevos.length > 0,
      sugerencia: fuzzyNuevos[0]?.nombre_comercial ?? null,
    })

  } catch (error) {
    // Fallback a búsqueda simple si pg_trgm no está disponible
    const { data } = await supabase
      .from('v_producto_detalle')
      .select('id, nombre_comercial, principios, dosis_forma, cenabast, precio_cenabast, precio_lista')
      .or(`nombre_comercial.ilike.%${q}%,principios.ilike.%${q}%`)
      .limit(8)

    return NextResponse.json({ resultados: data ?? [], fuzzy: false })
  }
}
