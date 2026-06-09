'use client'
// components/EnviarEmail.tsx — versión 2
// Abre la app de correo del usuario con el mensaje pre-redactado.
// El usuario decide a quién envía y puede editar antes de mandar.

interface Props {
  asunto: string
  textoPlano: string       // mailto solo soporta texto plano
  emailDefault?: string    // destinatario sugerido (editable por el usuario)
  labelBoton?: string
}

export default function EnviarEmail({
  asunto,
  textoPlano,
  emailDefault = '',
  labelBoton = 'Abrir en mi correo',
}: Props) {

  function handleAbrir() {
    const dest    = encodeURIComponent(emailDefault)
    const subject = encodeURIComponent(asunto)
    const body    = encodeURIComponent(textoPlano)
    window.location.href = `mailto:${dest}?subject=${subject}&body=${body}`
  }

  return (
    <div className="space-y-2">
      <p className="text-base font-semibold text-gray-700">Enviar por email</p>
      <p className="text-sm text-gray-500">
        Abre tu app de correo con el resumen listo. Puedes agregar más destinatarios antes de enviar.
      </p>
      <button
        onClick={handleAbrir}
        className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2"
        style={{ background: '#0B5966' }}
      >
        📧 {labelBoton}
      </button>
    </div>
  )
}

// ─── Helpers para generar el texto plano ──────────────────────────────────────

/** Texto plano para resumen de compra (boleta) */
export function textoResumenCompra(params: {
  farmacia: string
  fecha: string
  productos: { nombre: string; precio: number; descuento: string; credencial?: string }[]
  total: number
}): string {
  const lineas = params.productos.map(p => {
    const descuento = p.descuento !== 'ninguno'
      ? ` (${p.credencial ?? p.descuento})`
      : ''
    return `• ${p.nombre}: $${p.precio.toLocaleString('es-CL')}${descuento}`
  }).join('\n')

  return `RESUMEN DE COMPRA
${params.farmacia} — ${params.fecha}

${lineas}

Total: $${params.total.toLocaleString('es-CL')}

---
Enviado desde Mis Remedios Chile
Beneficios reales · Fuentes oficiales`
}

/** Texto plano para plan de toma (receta) */
export function textoPlanToma(params: {
  medicamentos: { nombre: string; dosis: string; posologia: string; momento: string[] }[]
  permanente: boolean
}): string {
  const porMomento = (m: string) =>
    params.medicamentos.filter(med => med.momento.includes(m))

  const seccion = (titulo: string, momento: string) => {
    const lista = porMomento(momento)
    if (lista.length === 0) return ''
    const items = lista.map(m =>
      `• ${m.nombre}${m.dosis ? ` ${m.dosis}` : ''} — ${m.posologia}`
    ).join('\n')
    return `\n${titulo}\n${items}\n`
  }

  return `MI PLAN DE REMEDIOS
${params.permanente ? 'Tratamiento crónico / permanente' : 'Tratamiento indicado'}
${seccion('EN LA MAÑANA:', 'mañana')}${seccion('AL MEDIODÍA:', 'mediodia')}${seccion('EN LA NOCHE:', 'noche')}
---
Consulta siempre con tu médico ante cualquier duda.
Enviado desde Mis Remedios Chile`
}
