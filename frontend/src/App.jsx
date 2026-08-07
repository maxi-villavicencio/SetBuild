import { useState } from 'react'
import LibraryView from './components/LibraryView'
import MySets from './components/MySets'
import SetBuilder from './components/SetBuilder'
import { AudioProvider } from './lib/audioPlayer'
import './App.css'

const TABS = [
  { id: 'biblioteca', label: 'Biblioteca' },
  { id: 'armar', label: 'Armar set' },
  { id: 'sets', label: 'Mis sets' },
]

export default function App() {
  const [tab, setTab] = useState('biblioteca')
  // Tracks semilla para arrancar/abrir un set en "Armar set" (se consumen al montar SetBuilder).
  const [seedTracks, setSeedTracks] = useState(null)

  // Desde la Biblioteca: arrancar un set con un track.
  const startFromTrack = (track) => {
    setSeedTracks([track])
    setTab('armar')
  }
  // Desde "Mis sets": abrir un set guardado (tracks en orden) para seguir editándolo.
  const openSet = (tracks) => {
    setSeedTracks(tracks)
    setTab('armar')
  }

  return (
    <AudioProvider>
    <div className="app">
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
        <SetBuilder seedTracks={seedTracks} onSeedConsumed={() => setSeedTracks(null)} />
      )}
      {tab === 'sets' && <MySets onOpenSet={openSet} />}
    </div>
    </AudioProvider>
  )
}
