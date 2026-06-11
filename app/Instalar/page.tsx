'use client'
// app/instalar/page.tsx
// Guía paso a paso para instalar la app en Android e iPhone

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function InstalarPage() {
  const router = useRouter()
  const [sistema, setSistema] = useState<'android' | 'iphone'>('android')

  return (
    <main className="min-h-screen pb-12" style={{ background: '#EFF4F0' }}>

      {/* Header */}
      <div style={{ background: '#0B5966' }} className="px-6 pt-12 pb-8 text-white">
        <button onClick={() => router.push('/')} className="flex items-center gap-2 mb-4 opacity-80">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
          <span className="text-base">Volver</span>
        </button>
        <h1 className="text-2xl font-bold">Instalar la app</h1>
        <p className="text-base mt-1" style={{ color: '#A8D8CE' }}>
          Gratis · Sin App Store · Sin Play Store
        </p>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-5">

        {/* Beneficio */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-base text-gray-700">
            💊 Instala <strong>¿Cuánto debería costar tu remedio?</strong> directamente en tu celular,
            como cualquier app — pero sin pasar por ninguna tienda.
          </p>
        </div>

        {/* Selector Android / iPhone */}
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm">
          <button onClick={() => setSistema('android')}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            style={sistema === 'android' ? { background: '#0B5966', color: '#fff' } : { color: '#6B7280' }}>
            🤖 Android
          </button>
          <button onClick={() => setSistema('iphone')}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            style={sistema === 'iphone' ? { background: '#0B5966', color: '#fff' } : { color: '#6B7280' }}>
            🍎 iPhone
          </button>
        </div>

        {/* Pasos Android */}
        {sistema === 'android' && (
          <div className="space-y-3">
            {[
              {
                n: '1',
                titulo: 'Abre Chrome',
                desc: 'Asegúrate de estar usando Google Chrome (no otro navegador)',
                emoji: '🌐',
              },
              {
                n: '2',
                titulo: 'Entra a turemedio.vercel.app',
                desc: 'Escribe la dirección en la barra de Chrome o toca el enlace que te compartieron',
                emoji: '🔗',
              },
              {
                n: '3',
                titulo: 'Toca los tres puntos ⋮',
                desc: 'Están arriba a la derecha de Chrome',
                emoji: '⋮',
              },
              {
                n: '4',
                titulo: 'Selecciona "Añadir a pantalla de inicio"',
                desc: 'O puede decir "Instalar app" — toca esa opción',
                emoji: '📲',
              },
              {
                n: '5',
                titulo: '¡Listo!',
                desc: 'La app aparece en tu pantalla de inicio como cualquier otra app',
                emoji: '✅',
              },
            ].map(paso => (
              <div key={paso.n} className="bg-white rounded-2xl p-4 shadow-sm flex items-start gap-4">
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-sm"
                  style={{ background: '#0B5966' }}>
                  {paso.n}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800 text-base">{paso.emoji} {paso.titulo}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{paso.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pasos iPhone */}
        {sistema === 'iphone' && (
          <div className="space-y-3">
            {[
              {
                n: '1',
                titulo: 'Abre Safari',
                desc: 'En iPhone solo funciona con Safari (el navegador con la brújula azul)',
                emoji: '🧭',
              },
              {
                n: '2',
                titulo: 'Entra a turemedio.vercel.app',
                desc: 'Escribe la dirección en Safari o toca el enlace que te compartieron',
                emoji: '🔗',
              },
              {
                n: '3',
                titulo: 'Toca el botón compartir',
                desc: 'Es el ícono de una caja con una flecha hacia arriba, abajo en el centro de la pantalla',
                emoji: '⬆️',
              },
              {
                n: '4',
                titulo: 'Selecciona "Añadir a pantalla de inicio"',
                desc: 'Desplázate hacia abajo en el menú hasta encontrar esa opción',
                emoji: '📲',
              },
              {
                n: '5',
                titulo: '¡Listo!',
                desc: 'La app aparece en tu pantalla de inicio con el ícono de la cruz roja',
                emoji: '✅',
              },
            ].map(paso => (
              <div key={paso.n} className="bg-white rounded-2xl p-4 shadow-sm flex items-start gap-4">
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-sm"
                  style={{ background: '#0B5966' }}>
                  {paso.n}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800 text-base">{paso.emoji} {paso.titulo}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{paso.desc}</p>
                </div>
              </div>
            ))}

            {/* Nota iPhone */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm text-blue-800">
                ℹ️ En iPhone, la instalación solo funciona con <strong>Safari</strong>. Si estás en Chrome u otro navegador, cópiala en Safari primero.
              </p>
            </div>
          </div>
        )}

        {/* Compartir */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-base font-semibold text-gray-800 mb-3">📤 Comparte con alguien</p>
          <p className="text-sm text-gray-500 mb-4">
            ¿Conoces a alguien que compra remedios? Envíales el link directamente.
          </p>
          <button
            onClick={() => {
              const url = 'https://turemedio.vercel.app'
              const texto = '💊 ¿Cuánto debería costar tu remedio? Compara precios en farmacias chilenas: '
              if (navigator.share) {
                navigator.share({ title: '¿Cuánto debería costar tu remedio?', text: texto, url })
              } else {
                window.open(`https://wa.me/?text=${encodeURIComponent(texto + url)}`, '_blank')
              }
            }}
            className="w-full py-3.5 rounded-xl text-white font-bold text-base"
            style={{ background: '#25D366' }}>
            💬 Compartir por WhatsApp
          </button>
        </div>

      </div>
    </main>
  )
}
