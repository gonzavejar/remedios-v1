// app/api/ocr-receta/route.ts — versión 7
// Soporta imágenes Y PDFs con Gemini 2.5 Flash

import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { imagenBase64, mediaType } = await request.json()
    if (!imagenBase64) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'Falta GEMINI_API_KEY' }, { status: 500 })

    const esPDF = mediaType === 'application/pdf'

    // Gemini usa inline_data para imágenes y file_data structure para PDFs
    // Para PDFs usamos el mismo inline_data pero con mime_type correcto
    const archivoPart = esPDF
      ? {
          inline_data: {
            mime_type: 'application/pdf',
            data: imagenBase64,
          }
        }
      : {
          inline_data: {
            mime_type: mediaType ?? 'image/jpeg',
            data: imagenBase64,
          }
        }

    const prompt = `Eres un experto farmacéutico chileno con 20 años de experiencia leyendo recetas médicas de todo tipo.

Analiza este documento. Puede ser:
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
- "cada noche" / "hs" / "0-0-1" / "en la noche" / "tarde" → ["noche"]
- "en la mañana" / "1-0-0" / "en ayunas" / "ac desayuno" → ["mañana"]
- "1-0-1" / "cada 12h" / "c/12h" / "dos veces al día" → ["mañana","noche"]
- "1-1-1" / "cada 8h" / "c/8h" / "tres veces al día" → ["mañana","mediodia","noche"]
- "con almuerzo" / "0-1-0" / "pc almuerzo" / "tarde" → ["mediodia"]
- "una vez al día" / "c/24h" sin horario especificado → ["mañana"]
- "SOS" o "en caso de dolor/crisis" → ["mañana"] con posologia que indique SOS

Responde ÚNICAMENTE con JSON válido, sin texto adicional, sin backticks, sin comentarios:
{
  "tipo": "receta_digital",
  "medicamentos": [
    {
      "nombre": "nombre del medicamento",
      "dosis": "concentración y forma, ej: 50 mg comprimido",
      "posologia": "instrucción completa tal como aparece",
      "momento": ["mañana"]
    }
  ],
  "permanente": true,
  "codigo_receta": null,
  "advertencia": null
}`

    const modelos = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro']
    let response: Response | null = null
    let lastError = ''

    for (const modelo of modelos) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [archivoPart, { text: prompt }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 3000 }
          })
        }
      )
      if (res.ok) { response = res; break }
      const errBody = await res.text()
      lastError = `Error Gemini API (${modelo}): ${res.status} ${errBody}`
      console.error(lastError)
      // Solo reintentar en 503 (saturado) o 429 (cuota), no en 404 o 400
      if (res.status !== 503 && res.status !== 429) break
    }

    if (!response) throw new Error(lastError)

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
