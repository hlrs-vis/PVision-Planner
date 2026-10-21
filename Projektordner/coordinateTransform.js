// =========================================================
// KOORDINATENTRANSFORMATION
// =========================================================
//
// Umrechnung:
// EPSG:3857 <-> EPSG:4326
//
// OpenLayers arbeitet standardmäßig mit EPSG:3857.
// Das MapLink-Plugin erwartet Longitude/Latitude in EPSG:4326.
// =========================================================

const EARTH_RADIUS_M = 6378137.0;

// =========================================================
// EPSG:3857 -> EPSG:4326
// =========================================================

function webMercatorToLonLat(x, y) {
    const longitude = (x / EARTH_RADIUS_M) * (180 / Math.PI);

    const latitude =
        (2 * Math.atan(Math.exp(y / EARTH_RADIUS_M)) - Math.PI / 2) *
        (180 / Math.PI);

    return {
        longitude,
        latitude
    };
}

// =========================================================
// EPSG:4326 -> EPSG:3857
// =========================================================

function lonLatToWebMercator(longitude, latitude) {
    const lonRad = longitude * Math.PI / 180;
    const latRad = latitude * Math.PI / 180;

    const x = EARTH_RADIUS_M * lonRad;

    const y =
        EARTH_RADIUS_M *
        Math.log(
            Math.tan(Math.PI / 4 + latRad / 2)
        );

    return {
        x,
        y
    };
}

// =========================================================
// MEHRERE PUNKTE UMWANDELN
// =========================================================

function webMercatorPointsToLonLat(points) {
    return points.map(point =>
        webMercatorToLonLat(
            point.x,
            point.y
        )
    );
}

function lonLatPointsToWebMercator(points) {
    return points.map(point =>
        lonLatToWebMercator(
            point.longitude,
            point.latitude
        )
    );
}

// =========================================================
// MODULE FÜR BROWSER-VORSCHAU
// =========================================================

function modulesToWebMercator(modules) {
    if (!Array.isArray(modules)) {
        throw new Error(
            "Ungültige Modulliste für die Koordinatentransformation."
        );
    }

    return modules.map(module => ({
        ...module,
        corners: module.corners.map(corner => {
            const projected = lonLatToWebMercator(
                corner.longitude,
                corner.latitude
            );

            return {
                x: projected.x,
                y: projected.y,
                height: corner.height
            };
        })
    }));
}

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
    webMercatorToLonLat,
    lonLatToWebMercator,
    webMercatorPointsToLonLat,
    lonLatPointsToWebMercator,
    modulesToWebMercator
};