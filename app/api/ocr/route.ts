// app/api/ocr/route.ts — versión 3
// Migrado a Google Gemini 2.5 Flash

import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { imagenBase64, mediaType } = await request.json()
    if (!imagenBase64) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'Falta GEMINI_API_KEY' }, { status: 500 })

    const prompt = `Analiza esta boleta de farmacia chilena.
Responde SOLO con JSON válido, sin texto adicional, sin backticks:
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
Incluye SOLO medicamentos, no otros productos. Precios en pesos enteros sin puntos ni símbolos.
Si ves CLUB, CONVENIO, DCTO o DESCUENTO en la boleta, márcalo en tipo_descuento_detectado.
El precio_unitario debe ser el precio FINAL pagado (después de descuentos si los hay).`

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mediaType ?? 'image/jpeg', data: imagenBase64 } },
              { text: prompt }
            ]
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 1500 }
        })
      }
    )

    if (!response.ok) {
      const errBody = await response.text()
      console.error('Error Gemini API:', response.status, errBody)
      throw new Error(`Error Gemini API: ${response.status}`)
    }

    const data = await response.json()
    const texto = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    try {
      const resultado = JSON.parse(texto.replace(/```json|```/g, '').trim())
      return NextResponse.json({ ok: true, datos: resultado })
    } catch {
      console.error('Error parseando JSON de Gemini:', texto)
      return NextResponse.json({ ok: false, error: 'No se pudo leer la boleta. Ingresa los datos manualmente.' })
    }
  } catch (error) {
    console.error('Error OCR:', error)
    return NextResponse.json({ ok: false, error: 'Error al procesar el archivo.' }, { status: 500 })
  }
}
