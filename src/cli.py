"""CLI del DJ Set Builder.

Uso tipico (en orden):
    python -m src.cli init-db
    python -m src.cli ingest
    python -m src.cli analyze
    python -m src.cli recompute-energy
    python -m src.cli build --length 15 --save "Warmup Sabado"
"""
import argparse
import os

from . import analyze as analyze_mod
from . import build_set as build_mod
from . import dedupe as dedupe_mod
from . import derive as derive_mod
from . import genres as genres_mod
from . import ingest as ingest_mod
from .db import run_sql_file

SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "..", "sql", "schema.sql")


def _ids(s):
    """Parsea 'ids' separados por coma a lista de ints (para --playlists)."""
    return [int(x) for x in s.split(",") if x.strip()]


def _refresh(skip_analyze=False, skip_transcode=False):
    """Corre todo el pipeline de actualizacion en el orden correcto, una vez cada paso.

    Llama las funciones de modulo directamente (no el comando 'ingest', que encadena
    import-playlists + pretranscode) -> sin duplicar. Cada paso ya es incremental/idempotente.
    """
    from . import pretranscode, rb_playlists

    print("REFRESH - corre esto con Rekordbox CERRADO (se lee la master.db en modo lectura).")

    steps = [
        ("Ingesta de tracks desde Rekordbox", ingest_mod.ingest),
        ("Importar carpetas/playlists de Rekordbox", rb_playlists.import_playlists),
        ("Asignar genero canonico desde las playlists", genres_mod.assign_genres),
        ("Campos derivados (quality/collection) desde el file_path", derive_mod.backfill),
        ("De-duplicacion (grupos + representante por calidad)", dedupe_mod.dedupe),
    ]
    if not skip_analyze:
        steps.append(("Analisis de audio con librosa (solo faltantes)",
                      lambda: analyze_mod.analyze(only_missing=True)))
        steps.append(("Recomputar energy_score", analyze_mod.recompute_energy_scores))
    if not skip_transcode:
        steps.append(("Pre-transcodificacion de AIFF a mp3 (cache)", pretranscode.pretranscode_all))

    total = len(steps)
    for i, (name, fn) in enumerate(steps, 1):
        print(f"\n==> [{i}/{total}] {name}")
        fn()
    print(f"\nRefresh completo ({total} pasos).")


def main():
    parser = argparse.ArgumentParser(description="DJ Set Builder")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init-db", help="Crea las tablas en SQL Server")
    p_ing = sub.add_parser("ingest", help="Lee la master.db de Rekordbox -> tabla tracks")
    p_ing.add_argument("--no-pretranscode", action="store_true",
                       help="No pre-transcodificar los AIFF a mp3 al terminar")

    p_an = sub.add_parser("analyze", help="Extrae features de audio con librosa")
    p_an.add_argument("--all", action="store_true", help="Reanaliza todos, no solo los faltantes")

    sub.add_parser("recompute-energy", help="Normaliza features -> energy_score 1..10")
    sub.add_parser("import-playlists", help="Importa carpetas/playlists de Rekordbox (capa de navegacion)")

    p_dd = sub.add_parser("dedupe", help="Agrupa tracks que son el mismo tema (de-duplicacion)")
    p_dd.add_argument("--report", action="store_true", help="Imprime totales y ejemplos de grupos")
    p_dd.add_argument("--reelect", action="store_true",
                      help="No reagrupa: re-elige el representante por calidad sobre los grupos ya guardados")

    p_df = sub.add_parser("derive-fields", help="Rellena quality/collection desde el file_path")
    p_df.add_argument("--report", action="store_true", help="Cuenta tracks por quality y collection")

    p_g = sub.add_parser("assign-genre", help="Asigna genero canonico desde las playlists de Rekordbox")
    p_g.add_argument("--report", action="store_true",
                     help="Muestra playlist->genero, ignoradas, y tracks por genero")

    sub.add_parser("genre-compat", help="Imprime el gradiente y la compatibilidad por genero")

    p_sg = sub.add_parser("set-genre", help="Asigna genero canonico a mano a un track por id")
    p_sg.add_argument("--track", type=int, required=True, help="track_id")
    p_sg.add_argument("--genre", type=str, default=None, help="Genero canonico (ver genre-compat)")
    p_sg.add_argument("--clear", action="store_true", help="Deja el genero en NULL")

    p_b = sub.add_parser("build", help="Arma un set")
    p_b.add_argument("--length", type=int, default=15)
    p_b.add_argument("--bpm-tol", type=float, default=0.06)
    p_b.add_argument("--peak", type=float, default=0.7, help="Posicion del pico (0..1)")
    p_b.add_argument("--energy-boost", action="store_true", help="Permite el salto +7 de Camelot")
    p_b.add_argument("--start", type=int, default=None, help="track_id inicial")
    p_b.add_argument("--save", type=str, default=None, help="Guarda el set con este nombre")
    p_b.add_argument("--mode", choices=["limpio", "realista"], default="limpio",
                     help="limpio=solo lossless de Maxi (default); realista=todo, tolera faltantes")
    p_b.add_argument("--quality", choices=["lossless", "compressed"], default=None,
                     help="Override de calidad (pisa el modo)")
    p_b.add_argument("--collection", choices=["Maxi", "Zoe"], default=None,
                     help="Override de coleccion (pisa el modo)")
    p_b.add_argument("--playlists", type=_ids, default=None,
                     help="rb_id de playlists/carpetas (coma) que acotan el pool")

    p_n = sub.add_parser("next", help="Sugiere los mejores candidatos para el siguiente track")
    p_n.add_argument("--track", type=int, required=True, help="track_id actual")
    p_n.add_argument("--limit", type=int, default=None,
                     help="Tope de candidatos; por defecto TODOS los compatibles")
    p_n.add_argument("--target-energy", type=float, default=None,
                     help="Energia objetivo (1..10); por defecto la del track actual")
    p_n.add_argument("--mode", choices=["limpio", "realista"], default="realista")
    p_n.add_argument("--quality", choices=["lossless", "compressed"], default=None)
    p_n.add_argument("--collection", choices=["Maxi", "Zoe"], default=None)
    p_n.add_argument("--playlists", type=_ids, default=None,
                     help="rb_id de playlists/carpetas (coma) que acotan el pool de candidatos")

    p_rf = sub.add_parser("refresh", help="Corre todo el pipeline de actualizacion en orden (con Rekordbox cerrado)")
    p_rf.add_argument("--skip-analyze", action="store_true",
                      help="No corre el analisis de audio ni recompute-energy (solo datos)")
    p_rf.add_argument("--skip-transcode", action="store_true",
                      help="No pre-transcodifica los AIFF a mp3")
    p_rf.add_argument("--data-only", action="store_true",
                      help="Atajo: solo los pasos rapidos de datos (= --skip-analyze --skip-transcode)")

    args = parser.parse_args()

    if args.cmd == "init-db":
        run_sql_file(os.path.abspath(SCHEMA_PATH))
        print("Esquema creado.")
    elif args.cmd == "ingest":
        ingest_mod.ingest()
        from . import rb_playlists
        rb_playlists.import_playlists()
        if not args.no_pretranscode:
            from . import pretranscode
            pretranscode.pretranscode_all()
    elif args.cmd == "import-playlists":
        from . import rb_playlists
        rb_playlists.import_playlists()
    elif args.cmd == "refresh":
        _refresh(skip_analyze=args.skip_analyze or args.data_only,
                 skip_transcode=args.skip_transcode or args.data_only)
    elif args.cmd == "analyze":
        analyze_mod.analyze(only_missing=not args.all)
    elif args.cmd == "recompute-energy":
        analyze_mod.recompute_energy_scores()
    elif args.cmd == "dedupe":
        if args.reelect:
            dedupe_mod.reelect_representatives(report=args.report)
        else:
            dedupe_mod.dedupe(report=args.report)
    elif args.cmd == "derive-fields":
        derive_mod.backfill(report=args.report)
    elif args.cmd == "assign-genre":
        genres_mod.assign_genres(report=args.report)
    elif args.cmd == "genre-compat":
        genres_mod.print_compatibility()
    elif args.cmd == "set-genre":
        genre = None if args.clear else args.genre
        try:
            res = genres_mod.set_genre(args.track, genre)
        except ValueError as e:
            print(e)
            return
        if res is None:
            print(f"No existe el track_id {args.track}.")
        else:
            old, new = res
            print(f"track {args.track}: genre_canonical {old!r} -> {new!r}")
    elif args.cmd == "build":
        order = build_mod.build(length=args.length, bpm_tol=args.bpm_tol,
                                peak_pos=args.peak, energy_boost=args.energy_boost,
                                start_track_id=args.start, mode=args.mode,
                                quality=args.quality, collection=args.collection,
                                playlist_ids=args.playlists)
        build_mod.print_set(order)
        if args.save and order:
            build_mod.save_set(order, args.save)
    elif args.cmd == "next":
        result = build_mod.suggest_next(
            args.track, limit=args.limit, target_energy=args.target_energy,
            mode=args.mode, quality=args.quality, collection=args.collection,
            playlist_ids=args.playlists)
        build_mod.print_candidates(result)


if __name__ == "__main__":
    main()
