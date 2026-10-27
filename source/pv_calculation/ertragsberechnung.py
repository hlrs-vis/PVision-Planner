import numpy as np
import pvlib

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

# Testmodul
MODUL_LEISTUNG_WP = 450
MODUL_NEIGUNG = 30
MODUL_AZIMUT = 180

TEMPERATURKOEFFIZIENT = -0.0035
SYSTEMVERLUSTFAKTOR = 0.86
ALBEDO = 0.20

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
        surface_tilt=0,
        surface_azimuth=180,
        components=True,
        outputformat="json",
        usehorizon=True,
        timeout=60
    )

    print("Wetterdaten erfolgreich geladen.")

    return wetterdaten, meta


def bereite_einstrahlung_auf(wetterdaten):

    print("\nEinstrahlungsdaten werden aufbereitet...")

    wetterdaten = wetterdaten.copy()

    # Globalstrahlung auf horizontaler Fläche
    wetterdaten["ghi"] = (
        wetterdaten["poa_direct"]
        + wetterdaten["poa_sky_diffuse"]
    )

    # Diffuse Horizontalstrahlung
    wetterdaten["dhi"] = (
        wetterdaten["poa_sky_diffuse"]
    )

    # Sonnenzenitwinkel
    wetterdaten["solar_zenith"] = (
        90 - wetterdaten["solar_elevation"]
    )

    # Direkte Normalstrahlung aus horizontaler
    # Direktstrahlung und Sonnenhöhe ableiten
    import numpy as np

    sin_elevation = np.sin(
        np.radians(wetterdaten["solar_elevation"])
    )

    wetterdaten["dni"] = np.where(
        sin_elevation > 0.05,
        wetterdaten["poa_direct"] / sin_elevation,
        0.0
    )

    wetterdaten["dni"] = (
        wetterdaten["dni"]
        .clip(lower=0)
    )

    print("Einstrahlungsdaten aufbereitet.")

    return wetterdaten


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
# 4. Berechnung des PV-Ertrags
# --------------------------------------------------

def berechne_pv_ertrag(wetterdaten):

    print("\nPV-Ertrag wird berechnet...")

    daten = wetterdaten.copy()

    # 1. Sonnenstand berechnen
    sonnenstand = pvlib.solarposition.get_solarposition(
        time=daten.index,
        latitude=LATITUDE,
        longitude=LONGITUDE
    )

    # 2. Einstrahlung auf die geneigte Modulfläche
    poa = pvlib.irradiance.get_total_irradiance(
        surface_tilt=MODUL_NEIGUNG,
        surface_azimuth=MODUL_AZIMUT,
        solar_zenith=sonnenstand["apparent_zenith"],
        solar_azimuth=sonnenstand["azimuth"],
        dni=daten["dni"],
        ghi=daten["ghi"],
        dhi=daten["dhi"],
        albedo=ALBEDO,
        model="isotropic"
    )

    daten["poa_global"] = poa["poa_global"].clip(lower=0)

    # 3. Zelltemperatur mit dem Faiman-Modell
    daten["temp_cell"] = pvlib.temperature.faiman(
        poa_global=daten["poa_global"],
        temp_air=daten["temp_air"],
        wind_speed=daten["wind_speed"]
    )

    # 4. Temperaturkorrekturfaktor
    daten["f_temp"] = (
        1
        + TEMPERATURKOEFFIZIENT
        * (daten["temp_cell"] - 25)
    )

    # 5. Elektrische Leistung in Watt
    daten["leistung_w"] = (
        MODUL_LEISTUNG_WP
        * daten["poa_global"] / 1000
        * daten["f_temp"]
        * SYSTEMVERLUSTFAKTOR
    ).clip(lower=0)

    # 6. Energie je Stundenintervall in kWh
    daten["energie_kwh"] = daten["leistung_w"] / 1000

    # 7. Jahresenergieertrag
    jahresertrag = daten["energie_kwh"].sum()

    # 8. Monatliche Energieerträge
    monatswerte = daten["energie_kwh"].resample("MS").sum()

    print(f"\nJahresertrag: {jahresertrag:.2f} kWh")

    print("\nMonatliche Energieerträge:")
    print(monatswerte.round(2))

    return daten, jahresertrag, monatswerte


# --------------------------------------------------
# 5. Hauptprogramm
# --------------------------------------------------

def main():

    print("PV-Ertragsberechnung gestartet\n")

    wetterdaten, meta = lade_wetterdaten()

    wetterdaten = bereite_einstrahlung_auf(wetterdaten)

    speichere_wetterdaten(wetterdaten)

    # PV-Ertrag berechnen
    ergebnisse, jahresertrag, monatswerte = (
        berechne_pv_ertrag(wetterdaten)
    )

    print(f"\nBerechneter Jahresertrag: {jahresertrag:.2f} kWh")

    print("\nProgramm erfolgreich beendet.")


if __name__ == "__main__":
    main()
