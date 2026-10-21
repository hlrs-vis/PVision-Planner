
from pathlib import Path

import pandas as pd
from pvlib.iotools import get_pvgis_hourly


# --------------------------------------------------
# 1. Einstellungen
# --------------------------------------------------

LATITUDE = 48.7758
LONGITUDE = 9.1829

START_YEAR = 2023
END_YEAR = 2023

OUTPUT_DIR = Path(__file__).resolve().parent / "wetterdaten"


# --------------------------------------------------
# 2. Wetterdaten von PVGIS abrufen
# --------------------------------------------------

def lade_wetterdaten():

    print("PVGIS-Wetterdaten werden abgerufen...")

    wetterdaten, meta = get_pvgis_hourly(
        latitude=LATITUDE,
        longitude=LONGITUDE,
        start=START_YEAR,
        end=END_YEAR,
        raddatabase="PVGIS-SARAH3",
        components=True,
        outputformat="json",
        usehorizon=True,
        timeout=60
    )

    print("Wetterdaten erfolgreich geladen.")

    return wetterdaten, meta


# --------------------------------------------------
# 3. Wetterdaten prüfen und speichern
# --------------------------------------------------

def speichere_wetterdaten(wetterdaten):

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    print("\nVerfügbare Spalten:")
    print(wetterdaten.columns.tolist())

    print("\nAnzahl der Stunden:")
    print(len(wetterdaten))

    print("\nErste fünf Datensätze:")
    print(wetterdaten.head())

    if wetterdaten.isna().any().any():
        print("\nWarnung: Fehlende Werte vorhanden!")

    dateipfad = (
        OUTPUT_DIR /
        f"pvgis_stuttgart_{START_YEAR}.csv"
    )

    wetterdaten.to_csv(
        dateipfad,
        sep=";",
        decimal=",",
        encoding="utf-8-sig"
    )

    print(f"\nWetterdaten gespeichert: {dateipfad}")


# --------------------------------------------------
# 4. Hauptprogramm
# --------------------------------------------------

def main():

    print("PV-Ertragsberechnung gestartet\n")

    wetterdaten, meta = lade_wetterdaten()

    speichere_wetterdaten(wetterdaten)

    print("\nProgramm erfolgreich beendet.")


if __name__ == "__main__":
    main()
