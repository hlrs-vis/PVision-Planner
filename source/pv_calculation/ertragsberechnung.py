import numpy as np
import pvlib
import json
import sys

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

def wetterdaten_dateipfad(latitude=LATITUDE, longitude=LONGITUDE):

    standort = (
        f"{latitude:.5f}_{longitude:.5f}"
        .replace(".", "p")
        .replace("-", "m")
    )

    return (
        OUTPUT_DIR /
        f"pvgis_SARAH3_{standort}_{START_YEAR}_{END_YEAR}_horizon.csv"
    )

# --------------------------------------------------
# Testkonfiguration: PV-Modulgruppen
# --------------------------------------------------

MODULGRUPPEN = [
    {
        "id": "G1",
        "kategorie": "south",
        "anzahl": 20,
        "leistung_wp": 450,
        "neigung": 30,
        "azimut": 180
    },
    {
        "id": "G2",
        "kategorie": "east-west",
        "anzahl": 15,
        "leistung_wp": 450,
        "neigung": 10,
        "azimut": 90
    },
    {
        "id": "G3",
        "kategorie": "Ost-West",
        "anzahl": 15,
        "leistung_wp": 450,
        "neigung": 10,
        "azimut": 270
    }
]

TEMPERATURKOEFFIZIENT = -0.0035
SYSTEMVERLUSTFAKTOR = 0.86
ALBEDO = 0.20

# --------------------------------------------------
# 2. Wetterdaten von PVGIS abrufen
# --------------------------------------------------

def lade_wetterdaten(latitude=LATITUDE, longitude=LONGITUDE):

    print("PVGIS-Wetterdaten werden abgerufen...")

    wetterdaten, meta = get_pvgis_hourly(
        latitude=latitude,
        longitude=longitude,
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

def speichere_wetterdaten(
    wetterdaten,
    latitude=LATITUDE,
    longitude=LONGITUDE
):

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

    dateipfad = wetterdaten_dateipfad()

    wetterdaten.to_csv(
        dateipfad,
        sep=";",
        decimal=",",
        encoding="utf-8-sig"
    )

    print(f"\nWetterdaten gespeichert: {dateipfad}")
    
# --------------------------------------------------
# 4.Wetterdaten aus CSV laden oder von PVGIS abrufen
# --------------------------------------------------

def lade_oder_erstelle_wetterdaten(latitude=LATITUDE, longitude=LONGITUDE):

    dateipfad = wetterdaten_dateipfad(latitude, longitude)

    if dateipfad.exists():

        print("Gespeicherte PVGIS-Wetterdaten werden geladen.")

        wetterdaten = pd.read_csv(
            dateipfad,
            sep=";",
            decimal=",",
            encoding="utf-8-sig",
            index_col=0
        )

        # Zeitstempel einschließlich Zeitzone wiederherstellen
        wetterdaten.index = pd.to_datetime(
            wetterdaten.index,
            utc=True
        )

        wetterdaten.index.name = "time"

        benoetigte_spalten = [
            "ghi",
            "dhi",
            "dni",
            "temp_air",
            "wind_speed"
        ]

        if any(
            spalte not in wetterdaten.columns
            for spalte in benoetigte_spalten
        ):
            raise ValueError(
                "Die gespeicherte Wetterdatei enthält "
                "nicht alle benötigten Spalten."
            )

        if (
            len(wetterdaten) == 0
            or wetterdaten[benoetigte_spalten].isna().any().any()
            or not wetterdaten.index.is_monotonic_increasing
            or wetterdaten.index.has_duplicates
        ):
            raise ValueError(
                "Die gespeicherte Wetterdatei ist unvollständig "
                "oder enthält ungültige Zeitstempel."
            )

        print(
            f"{len(wetterdaten)} Wetterdatensätze aus CSV geladen."
        )

        return wetterdaten

    print("Keine passende Wetterdatei vorhanden.")

    wetterdaten, meta = lade_wetterdaten(latitude, longitude)

    wetterdaten = bereite_einstrahlung_auf(
        wetterdaten
    )

    speichere_wetterdaten(
        wetterdaten,
        latitude,
        longitude
    )

    return wetterdaten
# --------------------------------------------------
# 5. Berechnung des PV-Ertrags
# --------------------------------------------------

def berechne_pv_ertrag(
    wetterdaten,
    modulgruppen,
    albedo=0.20,
    temperaturkoeffizient=-0.0035,
    systemverlustfaktor=0.86,
    latitude=LATITUDE,
    longitude=LONGITUDE
):

    print("\nPV-Ertragsberechnung gestartet...")

    sonnenstand = pvlib.solarposition.get_solarposition(
         time=wetterdaten.index,
        latitude=latitude,
        longitude=longitude
    )

    gruppenergebnisse = []

    gesamt_monatswerte = None
    gesamt_jahresertrag = 0.0
    gesamt_modulanzahl = 0
    gesamt_leistung_kwp = 0.0

    for gruppe in modulgruppen:

        print(f"\nBerechne Gruppe {gruppe['id']}...")

        anzahl = int(gruppe["anzahl"])
        leistung_wp = float(gruppe["leistung_wp"])
        neigung = float(gruppe["neigung"])
        azimut = float(gruppe["azimut"])

        if (
            anzahl <= 0
            or leistung_wp <= 0
            or not 0 <= neigung <= 90
            or not 0 <= azimut < 360
        ):
            raise ValueError(
                f"Ungültige Parameter in Gruppe {gruppe['id']}."
            )

        # 1. Einstrahlung auf die Modulfläche

        poa = pvlib.irradiance.get_total_irradiance(
            surface_tilt=neigung,
            surface_azimuth=azimut,
            solar_zenith=sonnenstand["apparent_zenith"],
            solar_azimuth=sonnenstand["azimuth"],
            dni=wetterdaten["dni"],
            ghi=wetterdaten["ghi"],
            dhi=wetterdaten["dhi"],
            albedo=albedo,
            model="isotropic"
        )

        poa_global = poa["poa_global"].clip(lower=0)

        # 2. Modultemperatur

        temp_cell = pvlib.temperature.faiman(
            poa_global=poa_global,
            temp_air=wetterdaten["temp_air"],
            wind_speed=wetterdaten["wind_speed"]
        )

        # 3. Temperaturkorrektur

        f_temp = (
            1
            + temperaturkoeffizient
            * (temp_cell - 25)
        )

        # 4. Installierte Leistung der Gruppe

        leistung_kwp = (
            anzahl * leistung_wp / 1000
        )

        # 5. Elektrische Gruppenleistung [W]

        leistung_w = (
            anzahl
            * leistung_wp
            * poa_global / 1000
            * f_temp
            * systemverlustfaktor
        ).clip(lower=0)

        # 6. Stundenenergie [kWh]
        # Gültig für stündlich aufgelöste Wetterdaten.

        energie_kwh = leistung_w / 1000

        # 7. Monats- und Jahresertrag

        monatswerte = energie_kwh.resample("MS").sum()

        jahresertrag = float(energie_kwh.sum())

        # 8. Ergebnisse speichern

        gruppenergebnisse.append({
            "id": gruppe["id"],
            "kategorie": gruppe["kategorie"],
            "anzahl": anzahl,
            "leistung_kwp": leistung_kwp,
            "neigung": neigung,
            "azimut": azimut,
            "jahresertrag_kwh": jahresertrag,
            "monatswerte_kwh": monatswerte
        })

        # 9. Gesamtwerte aufsummieren

        gesamt_jahresertrag += jahresertrag
        gesamt_modulanzahl += anzahl
        gesamt_leistung_kwp += leistung_kwp

        if gesamt_monatswerte is None:
            gesamt_monatswerte = monatswerte.copy()
        else:
            gesamt_monatswerte = (
                gesamt_monatswerte.add(
                    monatswerte,
                    fill_value=0
                )
            )

        print(
            f"Jahresertrag: {jahresertrag:.2f} kWh"
        )

    gesamt = {
        "modulanzahl": gesamt_modulanzahl,
        "leistung_kwp": gesamt_leistung_kwp,
        "jahresertrag_kwh": gesamt_jahresertrag,
        "monatswerte_kwh": gesamt_monatswerte
    }

    return gruppenergebnisse, gesamt

# --------------------------------------------------
# 6. Hauptprogramm
# --------------------------------------------------

def main():

    print("PV-Ertragsberechnung gestartet\n")

    wetterdaten = lade_oder_erstelle_wetterdaten()

    gruppenergebnisse, gesamt = (
        berechne_pv_ertrag(
            wetterdaten,
            MODULGRUPPEN
        )
    )

    print("\n================================")
    print("ERGEBNISSE DER MODULGRUPPEN")
    print("================================")

    for gruppe in gruppenergebnisse:

        print(
            f"\nGruppe: {gruppe['id']}"
            f"\nKategorie: {gruppe['kategorie']}"
            f"\nModule: {gruppe['anzahl']}"
            f"\nLeistung: {gruppe['leistung_kwp']:.2f} kWp"
            f"\nAzimut: {gruppe['azimut']}°"
            f"\nNeigung: {gruppe['neigung']}°"
            f"\nJahresertrag: "
            f"{gruppe['jahresertrag_kwh']:.2f} kWh"
        )

        print("\nMonatliche Erträge:")

        print(
            gruppe["monatswerte_kwh"].round(2)
        )

    print("\n================================")
    print("GESAMTERGEBNIS")
    print("================================")

    print(
        f"Modulanzahl: {gesamt['modulanzahl']}"
    )

    print(
        f"Installierte Leistung: "
        f"{gesamt['leistung_kwp']:.2f} kWp"
    )

    print(
        f"Jahresertrag: "
        f"{gesamt['jahresertrag_kwh']:.2f} kWh"
    )

    print("\nMonatliche Gesamterträge:")

    print(
        gesamt["monatswerte_kwh"].round(2)
    )

    print("\nProgramm erfolgreich beendet.")
    
# --------------------------------------------------
# 7. JSON-Schnittstelle für Node.js
# --------------------------------------------------

def main_json():

    # Eingabedaten von Node.js lesen
    eingabe = json.load(sys.stdin)

    modulgruppen = eingabe["groups"]
    
    latitude = float(eingabe.get("latitude", LATITUDE))
    longitude = float(eingabe.get("longitude", LONGITUDE))

    if not -90 <= latitude <= 90:
        raise ValueError("Ungültiger Breitengrad.")

    if not -180 <= longitude <= 180:
        raise ValueError("Ungültiger Längengrad.")
    
    # Optionale Berechnungsparameter einlesen
    albedo = float(eingabe.get("albedo", 0.20))

    # Eingabe in %/K, beispielsweise -0.35
    temperaturkoeffizient = (
        float(eingabe.get("temperaturkoeffizient", -0.35)) / 100
    )

    # Eingabe als Verlustanteil in %, beispielsweise 14
    systemverluste = float(eingabe.get("systemverluste", 14.0))
    systemverlustfaktor = 1.0 - systemverluste / 100

    # Eingabewerte prüfen
    if not 0 <= albedo <= 1:
        raise ValueError("Albedo muss zwischen 0 und 1 liegen.")

    if not -1.0 <= temperaturkoeffizient * 100 <= 0:
        raise ValueError(
            "Temperaturkoeffizient muss zwischen -1 und 0 %/K liegen."
        )

    if not 0 <= systemverluste < 100:
        raise ValueError(
            "Systemverluste müssen zwischen 0 und unter 100 % liegen."
        )

    if not isinstance(modulgruppen, list) or not modulgruppen:
        raise ValueError("Keine Modulgruppen übergeben.")

    # Standortabhängige Wetterdaten laden
    wetterdaten = lade_oder_erstelle_wetterdaten(
        latitude=latitude,
        longitude=longitude
    )

    # Ertragsberechnung
    gruppenergebnisse, gesamt = berechne_pv_ertrag(
        wetterdaten,
        modulgruppen,
        albedo=albedo,
        temperaturkoeffizient=temperaturkoeffizient,
        systemverlustfaktor=systemverlustfaktor,
        latitude=latitude,
        longitude=longitude
    )
    # Pandas-Zeitreihen in JSON-kompatible Listen umwandeln
    gruppen_json = []

    for gruppe in gruppenergebnisse:

        gruppen_json.append({
            "id": gruppe["id"],
            "kategorie": gruppe["kategorie"],
            "anzahl": gruppe["anzahl"],
            "leistung_kwp": gruppe["leistung_kwp"],
            "neigung": gruppe["neigung"],
            "azimut": gruppe["azimut"],
            "jahresertrag_kwh": gruppe["jahresertrag_kwh"],
            "monatswerte_kwh": [
                float(wert)
                for wert in gruppe["monatswerte_kwh"].tolist()
            ]
        })

    ergebnis = {
        "success": True,
        "year": START_YEAR,
        "gesamt": {
            "modulanzahl": gesamt["modulanzahl"],
            "leistung_kwp": gesamt["leistung_kwp"],
            "jahresertrag_kwh": gesamt["jahresertrag_kwh"],
            "monatswerte_kwh": [
                float(wert)
                for wert in gesamt["monatswerte_kwh"].tolist()
            ]
        },
        "gruppen": gruppen_json
    }

    return ergebnis


if __name__ == "__main__":

    if "--json" in sys.argv:

        # Berechnungsprotokolle dürfen die JSON-Antwort
        # auf stdout nicht verunreinigen.
        from contextlib import redirect_stdout

        try:
            with redirect_stdout(sys.stderr):
                ergebnis = main_json()

            json.dump(
                ergebnis,
                sys.stdout,
                ensure_ascii=False
            )

            sys.stdout.write("\n")

        except Exception as error:
            print(
                f"Ertragsberechnung fehlgeschlagen: {error}",
                file=sys.stderr
            )
            sys.exit(1)

    else:
        main()