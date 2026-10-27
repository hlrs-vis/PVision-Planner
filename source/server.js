// =========================================================
// SERVER / ANWENDUNGSLOGIK
// =========================================================
const { startHttpServer } = require("./httpServer");
const { CoviseConnection } = require("./coviseConnection");

const { PNG } = require("pngjs");

const {
    MSG_GetHeight,
    MSG_SetModules,
    COVISE_MAPLINK_MESSAGE_TYPE,
    MSG_DeleteModuleRequest,
    MSG_GetMap,
    createGetHeightMessage,
    createSetModulesMessage,
    createDeleteModulesMessage,
    createClearAllModulesMessage,
    parseMapLinkPayload,
    createGetMapMessage
} = require("./coviseProtocol");

const {
    globalToLocal,
    calculateRoofPlane,
    checkRoofPlanarity,
    calculateRoofTilt,
    projectPointOntoRoofPlane,
    createModuleLayout
} = require("./roofGeometry");

const {
    webMercatorPointsToLonLat,
    modulesToWebMercator
} = require("./coordinateTransform");

// =========================================================
// KONFIGURATION
// =========================================================

//const COVISE_HOST = "visent.hlrs.de";
const COVISE_HOST = "127.0.0.1";
const COVISE_PORT = 31822;
const COVISE_RECONNECT_MS = 2000;

const HTTP_PORT = 8080;

const FLAT_ROOF_LIMIT_DEG = 5;
const ROOF_PLANARITY_TOLERANCE_M = 0.05;
const DESIGN_SUN_ELEVATION_DEG = 18;

const MODULE_TYPES = {
    compact: {
        width: 1.134,
        length: 1.760
    },
    large: {
        width: 1.134,
        length: 2.384
    }
};

const VALID_MOUNTING_DIRECTIONS = new Set([
    "positive-v",
    "positive-u",
    "negative-v",
    "negative-u"
]);

// =========================================================
// INTEGRATIONSTEST
// =========================================================

const RUN_INTEGRATION_TEST = false;
const INTEGRATION_TEST_MAX_MODULES = 2;

const TEST_ROOF_POINTS = [
    { longitude: 9.0969711933, latitude: 48.7397802649 },
    { longitude: 9.0970290891, latitude: 48.7397789019 },
    { longitude: 9.0970271319, latitude: 48.7397427459 },
    { longitude: 9.0969692361, latitude: 48.7397441090 }
];

// =========================================================
// ZUSTAND
// =========================================================

let nextModuleId = 1001;
let pendingGetHeightRequest = null;
let pendingGetMapRequest = null;
let integrationTestStarted = false;

const roofDrafts = new Map();
let nextRoofDraftId = 1;

// =========================================================
// BROWSER-EVENTS
// =========================================================

// Modul-IDs, die im 3D gelöscht wurden und
// noch an den Browser gemeldet werden müssen.
const pendingDeletedModuleIds = [];

// =========================================================
// COVISE-VERBINDUNG
// =========================================================

const covise = new CoviseConnection({
    host: COVISE_HOST,
    port: COVISE_PORT,
    reconnectMs: COVISE_RECONNECT_MS
});

// =========================================================
// HILFSFUNKTIONEN
// =========================================================

function createLocalRoofPoints(roofPoints, heights) {
    if (!Array.isArray(roofPoints) || !Array.isArray(heights)) {
        throw new Error(
            "Ungültige Dachpunkte oder Höhenwerte."
        );
    }

    if (roofPoints.length !== heights.length) {
        throw new Error(
            "Anzahl der Dachpunkte stimmt nicht mit Anzahl der Höhenwerte überein."
        );
    }

    const origin = roofPoints[0];

    return roofPoints.map((point, index) => ({
        longitude: point.longitude,
        latitude: point.latitude,
        height: heights[index],
        local: globalToLocal(point, origin)
    }));
}

function determineRoofType(roofTiltDeg) {
    return roofTiltDeg > FLAT_ROOF_LIMIT_DEG
        ? "pitched"
        : "flat";
}


function validateRoofPlanarity(roofPointsLocal, roofPlane) {
    const planarity = checkRoofPlanarity(
        roofPointsLocal,
        roofPlane,
        ROOF_PLANARITY_TOLERANCE_M
    );

    console.log(
        "Maximale Ebenheitsabweichung:",
        planarity.maxDeviation.toFixed(4),
        "m"
    );

    if (!planarity.isPlanar) {
        throw new Error(
            "Die ausgewählte Dachfläche ist nicht ausreichend eben. " +
            `Maximale Abweichung: ${
                planarity.maxDeviation.toFixed(3)
            } m`
        );
    }

    return planarity;
}

function calculateModulesForDraft(
    draft,
    settings,
    maxModules = Infinity
) {
    if (!settings) {
        throw new Error(
            "Moduleinstellungen fehlen."
        );
    }

    const moduleType =
        MODULE_TYPES[settings.moduleType];

    if (!moduleType) {
        throw new Error(
            `Unbekannter Modultyp: ${settings.moduleType}`
        );
    }

    let moduleWidth =
        moduleType.width;

    let moduleLength =
        moduleType.length;

    if (settings.orientation === "landscape") {
        [
            moduleWidth,
            moduleLength
        ] = [
            moduleLength,
            moduleWidth
        ];
    }

    const userTiltDeg =
        Number.isFinite(Number(settings.tiltDeg))
            ? Number(settings.tiltDeg)
            : 0;

    if (
        userTiltDeg < 0 ||
        userTiltDeg > 45
    ) {
        throw new Error(
            "Der Aufstellwinkel muss zwischen 0° und 45° liegen."
        );
    }

    const additionalTiltDeg =
        draft.roofType === "flat"
            ? userTiltDeg
            : 0;

    const projectionTiltDeg =
        draft.roofType === "flat"
            ? additionalTiltDeg
            : draft.roofTiltDeg;

    const roofMargin =
        Number.isFinite(Number(settings.edgeDistance))
            ? Number(settings.edgeDistance)
            : 0;

    
    // =========================================================
    // AUFSTÄNDERUNGSART BESTIMMEN
    // =========================================================

    const mountingType =
        draft.roofType === "flat"
            ? (settings.mountingType ?? "south")
            : "south";

    if (
        mountingType !== "south" &&
        mountingType !== "east_west"
    ) {
        throw new Error(
            `Ungültige Aufständerungsart: ${mountingType}`
        );
    }

    // Die konkrete geometrische Richtung wird automatisch aus den Dachkanten bestimmt. Die Benutzerauswahl gibt nur noch die Art der Aufständerung vor.

    return createModuleLayout(
        draft.layoutPointsLocal,
        draft.roofPlane,
        {
            moduleLength,
            moduleWidth,
            roofMargin,
            projectionTiltDeg,
            additionalTiltDeg,

            mountingType,

            designSunElevationDeg:
                DESIGN_SUN_ELEVATION_DEG,

            maxModules
        }
    );
}

// =========================================================
// HÖHENABFRAGE
// =========================================================

function requestHeights(points) {
    if (pendingGetHeightRequest) {
        return Promise.reject(
            new Error(
                "Es läuft bereits eine Höhenabfrage."
            )
        );
    }

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            if (!pendingGetHeightRequest) {
                return;
            }

            pendingGetHeightRequest = null;

            reject(
                new Error(
                    "Zeitüberschreitung bei der Höhenabfrage."
                )
            );
        }, 10000);

        pendingGetHeightRequest = {
            points,
            resolve,
            reject,
            timeout
        };

        try {
            sendGetHeight(points);
        } catch (error) {
            clearTimeout(timeout);
            pendingGetHeightRequest = null;
            reject(error);
        }
    });
}

function handleGetHeightResponse(heights) {
    if (!pendingGetHeightRequest) {
        console.warn(
            "Höhenantwort erhalten, aber keine Anfrage ist offen."
        );
        return;
    }

    const request =
        pendingGetHeightRequest;

    pendingGetHeightRequest = null;

    clearTimeout(request.timeout);

    if (!Array.isArray(heights)) {
        request.reject(
            new Error(
                "Ungültige Höhenantwort."
            )
        );
        return;
    }

    if (heights.length !== request.points.length) {
        request.reject(
            new Error(
                "Anzahl der empfangenen Höhenwerte stimmt nicht mit der Anfrage überein."
            )
        );
        return;
    }

    if (!heights.every(Number.isFinite)) {
        request.reject(
            new Error(
                "Höhenantwort enthält ungültige Werte."
            )
        );
        return;
    }

    request.resolve(heights);
}


// =========================================================
// SNAPSHOT AUS OPENCOVER
// =========================================================

function rgbaToPng(imageData, width, height) {
    const png = new PNG({
        width,
        height
    });

    const rowBytes = width * 4;

    // OpenGL liefert das Bild normalerweise
    // von unten nach oben. PNG benötigt
    // die oberste Bildzeile zuerst.
    for (let row = 0; row < height; row++) {
        const sourceOffset =
            (height - 1 - row) * rowBytes;

        const targetOffset =
            row * rowBytes;

        imageData.copy(
            png.data,
            targetOffset,
            sourceOffset,
            sourceOffset + rowBytes
        );
    }

    return PNG.sync.write(png);
}


function requestMapSnapshot({
    x,
    y,
    width,
    height
}) {
    if (pendingGetMapRequest) {
        return Promise.reject(
            new Error(
                "Es läuft bereits eine Snapshot-Anfrage."
            )
        );
    }

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            pendingGetMapRequest = null;

            reject(new Error(
                "Keine Snapshot-Antwort von OpenCOVER erhalten."
            ));
        }, 15000);

        pendingGetMapRequest = {
            resolve,
            reject,
            timeout
        };

        try {
            covise.send(
                createGetMapMessage({
                    x,
                    y,
                    width,
                    height,
                    xRes: 1024,
                    yRes: 768
                })
            );
        } catch (error) {
            clearTimeout(timeout);
            pendingGetMapRequest = null;
            reject(error);
        }
    });
}


function handleGetMapResponse(response) {
    if (!pendingGetMapRequest) {
        console.warn(
            "Snapshot empfangen, aber keine Anfrage offen."
        );
        return;
    }

    const request = pendingGetMapRequest;

    pendingGetMapRequest = null;
    clearTimeout(request.timeout);

    try {
        const pngBuffer = rgbaToPng(
            response.imageData,
            response.xRes,
            response.yRes
        );

        console.log(
            "Snapshot-PNG erstellt:",
            pngBuffer.length,
            "Bytes"
        );

        request.resolve(pngBuffer);
    } catch (error) {
        request.reject(error);
    }
}


// Für den HTTP-Server
async function onGetMap(body) {
    const { x, y, width, height } = body;

    if (
        ![x, y, width, height].every(Number.isFinite) ||
        width <= 0 ||
        height <= 0
    ) {
        throw new Error(
            "Ungültiger Snapshot-Ausschnitt."
        );
    }

    return requestMapSnapshot({
        x,
        y,
        width,
        height
    });
}


// =========================================================
// HTTP: NEUE DACHFLÄCHE
// =========================================================

async function onSetRoof(body) {
    const { points, settings } = body;

    if (
        !Array.isArray(points) ||
        points.length !== 4
    ) {
        throw new Error(
            "Für eine Dachfläche werden genau vier Punkte benötigt."
        );
    }

    if (!settings) {
        throw new Error(
            "Moduleinstellungen fehlen."
        );
    }

    const roofPoints =
        webMercatorPointsToLonLat(points);

    const heights = await requestHeights(roofPoints);

    if (
        !Array.isArray(heights) ||
        heights.length !== roofPoints.length ||
        heights.some(height => !Number.isFinite(height))
    ) {
        const error = new Error(
            "Für den ausgewählten Bereich sind keine vollständigen 3D-Modelldaten vorhanden. Die Dachhöhe konnte nicht für alle Eckpunkte ermittelt werden. Bitte wählen Sie einen anderen Bereich aus."
        );
        error.code = "ROOF_HEIGHT_NOT_FOUND";
        throw error;
    }

    const roofPointsLocal = createLocalRoofPoints(roofPoints, heights);

    const planePointsLocal =
    roofPointsLocal.slice(0, 3);

    const roofPlane =
        calculateRoofPlane(
            planePointsLocal
        );

    const planarity =
        validateRoofPlanarity(
            roofPointsLocal,
            roofPlane
        );

    const projectedFourthPoint =
        projectPointOntoRoofPlane(
            roofPointsLocal[3],
            roofPlane
        );

    const layoutPointsLocal = [
        roofPointsLocal[0],
        roofPointsLocal[1],
        roofPointsLocal[2],
        projectedFourthPoint
    ];

    const roofTiltDeg =
        calculateRoofTilt(
            roofPlane
        );

    const roofType =
        determineRoofType(
            roofTiltDeg
        );

    const draftId =
        nextRoofDraftId++;

    const draft = {
        id: draftId,
        roofPoints,
        roofPointsLocal,
        planePointsLocal,
        layoutPointsLocal,
        heights,
        roofPlane,
        planarity,
        roofTiltDeg,
        roofType,
        settings,
        modules: []
    };

    const layout =
        calculateModulesForDraft(
            draft,
            settings
        );

    draft.modules =
        layout.modules;

    roofDrafts.set(
        draftId,
        draft
    );

    const moduleTiltDeg =
        roofType === "flat"
            ? Number(settings.tiltDeg) || 0
            : 0;

    const projectionTiltDeg =
        roofType === "flat"
            ? moduleTiltDeg
            : roofTiltDeg;

    return {
        draftId,
        roofType,
        roofTiltDeg,
        moduleTiltDeg,
        projectionTiltDeg,
        rowGap: layout.rowGap,
        designSunElevationDeg:
            DESIGN_SUN_ELEVATION_DEG,
        moduleCount:
            layout.modules.length,
        
        modules: modulesToWebMercator(
            layout.modules
        ).map((module, index) => ({
            ...module,

            mountingType:
                layout.modules[index].mountingType,

            orientationCategory:
                layout.modules[index].orientationCategory,

            moduleAzimuthDeg:
                layout.modules[index].moduleAzimuthDeg,

            roofReferenceAzimuthDeg:
                layout.modules[index].roofReferenceAzimuthDeg,

            rowIndex:
                layout.modules[index].rowIndex,

            rowPairId:
                layout.modules[index].rowPairId,

            automaticRowGapM:
                layout.modules[index].automaticRowGapM
        }))

    };
}

// =========================================================
// HTTP: DRAFT AKTUALISIEREN
// =========================================================

async function onUpdateRoofDraft(body) {
    const { draftId, settings } = body;

    if (!Number.isInteger(draftId)) {
        throw new Error(
            "Ungültige Draft-ID."
        );
    }

    if (!settings) {
        throw new Error(
            "Moduleinstellungen fehlen."
        );
    }

    const draft =
        roofDrafts.get(draftId);

    if (!draft) {
        throw new Error(
            `Dach-Draft ${draftId} wurde nicht gefunden.`
        );
    }

    const layout =
        calculateModulesForDraft(
            draft,
            settings
        );

    draft.settings = settings;
    draft.modules = layout.modules;

    const moduleTiltDeg =
        draft.roofType === "flat"
            ? Number(settings.tiltDeg) || 0
            : 0;

    const projectionTiltDeg =
        draft.roofType === "flat"
            ? moduleTiltDeg
            : draft.roofTiltDeg;

    return {
        draftId,
        roofType:
            draft.roofType,
        roofTiltDeg:
            draft.roofTiltDeg,
        moduleTiltDeg,
        projectionTiltDeg,
        rowGap:
            layout.rowGap,
        designSunElevationDeg:
            DESIGN_SUN_ELEVATION_DEG,
        moduleCount:
            layout.modules.length,

        modules: modulesToWebMercator(
            layout.modules
        ).map((module, index) => ({
            ...module,

            mountingType:
                layout.modules[index].mountingType,

            orientationCategory:
                layout.modules[index].orientationCategory,

            moduleAzimuthDeg:
                layout.modules[index].moduleAzimuthDeg,

            roofReferenceAzimuthDeg:
                layout.modules[index].roofReferenceAzimuthDeg,

            rowIndex:
                layout.modules[index].rowIndex,

            rowPairId:
                layout.modules[index].rowPairId,

            automaticRowGapM:
                layout.modules[index].automaticRowGapM
        }))

    };
}

// =========================================================
// HTTP: DACH FINALISIEREN
// =========================================================

async function onFinishRoof(body) {
    const { draftId } = body;

    if (!Number.isInteger(draftId)) {
        throw new Error(
            "Ungültige Draft-ID."
        );
    }

    const draft =
        roofDrafts.get(draftId);

    if (!draft) {
        throw new Error(
            `Dach-Draft ${draftId} wurde nicht gefunden.`
        );
    }

    if (
        !Array.isArray(draft.modules) ||
        draft.modules.length === 0
    ) {
        throw new Error(
            "Der Dach-Draft enthält keine Module."
        );
    }

    const modules = draft.modules.map(module => ({
        ...module,

        id: nextModuleId++
    }));



    sendSetModules(modules);

    roofDrafts.delete(draftId);

    
    return {
        success: true,

        moduleCount: modules.length,

        moduleIds: modules.map(module => module.id),

        modules: modules.map(module => ({
            ...module,

            moduleId: module.id
        }))
    };

}

// =========================================================
// HTTP: DRAFT ABBRECHEN
// =========================================================

async function onCancelRoof(body) {
    const { draftId } = body;

    if (!Number.isInteger(draftId)) {
        throw new Error(
            "Ungültige Draft-ID."
        );
    }

    const removed =
        roofDrafts.delete(draftId);

    return {
        success: true,
        removed
    };
}

// =========================================================
// HTTP: PROJEKT LADEN
// =========================================================

async function onLoadProject(body) {
    const { modules } = body;

    if (!Array.isArray(modules)) {
        throw new Error(
            "Ungültige Projektdatei: Module fehlen."
        );
    }

    if (modules.length === 0) {
        nextModuleId = 1001;
        nextRoofDraftId = 1;

        return {
            success: true,
            moduleCount: 0,
            nextModuleId
        };
    }

    const moduleIds = modules.map(
        module => module.moduleId
    );

    if (!moduleIds.every(Number.isInteger)) {
        throw new Error(
            "Ungültige Projektdatei: Modul-IDs fehlen oder sind ungültig."
        );
    }

    if (new Set(moduleIds).size !== moduleIds.length) {
        throw new Error(
            "Ungültige Projektdatei: Modul-IDs sind nicht eindeutig."
        );
    }

    const coviseModules = modules.map(module => {
        if (
            !Array.isArray(module.corners) ||
            module.corners.length !== 4
        ) {
            throw new Error(
                `Modul ${module.moduleId} besitzt keine gültigen Eckpunkte.`
            );
        }

        return {
            id: module.moduleId,
            corners: module.corners
        };
    });

    const areaIds = modules.map(module => module.areaId).filter(Number.isInteger);

    if (areaIds.length > 0) {
        nextRoofDraftId =
            Math.max(...areaIds) + 1;
    }

    // COVISE zunächst auf einen definierten Zustand setzen.
    sendClearAllModules();

    // Danach geladenen Zustand wiederherstellen.
    sendSetModules(coviseModules);

    // Neue IDs immer oberhalb der größten geladenen ID vergeben.
    nextModuleId =
        Math.max(...moduleIds) + 1;

    return {
        success: true,
        moduleCount: modules.length,
        nextModuleId
    };
}


// =========================================================
// HTTP: MODULE LÖSCHEN
// =========================================================

function deleteModules(moduleIds) {
    if (
        !Array.isArray(moduleIds) ||
        moduleIds.length === 0
    ) {
        throw new Error(
            "Keine Modul-IDs zum Löschen angegeben."
        );
    }

    if (!moduleIds.every(Number.isInteger)) {
        throw new Error(
            "Ungültige Modul-ID."
        );
    }

    sendDeleteModules(moduleIds);

    return moduleIds;
}

async function onGetBrowserEvents() {
    const deletedModuleIds =
        pendingDeletedModuleIds.splice(
            0,
            pendingDeletedModuleIds.length
        );

    return {
        deletedModuleIds
    };
}

async function onDeleteModules(body) {
    const deletedModuleIds =
        deleteModules(body.moduleIds);

    return {
        deletedModuleIds
    };
}

// =========================================================
// HTTP: ALLE MODULE LÖSCHEN
// =========================================================

async function onClearModules() {
    sendClearAllModules();

    return {
        cleared: true
    };
}

// =========================================================
// COVISE-NACHRICHTEN SENDEN
// =========================================================

function sendGetHeight(points) {
    covise.send(
        createGetHeightMessage(points)
    );
}

function sendSetModules(modules) {
    covise.send(
        createSetModulesMessage(modules)
    );
}

function sendDeleteModules(moduleIds) {
    covise.send(
        createDeleteModulesMessage(
            moduleIds
        )
    );
}

function sendClearAllModules() {
    covise.send(
        createClearAllModulesMessage()
    );
}

// =========================================================
// COVISE-ANTWORTEN
// =========================================================

covise.on("message", message => {
    if (
        message.msgType !==
        COVISE_MAPLINK_MESSAGE_TYPE
    ) {
        return;
    }

    try {
        const response =
            parseMapLinkPayload(
                message.payload
            );

        switch (response.command) {
            case MSG_GetMap:
                console.log(
                    "Snapshot von OpenCOVER empfangen:",
                    response.xRes,
                    "x",
                    response.yRes
                );

                handleGetMapResponse(response);
                break;

            case MSG_GetHeight:
                console.log(
                    "Höhenwerte empfangen:",
                    response.heights
                );

                handleGetHeightResponse(
                    response.heights
                );
                break;

            case MSG_SetModules:
                console.log(
                    `MSG_SetModules bestätigt: ${response.numModules} Module verarbeitet`
                );
                break;

            case MSG_DeleteModuleRequest:
                console.log(
                    `3D-Loeschanforderung empfangen fuer Modul ${response.moduleId}`
                );

                deleteModules([
                    response.moduleId
                ]);

                // Löschung für den Browser vormerken.
                if (
                    !pendingDeletedModuleIds.includes(
                        response.moduleId
                    )
                ) {
                    pendingDeletedModuleIds.push(
                        response.moduleId
                    );
                }

                console.log(
                    "Für Browser vorgemerkte Löschungen:",
                    pendingDeletedModuleIds
                );

                break;

            default:
                console.log(
                    "MapLink-Antwort:",
                    response
                );
        }
    } catch (error) {
        console.error(
            "Fehler beim Auswerten der MapLink-Antwort:",
            error.message
        );
    }
});

covise.on("connectionError", error => {
    console.error(
        "COVISE-Verbindungsfehler:",
        error.message
    );
});

covise.on("close", () => {
    console.log(
        "Warte auf erneute COVISE-Verbindung..."
    );

    if (pendingGetMapRequest) {
    clearTimeout(pendingGetMapRequest.timeout);

    pendingGetMapRequest.reject(
        new Error("COVISE-Verbindung unterbrochen.")
    );

    pendingGetMapRequest = null;
}
});

// =========================================================
// INTEGRATIONSTEST
// =========================================================

covise.on("ready", async () => {
    if (
        !RUN_INTEGRATION_TEST ||
        integrationTestStarted
    ) {
        return;
    }

    integrationTestStarted = true;

    try {
        console.log(
            "Starte Integrationstest..."
        );

        const heights =
            await requestHeights(
                TEST_ROOF_POINTS
            );

        const roofPointsLocal =
            createLocalRoofPoints(
                TEST_ROOF_POINTS,
                heights
            );

        const roofPlane =
            calculateRoofPlane(
                roofPointsLocal
            );

        const planarity =
            validateRoofPlanarity(
                roofPointsLocal,
                roofPlane
            );

        const projectedFourthPoint =
            projectPointOntoRoofPlane(
                roofPointsLocal[3],
                roofPlane
            );

        const layoutPointsLocal = [
            roofPointsLocal[0],
            roofPointsLocal[1],
            roofPointsLocal[2],
            projectedFourthPoint
        ];


        const roofTiltDeg =
            calculateRoofTilt(
                roofPlane
            );

        const roofType =
            determineRoofType(
                roofTiltDeg
            );

        const testDraft = {
            roofPoints:
                TEST_ROOF_POINTS,
            roofPointsLocal,
            heights,
            roofPlane,
            roofTiltDeg,
            roofType
        };

        const testSettings = {
            moduleType:
                "compact",
            orientation:
                "portrait",
            mountingDirection:
                "positive-v",
            tiltDeg:
                20,
            edgeDistance:
                0.50
        };

        const layout =
            calculateModulesForDraft(
                testDraft,
                testSettings,
                INTEGRATION_TEST_MAX_MODULES
            );

        const modules =
            layout.modules.map(module => ({
                id: nextModuleId++,
                corners: module.corners
            }));

        sendSetModules(modules);

        setTimeout(() => {
            sendDeleteModules(
                modules.map(
                    module => module.id
                )
            );
        }, 3000);

        setTimeout(() => {
            sendClearAllModules();
        }, 6000);
    } catch (error) {
        console.error(
            "Integrationstest fehlgeschlagen:",
            error.message
        );
    }
});

// =========================================================
// HTTP-SERVER STARTEN
// =========================================================

startHttpServer({
    port: HTTP_PORT,
    onSetRoof,
    onUpdateRoofDraft,
    onFinishRoof,
    onCancelRoof,
    onDeleteModules,
    onClearModules,
    onLoadProject,
    onGetBrowserEvents,
    onGetMap
});

// =========================================================
// COVISE STARTEN
// =========================================================

covise.connect();