import { useState } from 'react'
import LibraryView from './components/LibraryView'
import SetBuilder from './components/SetBuilder'
import './App.css'

const TABS = [
  { id: 'biblioteca', label: 'Biblioteca' },
  { id: 'armar', label: 'Armar set' },
]

export default function App() {
  const [tab, setTab] = useState('biblioteca')
  // Track semilla para arrancar un set desde la Biblioteca (se consume al montar SetBuilder).
  const [seedTrack, setSeedTrack] = useState(null)

  const startFromTrack = (track) => {
    setSeedTrack(track)
    setTab('armar')
  }

  return (
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

      {tab === 'biblioteca' ? (
        <LibraryView onStartFromTrack={startFromTrack} />
      ) : (
        <SetBuilder seedTrack={seedTrack} onSeedConsumed={() => setSeedTrack(null)} />
      )}
    </div>
  )
}
