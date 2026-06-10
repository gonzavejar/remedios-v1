// app/api/ocr-receta/route.ts — versión 4
// Usa Google Gemini para OCR de recetas médicas chilenas.

import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { imagenBase64, mediaType } = await request.json()
    if (!imagenBase64) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'Falta GEMINI_API_KEY' }, { status: 500 })

    const prompt = `Analiza esta receta médica chilena.

IMPORTANTE — PRIVACIDAD: NO extraigas ni incluyas ningún dato personal del paciente
(nombre, RUT, dirección, edad) ni del médico. Extrae ÚNICAMENTE los medicamentos y
cómo deben tomarse.

Responde SOLO con JSON válido, sin texto adicional ni backticks:
{
  "medicamentos": [
    {
      "nombre": "nombre del medicamento",
      "dosis": "concentración, ej: 5 mg o 320/25",
      "posologia": "instrucción tal como aparece",
      "momento": ["mañana"]
    }
  ],
  "permanente": true
}

Para "momento": "cada noche" → ["noche"], "una por día" → ["mañana"],
"cada 12 horas" → ["mañana","noche"], "cada 8 horas" → ["mañana","mediodia","noche"].
Si dice "permanente" o "crónico", pon permanente: true.`

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: mediaType ?? 'image/jpeg',
                  data: imagenBase64,
                }
              },
              { text: prompt }
            ]
          }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 1500,
          }
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
      return NextResponse.json({ ok: false, error: 'No se pudo leer la receta. Agrega los remedios manualmente.' })
    }
  } catch (error) {
    console.error('Error OCR receta:', error)
    return NextResponse.json({ ok: false, error: 'Error al procesar el archivo.' }, { status: 500 })
  }
}
