-- Esquema para el DJ Set Builder (SQL Server / T-SQL)
-- Corré esto una vez con:  python -m src.cli init-db

IF OBJECT_ID('dbo.tracks', 'U') IS NULL
CREATE TABLE dbo.tracks (
    track_id       INT IDENTITY(1,1) PRIMARY KEY,
    rb_content_id  NVARCHAR(64)  NOT NULL UNIQUE,   -- ID del track en Rekordbox (para upsert)
    title          NVARCHAR(1000),
    artist         NVARCHAR(1000),
    album          NVARCHAR(1000),
    genre          NVARCHAR(4000),
    file_path      NVARCHAR(1000),
    duration_sec   FLOAT,
    bpm            FLOAT,                            -- viene de Rekordbox, NO se recalcula
    key_musical    NVARCHAR(20),                     -- notacion musical (ej: "Am", "C", "F#m")
    camelot        NVARCHAR(4),                      -- mapeado desde key_musical (ej: "8A")
    rating         INT,                              -- estrellas 0-5
    dup_group_id   INT,                              -- id del grupo de duplicados (= track_id del representante); lo llena 'dedupe'
    is_representative BIT,                            -- 1 si es el track elegido del grupo; NULL = sin deduplicar todavia
    quality        NVARCHAR(20),                     -- derivado de la extension: 'lossless' | 'compressed' | NULL (sin path)
    collection     NVARCHAR(50),                     -- derivado de la carpeta: 'Maxi' | 'Zoe' | NULL (indeterminada)
    genre_canonical NVARCHAR(100),                    -- genero canonico desde las playlists de Rekordbox; NULL si no matchea
    updated_at     DATETIME2 DEFAULT SYSUTCDATETIME()
);

-- Features de audio (se computan aparte con librosa, es la parte cara)
IF OBJECT_ID('dbo.track_features', 'U') IS NULL
CREATE TABLE dbo.track_features (
    track_id          INT PRIMARY KEY REFERENCES dbo.tracks(track_id) ON DELETE CASCADE,
    rms_energy        FLOAT,    -- cuanto "pega" (envolvente de volumen)
    spectral_centroid FLOAT,    -- brillo
    onset_rate        FLOAT,    -- densidad ritmica (proxy de groove)
    low_band_ratio    FLOAT,    -- presencia de kick/bajo
    pulse_clarity     FLOAT,    -- que tan marcado esta el pulso
    energy_score      FLOAT,    -- score final 1..10, lo llena el paso recompute-energy
    analyzed_at       DATETIME2 DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID('dbo.sets', 'U') IS NULL
CREATE TABLE dbo.sets (
    set_id     INT IDENTITY(1,1) PRIMARY KEY,
    name       NVARCHAR(200),
    created_at DATETIME2 DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID('dbo.set_tracks', 'U') IS NULL
CREATE TABLE dbo.set_tracks (
    set_id   INT REFERENCES dbo.sets(set_id) ON DELETE CASCADE,
    position INT,
    track_id INT REFERENCES dbo.tracks(track_id),
    PRIMARY KEY (set_id, position)
);

-- Migraciones idempotentes para bases ya creadas (init-db las aplica sin romper).
-- Sprint 1.5 - de-duplicacion: columnas de agrupamiento en dbo.tracks.
IF COL_LENGTH('dbo.tracks', 'dup_group_id') IS NULL
    ALTER TABLE dbo.tracks ADD dup_group_id INT NULL;
IF COL_LENGTH('dbo.tracks', 'is_representative') IS NULL
    ALTER TABLE dbo.tracks ADD is_representative BIT NULL;

-- Sprint 2 - campos derivados del file_path.
IF COL_LENGTH('dbo.tracks', 'quality') IS NULL
    ALTER TABLE dbo.tracks ADD quality NVARCHAR(20) NULL;
IF COL_LENGTH('dbo.tracks', 'collection') IS NULL
    ALTER TABLE dbo.tracks ADD collection NVARCHAR(50) NULL;

-- Sprint 9 - genero canonico desde las playlists de Rekordbox.
IF COL_LENGTH('dbo.tracks', 'genre_canonical') IS NULL
    ALTER TABLE dbo.tracks ADD genre_canonical NVARCHAR(100) NULL;

-- Sprint 21 - estructura completa de carpetas/playlists de Rekordbox (capa de navegacion,
-- NO reemplaza genre_canonical). Se refresca full en cada 'import-playlists' / ingest.
-- rb_id es el ID del nodo en Rekordbox (grande -> BIGINT).
IF OBJECT_ID('dbo.rb_playlists', 'U') IS NULL
CREATE TABLE dbo.rb_playlists (
    rb_id      BIGINT PRIMARY KEY,   -- ID del nodo en Rekordbox
    name       NVARCHAR(1000),
    node_type  NVARCHAR(10),         -- 'folder' | 'playlist'
    parent_id  BIGINT,               -- rb_id del padre; NULL = raiz
    seq        INT                   -- orden dentro del padre
);

IF OBJECT_ID('dbo.rb_playlist_tracks', 'U') IS NULL
CREATE TABLE dbo.rb_playlist_tracks (
    rb_playlist_id BIGINT,           -- rb_id de la playlist
    position       INT,              -- orden dentro de la playlist (1..N)
    rb_content_id  NVARCHAR(64),     -- ID del track en Rekordbox (matchea dbo.tracks.rb_content_id)
    PRIMARY KEY (rb_playlist_id, position)
);
