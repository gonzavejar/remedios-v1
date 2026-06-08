// lib/auth.ts — versión semana 10
// Correcciones: obtenerPlanToma incluye todos los campos necesarios.
// Agrega: agregarRemedioConPosologia actualizado, generarICS para calendario.

import { supabase } from './supabase'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface UsuarioActual {
  id: string
  email: string | null
  nombre: string | null
  avatar_url: string | null
}

export interface Credenciales {
  prevision: string | null
  isapre_nombre: string | null
  caja_nombre: string | null
  club_cruz_verde: boolean
  club_ahumada: boolean
  club_salcobrand: boolean
  club_dr_simi: boolean
  tiene_seguro_comp: boolean
  seguro_comp_nombre: string | null
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function obtenerUsuario(): Promise<UsuarioActual | null> {
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) return null
  return {
    id: user.id,
    email: user.email ?? null,
    nombre: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? null,
    avatar_url: user.user_metadata?.avatar_url ?? null,
  }
}

export async function registrarConEmail(email: string, password: string) {
  const origin = typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL
  return supabase.auth.signUp({
    email, password,
    options: { emailRedirectTo: `${origin}/` },
  })
}

export async function iniciarSesionEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function iniciarSesionGoogle() {
  const origin = typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origin}/` },
  })
}

export async function cerrarSesion() {
  return supabase.auth.signOut()
}

// ─── Credenciales ─────────────────────────────────────────────────────────────

export async function obtenerCredenciales(usuarioId: string): Promise<Credenciales | null> {
  const { data } = await supabase
    .from('perfil_credencial')
    .select('*')
    .eq('usuario_id', usuarioId)
    .single()
  return data ?? null
}

export async function guardarCredenciales(usuarioId: string, creds: Partial<Credenciales>) {
  return supabase.from('perfil_credencial').upsert({
    usuario_id: usuarioId, ...creds, updated_at: new Date().toISOString(),
  })
}

export function generarHints(creds: Credenciales): string[] {
  const hints: string[] = []
  if (creds.prevision?.startsWith('fonasa'))   hints.push('Tienes Fonasa: verifica el precio preferente antes de pagar.')
  if (creds.prevision === 'isapre' && creds.isapre_nombre)
    hints.push(`Tu Isapre ${creds.isapre_nombre} podría tener convenio con alguna cadena.`)
  if (creds.caja_nombre) {
    const cajas: Record<string, string> = {
      los_andes: 'Caja Los Andes', los_heroes: 'Caja Los Héroes',
      '18_septiembre': 'Caja 18 de Septiembre', araucana: 'La Araucana', serviestado: 'ServiEstado',
    }
    hints.push(`${cajas[creds.caja_nombre] ?? 'Tu Caja'} tiene convenio con farmacias — muestra tu credencial.`)
  }
  if (creds.club_cruz_verde)   hints.push('Tu Club Cruz Verde puede darte descuento.')
  if (creds.club_ahumada)      hints.push('Tu Club Ahumada puede darte descuento.')
  if (creds.club_salcobrand)   hints.push('Tu Club Salcobrand puede darte descuento.')
  if (creds.club_dr_simi)      hints.push('Tu Club Dr. Simi puede darte descuento.')
  if (creds.tiene_seguro_comp) hints.push('Con tu seguro complementario podrías reembolsar parte — guarda la boleta.')
  return hints
}

// ─── Mis remedios ─────────────────────────────────────────────────────────────

export async function agregarRemedio(usuarioId: string, productoId: number) {
  return supabase.from('usuario_remedio')
    .upsert({ usuario_id: usuarioId, producto_id: productoId, activo: true })
}

export async function tieneRemedio(usuarioId: string, productoId: number): Promise<boolean> {
  const { data } = await supabase.from('usuario_remedio').select('id')
    .eq('usuario_id', usuarioId).eq('producto_id', productoId).eq('activo', true).single()
  return !!data
}

export async function obtenerMisRemedios(usuarioId: string) {
  const { data } = await supabase.from('usuario_remedio')
    .select('id, producto_id, notas, created_at, producto (nombre_comercial, dosis_forma)')
    .eq('usuario_id', usuarioId).eq('activo', true)
    .order('created_at', { ascending: false })
  return data ?? []
}

// ─── Plan de toma ─────────────────────────────────────────────────────────────

export async function agregarRemedioConPosologia(params: {
  usuarioId: string
  productoId: number | null
  nombreManual?: string
  dosisTexto: string
  posologia: string
  momentoToma: string[]
  permanente: boolean
}) {
  return supabase.from('usuario_remedio').upsert({
    usuario_id:   params.usuarioId,
    producto_id:  params.productoId,
    dosis_texto:  params.dosisTexto,
    posologia:    params.posologia,
    momento_toma: params.momentoToma,
    permanente:   params.permanente,
    activo:       true,
    notas:        params.productoId ? null : params.nombreManual,
  }, { onConflict: 'usuario_id,producto_id' })
}

/** Obtiene TODOS los campos del plan de toma — versión corregida */
export async function obtenerPlanToma(usuarioId: string) {
  const { data, error } = await supabase
    .from('usuario_remedio')
    .select(`
      id,
      producto_id,
      dosis_texto,
      posologia,
      momento_toma,
      dias_semana,
      duracion_dias,
      permanente,
      hora_manana,
      hora_mediodia,
      hora_noche,
      notas,
      producto (nombre_comercial, dosis_forma)
    `)
    .eq('usuario_id', usuarioId)
    .eq('activo', true)
    .order('created_at', { ascending: true })

  if (error) console.error('Error obtenerPlanToma:', error.message)
  return data ?? []
}

// ─── Precios de usuario ───────────────────────────────────────────────────────

export async function ultimoPrecioUsuario(usuarioId: string, productoId: number) {
  const { data } = await supabase.from('precio_usuario')
    .select('valor_clp, fecha_compra, farmacia_nombre, canal, tipo_descuento, credencial_usada, validado')
    .eq('usuario_id', usuarioId).eq('producto_id', productoId)
    .order('fecha_compra', { ascending: false }).limit(1).single()
  return data
}

export async function subirFotoBoleta(usuarioId: string, archivo: File): Promise<string | null> {
  const ext = archivo.name.split('.').pop() ?? 'jpg'
  const ruta = `${usuarioId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('boletas')
    .upload(ruta, archivo, { contentType: archivo.type })
  if (error) { console.error('Error subiendo foto:', error); return null }
  const { data } = supabase.storage.from('boletas').getPublicUrl(ruta)
  return data.publicUrl
}

export async function registrarPrecio(params: {
  usuarioId: string
  productoId: number | null
  valorClp: number
  fechaCompra: string
  farmaciaNombre: string
  farmaciaComuna: string
  fotoBoleta?: File | null
  canal: string
  tipoDescuento: string
  credencialUsada: string
}) {
  let fotoUrl: string | null = null
  if (params.fotoBoleta) {
    fotoUrl = await subirFotoBoleta(params.usuarioId, params.fotoBoleta)
    if (!fotoUrl) return { error: 'No se pudo subir la foto de boleta' }
  }
  const { error } = await supabase.from('precio_usuario').insert({
    usuario_id:       params.usuarioId,
    producto_id:      params.productoId,
    valor_clp:        params.valorClp,
    fecha_compra:     params.fechaCompra,
    farmacia_nombre:  params.farmaciaNombre,
    farmacia_comuna:  params.farmaciaComuna,
    foto_boleta_url:  fotoUrl,
    canal:            params.canal,
    tipo_descuento:   params.tipoDescuento,
    credencial_usada: params.credencialUsada || null,
  })
  if (error) return { error: error.message }
  return { ok: true }
}

// ─── Generador de calendario .ics ─────────────────────────────────────────────

interface RemedioICS {
  nombre: string
  dosis: string
  posologia: string
  momento_toma: string[]
  hora_manana?: string | null
  hora_mediodia?: string | null
  hora_noche?: string | null
}

/**
 * Genera un archivo .ics con recordatorios recurrentes para los remedios.
 * El usuario lo importa a su calendario (Google Calendar, Apple Calendar, etc.)
 */
export function generarICS(remedios: RemedioICS[]): string {
  const hoy = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')

  function fechaICS(date: Date, hora: string) {
    const [h, m] = hora.split(':').map(Number)
    const d = new Date(date)
    d.setHours(h, m, 0, 0)
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
  }

  const horasDefecto: Record<string, string> = {
    'mañana':   '08:00',
    'mediodia': '13:00',
    'noche':    '21:00',
  }

  let eventos = ''
  let uid = 1

  for (const r of remedios) {
    for (const momento of (r.momento_toma ?? [])) {
      const horaMap: Record<string, string | null | undefined> = {
        'mañana':   r.hora_manana,
        'mediodia': r.hora_mediodia,
        'noche':    r.hora_noche,
      }
      const hora = horaMap[momento] ?? horasDefecto[momento] ?? '08:00'
      const dtstart = fechaICS(hoy, hora)
      const dtend   = fechaICS(hoy, hora.replace(/(\d+):(\d+)/, (_, h, m) =>
        `${pad(parseInt(h))}:${pad((parseInt(m)+5) % 60)}`
      ))

      const momentoLabel = momento === 'mañana' ? 'En la mañana'
        : momento === 'mediodia' ? 'Al mediodía' : 'En la noche'

      eventos += `BEGIN:VEVENT
UID:remedios-${uid++}-${Date.now()}@remedios-v1
DTSTART:${dtstart}
DTEND:${dtend}
RRULE:FREQ=DAILY
SUMMARY:💊 ${r.nombre}${r.dosis ? ` ${r.dosis}` : ''} — ${momentoLabel}
DESCRIPTION:${r.posologia ?? '1 dosis'}
BEGIN:VALARM
TRIGGER:-PT5M
ACTION:DISPLAY
DESCRIPTION:Recordatorio: ${r.nombre}
END:VALARM
END:VEVENT
`
    }
  }

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Remedios Chile//Plan de Toma//ES
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Mi plan de remedios
X-WR-TIMEZONE:America/Santiago
${eventos}END:VCALENDAR`
}

/** Descarga el archivo .ics en el navegador */
export function descargarICS(contenido: string, nombreArchivo = 'mis-remedios.ics') {
  const blob = new Blob([contenido], { type: 'text/calendar;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
