import 'ol/ol.css';

import Map from 'ol/Map.js';
import View from 'ol/View.js';
import Link from 'ol/interaction/Link.js';
import Select from 'ol/interaction/Select.js';

import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import ImageLayer from 'ol/layer/Image.js';
import ImageStatic from 'ol/source/ImageStatic.js';

import OSM from 'ol/source/OSM.js';
import VectorSource from 'ol/source/Vector.js';

import Feature from 'ol/Feature.js';
import Polygon from 'ol/geom/Polygon.js';
import LineString from 'ol/geom/LineString.js';
import Point from 'ol/geom/Point.js';

import {
    Fill,
    Stroke,
    Style,
    Text
} from 'ol/style.js';

import { fromLonLat } from 'ol/proj.js';

// =========================================================
// KONFIGURATION
// =========================================================

const SERVER_URL = 'http://localhost:8080';
//const SERVER_URL = "visent.hlrs.de";
const MIN_DRAW_ZOOM = 18;
const MIN_MODULE_ZOOM = 16;

// =========================================================
// DOM
// =========================================================

const placeButton = document.getElementById('place-module');
const deleteButton = document.getElementById('delete-selected');
const clearButton = document.getElementById('clear');
const downloadLink = document.getElementById('download');

const editor = document.getElementById('area-editor');
const finishButton = document.getElementById('finish-area');
const cancelButton = document.getElementById('cancel-area');

const moduleTypeInput = document.getElementById('module-type');
const orientationInput = document.getElementById('module-orientation');
const moduleTiltInput = document.getElementById('module-tilt');
const edgeDistanceInput = document.getElementById('edge-distance');

const roofStatusOutput = document.getElementById('roof-status');
const tiltInfoOutput = document.getElementById('tilt-info');

const mountingDirectionSection =
    document.getElementById('mounting-direction-section');

const mountingDirectionOutput =
    document.getElementById('mounting-direction-value');

const rowGapSection =
    document.getElementById('row-gap-section');

const rowGapOutput =
    document.getElementById('row-gap-value');

const loadProjectInput =
    document.getElementById('load-project');

// =========================================================
// STYLES
// =========================================================

const moduleStyle = new Style({
    fill: new Fill({
        color: 'rgba(30, 110, 190, 0.65)'
    }),
    stroke: new Stroke({
        color: '#0b3d6e',
        width: 1
    })
});

const previewModuleStyle = new Style({
    fill: new Fill({
        color: 'rgba(30, 110, 190, 0.35)'
    }),
    stroke: new Stroke({
        color: '#1e6ebe',
        width: 1
    })
});

const areaStyle = new Style({
    fill: new Fill({
        color: 'rgba(255, 255, 255, 0.05)'
    }),
    stroke: new Stroke({
        color: '#ffffff',
        width: 2
    })
});

const edgePreviewStyle = new Style({
    stroke: new Stroke({
        color: '#ffffff',
        width: 2
    })
});

const selectionStyle = new Style({
    fill: new Fill({
        color: 'rgba(255, 255, 255, 0.15)'
    }),
    stroke: new Stroke({
        color: '#ffffff',
        width: 2
    })
});

// =========================================================
// SOURCES UND LAYER
// =========================================================

const MIN_SNAPSHOT_ZOOM = 19;

const snapshotLayer = new ImageLayer({
    visible: false,
    opacity: 1,
    zIndex: 1
});


const drawingSource = new VectorSource();
const moduleAreaSource = new VectorSource();
const previewSource = new VectorSource();
const selectionBoxSource = new VectorSource();

const drawingLayer = new VectorLayer({
    source: drawingSource,
    style: moduleStyle,
    minZoom: MIN_MODULE_ZOOM
});

const moduleAreaLayer = new VectorLayer({
    source: moduleAreaSource,
    style: areaStyle
});

const previewLayer = new VectorLayer({
    source: previewSource
});

const selectionBoxLayer = new VectorLayer({
    source: selectionBoxSource,
    style: selectionStyle
});

// =========================================================
// KARTE
// =========================================================

const map = new Map({
    target: 'map-container',
    
    layers: [
        new TileLayer({
            source: new OSM()
        }),

        // Detaillierte OpenCOVER-Draufsicht
        snapshotLayer,

        // Bestehende PV-Ebenen
        moduleAreaLayer,
        drawingLayer,
        previewLayer,
        selectionBoxLayer
    ],

    view: new View({
        center: fromLonLat([
            9.18,
            48.78
        ]),
        zoom: 13
    })
});

map.addInteraction(
    new Link()
);

// =========================================================
// AUSWAHL
// =========================================================

const selectInteraction = new Select({
    layers: [
        drawingLayer
    ],
    condition: () => false
});

map.addInteraction(
    selectInteraction
);

// =========================================================
// ZUSTAND
// =========================================================

let isDrawingArea = false;
let isEditingArea = false;

let areaDrawStep = 'idle';
let firstAreaPoint = null;
let secondAreaPoint = null;
let currentAreaDepth = 0;
let currentAreaFeature = null;

let selectionDrawStep = 'idle';
let selectionStartCoordinate = null;
let selectionEndCoordinate = null;
let currentSelectionDepth = 0;

let roofType = null;
let roofTiltDeg = null;
let moduleTiltDeg = 0;

let mountingType = 'south';
let automaticRowGapM = 0;

let currentRoofDraftId = null;
let currentPreviewModules = [];

let previewUpdateTimer = null;
let previewUpdateChain =
    Promise.resolve();

// =========================================================
// HILFSFUNKTIONEN
// =========================================================

function hasDraftId(value) {
    return (
        typeof value === 'string' ||
        Number.isInteger(value)
    );
}

function isDrawingZoomAllowed() {
    return (
        map.getView().getZoom() >=
        MIN_DRAW_ZOOM
    );
}

function createOrientedRectangleFeature(
    start,
    end,
    depth
) {
    if (!start || !end) {
        return null;
    }

    const dx =
        end[0] - start[0];

    const dy =
        end[1] - start[1];

    const length =
        Math.hypot(dx, dy);

    if (
        length === 0 ||
        Math.abs(depth) < 0.000001
    ) {
        return null;
    }

    const normalX =
        -dy / length;

    const normalY =
        dx / length;

    const p1 = [...start];
    const p2 = [...end];

    const p3 = [
        end[0] + normalX * depth,
        end[1] + normalY * depth
    ];

    const p4 = [
        start[0] + normalX * depth,
        start[1] + normalY * depth
    ];

    return new Feature({
        geometry:
            new Polygon([
                [
                    p1,
                    p2,
                    p3,
                    p4,
                    p1
                ]
            ])
    });
}

function createEdgePreviewFeature(
    start,
    end
) {
    if (!start || !end) {
        return null;
    }

    const dx =
        end[0] - start[0];

    const dy =
        end[1] - start[1];

    if (
        Math.hypot(dx, dy) === 0
    ) {
        return null;
    }

    const feature =
        new Feature({
            geometry:
                new LineString([
                    [...start],
                    [...end]
                ])
        });

    feature.setStyle(
        edgePreviewStyle
    );

    return feature;
}

function calculateDepthFromPoint(
    start,
    end,
    point
) {
    const dx =
        end[0] - start[0];

    const dy =
        end[1] - start[1];

    const length =
        Math.hypot(dx, dy);

    if (length === 0) {
        return 0;
    }

    const normalX =
        -dy / length;

    const normalY =
        dx / length;

    return (
        (point[0] - start[0]) *
            normalX +
        (point[1] - start[1]) *
            normalY
    );
}

function getCurrentAreaCorners() {
    if (!currentAreaFeature) {
        return null;
    }

    const geometry =
        currentAreaFeature.getGeometry();

    if (!(geometry instanceof Polygon)) {
        return null;
    }

    const coordinates =
        geometry
            .getCoordinates()[0];

    if (coordinates.length < 4) {
        return null;
    }

    return coordinates
        .slice(0, 4)
        .map(coordinate => ({
            x: coordinate[0],
            y: coordinate[1]
        }));
}


// =========================================================
// AUTOMATISCHE AUSRICHTUNG DER MODULAUFSTÄNDERUNG
// =========================================================

function normalizeAzimuth(deg) {
    return (deg + 360) % 360;
}

function calculateVectorAzimuth(vector) {
    return normalizeAzimuth(
        Math.atan2(vector[0], vector[1]) *
        180 / Math.PI
    );
}

function calculateAngularDifference(a, b) {
    return Math.abs(
        ((a - b + 540) % 360) - 180
    );
}

function getRoofOrientationData() {
    if (!currentAreaFeature) {
        return null;
    }

    const coordinates = currentAreaFeature
        .getGeometry()
        .getCoordinates()[0];

    const p0 = coordinates[0];
    const p1 = coordinates[1];
    const p3 = coordinates[3];

    const u = [
        p1[0] - p0[0],
        p1[1] - p0[1]
    ];

    const v = [
        p3[0] - p0[0],
        p3[1] - p0[1]
    ];

    const directions = [
        { value: 'positive-v', vector: v },
        { value: 'positive-u', vector: u },
        { value: 'negative-v', vector: [-v[0], -v[1]] },
        { value: 'negative-u', vector: [-u[0], -u[1]] }
    ].map(item => ({
        ...item,
        azimuthDeg: calculateVectorAzimuth(item.vector)
    }));

    // Richtung mit der geringsten Abweichung zu 180°
    const south = directions.reduce((best, item) =>
        calculateAngularDifference(item.azimuthDeg, 180) <
        calculateAngularDifference(best.azimuthDeg, 180)
            ? item
            : best
    );

    // Nur die beiden zur Südrichtung orthogonalen
    // Dachkantenrichtungen kommen für Ost-West infrage.
    const eastCandidates = directions.filter(item =>
        Math.abs(
            calculateAngularDifference(
                item.azimuthDeg,
                south.azimuthDeg
            ) - 90
        ) < 1
    );

    const east = eastCandidates.reduce((best, item) =>
        calculateAngularDifference(item.azimuthDeg, 90) <
        calculateAngularDifference(best.azimuthDeg, 90)
            ? item
            : best
    );

    return {
        southDirection: south.value,
        southAzimuthDeg: south.azimuthDeg,
        southVector: south.vector,

        eastDirection: east.value,
        eastAzimuthDeg: east.azimuthDeg,
        eastVector: east.vector,

        westAzimuthDeg: normalizeAzimuth(
            east.azimuthDeg + 180
        )
    };
}


function getCurrentMountingDirection() {
    const orientation = getRoofOrientationData();

    if (!orientation) {
        return null;
    }

    if (mountingType === 'east_west') {
        return {
            value: orientation.eastDirection,
            azimuthDeg: orientation.eastAzimuthDeg,
            vector: orientation.eastVector
        };
    }

    return {
        value: orientation.southDirection,
        azimuthDeg: orientation.southAzimuthDeg,
        vector: orientation.southVector
    };
}


// =========================================================
// HTTP
// =========================================================

async function postJson(
    path,
    body = {}
) {
    const response =
        await fetch(
            `${SERVER_URL}${path}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type':
                        'application/json'
                },
                body:
                    JSON.stringify(body)
            }
        );

    let result;

    try {
        result =
            await response.json();
    } catch {
        throw new Error(
            `Ungültige Serverantwort von ${path}.`
        );
    }

    if (
        !response.ok ||
        result.success === false
    ) {
        throw new Error(
            result.error ||
            `HTTP-Fehler bei ${path}.`
        );
    }

    return result;
}

// =========================================================
// EINSTELLUNGEN
// =========================================================


function getCurrentModuleSettings() {
    const direction = getCurrentMountingDirection();

    return {
        moduleType: moduleTypeInput.value,

        orientation: orientationInput.value,

        mountingType: mountingType,

        mountingDirection: direction?.value ?? 'positive-v',

        tiltDeg:
            roofType === 'pitched'
                ? 0
                : moduleTiltDeg,

        edgeDistance: Number(
            edgeDistanceInput.value
        )
    };
}


function updateModuleTiltFromInput() {
    const value = Number(moduleTiltInput.value);

    if (!Number.isFinite(value)) {
        return;
    }

    const minTilt =
        mountingType === 'east_west' ? 1 : 0;

    moduleTiltDeg = Math.min(
        45,
        Math.max(minTilt, value)
    );

    moduleTiltInput.value = String(moduleTiltDeg);
}


function updateMountingDirectionUi() {
    const orientation = getRoofOrientationData();

    if (!orientation) {
        mountingDirectionOutput.textContent = '–';
        return;
    }

    const formatAngle = value =>
        `${Math.round(value)}°`;

    if (mountingType === 'south') {
        mountingDirectionOutput.textContent =
            `Süden – ${formatAngle(
                orientation.southAzimuthDeg
            )}`;
    } else {
        mountingDirectionOutput.textContent =
            `Ost-West – ${formatAngle(
                orientation.eastAzimuthDeg
            )} / ${formatAngle(
                orientation.westAzimuthDeg
            )}`;
    }
}

function updateRowGapUi() {
    rowGapOutput.textContent =
        `${automaticRowGapM.toFixed(2).replace('.', ',')} m`;
}

updateModuleTiltFromInput();
updateMountingDirectionUi();
updateRowGapUi();

// =========================================================
// DACHANALYSE
// =========================================================

function applyRoofAnalysis(
    newRoofType,
    newRoofTiltDeg
) {
    roofType = newRoofType;
    roofTiltDeg =
        Number(newRoofTiltDeg);

    if (!Number.isFinite(roofTiltDeg)) {
        roofTiltDeg = 0;
    }

    if (roofType === 'flat') {
        roofStatusOutput.textContent =
            `Flachdach erkannt – Dachneigung ${roofTiltDeg.toFixed(2)}°.`;

        tiltInfoOutput.textContent =
            'Der Aufstellwinkel kann bei dieser Flachdachfläche zwischen 0° und 45° verändert werden.';

        moduleTiltInput.disabled =
            false;

        mountingDirectionSection.hidden =
            false;

        rowGapSection.hidden =
            false;
    } else if (
        roofType === 'pitched'
    ) {
        roofStatusOutput.textContent =
            `Schrägdach erkannt – Dachneigung ${roofTiltDeg.toFixed(2)}°.`;

        tiltInfoOutput.textContent =
            'Bei einem Schrägdach werden die Module dachparallel gesetzt.';

        moduleTiltInput.disabled =
            true;

        moduleTiltDeg = 0;

        moduleTiltInput.value =
            '0';

        mountingDirectionSection.hidden =
            true;

        rowGapSection.hidden =
            true;
    } else {
        roofStatusOutput.textContent =
            'Dachtyp konnte nicht bestimmt werden.';

        tiltInfoOutput.textContent =
            '';

        moduleTiltInput.disabled =
            false;

        mountingDirectionSection.hidden =
            true;

        rowGapSection.hidden =
            true;
    }
}

function applyLayoutMetadata(result) {
    automaticRowGapM =
        Number.isFinite(
            Number(result.rowGap)
        )
            ? Number(result.rowGap)
            : 0;

    updateRowGapUi();
}

// =========================================================
// SERVER-MODULE ALS VORSCHAU
// =========================================================

function createPreviewModuleFeature(
    module,
    index
) {
    if (
        !module ||
        !Array.isArray(module.corners) ||
        module.corners.length !== 4
    ) {
        return null;
    }

    const coordinates =
        module.corners.map(
            corner => [
                corner.x,
                corner.y
            ]
        );

    coordinates.push([
        ...coordinates[0]
    ]);

    const feature =
        new Feature({
            geometry:
                new Polygon([
                    coordinates
                ])
        });

    feature.setProperties({
        objectType:
            'preview-module',
        previewIndex:
            index
    });

    feature.setStyle(
        previewModuleStyle
    );

    return feature;
}

// =========================================================
// AUFSTÄNDERUNGSPFEIL
// =========================================================


function createMountingDirectionControlFeature() {
    if (
        roofType !== 'flat' ||
        !currentAreaFeature
    ) {
        return null;
    }

    const coordinates = currentAreaFeature
        .getGeometry()
        .getCoordinates()[0];

    const center = [
        (
            coordinates[0][0] +
            coordinates[1][0] +
            coordinates[2][0] +
            coordinates[3][0]
        ) / 4,
        (
            coordinates[0][1] +
            coordinates[1][1] +
            coordinates[2][1] +
            coordinates[3][1]
        ) / 4
    ];

    const direction = getCurrentMountingDirection();

    if (!direction) {
        return null;
    }

    const vector = direction.vector;

    const angle = Math.atan2(
        vector[1],
        vector[0]
    );

    const isEastWest = mountingType === 'east_west';

    const feature = new Feature({
        geometry: new Point(center)
    });

    feature.setProperties({
        objectType: 'mounting-direction-control'
    });

    feature.setStyle(
        new Style({
            text: new Text({
                text: isEastWest ? '↔' : '➤',

                font: isEastWest
                    ? 'bold 44px sans-serif'
                    : 'bold 38px sans-serif',

                fill: new Fill({
                    color: '#ffffff'
                }),

                stroke: new Stroke({
                    color: '#111111',
                    width: 4
                }),

                rotation: -angle,

                rotateWithView: true
            })
        })
    );

    return feature;
}



function rotateMountingDirection() {
    if (
        !isEditingArea ||
        roofType !== 'flat'
    ) {
        return;
    }

    mountingType =
        mountingType === 'south'
            ? 'east_west'
            : 'south';

    // Ost-West benötigt einen Aufstellwinkel > 0°.
    if (
        mountingType === 'east_west' &&
        moduleTiltDeg === 0
    ) {
        moduleTiltDeg = 10;
        moduleTiltInput.value = '10';
    }

    updateMountingDirectionUi();
    updateAreaPreview();
    scheduleRoofDraftUpdate();
}


function handleMountingDirectionClick(pixel) {
    if (
        !isEditingArea ||
        roofType !== 'flat'
    ) {
        return false;
    }

    const feature =
        map.forEachFeatureAtPixel(
            pixel,
            candidate => {
                if (
                    candidate.get(
                        'objectType'
                    ) ===
                    'mounting-direction-control'
                ) {
                    return candidate;
                }

                return undefined;
            },
            {
                hitTolerance: 12,
                layerFilter:
                    layer =>
                        layer === previewLayer
            }
        );

    if (!feature) {
        return false;
    }

    rotateMountingDirection();

    return true;
}

// =========================================================
// VORSCHAU AKTUALISIEREN
// =========================================================

function updateAreaPreview() {
    previewSource.clear();

    if (currentAreaFeature) {
        const areaClone =
            currentAreaFeature.clone();

        areaClone.setStyle(
            areaStyle
        );

        areaClone.setProperties({
            objectType:
                'editing-area'
        });

        previewSource.addFeature(
            areaClone
        );
    }

    currentPreviewModules.forEach(
        (module, index) => {
            const feature =
                createPreviewModuleFeature(
                    module,
                    index
                );

            if (feature) {
                previewSource.addFeature(
                    feature
                );
            }
        }
    );

    const directionControl =
        createMountingDirectionControlFeature();

    if (directionControl) {
        previewSource.addFeature(
            directionControl
        );
    }
}

// =========================================================
// ERSTE DACHANALYSE
// =========================================================

async function requestRoofHeightAnalysis() {
    const points =
        getCurrentAreaCorners();

    if (!points) {
        throw new Error(
            'Keine gültige Dachfläche vorhanden.'
        );
    }

    const settings =
        getCurrentModuleSettings();

    finishButton.disabled =
        true;

    roofStatusOutput.textContent =
        'Dachfläche wird ausgewertet.';

    const result =
        await postJson(
            '/set-roof',
            {
                points,
                settings
            }
        );

    if (!isEditingArea) {
        if (
            hasDraftId(
                result.draftId
            )
        ) {
            await discardRoofDraft(
                result.draftId
            );
        }

        return;
    }

    currentRoofDraftId =
        result.draftId;

    currentPreviewModules =
        Array.isArray(result.modules)
            ? result.modules
            : [];

    applyRoofAnalysis(
        result.roofType,
        result.roofTiltDeg
    );
    updateMountingDirectionUi();

    applyLayoutMetadata(
        result
    );

    updateAreaPreview();

    finishButton.disabled =
        currentPreviewModules.length === 0;
}

// =========================================================
// DRAFT AKTUALISIEREN
// =========================================================

async function sendRoofDraftUpdate(
    draftId,
    settings
) {
    const result =
        await postJson(
            '/update-roof-draft',
            {
                draftId,
                settings
            }
        );

    if (
        !isEditingArea ||
        currentRoofDraftId !== draftId
    ) {
        return;
    }

    currentPreviewModules =
        Array.isArray(result.modules)
            ? result.modules
            : [];

    applyRoofAnalysis(
        result.roofType,
        result.roofTiltDeg
    );
    updateMountingDirectionUi();

    applyLayoutMetadata(
        result
    );

    updateAreaPreview();

    finishButton.disabled =
        currentPreviewModules.length === 0;
}

function queueRoofDraftUpdate() {
    if (
        !isEditingArea ||
        !hasDraftId(
            currentRoofDraftId
        )
    ) {
        return;
    }

    const draftId =
        currentRoofDraftId;

    const settings =
        getCurrentModuleSettings();

    previewUpdateChain =
        previewUpdateChain
            .then(() =>
                sendRoofDraftUpdate(
                    draftId,
                    settings
                )
            )
            .catch(error => {
                console.error(
                    'Fehler beim Aktualisieren der Vorschau:',
                    error
                );
            });
}

function scheduleRoofDraftUpdate() {
    if (previewUpdateTimer) {
        clearTimeout(
            previewUpdateTimer
        );
    }

    previewUpdateTimer =
        setTimeout(() => {
            previewUpdateTimer =
                null;

            queueRoofDraftUpdate();
        }, 150);
}

// =========================================================
// EDITOR
// =========================================================

function startAreaEditing(feature) {
    currentAreaFeature =
        feature;

    isDrawingArea = false;
    isEditingArea = true;
    areaDrawStep = 'idle';

    currentRoofDraftId = null;
    currentPreviewModules = [];

    mountingType = 'south';
    automaticRowGapM = 0;

    updateMountingDirectionUi();
    updateRowGapUi();

    previewSource.clear();
    selectionBoxSource.clear();

    selectInteraction.setActive(
        false
    );

    editor.hidden = false;
    finishButton.disabled = true;

    placeButton.textContent =
        'Fläche setzen';

    updateAreaPreview();

    requestRoofHeightAnalysis()
        .catch(error => {
            console.error(
                'Dachanalyse fehlgeschlagen:',
                error
            );

            alert(
                error.message
            );

            resetAreaEditing();
        });
}

function resetAreaEditing() {
    if (previewUpdateTimer) {
        clearTimeout(
            previewUpdateTimer
        );

        previewUpdateTimer =
            null;
    }

    isDrawingArea = false;
    isEditingArea = false;
    areaDrawStep = 'idle';

    firstAreaPoint = null;
    secondAreaPoint = null;
    currentAreaDepth = 0;
    currentAreaFeature = null;

    currentRoofDraftId = null;
    currentPreviewModules = [];

    roofType = null;
    roofTiltDeg = null;

    mountingType = 'south';
    automaticRowGapM = 0;

    previewSource.clear();

    editor.hidden = true;
    finishButton.disabled = true;

    roofStatusOutput.textContent =
        'Dachfläche wird ausgewertet.';

    tiltInfoOutput.textContent =
        'Der Aufstellwinkel kann bei einer Flachdachfläche verändert werden.';

    moduleTiltInput.disabled =
        false;

    mountingDirectionSection.hidden =
        true;

    rowGapSection.hidden =
        true;

    updateMountingDirectionUi();
    updateRowGapUi();

    selectInteraction.setActive(
        true
    );

    placeButton.textContent =
        'Fläche setzen';

    updatePlaceButtonState();
}

async function discardRoofDraft(
    draftId
) {
    if (!hasDraftId(draftId)) {
        return;
    }

    try {
        await postJson(
            '/cancel-roof',
            {
                draftId
            }
        );
    } catch (error) {
        console.error(
            'Dach-Draft konnte nicht verworfen werden:',
            error
        );
    }
}

async function cancelAreaEditing() {
    if (!isEditingArea) {
        return;
    }

    if (previewUpdateTimer) {
        clearTimeout(
            previewUpdateTimer
        );

        previewUpdateTimer =
            null;
    }

    await previewUpdateChain;

    const draftId =
        currentRoofDraftId;

    if (hasDraftId(draftId)) {
        await discardRoofDraft(
            draftId
        );
    }

    resetAreaEditing();
}

async function finishAreaEditing() {
    if (
        !isEditingArea ||
        !hasDraftId(
            currentRoofDraftId
        )
    ) {
        return;
    }

    if (
        currentPreviewModules.length === 0
    ) {
        return;
    }

    finishButton.disabled = true;

    try {
        if (previewUpdateTimer) {
            clearTimeout(
                previewUpdateTimer
            );

            previewUpdateTimer =
                null;
        }

        await previewUpdateChain;

        queueRoofDraftUpdate();

        await previewUpdateChain;

        const draftId =
            currentRoofDraftId;

        const result =
            await postJson(
                '/finish-roof',
                {
                    draftId
                }
            );

        const moduleIds =
            Array.isArray(
                result.moduleIds
            )
                ? result.moduleIds
                : [];

        if (
            moduleIds.length !==
            currentPreviewModules.length
        ) {
            throw new Error(
                'Anzahl der Modul-IDs stimmt nicht mit der Vorschau überein.'
            );
        }

        const previewFeatures =
            previewSource
                .getFeatures()
                .filter(
                    feature =>
                        feature.get(
                            'objectType'
                        ) ===
                        'preview-module'
                )
                .sort(
                    (a, b) =>
                        a.get(
                            'previewIndex'
                        ) -
                        b.get(
                            'previewIndex'
                        )
                );

        if (
            previewFeatures.length !==
            moduleIds.length
        ) {
            throw new Error(
                'Die Modulvorschau ist unvollständig.'
            );
        }

        const settings =
            getCurrentModuleSettings();

        previewFeatures.forEach(
            (feature, index) => {
                const moduleFeature =
                    feature.clone();

                moduleFeature.setStyle(
                    undefined
                );

                
            const calculatedModule = result.modules[index];

            moduleFeature.setProperties({
                objectType: 'pv-module',

                moduleId: moduleIds[index],

                areaId: draftId,

                corners3D: calculatedModule.corners,

                moduleType: settings.moduleType,

                orientation: settings.orientation,

                mountingDirection: settings.mountingDirection,

                mountingType: calculatedModule.mountingType,

                orientationCategory:
                    calculatedModule.orientationCategory,

                moduleAzimuthDeg:
                    calculatedModule.moduleAzimuthDeg,

                roofReferenceAzimuthDeg:
                    calculatedModule.roofReferenceAzimuthDeg,

                rowIndex: calculatedModule.rowIndex,

                rowPairId: calculatedModule.rowPairId,

                tiltDeg: settings.tiltDeg,

                automaticRowGapM,

                roofType,
                roofTiltDeg
            });


                drawingSource.addFeature(
                    moduleFeature
                );
            }
        );

        if (currentAreaFeature) {
            const areaFeature =
                currentAreaFeature.clone();

            areaFeature.setProperties({
                objectType:
                    'module-area',
                areaId:
                    draftId
            });

            moduleAreaSource.addFeature(
                areaFeature
            );
        }

        updateDownloadLink();
        resetAreaEditing();

    } catch (error) {
        console.error(
            'Dach konnte nicht abgeschlossen werden:',
            error
        );

        alert(
            `Dach konnte nicht abgeschlossen werden: ${error.message}`
        );

        finishButton.disabled =
            false;
    }
}

// =========================================================
// ZEICHENMODUS
// =========================================================

function startAreaDrawing() {
    if (
        isEditingArea ||
        map.getView().getZoom() <
            MIN_DRAW_ZOOM
    ) {
        return;
    }

    if (isDrawingArea) {
        cancelCurrentInteraction();
        return;
    }

    cancelSelectionDrawing();

    selectInteraction
        .getFeatures()
        .clear();

    isDrawingArea = true;
    areaDrawStep = 'idle';

    firstAreaPoint = null;
    secondAreaPoint = null;
    currentAreaDepth = 0;
    currentAreaFeature = null;

    previewSource.clear();

    selectInteraction.setActive(
        false
    );

    placeButton.textContent =
        'Fläche setzen aktiv';

    updatePlaceButtonState();
}

function handleAreaDrawingClick(
    coordinate
) {
    if (!isDrawingArea) {
        return;
    }

    if (areaDrawStep === 'idle') {
        firstAreaPoint =
            [...coordinate];

        secondAreaPoint = null;
        currentAreaDepth = 0;

        areaDrawStep =
            'edge-started';

        previewSource.clear();

        return;
    }

    if (
        areaDrawStep ===
        'edge-started'
    ) {
        secondAreaPoint =
            [...coordinate];

        const edgeLength =
            Math.hypot(
                secondAreaPoint[0] -
                    firstAreaPoint[0],
                secondAreaPoint[1] -
                    firstAreaPoint[1]
            );

        if (edgeLength < 0.001) {
            return;
        }

        areaDrawStep =
            'depth-started';

        previewSource.clear();

        return;
    }

    if (
        areaDrawStep ===
        'depth-started'
    ) {
        currentAreaDepth =
            calculateDepthFromPoint(
                firstAreaPoint,
                secondAreaPoint,
                coordinate
            );

        if (
            Math.abs(
                currentAreaDepth
            ) < 0.01
        ) {
            return;
        }

        const feature =
            createOrientedRectangleFeature(
                firstAreaPoint,
                secondAreaPoint,
                currentAreaDepth
            );

        if (!feature) {
            return;
        }

        currentAreaFeature =
            feature;

        startAreaEditing(
            feature
        );
    }
}

function updateAreaDrawingPreview(
    coordinate
) {
    if (!isDrawingArea) {
        return;
    }

    if (
        areaDrawStep ===
            'edge-started' &&
        firstAreaPoint
    ) {
        previewSource.clear();

        const edgePreview =
            createEdgePreviewFeature(
                firstAreaPoint,
                coordinate
            );

        if (edgePreview) {
            previewSource.addFeature(
                edgePreview
            );
        }

        return;
    }

    if (
        areaDrawStep ===
            'depth-started' &&
        firstAreaPoint &&
        secondAreaPoint
    ) {
        currentAreaDepth =
            calculateDepthFromPoint(
                firstAreaPoint,
                secondAreaPoint,
                coordinate
            );

        previewSource.clear();

        const areaPreview =
            createOrientedRectangleFeature(
                firstAreaPoint,
                secondAreaPoint,
                currentAreaDepth
            );

        if (areaPreview) {
            areaPreview.setStyle(
                areaStyle
            );

            previewSource.addFeature(
                areaPreview
            );
        }
    }
}

// =========================================================
// AUSWAHLRECHTECK
// =========================================================

function cancelSelectionDrawing() {
    selectionDrawStep =
        'idle';

    selectionStartCoordinate =
        null;

    selectionEndCoordinate =
        null;

    currentSelectionDepth =
        0;

    selectionBoxSource.clear();
}

function handleSelectionClick(
    coordinate
) {
    if (
        isDrawingArea ||
        isEditingArea ||
        !isDrawingZoomAllowed()
    ) {
        return;
    }

    if (
        selectionDrawStep ===
        'idle'
    ) {
        selectionStartCoordinate =
            [...coordinate];

        selectionEndCoordinate =
            null;

        currentSelectionDepth =
            0;

        selectionDrawStep =
            'edge-started';

        selectionBoxSource.clear();

        return;
    }

    if (
        selectionDrawStep ===
        'edge-started'
    ) {
        selectionEndCoordinate =
            [...coordinate];

        const edgeLength =
            Math.hypot(
                selectionEndCoordinate[0] -
                    selectionStartCoordinate[0],
                selectionEndCoordinate[1] -
                    selectionStartCoordinate[1]
            );

        if (edgeLength < 0.001) {
            return;
        }

        selectionDrawStep =
            'depth-started';

        selectionBoxSource.clear();

        return;
    }

    if (
        selectionDrawStep ===
        'depth-started'
    ) {
        currentSelectionDepth =
            calculateDepthFromPoint(
                selectionStartCoordinate,
                selectionEndCoordinate,
                coordinate
            );

        const selectionFeature =
            createOrientedRectangleFeature(
                selectionStartCoordinate,
                selectionEndCoordinate,
                currentSelectionDepth
            );

        if (!selectionFeature) {
            return;
        }

        const selectionGeometry =
            selectionFeature
                .getGeometry();

        const selectedFeatures =
            selectInteraction
                .getFeatures();

        selectedFeatures.clear();

        drawingSource
            .getFeatures()
            .forEach(feature => {
                const geometry =
                    feature.getGeometry();

                if (
                    geometry &&
                    selectionGeometry
                        .intersectsExtent(
                            geometry
                                .getExtent()
                        )
                ) {
                    selectedFeatures.push(
                        feature
                    );
                }
            });

        cancelSelectionDrawing();
    }
}

function updateSelectionPreview(
    coordinate
) {
    if (
        selectionDrawStep ===
            'edge-started' &&
        selectionStartCoordinate
    ) {
        selectionBoxSource.clear();

        const edgePreview =
            createEdgePreviewFeature(
                selectionStartCoordinate,
                coordinate
            );

        if (edgePreview) {
            selectionBoxSource.addFeature(
                edgePreview
            );
        }

        return;
    }

    if (
        selectionDrawStep ===
            'depth-started' &&
        selectionStartCoordinate &&
        selectionEndCoordinate
    ) {
        currentSelectionDepth =
            calculateDepthFromPoint(
                selectionStartCoordinate,
                selectionEndCoordinate,
                coordinate
            );

        selectionBoxSource.clear();

        const selectionFeature =
            createOrientedRectangleFeature(
                selectionStartCoordinate,
                selectionEndCoordinate,
                currentSelectionDepth
            );

        if (selectionFeature) {
            selectionBoxSource.addFeature(
                selectionFeature
            );
        }
    }
}

// =========================================================
// AKTUELLE INTERAKTION ABBRECHEN
// =========================================================

function cancelCurrentInteraction() {
    if (isDrawingArea) {
        isDrawingArea = false;
        areaDrawStep = 'idle';

        firstAreaPoint = null;
        secondAreaPoint = null;
        currentAreaDepth = 0;
        currentAreaFeature = null;

        previewSource.clear();

        selectInteraction.setActive(
            true
        );

        placeButton.textContent =
            'Fläche setzen';

        updatePlaceButtonState();
    }

    cancelSelectionDrawing();
}

// =========================================================
// MODULE LÖSCHEN
// =========================================================

async function deleteSelectedFeatures() {
    const selected =
        selectInteraction
            .getFeatures()
            .getArray()
            .slice();

    if (
        selected.length === 0
    ) {
        return;
    }

    const moduleIds =
        selected
            .map(
                feature =>
                    feature.get(
                        'moduleId'
                    )
            )
            .filter(
                moduleId =>
                    Number.isInteger(
                        moduleId
                    )
            );

    if (
        moduleIds.length === 0
    ) {
        return;
    }

    try {
        await postJson(
            '/delete-modules',
            {
                moduleIds
            }
        );

        selected.forEach(
            feature => {
                drawingSource.removeFeature(
                    feature
                );
            }
        );

        selectInteraction
            .getFeatures()
            .clear();

        cleanupModuleAreas();
        updateDownloadLink();
    } catch (error) {
        console.error(
            'Module konnten nicht gelöscht werden:',
            error
        );

        alert(
            `Module konnten nicht gelöscht werden: ${error.message}`
        );
    }
}

function cleanupModuleAreas() {
    const remainingAreaIds =
        new Set(
            drawingSource
                .getFeatures()
                .map(
                    feature =>
                        feature.get(
                            'areaId'
                        )
                )
        );

    moduleAreaSource
        .getFeatures()
        .forEach(areaFeature => {
            const areaId =
                areaFeature.get(
                    'areaId'
                );

            if (
                !remainingAreaIds.has(
                    areaId
                )
            ) {
                moduleAreaSource
                    .removeFeature(
                        areaFeature
                    );
            }
        });
}

// =========================================================
// LÖSCHUNGEN AUS 3D SYNCHRONISIEREN
// =========================================================

async function checkBrowserEvents() {
    try {
        const response =
            await fetch(
                `${SERVER_URL}/browser-events`
            );

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}`
            );
        }

        const data =
            await response.json();

        const deletedModuleIds =
            data.deletedModuleIds;

        if (
            !Array.isArray(deletedModuleIds) ||
            deletedModuleIds.length === 0
        ) {
            return;
        }

        console.log(
            'Löschungen aus 3D empfangen:',
            deletedModuleIds
        );

        const deletedIdSet =
            new Set(deletedModuleIds);

        drawingSource
            .getFeatures()
            .forEach(feature => {
                if (
                    deletedIdSet.has(
                        feature.get('moduleId')
                    )
                ) {
                    drawingSource.removeFeature(
                        feature
                    );
                }
            });

        // Falls eines der gelöschten Module
        // gerade im Browser ausgewählt war.
        selectInteraction
            .getFeatures()
            .getArray()
            .slice()
            .forEach(feature => {
                if (
                    deletedIdSet.has(
                        feature.get('moduleId')
                    )
                ) {
                    selectInteraction
                        .getFeatures()
                        .remove(feature);
                }
            });

        cleanupModuleAreas();
        updateDownloadLink();

    } catch (error) {
        console.error(
            '3D-Löschungen konnten nicht synchronisiert werden:',
            error
        );
    }
}

setInterval(
    checkBrowserEvents,
    500
);

// =========================================================
// ALLE MODULE LÖSCHEN
// =========================================================

async function clearAllModules() {
    try {
        if (isEditingArea) {
            await cancelAreaEditing();
        }

        cancelCurrentInteraction();

        await postJson(
            '/clear-modules'
        );

        drawingSource.clear();
        moduleAreaSource.clear();
        selectionBoxSource.clear();

        selectInteraction
            .getFeatures()
            .clear();

        updateDownloadLink();
    } catch (error) {
        console.error(
            'Module konnten nicht vollständig gelöscht werden:',
            error
        );

        alert(
            `Module konnten nicht gelöscht werden: ${error.message}`
        );
    }
}

// =========================================================
// PROJEKT LADEN
// =========================================================

async function loadProjectFromFile(file) {
    if (drawingSource.getFeatures().length > 0) {
        throw new Error(
            "Ein Projekt kann nur geladen werden, solange noch keine Module gesetzt wurden."
        );
    }

    const text =
        await file.text();

    const data =
        JSON.parse(text);

    if (
        data.type !== 'FeatureCollection' ||
        !Array.isArray(data.features)
    ) {
        throw new Error(
            'Die ausgewählte Datei ist keine gültige Projektdatei.'
        );
    }

    const modules =
        data.features.map(item => {
            if (
                item.type !== 'Feature' ||
                item.geometry?.type !== 'Polygon' ||
                !Array.isArray(
                    item.geometry.coordinates
                )
            ) {
                throw new Error(
                    'Die Projektdatei enthält eine ungültige Modulgeometrie.'
                );
            }

            const ring =
                item.geometry.coordinates[0];

            if (
                !Array.isArray(ring) ||
                ring.length < 4
            ) {
                throw new Error(
                    'Ein Modul besitzt keine gültige Polygongeometrie.'
                );
            }

            return {
                moduleId:
                    item.properties?.moduleId,

                areaId:
                    item.properties?.areaId,

                corners:
                    item.properties?.corners3D,

                featureData:
                    item
            };
        });

    // Erst Server/COVISE synchronisieren.
    await postJson(
        '/load-project',
        {
            modules
        }
    );

    // Erst nach erfolgreicher Serverantwort
    // Module im Browser erzeugen.
    modules.forEach(module => {
        const item =
            module.featureData;

        const feature =
            new Feature({
                geometry:
                    new Polygon(
                        item.geometry.coordinates
                    )
            });

        feature.setProperties({
            objectType:
                'pv-module',

            moduleId:
                item.properties.moduleId,

            areaId:
                item.properties.areaId,

            corners3D:
                item.properties.corners3D,

            moduleType:
                item.properties.moduleType,

            orientation:
                item.properties.orientation,

            mountingDirection:
                item.properties.mountingDirection,

            mountingType:
                item.properties.mountingType,

            orientationCategory:
                item.properties.orientationCategory,

            moduleAzimuthDeg:
                item.properties.moduleAzimuthDeg,

            roofReferenceAzimuthDeg:
                item.properties.roofReferenceAzimuthDeg,

            rowIndex:
                item.properties.rowIndex,

            rowPairId:
                item.properties.rowPairId,

            tiltDeg:
                item.properties.tiltDeg,

            automaticRowGapM:
                item.properties.automaticRowGapM,

            roofType:
                item.properties.roofType,

            roofTiltDeg:
                item.properties.roofTiltDeg
        });

        drawingSource.addFeature(
            feature
        );
    });

    updateDownloadLink();
}

// =========================================================
// DOWNLOAD
// =========================================================

function updateDownloadLink() {
    const features =
        drawingSource.getFeatures();

    const data = {
        type:
            'FeatureCollection',

        features:
            features.map(
                feature => {
                    const geometry =
                        feature
                            .getGeometry();

                    return {
                        type:
                            'Feature',

                        properties: {
                            moduleId:
                                feature.get(
                                    'moduleId'
                                ),

                            areaId:
                                feature.get(
                                    'areaId'
                                ),

                            corners3D:
                                feature.get(
                                    'corners3D'
                                ),

                            moduleType:
                                feature.get(
                                    'moduleType'
                                ),

                            orientation:
                                feature.get(
                                    'orientation'
                                ),

                            mountingDirection:
                                feature.get('mountingDirection'),

                            
                            mountingType:
                                feature.get('mountingType'),

                            orientationCategory:
                                feature.get('orientationCategory'),

                            moduleAzimuthDeg:
                                feature.get('moduleAzimuthDeg'),

                            roofReferenceAzimuthDeg:
                                feature.get('roofReferenceAzimuthDeg'),

                            rowIndex:
                                feature.get('rowIndex'),

                            rowPairId:
                                feature.get('rowPairId'),


                            tiltDeg:
                                feature.get(
                                    'tiltDeg'
                                ),

                            automaticRowGapM:
                                feature.get(
                                    'automaticRowGapM'
                                ),

                            roofType:
                                feature.get(
                                    'roofType'
                                ),

                            roofTiltDeg:
                                feature.get(
                                    'roofTiltDeg'
                                )
                        },

                        geometry: {
                            type:
                                'Polygon',

                            coordinates:
                                geometry
                                    .getCoordinates()
                        }
                    };
                }
            )
    };

    const blob =
        new Blob(
            [
                JSON.stringify(
                    data,
                    null,
                    2
                )
            ],
            {
                type:
                    'application/json'
            }
        );

    if (
        downloadLink.dataset.url
    ) {
        URL.revokeObjectURL(
            downloadLink.dataset.url
        );
    }

    const url =
        URL.createObjectURL(
            blob
        );

    downloadLink.href =
        url;

    downloadLink.dataset.url =
        url;
}

// =========================================================
// BUTTON-STATUS
// =========================================================

function updatePlaceButtonState() {
    const zoomAllowed =
        isDrawingZoomAllowed();

    placeButton.disabled =
        !zoomAllowed ||
        isEditingArea;

    if (!zoomAllowed) {
        placeButton.textContent =
            `Weiter hineinzoomen (mindestens Zoom ${MIN_DRAW_ZOOM})`;
    } else if (!isEditingArea) {
        placeButton.textContent =
            isDrawingArea
                ? 'Fläche setzen aktiv'
                : 'Fläche setzen';
    }
}

// =========================================================
// MAP EVENTS
// =========================================================

map.on(
    'singleclick',
    event => {
        if (
            handleMountingDirectionClick(
                event.pixel
            )
        ) {
            return;
        }

        if (isDrawingArea) {
            handleAreaDrawingClick(
                event.coordinate
            );
        }
    }
);

map.on(
    'pointermove',
    event => {
        if (isDrawingArea) {
            updateAreaDrawingPreview(
                event.coordinate
            );

            return;
        }

        updateSelectionPreview(
            event.coordinate
        );
    }
);

map.getView().on(
    'change:resolution',
    () => {
        if (
            !isDrawingZoomAllowed()
        ) {
            if (isEditingArea) {
                cancelAreaEditing();
            } else {
                cancelCurrentInteraction();
            }

            selectInteraction
                .getFeatures()
                .clear();
        }

        updatePlaceButtonState();
    }
);

// =========================================================
// RECHTSKLICK-AUSWAHL
// =========================================================

map.getViewport()
    .addEventListener(
        'contextmenu',
        event => {
            event.preventDefault();

            if (
                isDrawingArea ||
                isEditingArea ||
                !isDrawingZoomAllowed()
            ) {
                return;
            }

            const coordinate =
                map.getEventCoordinate(
                    event
                );

            handleSelectionClick(
                coordinate
            );
        }
    );

// =========================================================
// BUTTON EVENTS
// =========================================================

placeButton.addEventListener(
    'click',
    startAreaDrawing
);

finishButton.addEventListener(
    'click',
    finishAreaEditing
);

cancelButton.addEventListener(
    'click',
    cancelAreaEditing
);

deleteButton.addEventListener(
    'click',
    deleteSelectedFeatures
);

clearButton.addEventListener(
    'click',
    clearAllModules
);

// =========================================================
// EINSTELLUNGEN
// =========================================================

moduleTypeInput.addEventListener(
    'change',
    scheduleRoofDraftUpdate
);

orientationInput.addEventListener(
    'change',
    scheduleRoofDraftUpdate
);

moduleTiltInput.addEventListener(
    'change',
    () => {
        if (roofType !== 'pitched') {
            updateModuleTiltFromInput();
            scheduleRoofDraftUpdate();
        }
    }
);

edgeDistanceInput.addEventListener(
    'input',
    scheduleRoofDraftUpdate
);

// =========================================================
// TASTATUR
// =========================================================

document.addEventListener(
    'keydown',
    event => {
        if (
            event.key ===
            'Escape'
        ) {
            if (isEditingArea) {
                cancelAreaEditing();
                return;
            }

            cancelCurrentInteraction();

            selectInteraction
                .getFeatures()
                .clear();

            return;
        }

        if (
            event.key ===
                'Delete' ||
            event.key ===
                'Backspace'
        ) {
            deleteSelectedFeatures();
        }
    }
);

// =========================================================
// JSON Laden
// =========================================================
loadProjectInput.addEventListener(
    'change',
    async event => {
        const file =
            event.target.files?.[0];

        if (!file) {
            return;
        }

        try {
            await loadProjectFromFile(file);
        } catch (error) {
            console.error(
                'Projekt konnte nicht geladen werden:',
                error
            );

            alert(
                `Projekt konnte nicht geladen werden: ${error.message}`
            );
        } finally {
            event.target.value = '';
        }
    }
);

// =========================================================
// INITIALISIERUNG
// =========================================================

editor.hidden = true;
finishButton.disabled = true;

mountingDirectionSection.hidden =
    true;

rowGapSection.hidden =
    true;

updateDownloadLink();
updatePlaceButtonState();




// =========================================================
// OPENCOVER-SNAPSHOT ALS OPENLAYERS-EBENE
// =========================================================

let currentSnapshotUrl = null;
let snapshotRequestRunning = false;

async function updateSnapshotLayer() {
    const zoom = map.getView().getZoom();

    // Unterhalb des Schwellwerts deaktivieren
    if (zoom < MIN_SNAPSHOT_ZOOM) {
        snapshotLayer.setVisible(false);
        return;
    }

    if (snapshotRequestRunning) {
        return;
    }

    snapshotRequestRunning = true;

    try {
        // Aktuell sichtbarer OpenLayers-Bereich
        const mapExtent = map.getView().calculateExtent(
            map.getSize()
        );

        // VORLAEUFIGER TESTAUSSCHNITT
        // Im OpenCOVER-Projektraum.
        // Die korrekte Umrechnung des mapExtent
        // erfolgt im naechsten Schritt.
        const snapshotRequest = {
            x: 100,
            y: 60,
            width: 80,
            height: 60
        };

        const response = await fetch(
            `${SERVER_URL}/get-map`,
            {
                method: 'POST',
                headers: {
                    'Content-Type':
                        'application/json'
                },
                body: JSON.stringify(
                    snapshotRequest
                )
            }
        );

        if (!response.ok) {
            throw new Error(
                `Snapshot-HTTP-Fehler: ${response.status}`
            );
        }

        const imageBlob = await response.blob();

        const imageUrl = URL.createObjectURL(
            imageBlob
        );

        // Bild unmittelbar als Kartenebene anzeigen
        const imageSource = new ImageStatic({
            url: imageUrl,
            imageExtent: mapExtent,
            projection:
                map.getView().getProjection()
        });

        snapshotLayer.setSource(imageSource);

        if (currentSnapshotUrl) {
            URL.revokeObjectURL(
                currentSnapshotUrl
            );
        }

        currentSnapshotUrl = imageUrl;

        snapshotLayer.setVisible(
            map.getView().getZoom() >=
                MIN_SNAPSHOT_ZOOM
        );

        console.log(
            "OpenCOVER-Snapshot in Karte eingefügt."
        );

    } catch (error) {
        console.error(
            "Snapshot konnte nicht geladen werden:",
            error
        );

        snapshotLayer.setVisible(false);

    } finally {
        snapshotRequestRunning = false;
    }
}


// Taste M: Snapshot auf der Karte anzeigen
document.addEventListener(
    'keydown',
    event => {
        if (
            event.key.toLowerCase() === 'm' &&
            !event.repeat &&
            !['INPUT', 'TEXTAREA', 'SELECT'].includes(
                document.activeElement?.tagName
            )
        ) {
            updateSnapshotLayer();
        }
    }
);


// Beim Herauszoomen Snapshot ausblenden
map.getView().on(
    'change:resolution',
    () => {
        if (
            map.getView().getZoom() <
            MIN_SNAPSHOT_ZOOM
        ) {
            snapshotLayer.setVisible(false);
        }
    }
);
