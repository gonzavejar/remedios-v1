// app/api/remedio/route.ts  (versión 2)
// Acepta ?id=X  (desde el autocompletado — más preciso)
// Acepta ?nombre=X (URL de prueba directa — compatibilidad)

import { NextRequest, NextResponse } from 'next/server'
import { consultarMotorPorId, consultarMotor } from '../../../lib/motor'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const nombre = searchParams.get('nombre')

  if (!id && !nombre) {
    return NextResponse.json(
      { error: 'Falta el parámetro. Usa ?id=X o ?nombre=texto' },
      { status: 400 }
    )
  }

  try {
    const tarjeta = id
      ? await consultarMotorPorId(parseInt(id))
      : await consultarMotor(nombre!)

    if (!tarjeta) {
      return NextResponse.json(
        { error: 'Medicamento no encontrado',
          sugerencia: 'Prueba: losartan, levotiroxina, humira, iltuxam, clotiazepam' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      ok: true,
      tarjeta,
      resumen: {
        medicamento: tarjeta.nombreComercial,
        tag: tarjeta.tag,
        pagas: tarjeta.precioLista
          ? `$${tarjeta.precioLista.toLocaleString('es-CL')}`
          : 'sin precio registrado',
        deberiasPagar: typeof tarjeta.precioObjetivo === 'number'
          ? `$${tarjeta.precioObjetivo.toLocaleString('es-CL')}`
          : tarjeta.precioObjetivo,
        paso: tarjeta.paso,
      }
    })
  } catch (error) {
    console.error('Error en el motor:', error)
    return NextResponse.json(
      { error: 'Error interno. Revisa la consola del servidor.' },
      { status: 500 }
    )
  }
}
