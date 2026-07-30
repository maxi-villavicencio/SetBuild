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
from . import ingest as ingest_mod
from .db import run_sql_file

SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "..", "sql", "schema.sql")


def main():
    parser = argparse.ArgumentParser(description="DJ Set Builder")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init-db", help="Crea las tablas en SQL Server")
    sub.add_parser("ingest", help="Lee la master.db de Rekordbox -> tabla tracks")

    p_an = sub.add_parser("analyze", help="Extrae features de audio con librosa")
    p_an.add_argument("--all", action="store_true", help="Reanaliza todos, no solo los faltantes")

    sub.add_parser("recompute-energy", help="Normaliza features -> energy_score 1..10")

    p_dd = sub.add_parser("dedupe", help="Agrupa tracks que son el mismo tema (de-duplicacion)")
    p_dd.add_argument("--report", action="store_true", help="Imprime totales y ejemplos de grupos")
    p_dd.add_argument("--reelect", action="store_true",
                      help="No reagrupa: re-elige el representante por calidad sobre los grupos ya guardados")

    p_df = sub.add_parser("derive-fields", help="Rellena quality/collection desde el file_path")
    p_df.add_argument("--report", action="store_true", help="Cuenta tracks por quality y collection")

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

    args = parser.parse_args()

    if args.cmd == "init-db":
        run_sql_file(os.path.abspath(SCHEMA_PATH))
        print("Esquema creado.")
    elif args.cmd == "ingest":
        ingest_mod.ingest()
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
    elif args.cmd == "build":
        order = build_mod.build(length=args.length, bpm_tol=args.bpm_tol,
                                peak_pos=args.peak, energy_boost=args.energy_boost,
                                start_track_id=args.start, mode=args.mode,
                                quality=args.quality, collection=args.collection)
        build_mod.print_set(order)
        if args.save and order:
            build_mod.save_set(order, args.save)


if __name__ == "__main__":
    main()
