// app/api/buscar/route.ts
// Autocompletado: busca por nombre comercial O principio activo.
// "adalimumab" encuentra "Humira 40 mg" porque busca en la columna
// `principios` de la vista v_producto_detalle.

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim()

  if (!q || q.length < 2) {
    return NextResponse.json({ resultados: [] })
  }

  const patron = `%${q}%`

  // La vista v_producto_detalle tiene la columna `principios` con todos
  // los nombres de los principios activos concatenados (ej. "adalimumab").
  // Buscar en ambas columnas resuelve el problema nombre-comercial vs genérico.
  const { data, error } = await supabase
    .from('v_producto_detalle')
    .select('producto_id, nombre_comercial, principios, dosis_forma')
    .or(`nombre_comercial.ilike.${patron},principios.ilike.${patron}`)
    .limit(8)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Renombrar producto_id a id para simplificar en el frontend
  const resultados = (data ?? []).map((r: {
    producto_id: number
    nombre_comercial: string
    principios: string
    dosis_forma: string
  }) => ({
    id: r.producto_id,
    nombre_comercial: r.nombre_comercial,
    principios: r.principios,
    dosis_forma: r.dosis_forma,
  }))

  return NextResponse.json({ resultados })
}
