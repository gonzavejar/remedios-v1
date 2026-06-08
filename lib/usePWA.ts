// lib/usePWA.ts
// Hook para manejar instalación de PWA y programación de alarmas.

import { useEffect, useState, useCallback } from 'react'

export function usePWA() {
  const [instalada, setInstalada]               = useState(false)
  const [puedeInstalar, setPuedeInstalar]       = useState(false)
  const [promptInstalar, setPromptInstalar]     = useState<any>(null)
  const [notifActivas, setNotifActivas]         = useState(false)
  const [swListo, setSwListo]                   = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Registrar Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => {
          console.log('✅ SW registrado')
          setSwListo(true)
          // Reprogramar alarmas si las tenía guardadas
          const alarmasGuardadas = localStorage.getItem('alarmas_programadas')
          if (alarmasGuardadas && Notification.permission === 'granted') {
            const alarmas = JSON.parse(alarmasGuardadas)
            reg.active?.postMessage({ type: 'PROGRAMAR_ALARMAS', alarmas })
          }
        })
        .catch(err => console.error('Error SW:', err))
    }

    // Detectar si ya está instalada como PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalada(true)
    }

    // Prompt de instalación (Android Chrome / Edge)
    const handlePrompt = (e: Event) => {
      e.preventDefault()
      setPromptInstalar(e)
      setPuedeInstalar(true)
    }
    window.addEventListener('beforeinstallprompt', handlePrompt)

    // Estado de notificaciones
    if ('Notification' in window) {
      setNotifActivas(Notification.permission === 'granted')
    }

    return () => window.removeEventListener('beforeinstallprompt', handlePrompt)
  }, [])

  // Mostrar prompt de instalación (Android)
  async function instalarApp() {
    if (!promptInstalar) return false
    promptInstalar.prompt()
    const result = await promptInstalar.userChoice
    if (result.outcome === 'accepted') {
      setPuedeInstalar(false)
      setInstalada(true)
    }
    return result.outcome === 'accepted'
  }

  // Pedir permiso de notificaciones
  async function activarNotificaciones(): Promise<boolean> {
    if (!('Notification' in window)) return false
    const permiso = await Notification.requestPermission()
    const ok = permiso === 'granted'
    setNotifActivas(ok)
    return ok
  }

  // Programar alarmas para el día de hoy
  const programarAlarmas = useCallback(async (remedios: any[]) => {
    if (!swListo) return
    if (!('Notification' in window) || Notification.permission !== 'granted') return

    const ahora = new Date()
    const alarmas: any[] = []

    remedios.forEach(r => {
      const nombre = r.producto?.nombre_comercial ?? r.notas ?? 'Remedio'
      const horas: Record<string, string | null> = {
        'mañana':   r.hora_manana,
        'mediodia': r.hora_mediodia,
        'noche':    r.hora_noche,
      }
      const defecto: Record<string, string> = {
        'mañana': '08:00', 'mediodia': '13:00', 'noche': '21:00'
      }

      ;(r.momento_toma ?? []).forEach((momento: string) => {
        const hora = horas[momento] ?? defecto[momento]
        const [h, m] = hora.split(':').map(Number)
        const target = new Date()
        target.setHours(h, m, 0, 0)

        // Si ya pasó, programar para mañana
        if (target <= ahora) target.setDate(target.getDate() + 1)

        alarmas.push({
          nombre,
          descripcion: `${r.dosis_texto ?? ''} ${r.posologia ?? '1 dosis'}`.trim(),
          timestamp: target.getTime(),
          momento,
        })
      })
    })

    // Guardar en localStorage para reprogramar al abrir
    localStorage.setItem('alarmas_programadas', JSON.stringify(alarmas))

    // Enviar al Service Worker
    const reg = await navigator.serviceWorker.ready
    reg.active?.postMessage({ type: 'PROGRAMAR_ALARMAS', alarmas })

    return alarmas.length
  }, [swListo])

  return {
    instalada,
    puedeInstalar,
    notifActivas,
    swListo,
    instalarApp,
    activarNotificaciones,
    programarAlarmas,
  }
}
