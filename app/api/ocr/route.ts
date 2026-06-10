// app/api/ocr/route.ts — versión 4
// Gemini 2.5 Flash — detecta descuentos correctamente

import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { imagenBase64, mediaType } = await request.json()
    if (!imagenBase64) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'Falta GEMINI_API_KEY' }, { status: 500 })

    const prompt = `Analiza esta boleta de farmacia chilena.

INSTRUCCIONES IMPORTANTES:
- El precio_unitario debe ser el precio FINAL pagado por producto (después de restar cualquier descuento)
- Si hay líneas de descuento (DCTO, ALIANZA, CLUB, CONVENIO, etc.) réstalas al precio original
- Para tipo_descuento_detectado usa: "club" si hay Club farmacia o Alianza banco, "convenio" si hay convenio Fonasa/Isapre/Caja, "ninguno" si no hay descuento
- Incluye SOLO medicamentos, no otros productos

Responde SOLO con JSON válido, sin texto adicional, sin backticks:
{
  "farmacia": "nombre de la cadena",
  "comuna": "comuna o null",
  "fecha": "YYYY-MM-DD o null",
  "productos": [
    {
      "nombre_boleta": "nombre exacto como aparece",
      "nombre_generico": "principio activo en español",
      "precio_unitario": 17505,
      "cantidad": 1
    }
  ],
  "descuento_detectado": true,
  "tipo_descuento_detectado": "club"
}`

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
          generationConfig: { temperature: 0, maxOutputTokens: 2000 }
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
      let textoLimpio = texto.replace(/```json|```/g, '').trim()
      // Si el JSON está incompleto, intentar cerrarlo
      if (!textoLimpio.endsWith('}')) {
        if (!textoLimpio.includes('"descuento_detectado"')) {
          const abiertos = (textoLimpio.match(/\[/g) || []).length - (textoLimpio.match(/\]/g) || []).length
          for (let i = 0; i < abiertos; i++) textoLimpio += ']'
          textoLimpio += ', "descuento_detectado": false, "tipo_descuento_detectado": "ninguno"}'
        } else {
          textoLimpio += '}'
        }
      }
      const resultado = JSON.parse(textoLimpio)
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
