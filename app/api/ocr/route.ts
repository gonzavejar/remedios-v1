// app/api/ocr/route.ts — versión 2
// Acepta imágenes (jpg, png, webp) Y archivos PDF.

import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { imagenBase64, mediaType } = await request.json()
    if (!imagenBase64) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })

    const esPDF = mediaType === 'application/pdf'

    // Contenido de la imagen o PDF para Claude
    const contenido = esPDF
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: imagenBase64 } }
      : { type: 'image',    source: { type: 'base64', media_type: mediaType ?? 'image/jpeg', data: imagenBase64 } }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            contenido,
            {
              type: 'text',
              text: `Analiza esta boleta de farmacia chilena.
Responde SOLO con JSON válido, sin texto adicional:
{
  "farmacia": "nombre de la cadena o farmacia",
  "comuna": "comuna si aparece o null",
  "fecha": "YYYY-MM-DD o null",
  "productos": [
    {
      "nombre_boleta": "nombre exacto como aparece en la boleta",
      "nombre_generico": "principio activo probable en español",
      "precio_unitario": 1234,
      "cantidad": 1
    }
  ],
  "descuento_detectado": false,
  "tipo_descuento_detectado": "club/convenio/ninguno"
}
Incluye SOLO medicamentos. Precios en pesos enteros sin puntos ni símbolos.
Si ves CLUB, CONVENIO o DESCUENTO en la boleta, márcalo en tipo_descuento_detectado.`
            }
          ]
        }]
      })
    })

    if (!response.ok) throw new Error(`Error Claude API: ${response.status}`)
    const data = await response.json()
    const texto = data.content?.[0]?.text ?? ''

    try {
      const resultado = JSON.parse(texto.replace(/```json|```/g, '').trim())
      return NextResponse.json({ ok: true, datos: resultado })
    } catch {
      return NextResponse.json({ ok: false, error: 'No se pudo leer la boleta. Ingresa los datos manualmente.' })
    }
  } catch (error) {
    console.error('Error OCR:', error)
    return NextResponse.json({ ok: false, error: 'Error al procesar el archivo.' }, { status: 500 })
  }
}
