// lib/auth.ts
import { supabase } from './supabase'

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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return {
    id: user.id,
    email: user.email ?? null,
    nombre: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? null,
    avatar_url: user.user_metadata?.avatar_url ?? null,
  }
}

export async function registrarConEmail(email: string, password: string) {
  return supabase.auth.signUp({
    email, password,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
  })
}

export async function iniciarSesionEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function iniciarSesionGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
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
    usuario_id: usuarioId,
    ...creds,
    updated_at: new Date().toISOString(),
  })
}

// Genera hints personalizados según las credenciales del usuario
export function generarHints(creds: Credenciales): string[] {
  const hints: string[] = []
  if (creds.prevision?.startsWith('fonasa')) {
    hints.push('Tienes Fonasa: verifica el precio preferente antes de pagar.')
  }
  if (creds.prevision === 'isapre' && creds.isapre_nombre) {
    hints.push(`Tu Isapre ${creds.isapre_nombre} podría tener convenio con alguna cadena — consulta antes de comprar.`)
  }
  if (creds.caja_nombre) {
    const cajas: Record<string, string> = {
      los_andes: 'Caja Los Andes',
      los_heroes: 'Caja Los Héroes',
      '18_septiembre': 'Caja 18 de Septiembre',
      araucana: 'La Araucana',
      serviestado: 'ServiEstado',
    }
    const nombre = cajas[creds.caja_nombre] ?? 'tu Caja de Compensación'
    hints.push(`${nombre} tiene convenio con farmacias — muestra tu credencial en caja.`)
  }
  if (creds.club_cruz_verde)  hints.push('Tu Club Cruz Verde puede darte descuento en esa cadena.')
  if (creds.club_ahumada)     hints.push('Tu Club Ahumada puede darte descuento en esa cadena.')
  if (creds.club_salcobrand)  hints.push('Tu Club Salcobrand puede darte descuento adicional.')
  if (creds.club_dr_simi)     hints.push('Tu Club Dr. Simi puede aplicar descuento en esa farmacia.')
  if (creds.tiene_seguro_comp) hints.push('Con tu seguro complementario podrías reembolsar parte del valor — guarda la boleta.')
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
  fotoBoleta?: File | null   // foto opcional
  canal: string
  tipoDescuento: string
  credencialUsada: string
}) {
  // Subir foto solo si existe
  let fotoUrl: string | null = null
  if (params.fotoBoleta) {
    fotoUrl = await subirFotoBoleta(params.usuarioId, params.fotoBoleta)
    if (!fotoUrl) return { error: 'No se pudo subir la foto de boleta' }
  }

  const { error } = await supabase.from('precio_usuario').insert({
    usuario_id:      params.usuarioId,
    producto_id:     params.productoId,
    valor_clp:       params.valorClp,
    fecha_compra:    params.fechaCompra,
    farmacia_nombre: params.farmaciaNombre,
    farmacia_comuna: params.farmaciaComuna,
    foto_boleta_url: fotoUrl,
    canal:           params.canal,
    tipo_descuento:  params.tipoDescuento,
    credencial_usada: params.credencialUsada || null,
  })

  if (error) return { error: error.message }
  return { ok: true }
}

// ─── Plan de toma / posología ─────────────────────────────────────────────────

/** Agrega un remedio con posología a la lista del usuario */
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

/** Obtiene el plan de toma del usuario organizado por momento del día */
export async function obtenerPlanToma(usuarioId: string) {
  const { data } = await supabase
    .from('usuario_remedio')
    .select('id, producto_id, dosis_texto, posologia, momento_toma, notas, producto (nombre_comercial, dosis_forma)')
    .eq('usuario_id', usuarioId)
    .eq('activo', true)
  return data ?? []
}
