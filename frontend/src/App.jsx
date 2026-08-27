import LibraryView from './components/LibraryView'
import MySets from './components/MySets'
import PlayerBar from './components/PlayerBar'
import SetBuilder from './components/SetBuilder'
import { AudioProvider, useAudio } from './lib/audioPlayer'
import {
  isFilters,
  isNumberArrayOrNull,
  isOneOf,
  isPoolOrNull,
  isTrackArray,
  usePersistentState,
} from './lib/persist'
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
  // Todo el estado que el usuario no quiere perder vive acá (dueño único) y persiste en
  // localStorage: sobrevive al cambio de solapa/vista (los componentes se desmontan) y al F5.
  const [tab, setTab] = usePersistentState('tab', 'biblioteca', isOneOf(['biblioteca', 'armar', 'sets']))

  // Estado de "Armar set": el set en construcción, la energía objetivo, el modo y el pool activo.
  const [builderSet, setBuilderSet] = usePersistentState('builderSet', [], isTrackArray)
  const [builderEnergyDir, setBuilderEnergyDir] = usePersistentState(
    'builderEnergyDir', 'similar', isOneOf(['similar', 'mas', 'menos']))
  const [builderMode, setBuilderMode] = usePersistentState(
    'builderMode', 'realista', isOneOf(['realista', 'limpio']))
  const [builderPool, setBuilderPool] = usePersistentState('builderPool', null, isPoolOrNull)

  // Selección del pool de la vista Rekordbox (ids de playlists tildadas). null = sin inicializar.
  const [rkPool, setRkPool] = usePersistentState('rkPool', null, isNumberArrayOrNull)

  // Filtros y vista activa de la Biblioteca.
  const [libFilters, setLibFilters] = usePersistentState(
    'libFilters', { quality: '', onlyRepresentatives: false }, isFilters)
  const [libView, setLibView] = usePersistentState(
    'libView', 'rekordbox', isOneOf(['rekordbox', 'agrupada', 'plana']))

  // Desde la Biblioteca: arrancar un set NUEVO con un track (y, si viene de Rekordbox, con su pool).
  const startFromTrack = (track, pool = null) => {
    setBuilderSet([track])
    setBuilderPool(pool)
    setBuilderEnergyDir('similar')
    setTab('armar')
  }
  // Desde "Mis sets": abrir un set guardado (tracks en orden), sin pool.
  const openSet = (tracks) => {
    setBuilderSet(tracks)
    setBuilderPool(null)
    setBuilderEnergyDir('similar')
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

      {tab === 'biblioteca' && (
        <LibraryView
          onStartFromTrack={startFromTrack}
          filters={libFilters}
          onFiltersChange={setLibFilters}
          view={libView}
          onViewChange={setLibView}
          rkPool={rkPool}
          onRkPoolChange={setRkPool}
        />
      )}
      {tab === 'armar' && (
        <SetBuilder
          set={builderSet}
          onSetChange={setBuilderSet}
          energyDir={builderEnergyDir}
          onEnergyDirChange={setBuilderEnergyDir}
          mode={builderMode}
          onModeChange={setBuilderMode}
          pool={builderPool}
          onPoolChange={setBuilderPool}
        />
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
