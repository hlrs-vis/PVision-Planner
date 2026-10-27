
// =========================================================
// GEOMETRISCHE HILFSFUNKTIONEN
// =========================================================

const EARTH_RADIUS_M = 6378137.0;
const DEFAULT_PLANARITY_TOLERANCE_M = 3.00;

function degToRad(deg) {
    return deg * Math.PI / 180.0;
}

function radToDeg(rad) {
    return rad * 180.0 / Math.PI;
}

// =========================================================
// KOORDINATENTRANSFORMATION
// =========================================================

function globalToLocal(point, origin) {
    const lat0 = degToRad(origin.latitude);
    const dLon = degToRad(point.longitude - origin.longitude);
    const dLat = degToRad(point.latitude - origin.latitude);

    return {
        x: EARTH_RADIUS_M * dLon * Math.cos(lat0),
        y: EARTH_RADIUS_M * dLat
    };
}

function localToGlobal(point, origin) {
    const lat0 = degToRad(origin.latitude);

    return {
        longitude:
            origin.longitude +
            radToDeg(point.x / (EARTH_RADIUS_M * Math.cos(lat0))),
        latitude:
            origin.latitude +
            radToDeg(point.y / EARTH_RADIUS_M)
    };
}

// =========================================================
// DACHEBENE
// =========================================================

function projectPointOntoRoofPlane(point, roofPlane) {
    if (!point || !point.local || !roofPlane) {
        throw new Error(
            "Ungültiger Punkt oder ungültige Dachebene."
        );
    }

    const projectedHeight = getRoofHeight(
        roofPlane,
        point.local.x,
        point.local.y
    );

    return {
        ...point,
        height: projectedHeight
    };
}

function calculateRoofPlane(roofPoints) {
    if (!Array.isArray(roofPoints) || roofPoints.length < 3) {
        throw new Error(
            "Für die Ebenenberechnung werden drei Dachpunkte benötigt."
        );
    }

    const p0 = roofPoints[0];
    const p1 = roofPoints[1];
    const p2 = roofPoints[2];

    const x1 = p1.local.x - p0.local.x;
    const y1 = p1.local.y - p0.local.y;
    const x2 = p2.local.x - p0.local.x;
    const y2 = p2.local.y - p0.local.y;

    const dz1 = p1.height - p0.height;
    const dz2 = p2.height - p0.height;

    const determinant = x1 * y2 - x2 * y1;

    if (Math.abs(determinant) < 1e-8) {
        throw new Error(
            "Dachpunkte erlauben keine eindeutige Ebenenberechnung."
        );
    }

    const a = (dz1 * y2 - dz2 * y1) / determinant;
    const b = (x1 * dz2 - x2 * dz1) / determinant;

    return {
        originX: p0.local.x,
        originY: p0.local.y,
        z0: p0.height,
        a,
        b
    };
}

function getRoofHeight(roofPlane, x, y) {
    return (
        roofPlane.z0 +
        roofPlane.a * (x - roofPlane.originX) +
        roofPlane.b * (y - roofPlane.originY)
    );
}

function checkRoofPlanarity(
    roofPoints,
    roofPlane,
    toleranceM = DEFAULT_PLANARITY_TOLERANCE_M
) {
    if (!Array.isArray(roofPoints) || roofPoints.length < 4) {
        throw new Error(
            "Für die Planaritätsprüfung werden vier Dachpunkte benötigt."
        );
    }

    if (!Number.isFinite(toleranceM) || toleranceM < 0) {
        throw new Error(
            "Ungültige Toleranz für die Planaritätsprüfung."
        );
    }

    const normalLength = Math.sqrt(
        roofPlane.a ** 2 +
        roofPlane.b ** 2 +
        1
    );

    const deviations = roofPoints.map(point => {
        const expectedHeight = getRoofHeight(
            roofPlane,
            point.local.x,
            point.local.y
        );

        return (
            Math.abs(point.height - expectedHeight) /
            normalLength
        );
    });

    const maxDeviation = Math.max(...deviations);

    return {
        isPlanar: maxDeviation <= toleranceM,
        maxDeviation,
        deviations,
        toleranceM
    };
}

function calculateRoofTilt(roofPlane) {
    const gradient = Math.sqrt(
        roofPlane.a ** 2 +
        roofPlane.b ** 2
    );

    return radToDeg(Math.atan(gradient));
}

// =========================================================
// BASIS DER AUSGEWÄHLTEN RECHTECKFLÄCHE
// =========================================================

function calculateRoofBasis(roofPoints) {
    if (!Array.isArray(roofPoints) || roofPoints.length < 4) {
        throw new Error(
            "Für die Berechnung der Dachbasis werden vier Dachpunkte benötigt."
        );
    }

    const p0 = roofPoints[0].local;
    const p1 = roofPoints[1].local;
    const p3 = roofPoints[3].local;

    const edgeU = {
        x: p1.x - p0.x,
        y: p1.y - p0.y
    };

    const roofWidth = Math.hypot(edgeU.x, edgeU.y);

    if (roofWidth < 1e-8) {
        throw new Error(
            "Die erste Dachkante besitzt keine gültige Länge."
        );
    }

    const u = {
        x: edgeU.x / roofWidth,
        y: edgeU.y / roofWidth
    };

    const edgeVRaw = {
        x: p3.x - p0.x,
        y: p3.y - p0.y
    };

    const projectionVOnU =
        edgeVRaw.x * u.x +
        edgeVRaw.y * u.y;

    const edgeV = {
        x: edgeVRaw.x - projectionVOnU * u.x,
        y: edgeVRaw.y - projectionVOnU * u.y
    };

    const roofDepth = Math.hypot(edgeV.x, edgeV.y);

    if (roofDepth < 1e-8) {
        throw new Error(
            "Die zweite Dachkante besitzt keine gültige Länge."
        );
    }

    const v = {
        x: edgeV.x / roofDepth,
        y: edgeV.y / roofDepth
    };

    return {
        origin: {
            x: p0.x,
            y: p0.y
        },
        u,
        v,
        roofWidth,
        roofDepth
    };
}

// =========================================================
// AUFSTÄNDERUNGSRICHTUNG
// =========================================================

function calculateLayoutBasis(roofBasis, mountingDirection) {
    const {
        origin,
        u,
        v,
        roofWidth,
        roofDepth
    } = roofBasis;

    switch (mountingDirection) {
        case "positive-v":
            return {
                origin: { ...origin },
                u: { ...u },
                v: { ...v },
                rowExtent: roofWidth,
                tiltExtent: roofDepth
            };

        case "positive-u":
            return {
                origin: { ...origin },
                u: { ...v },
                v: { ...u },
                rowExtent: roofDepth,
                tiltExtent: roofWidth
            };

        case "negative-v":
            return {
                origin: {
                    x: origin.x + v.x * roofDepth,
                    y: origin.y + v.y * roofDepth
                },
                u: { ...u },
                v: {
                    x: -v.x,
                    y: -v.y
                },
                rowExtent: roofWidth,
                tiltExtent: roofDepth
            };

        case "negative-u":
            return {
                origin: {
                    x: origin.x + u.x * roofWidth,
                    y: origin.y + u.y * roofWidth
                },
                u: { ...v },
                v: {
                    x: -u.x,
                    y: -u.y
                },
                rowExtent: roofDepth,
                tiltExtent: roofWidth
            };

        default:
            throw new Error(
                `Ungültige Aufständerungsrichtung: ${mountingDirection}`
            );
    }
}

// =========================================================
// PROJEKTION UND REIHENABSTAND
// =========================================================

function calculateProjectedModuleDimensions(
    moduleLength,
    moduleWidth,
    projectionTiltDeg
) {
    if (!Number.isFinite(moduleLength) || moduleLength <= 0) {
        throw new Error("Ungültige Modullänge.");
    }

    if (!Number.isFinite(moduleWidth) || moduleWidth <= 0) {
        throw new Error("Ungültige Modulbreite.");
    }

    if (
        !Number.isFinite(projectionTiltDeg) ||
        projectionTiltDeg < 0 ||
        projectionTiltDeg >= 90
    ) {
        throw new Error(
            "Ungültiger Winkel für die Modulprojektion."
        );
    }

    return {
        width: moduleWidth,
        length:
            moduleLength *
            Math.cos(degToRad(projectionTiltDeg))
    };
}

function calculateMinimumRowGap(
    moduleLength,
    tiltDeg,
    sunElevationDeg
) {
    if (!Number.isFinite(moduleLength) || moduleLength <= 0) {
        throw new Error("Ungültige Modullänge.");
    }

    if (
        !Number.isFinite(tiltDeg) ||
        tiltDeg < 0 ||
        tiltDeg >= 90
    ) {
        throw new Error(
            "Ungültiger Aufstellwinkel."
        );
    }

    if (
        !Number.isFinite(sunElevationDeg) ||
        sunElevationDeg <= 0 ||
        sunElevationDeg >= 90
    ) {
        throw new Error(
            "Ungültige Sonnenhöhe für die Reihenabstandsberechnung."
        );
    }

    if (tiltDeg === 0) {
        return 0;
    }

    const height =
        moduleLength * Math.sin(degToRad(tiltDeg));

    return height / Math.tan(degToRad(sunElevationDeg));
}

// =========================================================
// 3D-MODULGEOMETRIE
// =========================================================

function createModuleCorners(
    frontLeft2D,
    moduleWidth,
    projectedModuleLength,
    basis,
    roofPlane,
    additionalTiltDeg,
    moduleLength
) {
    const frontRight2D = {
        x: frontLeft2D.x + basis.u.x * moduleWidth,
        y: frontLeft2D.y + basis.u.y * moduleWidth
    };

    const rearLeft2D = {
        x: frontLeft2D.x +
           basis.v.x * projectedModuleLength,
        y: frontLeft2D.y +
           basis.v.y * projectedModuleLength
    };

    const rearRight2D = {
        x: rearLeft2D.x + basis.u.x * moduleWidth,
        y: rearLeft2D.y + basis.u.y * moduleWidth
    };

    const corners = [
        frontLeft2D,
        frontRight2D,
        rearRight2D,
        rearLeft2D
    ].map(point => ({
        x: point.x,
        y: point.y,
        z: getRoofHeight(
            roofPlane,
            point.x,
            point.y
        )
    }));

    if (additionalTiltDeg > 0) {
        const rise =
            moduleLength *
            Math.sin(degToRad(additionalTiltDeg));

        corners[2].z += rise;
        corners[3].z += rise;
    }

    return corners;
}

// =========================================================
// PRÜFUNG DER 3D-MODULGEOMETRIE
// =========================================================

function checkModuleGeometry(corners, moduleWidth, moduleLength) {
    const [p1, p2, p3, p4] = corners;

    function subtract(a, b) {
        return {
            x: a.x - b.x,
            y: a.y - b.y,
            z: a.z - b.z
        };
    }

    function dot(a, b) {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    }

    function length(v) {
        return Math.hypot(v.x, v.y, v.z);
    }

    const u = subtract(p2, p1);
    const v = subtract(p4, p1);

    const widthFront = length(u);
    const widthRear = length(subtract(p3, p4));

    const lengthLeft = length(v);
    const lengthRight = length(subtract(p3, p2));

    const cosine = dot(u, v) / (length(u) * length(v));

    const angleDeg =
        Math.acos(Math.max(-1, Math.min(1, cosine))) *
        180 / Math.PI;

    const normal = {
        x: u.y * v.z - u.z * v.y,
        y: u.z * v.x - u.x * v.z,
        z: u.x * v.y - u.y * v.x
    };

    const diagonal = subtract(p3, p1);

    const planarityError =
        Math.abs(dot(normal, diagonal)) /
        length(normal);

    const tolerance = 0.001;

    const valid =
        Math.abs(widthFront - moduleWidth) < tolerance &&
        Math.abs(widthRear - moduleWidth) < tolerance &&
        Math.abs(lengthLeft - moduleLength) < tolerance &&
        Math.abs(lengthRight - moduleLength) < tolerance &&
        Math.abs(angleDeg - 90) < 0.01 &&
        planarityError < tolerance;

    console.log("----- Modulgeometrie -----");
    console.log(`Breite vorne: ${widthFront.toFixed(4)} m`);
    console.log(`Breite hinten: ${widthRear.toFixed(4)} m`);
    console.log(`Länge links: ${lengthLeft.toFixed(4)} m`);
    console.log(`Länge rechts: ${lengthRight.toFixed(4)} m`);
    console.log(`Winkel: ${angleDeg.toFixed(4)}°`);
    console.log(
        `Ebenheitsabweichung: ${(planarityError * 1000).toFixed(3)} mm`
    );
    console.log(`Ergebnis: ${valid ? "OK" : "ABWEICHUNG"}`);

    return valid;
}

// =========================================================
// AUTOMATISCHE AZIMUTBESTIMMUNG
// =========================================================

// Azimut:
// 0° = Nord, 90° = Ost, 180° = Süd, 270° = West

function vectorAzimuthDeg(vector) {
    return (
        radToDeg(Math.atan2(vector.x, vector.y)) + 360
    ) % 360;
}

function angleDifferenceDeg(a, b) {
    return Math.abs(((a - b + 540) % 360) - 180);
}

// Vier mögliche Neigungsrichtungen aus den Dachkanten.
// Die nächstliegende Süd- und Ostrichtung wird ermittelt.

function classifyRoofDirections(roofBasis) {
    const directions = [
        "positive-v",
        "positive-u",
        "negative-v",
        "negative-u"
    ];

    const candidates = directions.map(direction => {
        const basis = calculateLayoutBasis(
            roofBasis,
            direction
        );

        return {
            direction,
            azimuthDeg: vectorAzimuthDeg(basis.v)
        };
    });

    const nearest = target => candidates.reduce(
        (best, item) =>
            angleDifferenceDeg(item.azimuthDeg, target) <
            angleDifferenceDeg(best.azimuthDeg, target)
                ? item
                : best
    );

    const south = nearest(180);
    const east = nearest(90);

    return {
        southDirection: south.direction,
        southAzimuthDeg: south.azimuthDeg,
        eastDirection: east.direction,
        eastAzimuthDeg: east.azimuthDeg,
        westAzimuthDeg: (east.azimuthDeg + 180) % 360
    };
}

// =========================================================
// MODULRASTER
// =========================================================

function createModuleLayout(roofPoints, roofPlane, config) {
    if (!Array.isArray(roofPoints) || roofPoints.length < 4) {
        throw new Error(
            "Für das Modulraster werden vier Dachpunkte benötigt."
        );
    }

    if (!config) {
        throw new Error(
            "Keine Konfiguration für das Modulraster vorhanden."
        );
    }

    const {
        moduleLength,
        moduleWidth,
        roofMargin,
        projectionTiltDeg,
        additionalTiltDeg,
        designSunElevationDeg,
        maxModules = Infinity
    } = config;

    // Neu: Unterscheidung Süd / Ost-West
    const mountingType = config.mountingType ?? "south";

    if (!["south", "east_west"].includes(mountingType)) {
        throw new Error(
            `Unbekannte Aufständerungsart: ${mountingType}`
        );
    }

    if (!Number.isFinite(roofMargin) || roofMargin < 0) {
        throw new Error("Ungültiger Randabstand.");
    }

    if (
        !Number.isFinite(additionalTiltDeg) ||
        additionalTiltDeg < 0 ||
        additionalTiltDeg > 45
    ) {
        throw new Error(
            "Ungültiger zusätzlicher Modulwinkel."
        );
    }

    if (
        mountingType === "east_west" &&
        additionalTiltDeg === 0
    ) {
        throw new Error(
            "Ost-West-Aufständerung benötigt einen Aufstellwinkel größer als 0°."
        );
    }

    // -----------------------------------------------------
    // Dachbasis und Ausrichtung bestimmen
    // -----------------------------------------------------

    const roofBasis = calculateRoofBasis(roofPoints);

    const orientation = classifyRoofDirections(roofBasis);

    
    const oppositeDirections = {
        "positive-v": "negative-v",
        "negative-v": "positive-v",
        "positive-u": "negative-u",
        "negative-u": "positive-u"
    };

    const mountingDirection =
        mountingType === "south"
            ? oppositeDirections[orientation.southDirection]
            : orientation.eastDirection;


    const layoutBasis = calculateLayoutBasis(
        roofBasis,
        mountingDirection
    );

    
    const crossZ =
        layoutBasis.u.x * layoutBasis.v.y -
        layoutBasis.u.y * layoutBasis.v.x;

    console.log(
        "Orientierung der Modulbasis:",
        crossZ > 0
            ? "gegen Uhrzeigersinn"
            : "im Uhrzeigersinn"
    );

    console.log(
        "Kreuzprodukt Z:",
        crossZ
    );


        
    console.log("----- AUSRICHTUNGSTEST -----");

    console.log(
        "Aufständerungsart:",
        mountingType
    );

    console.log(
        "Berechneter Südazimut:",
        orientation.southAzimuthDeg
    );

    console.log(
        "Gewählte Montagerichtung:",
        mountingDirection
    );

    console.log(
        "Ansteigende Richtung:",
        vectorAzimuthDeg(layoutBasis.v)
    );

    console.log(
        "Tatsächlicher Modulazimut:",
        (vectorAzimuthDeg(layoutBasis.v) + 180) % 360
    );


    // -----------------------------------------------------
    // Projizierte Modulabmessungen
    // -----------------------------------------------------

    const projectedDimensions =
        calculateProjectedModuleDimensions(
            moduleLength,
            moduleWidth,
            projectionTiltDeg
        );

    const projectedModuleWidth =
        projectedDimensions.width;

    const projectedModuleLength =
        projectedDimensions.length;

    // -----------------------------------------------------
    // Reihenabstände
    // -----------------------------------------------------

    const southGap =
        additionalTiltDeg > 0
            ? calculateMinimumRowGap(
                moduleLength,
                additionalTiltDeg,
                designSunElevationDeg
            )
            : 0;

    // Süd: bisheriger Mindestabstand
    // Ost-West: gemeinsame Firstkante innerhalb eines Paars.
    // Der freie Abstand entsteht zwischen den Modulpaaren.
    // Vereinfachtes geometrisches Abstandsmodell.

    const rowGap =
        mountingType === "east_west"
            ? Math.max(
                0,
                southGap - projectedModuleLength
            )
            : southGap;

    // -----------------------------------------------------
    // Verfügbare Dachfläche
    // -----------------------------------------------------

    const availableRowExtent =
        layoutBasis.rowExtent - 2 * roofMargin;

    const availableTiltExtent =
        layoutBasis.tiltExtent - 2 * roofMargin;

    const numColumns =
        availableRowExtent > 0
            ? Math.max(
                0,
                Math.floor(
                    (availableRowExtent + 1e-9) /
                    projectedModuleWidth
                )
            )
            : 0;

    let numPairs = 0;
    let numRows = 0;

    // -----------------------------------------------------
    // Anzahl der Modulreihen bestimmen
    // -----------------------------------------------------

    if (availableTiltExtent > 0) {
        if (mountingType === "east_west") {
            const pairLength =
                2 * projectedModuleLength;

            numPairs = Math.max(
                0,
                Math.floor(
                    (availableTiltExtent + rowGap + 1e-9) /
                    (pairLength + rowGap)
                )
            );

            numRows = 2 * numPairs;
        } else {
            numRows = Math.max(
                0,
                Math.floor(
                    (availableTiltExtent + rowGap + 1e-9) /
                    (projectedModuleLength + rowGap)
                )
            );
        }
    }

    const modules = [];

    // -----------------------------------------------------
    // Raster auf Dachfläche zentrieren
    // -----------------------------------------------------

    const usedRowExtent =
        numColumns * projectedModuleWidth;

    const usedTiltExtent =
        mountingType === "east_west"
            ? numPairs * 2 * projectedModuleLength +
              Math.max(0, numPairs - 1) * rowGap
            : numRows * projectedModuleLength +
              Math.max(0, numRows - 1) * rowGap;

    const centeredStartU =
        roofMargin +
        (availableRowExtent - usedRowExtent) / 2;

    const centeredStartV =
        roofMargin +
        (availableTiltExtent - usedTiltExtent) / 2;

    function pointOnLayout(du, dv) {
        return {
            x:
                layoutBasis.origin.x +
                layoutBasis.u.x * du +
                layoutBasis.v.x * dv,
            y:
                layoutBasis.origin.y +
                layoutBasis.u.y * du +
                layoutBasis.v.y * dv
        };
    }

    function toGlobalCorner(point) {
        const global = localToGlobal(
            point,
            roofPoints[0]
        );

        return {
            longitude: global.longitude,
            latitude: global.latitude,
            height: point.z
        };
    }

    // -----------------------------------------------------
    // Ergebnis einschließlich Ausrichtungsinformationen
    // -----------------------------------------------------

    const result = () => ({
        roofWidth: roofBasis.roofWidth,
        roofDepth: roofBasis.roofDepth,
        projectedModuleWidth,
        projectedModuleLength,
        rowGap,
        numColumns,
        numRows,
        mountingType,
        mountingDirection,
        southAzimuthDeg: orientation.southAzimuthDeg,
        eastAzimuthDeg: orientation.eastAzimuthDeg,
        westAzimuthDeg: orientation.westAzimuthDeg,
        modules
    });

    // -----------------------------------------------------
    // Module erzeugen
    // -----------------------------------------------------

    for (let row = 0; row < numRows; row++) {

        // Jede zweite Reihe zeigt bei Ost-West
        // in die entgegengesetzte Richtung.

        const westFacing =
            mountingType === "east_west" &&
            row % 2 === 1;

        // Die westseitigen Module werden bezüglich
        // der Neigungsrichtung umgekehrt.

        const rowBasis = westFacing
            ? {
                ...layoutBasis,
                u: {
                    x: -layoutBasis.u.x,
                    y: -layoutBasis.u.y
                },
                v: {
                    x: -layoutBasis.v.x,
                    y: -layoutBasis.v.y
                }
            }
            : layoutBasis;

        // -------------------------------------------------
        // Position der Modulreihe
        // -------------------------------------------------

        const startV =
            mountingType === "east_west"
                ? centeredStartV +
                  Math.floor(row / 2) *
                  (2 * projectedModuleLength + rowGap) +
                  (westFacing
                      ? 2 * projectedModuleLength
                      : 0)
                : centeredStartV +
                  row *
                  (projectedModuleLength + rowGap);

        
        // -------------------------------------------------
        // Tatsächlichen Modulazimut speichern
        // -------------------------------------------------

        // Die Modulfläche zeigt in die entgegengesetzte
        // Richtung ihrer ansteigenden Kante.
        //
        // Bei Ost-West:
        // Gerade Reihen -> West
        // Ungerade Reihen -> Ost

        const azimuthDeg =
            mountingType === "south"
                ? orientation.southAzimuthDeg
                : (
                    westFacing
                        ? orientation.eastAzimuthDeg
                        : orientation.westAzimuthDeg
                );

        for (let col = 0; col < numColumns; col++) {

            if (modules.length >= maxModules) {
                return result();
            }

            const startU =
                centeredStartU +
                col * projectedModuleWidth;

                
            // -------------------------------------------------
            // Modulecken berechnen
            // -------------------------------------------------

            const corners = createModuleCorners(
                pointOnLayout(
                    startU +
                    (westFacing
                        ? projectedModuleWidth
                        : 0),
                    startV
                ),
                projectedModuleWidth,
                projectedModuleLength,
                rowBasis,
                roofPlane,
                additionalTiltDeg,
                moduleLength
            );

            // -------------------------------------------------
            // TEST: Moduleckpunkte ausgeben
            // -------------------------------------------------

            if (modules.length === 0) {
                console.log("----- MODUL-ECKPUNKTE -----");

                corners.forEach((corner, index) => {
                    console.log(
                        `P${index}:`,
                        `x=${corner.x.toFixed(3)}`,
                        `y=${corner.y.toFixed(3)}`,
                        `z=${corner.z.toFixed(3)}`
                    );
                });

                console.log(
                    "Modulazimut:",
                    azimuthDeg
                );

                console.log(
                    "Aufständerung:",
                    mountingType
                );
            }



            

            // Geometrie des ersten Moduls prüfen
            if (modules.length === 0) {
                checkModuleGeometry(
                    corners,
                    moduleWidth,
                    moduleLength
                );
            }

            // -------------------------------------------------
            // Modul mit Ausrichtungsdaten speichern
            // -------------------------------------------------

            modules.push({
                corners: corners.map(toGlobalCorner),

                mountingType,

                orientationCategory: mountingType,

                moduleAzimuthDeg: azimuthDeg,

                roofReferenceAzimuthDeg:
                    orientation.southAzimuthDeg,

                rowIndex: row,

                rowPairId:
                    mountingType === "east_west"
                        ? Math.floor(row / 2) + 1
                        : null,

                automaticRowGapM: rowGap
            });
        }
    }

    return result();
}

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
    DEFAULT_PLANARITY_TOLERANCE_M,
    degToRad,
    radToDeg,
    globalToLocal,
    localToGlobal,
    projectPointOntoRoofPlane,
    calculateRoofPlane,
    getRoofHeight,
    checkRoofPlanarity,
    calculateRoofTilt,
    calculateRoofBasis,
    calculateLayoutBasis,
    calculateProjectedModuleDimensions,
    calculateMinimumRowGap,
    createModuleCorners,
    createModuleLayout,
    classifyRoofDirections,
    vectorAzimuthDeg
};
