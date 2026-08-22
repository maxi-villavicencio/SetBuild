import { useState } from 'react'
import LibraryView from './components/LibraryView'
import MySets from './components/MySets'
import PlayerBar from './components/PlayerBar'
import SetBuilder from './components/SetBuilder'
import { AudioProvider, useAudio } from './lib/audioPlayer'
import './App.css'

const TABS = [
  { id: 'biblioteca', label: 'Biblioteca' },
  { id: 'armar', label: 'Armar set' },
  { id: 'sets', label: 'Mis sets' },
]

// El shell vive DENTRO del AudioProvider para saber si hay un track cargado (current) y así
// reservar espacio abajo (has-player) y renderizar la barra fija.
function AppShell() {
  const { current } = useAudio()
  const [tab, setTab] = useState('biblioteca')
  // Semilla para arrancar/abrir un set en "Armar set" (se consume al montar SetBuilder).
  const [seedTracks, setSeedTracks] = useState(null)
  // Pool activo que viene de la vista Rekordbox: { ids, names } | null.
  const [seedPool, setSeedPool] = useState(null)

  const consumeSeed = () => {
    setSeedTracks(null)
    setSeedPool(null)
  }

  // Desde la Biblioteca: arrancar un set con un track (y, si viene de Rekordbox, con su pool).
  const startFromTrack = (track, pool = null) => {
    setSeedTracks([track])
    setSeedPool(pool)
    setTab('armar')
  }
  // Desde "Mis sets": abrir un set guardado (tracks en orden), sin pool.
  const openSet = (tracks) => {
    setSeedTracks(tracks)
    setSeedPool(null)
    setTab('armar')
  }

  return (
    <div className={'app' + (current ? ' has-player' : '')}>
      <header className="app-header">
        <h1>DJ Set Builder</h1>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'tab active' : 'tab'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {tab === 'biblioteca' && <LibraryView onStartFromTrack={startFromTrack} />}
      {tab === 'armar' && (
        <SetBuilder seedTracks={seedTracks} seedPool={seedPool} onSeedConsumed={consumeSeed} />
      )}
      {tab === 'sets' && <MySets onOpenSet={openSet} />}

      <PlayerBar />
    </div>
  )
}

export default function App() {
  return (
    <AudioProvider>
      <AppShell />
    </AudioProvider>
  )
}
