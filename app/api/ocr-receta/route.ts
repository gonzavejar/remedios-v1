// app/api/ocr-receta/route.ts — versión 2
// Acepta imágenes Y PDFs. Solo extrae medicamentos y posología, nunca datos personales.

import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { imagenBase64, mediaType } = await request.json()
    if (!imagenBase64) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })

    const esPDF = mediaType === 'application/pdf'

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
              text: `Analiza esta receta médica chilena.

IMPORTANTE — PRIVACIDAD: NO extraigas ni incluyas ningún dato personal del paciente
(nombre, RUT, dirección, edad) ni del médico. Extrae ÚNICAMENTE los medicamentos y
cómo deben tomarse.

Responde SOLO con JSON válido, sin texto adicional:
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
      return NextResponse.json({ ok: false, error: 'No se pudo leer la receta. Agrega los remedios manualmente.' })
    }
  } catch (error) {
    console.error('Error OCR receta:', error)
    return NextResponse.json({ ok: false, error: 'Error al procesar el archivo.' }, { status: 500 })
  }
}
