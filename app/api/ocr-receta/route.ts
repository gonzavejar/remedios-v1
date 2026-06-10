// app/api/ocr-receta/route.ts — versión 6
// Prompt optimizado para recetas chilenas: privadas, SNRE, boletas y manuscritas

import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { imagenBase64, mediaType } = await request.json()
    if (!imagenBase64) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'Falta GEMINI_API_KEY' }, { status: 500 })

    const prompt = `Eres un experto farmacéutico chileno con 20 años de experiencia leyendo recetas médicas de todo tipo.

Analiza esta imagen. Puede ser:
1. RECETA PRIVADA digital (clínica, consulta particular) — letra de computador, bien estructurada
2. RECETA ELECTRÓNICA SNRE de MINSAL — formato digital oficial, tiene código de 20 caracteres
3. RECETA MANUSCRITA — letra de médico, puede ser difícil de leer, con abreviaturas
4. BOLETA DE FARMACIA — Cruz Verde, Ahumada, Salcobrand, Dr. Simi, etc.

PARA RECETAS MANUSCRITAS — instrucciones especiales:
- Los médicos usan abreviaturas latinas: "c/8h" = cada 8 horas, "c/12h" = cada 12 horas, "c/24h" = una vez al día, "SOS" = solo si es necesario, "ac" = antes de comer, "pc" = después de comer, "hs" = antes de dormir
- Los nombres pueden estar abreviados o en DCI (nombre genérico): "Amlo" = Amlodipino, "Losart" = Losartán, "Metf" = Metformina, "Atorv" = Atorvastatina
- La dosis puede estar escrita como fracción: "1/2 comp" = medio comprimido
- Si la letra es ilegible en algún campo, escribe tu mejor interpretación entre paréntesis: "(posiblemente Enalapril)"
- Busca el número de unidades: "1-0-1" significa mañana y noche, "1-1-1" significa mañana, mediodía y noche, "0-0-1" significa solo en la noche

REGLAS DE PRIVACIDAD — MUY IMPORTANTE:
- NO extraigas nombre del paciente, RUT, dirección, edad ni datos del médico
- SOLO extrae medicamentos, dosis e instrucciones de toma

INTERPRETACIÓN DE HORARIOS:
- "cada noche" / "hs" / "0-0-1" / "en la noche" → ["noche"]
- "en la mañana" / "1-0-0" / "en ayunas" / "ac desayuno" → ["mañana"]
- "1-0-1" / "cada 12h" / "c/12h" / "dos veces al día" → ["mañana","noche"]
- "1-1-1" / "cada 8h" / "c/8h" / "tres veces al día" → ["mañana","mediodia","noche"]
- "con almuerzo" / "0-1-0" / "pc almuerzo" → ["mediodia"]
- "una vez al día" / "c/24h" sin horario especificado → ["mañana"]

Responde ÚNICAMENTE con JSON válido, sin texto adicional, sin backticks, sin comentarios:
{
  "tipo": "receta_digital" o "receta_snre" o "receta_manuscrita" o "boleta",
  "medicamentos": [
    {
      "nombre": "nombre del medicamento (mejor interpretación si es manuscrito)",
      "dosis": "concentración y forma, ej: 5 mg comprimido",
      "posologia": "instrucción completa tal como aparece, o interpretada si es manuscrita",
      "momento": ["mañana"]
    }
  ],
  "permanente": false,
  "codigo_receta": "código de 20 caracteres si es receta SNRE, o null",
  "advertencia": "si algo fue difícil de leer o es una interpretación, explícalo brevemente aquí, si no hay nada que advertir pon null"
}`

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
            maxOutputTokens: 2000,
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
      if (!resultado.medicamentos?.length) {
        return NextResponse.json({ ok: false, error: 'No se detectaron medicamentos. Intenta con mejor iluminación o ingresa los datos manualmente.' })
      }
      return NextResponse.json({ ok: true, datos: resultado })
    } catch {
      console.error('Error parseando JSON de Gemini:', texto)
      return NextResponse.json({ ok: false, error: 'No se pudo leer el documento. Intenta con mejor iluminación o ingresa los datos manualmente.' })
    }
  } catch (error) {
    console.error('Error OCR receta:', error)
    return NextResponse.json({ ok: false, error: 'Error al procesar el archivo.' }, { status: 500 })
  }
}
