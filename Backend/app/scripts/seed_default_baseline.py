"""
One-off seed script for the DEFAULT/DEFAULT DistrictYieldBaseline row.

The model's docstring says this row is "always seeded" via an Alembic data
migration, but in practice it's missing from this database — that's the
root cause of the crop-health crash on fields whose district/crop don't
match a specific baseline row. Either that migration never ran here, or it
was written but never actually committed/applied.

Run once with:
    python -m app.scripts.seed_default_baseline

Safe to re-run: it's a no-op if the row already exists (checked via the
unique district+crop constraint already on the table).

IMPORTANT: baseline_ndvi=0.6 and the yield figures below are placeholders
so the app stops crashing/showing blank data immediately. Replace these
with real agronomy-reviewed numbers before relying on health scores in
production — health_score is computed directly as a ratio against this
value (see crop_health_service.compute_health_score), so a wrong baseline
here means a wrong score for every field that falls back to it.
"""

from app.db.session import SessionLocal
from app.models.district_yield_baseline import DistrictYieldBaseline


def seed_default_baseline() -> None:
    db = SessionLocal()
    try:
        existing = (
            db.query(DistrictYieldBaseline)
            .filter(
                DistrictYieldBaseline.district == "DEFAULT",
                DistrictYieldBaseline.crop == "DEFAULT",
            )
            .first()
        )
        if existing is not None:
            print("DEFAULT/DEFAULT baseline already exists — nothing to do.")
            return

        db.add(
            DistrictYieldBaseline(
                district="DEFAULT",
                crop="DEFAULT",
                baseline_ndvi=0.6,  # placeholder — replace with a real figure
                baseline_yield_maund_per_acre=0.0,  # placeholder
                baseline_yield_t_per_ha=0.0,  # placeholder
            )
        )
        db.commit()
        print("Seeded DEFAULT/DEFAULT baseline row.")
    finally:
        db.close()


if __name__ == "__main__":
    seed_default_baseline()
