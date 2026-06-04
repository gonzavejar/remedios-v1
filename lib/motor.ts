// lib/motor.ts  (versión 3)
// Cambios respecto a v2:
// - Regla 6.5: precio CENABAST como palanca directa independiente del bioequivalente
// - precioLista siempre presente en la tarjeta, incluso para controlados
// - Para controlados: freno de seguridad pero precio de referencia visible

import { supabase } from './supabase'

export type TagTarjeta =
  | 'Sustancia controlada'
  | 'Ya estás en el piso'
  | 'Cobertura condicional'
  | 'Combinación'
  | 'Cuidado clínico'
  | 'Palanca directa'
  | 'Canal CENABAST'
  | 'Cobertura (GES)'
  | 'Cobertura parcial'
  | 'Sin palanca'

export type ColorTarjeta = 'danger' | 'success' | 'warning' | 'info' | 'neutral'

export interface TarjetaResultado {
  tag: TagTarjeta
  color: ColorTarjeta
  nombreComercial: string
  principios: string
  precioLista: number | null
  precioObjetivo: number | string
  paso: string
  reglaAplicada: string
  contexto?: string
  esCombinacion: boolean
  controlado: boolean
}

interface FilaVista {
  producto_id: number
  nombre_comercial: string
  principios: string
  es_combinacion: boolean
  controlado: boolean
  indice_estrecho: boolean
  tiene_bioequivalente: boolean
  condicion_venta: string
}

interface FilaRegla {
  mecanismo: 'GES' | 'LRS' | 'ninguno'
  farmaco_en_canasta: boolean
  requiere_especialista: boolean
  condicion: string
}

interface FilaPrecio {
  canal: string
  valor_clp: number
  disponible: boolean
}

// ─── Funciones públicas ───────────────────────────────────────────────────────

export async function consultarMotorPorId(
  productoId: number
): Promise<TarjetaResultado | null> {
  const { data, error } = await supabase
    .from('v_producto_detalle')
    .select('*')
    .eq('producto_id', productoId)
    .single()
  if (error || !data) return null
  return ejecutarMotor(data as FilaVista)
}

export async function consultarMotor(
  nombreBusqueda: string
): Promise<TarjetaResultado | null> {
  const { data, error } = await supabase
    .from('v_producto_detalle')
    .select('*')
    .ilike('nombre_comercial', `%${nombreBusqueda}%`)
    .limit(1)
  if (error || !data || data.length === 0) return null
  return ejecutarMotor(data[0] as FilaVista)
}

// ─── Lógica interna ───────────────────────────────────────────────────────────

async function ejecutarMotor(producto: FilaVista): Promise<TarjetaResultado> {
  const [precios, regla] = await Promise.all([
    obtenerPrecios(producto.producto_id),
    obtenerMejorRegla(producto.producto_id),
  ])
  return aplicarCascada(producto, regla, precios)
}

async function obtenerPrecios(productoId: number): Promise<FilaPrecio[]> {
  const { data } = await supabase
    .from('precio')
    .select('canal, valor_clp, disponible')
    .eq('producto_id', productoId)
  return (data ?? []) as FilaPrecio[]
}

async function obtenerMejorRegla(productoId: number): Promise<FilaRegla | null> {
  const { data: links } = await supabase
    .from('producto_principio')
    .select('principio_id')
    .eq('producto_id', productoId)
  if (!links || links.length === 0) return null
  const ids = links.map((r: { principio_id: number }) => r.principio_id)
  const { data: reglas } = await supabase
    .from('regla_cobertura')
    .select('mecanismo, farmaco_en_canasta, requiere_especialista, condicion')
    .in('principio_id', ids)
  return elegirMejorRegla((reglas ?? []) as FilaRegla[])
}

function elegirMejorRegla(reglas: FilaRegla[]): FilaRegla | null {
  if (reglas.length === 0) return null
  return (
    reglas.find(r => r.mecanismo === 'LRS' && r.farmaco_en_canasta) ??
    reglas.find(r => r.mecanismo === 'GES' && r.farmaco_en_canasta) ??
    reglas.find(r => r.mecanismo === 'GES') ??
    reglas[0]
  )
}

// ─── Cascada de reglas ────────────────────────────────────────────────────────

function aplicarCascada(
  p: FilaVista,
  regla: FilaRegla | null,
  precios: FilaPrecio[]
): TarjetaResultado {

  // Precios disponibles
  const precioLista = precios
    .filter(f => f.canal === 'lista' && f.disponible)
    .sort((a, b) => a.valor_clp - b.valor_clp)[0]?.valor_clp ?? null

  const precioBioeq = precios
    .filter(f => f.canal === 'bioequivalente' && f.disponible)
    .sort((a, b) => a.valor_clp - b.valor_clp)[0]?.valor_clp ?? null

  const precioCenabast = precios
    .filter(f => f.canal === 'cenabast' && f.disponible)
    .sort((a, b) => a.valor_clp - b.valor_clp)[0]?.valor_clp ?? null

  // El precio objetivo más bajo de canales no-lista
  const precioBarato = [precioBioeq, precioCenabast]
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b)[0] ?? null

  // ── Regla 1: Sustancia controlada ─────────────────────────────────────────
  // Muestra precio de lista como referencia, pero no sugiere optimización.
  if (p.controlado) return {
    tag: 'Sustancia controlada',
    color: 'danger',
    nombreComercial: p.nombre_comercial,
    principios: p.principios,
    precioLista,                              // ← siempre visible
    precioObjetivo: 'receta retenida',
    paso: 'Medicamento de receta retenida: retira solo con tu receta médica en la farmacia.',
    reglaAplicada: 'controlado = true → no se optimiza, solo referencia de precio',
    esCombinacion: p.es_combinacion,
    controlado: true,
  }

  // ── Regla 2: Ya en el piso ─────────────────────────────────────────────────
  const yaEnPiso = precioLista !== null && precioLista <= 5000 && !precioBarato
  if (yaEnPiso) return {
    tag: 'Ya estás en el piso',
    color: 'success',
    nombreComercial: p.nombre_comercial,
    principios: p.principios,
    precioLista,
    precioObjetivo: precioLista,
    paso: 'No cambies nada: ya pagas la versión más barata de este remedio.',
    reglaAplicada: 'precio ≤ $5.000 sin canal más barato → ya es el genérico mínimo',
    esCombinacion: p.es_combinacion,
    controlado: false,
  }

  // ── Regla 3: Ley Ricarte Soto ──────────────────────────────────────────────
  if (regla?.mecanismo === 'LRS' && regla.farmaco_en_canasta) return {
    tag: 'Cobertura condicional',
    color: 'info',
    nombreComercial: p.nombre_comercial,
    principios: p.principios,
    precioLista,
    precioObjetivo: '≈ $0 si calificas',
    paso: `Pídele a tu especialista que evalúe postularte a la Ley Ricarte Soto para "${regla.condicion}".`,
    reglaAplicada: 'LRS + fármaco en canasta → cobertura condicional vía especialista',
    esCombinacion: p.es_combinacion,
    controlado: false,
  }

  // ── Regla 4: Combinación de dosis fija ────────────────────────────────────
  if (p.es_combinacion) return {
    tag: 'Combinación',
    color: 'warning',
    nombreComercial: p.nombre_comercial,
    principios: p.principios,
    precioLista,
    precioObjetivo: precioBarato ?? 'consulta a tu médico',
    paso: `Contiene ${p.principios}. Puede reemplazarse por genéricos sueltos, pero eso lo decide tu médico.`,
    reglaAplicada: 'es_combinacion = true → palanca es descomponer, no sustituir marca',
    esCombinacion: true,
    controlado: false,
  }

  // ── Regla 5: Bioequivalente con índice estrecho ───────────────────────────
  if (p.tiene_bioequivalente && p.indice_estrecho) return {
    tag: 'Cuidado clínico',
    color: 'warning',
    nombreComercial: p.nombre_comercial,
    principios: p.principios,
    precioLista,
    precioObjetivo: precioBarato ?? 'precio del genérico',
    paso: 'Hay una versión más barata, pero no cambies de marca sin avisarle a tu médico.',
    reglaAplicada: 'bioequivalente + índice estrecho → bandera clínica antes de sustituir',
    esCombinacion: false,
    controlado: false,
  }

  // ── Regla 6: Bioequivalente limpio ────────────────────────────────────────
  if (p.tiene_bioequivalente) return {
    tag: 'Palanca directa',
    color: 'success',
    nombreComercial: p.nombre_comercial,
    principios: p.principios,
    precioLista,
    precioObjetivo: precioBarato ?? 'precio del bioequivalente',
    paso: 'Pide el bioequivalente o canal CENABAST en la farmacia.',
    reglaAplicada: 'bioequivalente sin restricción → sustitución directa, accionable hoy',
    contexto: regla?.mecanismo === 'GES' && regla.farmaco_en_canasta
      ? 'Tu condición también es GES: el copago es otra vía posible.' : undefined,
    esCombinacion: false,
    controlado: false,
  }

  // ── Regla 6.5: Precio CENABAST disponible ─────────────────────────────────
  // No hay bioequivalente, pero hay precio CENABAST inferior al lista.
  // El canal CENABAST es la palanca: farmacias con Sello CENABAST.
  if (precioCenabast !== null && (precioLista === null || precioCenabast < precioLista)) return {
    tag: 'Canal CENABAST',
    color: 'success',
    nombreComercial: p.nombre_comercial,
    principios: p.principios,
    precioLista,
    precioObjetivo: precioCenabast,
    paso: 'Cómpralo en una farmacia con Sello CENABAST — venden a este precio sin trámite adicional.',
    reglaAplicada: 'precio CENABAST menor al lista → canal CENABAST como palanca directa',
    contexto: regla?.mecanismo === 'GES' && regla.farmaco_en_canasta
      ? 'Tu condición también es GES: el copago es otra vía posible.' : undefined,
    esCombinacion: false,
    controlado: false,
  }

  // ── Regla 7: GES con fármaco en canasta ──────────────────────────────────
  if (regla?.mecanismo === 'GES' && regla.farmaco_en_canasta) return {
    tag: 'Cobertura (GES)',
    color: 'info',
    nombreComercial: p.nombre_comercial,
    principios: p.principios,
    precioLista,
    precioObjetivo: 'copago GES',
    paso: 'Activa el GES con tu médico para acotar el copago.',
    reglaAplicada: 'GES + fármaco en canasta → copago acotado',
    esCombinacion: false,
    controlado: false,
  }

  // ── Regla 8: Cobertura parcial ────────────────────────────────────────────
  if (regla && regla.mecanismo !== 'ninguno' && !regla.farmaco_en_canasta) return {
    tag: 'Cobertura parcial',
    color: 'info',
    nombreComercial: p.nombre_comercial,
    principios: p.principios,
    precioLista,
    precioObjetivo: 'copago del fármaco garantizado',
    paso: 'El plan cubre tu condición con otro fármaco. Conversa con tu médico.',
    reglaAplicada: 'condición cubierta, pero este fármaco no está en la canasta',
    esCombinacion: false,
    controlado: false,
  }

  // ── Regla 9: Sin palanca ──────────────────────────────────────────────────
  return {
    tag: 'Sin palanca',
    color: 'neutral',
    nombreComercial: p.nombre_comercial,
    principios: p.principios,
    precioLista,
    precioObjetivo: precioLista ?? 'sin precio registrado',
    paso: 'No hay cobertura ni equivalente más barato disponible.',
    reglaAplicada: 'sin cobertura y sin equivalente → no existe palanca estructural',
    esCombinacion: false,
    controlado: false,
  }
}
