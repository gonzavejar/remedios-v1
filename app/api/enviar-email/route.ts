// app/api/enviar-email/route.ts
// Envía emails usando Resend (resend.com).
// Usar para: resumen de compra de boleta y plan de receta.

import { NextRequest, NextResponse } from 'next/server'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL    = process.env.FROM_EMAIL ?? 'Mis Remedios <onboarding@resend.dev>'

export async function POST(request: NextRequest) {
  if (!RESEND_API_KEY) {
    return NextResponse.json(
      { error: 'Email no configurado. Agrega RESEND_API_KEY en las variables de entorno.' },
      { status: 500 }
    )
  }

  try {
    const { destinatario, asunto, html, texto } = await request.json()

    if (!destinatario || !asunto) {
      return NextResponse.json({ error: 'Faltan destinatario o asunto.' }, { status: 400 })
    }

    // Validar formato de email básico
    if (!destinatario.includes('@')) {
      return NextResponse.json({ error: 'Email inválido.' }, { status: 400 })
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      [destinatario],
        subject: asunto,
        html:    html ?? `<p>${texto ?? ''}</p>`,
        text:    texto,
      }),
    })

    if (!response.ok) {
      const err = await response.json()
      console.error('Resend error:', err)
      return NextResponse.json(
        { error: `Error al enviar: ${err.message ?? response.statusText}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json({ ok: true, id: data.id })

  } catch (error) {
    console.error('Error email:', error)
    return NextResponse.json({ error: 'Error interno al enviar el email.' }, { status: 500 })
  }
}

// ─── Helpers para generar el HTML de cada tipo ────────────────────────────────

/** HTML para resumen de compra (boleta) */
export function htmlResumenCompra(params: {
  farmacia: string
  fecha: string
  productos: { nombre: string; precio: number; descuento: string; credencial?: string }[]
  total: number
}): string {
  const filas = params.productos.map(p => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;">
        <strong style="color:#1A2E2E;font-size:16px;">💊 ${p.nombre}</strong>
      </td>
      <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;text-align:right;font-size:16px;font-weight:bold;color:#0B5966;">
        $${p.precio.toLocaleString('es-CL')}
        ${p.descuento !== 'ninguno'
          ? `<br><span style="font-size:12px;color:#B45309;font-weight:normal;">${p.credencial ?? p.descuento}</span>`
          : ''}
      </td>
    </tr>
  `).join('')

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#f9fafb;margin:0;padding:20px;">
  <div style="max-width:500px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

    <!-- Header -->
    <div style="background:#0B5966;padding:24px;text-align:center;">
      <h1 style="color:white;margin:0;font-size:22px;">🧾 Resumen de compra</h1>
      <p style="color:#A8D8CE;margin:8px 0 0;font-size:15px;">
        ${params.farmacia} · ${params.fecha}
      </p>
    </div>

    <!-- Productos -->
    <div style="padding:20px 24px;">
      <table style="width:100%;border-collapse:collapse;">
        ${filas}
        <tr>
          <td style="padding:16px 0 0;font-size:16px;font-weight:bold;color:#1A2E2E;">Total pagado</td>
          <td style="padding:16px 0 0;text-align:right;font-size:22px;font-weight:bold;color:#0B5966;">
            $${params.total.toLocaleString('es-CL')}
          </td>
        </tr>
      </table>
    </div>

    <!-- Footer -->
    <div style="background:#EFF4F0;padding:16px 24px;text-align:center;">
      <p style="color:#6B7280;font-size:13px;margin:0;">
        Enviado desde <strong>Mis Remedios Chile</strong><br>
        Beneficios reales · Fuentes oficiales
      </p>
    </div>
  </div>
</body>
</html>`
}

/** HTML para plan de toma (receta) */
export function htmlPlanToma(params: {
  medicamentos: {
    nombre: string
    dosis: string
    posologia: string
    momento: string[]
  }[]
  permanente: boolean
}): string {
  const porMomento = (momento: string) =>
    params.medicamentos.filter(m => m.momento.includes(momento))

  const seccion = (emoji: string, titulo: string, momento: string) => {
    const lista = porMomento(momento)
    if (lista.length === 0) return ''
    return `
      <div style="margin-bottom:20px;">
        <h2 style="color:#0B5966;font-size:18px;margin:0 0 10px;border-bottom:2px solid #EFF4F0;padding-bottom:8px;">
          ${emoji} ${titulo}
        </h2>
        ${lista.map(m => `
          <div style="padding:10px 0;border-bottom:1px solid #f3f4f6;">
            <strong style="color:#1A2E2E;font-size:16px;">💊 ${m.nombre}${m.dosis ? ` ${m.dosis}` : ''}</strong>
            <p style="color:#6B7280;margin:4px 0 0;font-size:14px;">${m.posologia}</p>
          </div>
        `).join('')}
      </div>
    `
  }

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#f9fafb;margin:0;padding:20px;">
  <div style="max-width:500px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

    <div style="background:#0B5966;padding:24px;text-align:center;">
      <h1 style="color:white;margin:0;font-size:22px;">💊 Plan de remedios</h1>
      <p style="color:#A8D8CE;margin:8px 0 0;font-size:15px;">
        ${params.permanente ? 'Tratamiento crónico / permanente' : 'Tratamiento indicado'}
      </p>
    </div>

    <div style="padding:20px 24px;">
      ${seccion('🌅', 'En la mañana',  'mañana')}
      ${seccion('☀️', 'Al mediodía',   'mediodia')}
      ${seccion('🌙', 'En la noche',   'noche')}
    </div>

    <div style="background:#EFF4F0;padding:16px 24px;text-align:center;">
      <p style="color:#6B7280;font-size:13px;margin:0;">
        Enviado desde <strong>Mis Remedios Chile</strong><br>
        Consulta siempre con tu médico ante cualquier duda.
      </p>
    </div>
  </div>
</body>
</html>`
}
