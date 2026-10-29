import 'ol/ol.css';

import Map from 'ol/Map.js';
import View from 'ol/View.js';
import Link from 'ol/interaction/Link.js';
import Select from 'ol/interaction/Select.js';

import TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import ImageLayer from 'ol/layer/Image.js';
import ImageStatic from 'ol/source/ImageStatic.js';
import { transformExtent } from 'ol/proj.js';

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

let SERVER_URL = 'http://localhost:8080';
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

const loadProjectFolderInput =
    document.getElementById('load-project-folder');


const deleteMenuButton =
    document.getElementById('delete-menu-button');

const deleteMenu =
    document.getElementById('delete-menu');

const importMenuButton =
    document.getElementById('import-menu-button');

const importMenu =
    document.getElementById('import-menu');

const yieldAnalysisButton =
    document.getElementById('yield-analysis-button');

const settingsButton =
    document.getElementById('settings-button');


const settingsPanel =
    document.getElementById('settings-panel');

const closeSettingsButton =
    document.getElementById('close-settings');


const serverUrlInput =
    document.getElementById('server-url-input');

const coviseHostInput =
    document.getElementById('covise-host-input');

const covisePortInput =
    document.getElementById('covise-port-input');

const applyConnectionButton =
    document.getElementById('apply-connection-settings');

const resetConnectionButton =
    document.getElementById('reset-connection-settings');

const connectionStatusOutput =
    document.getElementById('connection-status');


const availableModuleTypesList =
    document.getElementById("available-module-types");

const showNewModuleTypeButton =
    document.getElementById("show-new-module-type");

const newModuleTypeForm =
    document.getElementById("new-module-type-form");

const newModuleNameInput =
    document.getElementById("new-module-name");

const newModuleWidthInput =
    document.getElementById("new-module-width");

const newModuleLengthInput =
    document.getElementById("new-module-length");

const newModuleModelInput =
    document.getElementById("new-module-model");

const saveNewModuleTypeButton =
    document.getElementById("save-new-module-type");

const cancelNewModuleTypeButton =
    document.getElementById("cancel-new-module-type");

const moduleTypesStatus =
    document.getElementById("module-types-status");


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

    placeButton.textContent = '+ Modulplatzierung starten';

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
    
        closeSettingsPanel();

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
        'Modulplatzierung aktiv';

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

        // Snapshot nach erfolgreicher Löschung aktualisieren
        scheduleSnapshotRefresh(0);

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
// MODULE NACH TCP-RECONNECT WIEDERHERSTELLEN
// =========================================================

let resyncInProgress = false;

async function resyncModulesToOpenCover(generation) {

    if (resyncInProgress) {
        return;
    }

    // Während einer aktiven Dachflächenbearbeitung
    // keinen unvollständigen Zustand übertragen.
    if (isEditingArea || isDrawingArea || projectImportRunning) {
        return;
    }

    resyncInProgress = true;

    try {

        const modules = drawingSource
            .getFeatures()
            .filter(feature =>
                feature.get("objectType") === "pv-module"
            )
            .map(feature => ({
                id: feature.get("moduleId"),
                corners: feature.get("corners3D")
            }));

        console.log(
            `Synchronisiere ${modules.length} Module mit OpenCOVER.`
        );

        const result = await postJson(
            "/resync-modules",
            {
                generation,
                modules
            }
        );

        console.log(
            `${result.moduleCount} Module an MapLink übertragen.`
        );

    } catch (error) {

        console.error(
            "Modulsynchronisierung fehlgeschlagen:",
            error
        );

    } finally {
        resyncInProgress = false;
    }
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

        // Nach einer neuen TCP-Verbindung den
        // Modulbestand aus OpenLayers erneut übertragen.
        if (data.resyncRequired === true) {

            await resyncModulesToOpenCover(
                data.resyncGeneration
            );

            return;
        }

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

        // Snapshot nach erfolgreicher Löschung aktualisieren
        scheduleSnapshotRefresh(0);

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

        // Snapshot nach dem Löschen aller Module aktualisieren
        scheduleSnapshotRefresh(0);

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


async function loadProjectFiles(fileList) {

    const files = Array.from(fileList).filter(file =>
        /\.(json|geojson)$/i.test(file.name)
    );

    if (files.length === 0) {
        throw new Error(
            'Keine JSON- oder GeoJSON-Dateien ausgewählt.'
        );
    }

    if (isEditingArea) {
        throw new Error(
            'Bitte die aktuelle Dachflächenbearbeitung zuerst abschließen.'
        );
    }

    if (isDrawingArea) {
        cancelCurrentInteraction();
    }

    // Alle Dateien zuerst vollständig einlesen und prüfen.
    const modules = [];

    for (const [fileIndex, file] of files.entries()) {

        let data;

        try {
            data = JSON.parse(await file.text());
        } catch {
            throw new Error(
                `Die Datei "${file.name}" enthält kein gültiges JSON.`
            );
        }

        if (
            data.type !== 'FeatureCollection' ||
            !Array.isArray(data.features)
        ) {
            throw new Error(
                `Die Datei "${file.name}" ist keine gültige Projektdatei.`
            );
        }

        for (const [featureIndex, item] of data.features.entries()) {

            if (
                item?.type !== 'Feature' ||
                item.geometry?.type !== 'Polygon' ||
                !Array.isArray(item.geometry.coordinates) ||
                !Array.isArray(item.geometry.coordinates[0]) ||
                item.geometry.coordinates[0].length < 4
            ) {
                throw new Error(
                    `Ungültige Polygongeometrie in "${file.name}", ` +
                    `Feature ${featureIndex + 1}.`
                );
            }

            const properties = item.properties ?? {};

            if (
                !Number.isInteger(properties.areaId) ||
                properties.areaId < 1
            ) {
                throw new Error(
                    `Ungültige areaId in "${file.name}", ` +
                    `Feature ${featureIndex + 1}.`
                );
            }

            if (
                !Array.isArray(properties.corners3D) ||
                properties.corners3D.length !== 4 ||
                !properties.corners3D.every(corner =>
                    corner &&
                    ['longitude', 'latitude', 'height'].every(key =>
                        Number.isFinite(corner[key])
                    )
                )
            ) {
                throw new Error(
                    `Ungültige 3D-Eckpunkte in "${file.name}", ` +
                    `Feature ${featureIndex + 1}.`
                );
            }

            modules.push({
                moduleId: properties.moduleId,
                areaId: properties.areaId,
                corners: properties.corners3D,

                // Eindeutige Kennung innerhalb dieses Imports:
                // Gleiche areaIds aus verschiedenen Dateien
                // werden nicht versehentlich zusammengefasst.
                sourceFileKey: String(fileIndex),

                featureData: item
            });
        }
    }

    if (modules.length === 0) {
        throw new Error(
            'Die ausgewählten Dateien enthalten keine PV-Module.'
        );
    }

    // Nur die Daten senden, die der Server benötigt.
    const result = await postJson('/load-project', {
        modules: modules.map(module => ({
            moduleId: module.moduleId,
            areaId: module.areaId,
            corners: module.corners,
            sourceFileKey: module.sourceFileKey
        }))
    });

    if (
        !Array.isArray(result.idAssignments) ||
        result.idAssignments.length !== modules.length
    ) {
        throw new Error(
            'Der Server hat keine vollständige ID-Zuordnung zurückgegeben.'
        );
    }

    // Neue IDs aus der Serverantwort übernehmen.
    const assignments = new globalThis.Map();

    for (const assignment of result.idAssignments) {
        if (
            !Number.isInteger(assignment.index) ||
            assignment.index < 0 ||
            assignment.index >= modules.length ||
            !Number.isInteger(assignment.moduleId) ||
            !Number.isInteger(assignment.areaId) ||
            assignments.has(assignment.index)
        ) {
            throw new Error(
                'Die ID-Zuordnung des Servers ist ungültig.'
            );
        }

        assignments.set(assignment.index, assignment);
    }

    // Erst nach erfolgreicher Serverantwort
    // die importierten Module in OpenLayers ergänzen.
    modules.forEach((module, index) => {

        const item = module.featureData;
        const assignment = assignments.get(index);

        if (!assignment) {
            throw new Error(
                `ID-Zuordnung für Modul ${index} fehlt.`
            );
        }

        const feature = new Feature({
            geometry: new Polygon(
                item.geometry.coordinates
            )
        });

        feature.setProperties({
            ...item.properties,

            objectType: 'pv-module',

            // Vom Server neu vergebene IDs:
            moduleId: assignment.moduleId,
            areaId: assignment.areaId,

            // Bisherige 3D-Geometrie beibehalten:
            corners3D: module.corners
        });

        drawingSource.addFeature(feature);
    });

    updateDownloadLink();

    console.log(
        `${modules.length} PV-Module aus ${files.length} ` +
        `Datei(en) importiert.`
    );

    // Absichtlich KEIN Snapshot-Refresh beim Laden.
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
 // PROJEKT MIT DATEINAMEN UND SPEICHERORT SPEICHERN
 // =========================================================

 async function saveProjectAs(event) {

     // Verhindert den bisherigen direkten Download.
     event.preventDefault();

     try {

         // Die bestehende JSON-Datei aktualisieren.
         updateDownloadLink();

         const response = await fetch(downloadLink.href);
         const blob = await response.blob();

         // Speicherdialog für Edge / Chrome
         if ('showSaveFilePicker' in window) {

             const fileHandle = await window.showSaveFilePicker({
                 suggestedName: 'PVision_Projekt.json',
                 types: [
                     {
                         description: 'JSON-Projektdatei',
                         accept: {
                             'application/json': ['.json']
                         }
                     }
                 ]
             });

             const writable = await fileHandle.createWritable();

             await writable.write(blob);
             await writable.close();

             console.log('Projekt erfolgreich gespeichert.');

         } else {

             // Fallback für Browser ohne File System Access API.
             const link = document.createElement('a');

             link.href = downloadLink.href;
             link.download = 'PVision_Projekt.json';

             document.body.appendChild(link);
             link.click();
             link.remove();

         }

     } catch (error) {

         // Benutzer hat den Speicherdialog abgebrochen.
         if (error.name === 'AbortError') {
             return;
         }

         console.error(
             'Projekt konnte nicht gespeichert werden:',
             error
         );

         alert(
             `Fehler beim Speichern: ${error.message}`
         );
     }
 }

 downloadLink.addEventListener('click', saveProjectAs);


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
                ? 'Modulplatzierung aktiv'
                : '+ Modulplatzierung starten';
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
// EINSTELLUNGSMENÜ
// =========================================================

function closeSettingsPanel() {
    settingsPanel.hidden = true;
}


function toggleSettingsPanel() {

    closeToolMenus();

    // Modulflächen-Editor hat Vorrang
    if (isEditingArea) {
        return;
    }

    // Einstellungsmenü öffnen oder schließen
    settingsPanel.hidden = !settingsPanel.hidden;
}


settingsButton.addEventListener(
    'click',
    toggleSettingsPanel
);

closeSettingsButton.addEventListener(
    'click',
    closeSettingsPanel
);


// =========================================================
// VERBINDUNGSEINSTELLUNGEN
// =========================================================

async function applyConnectionSettings() {

    const previousServerUrl = SERVER_URL;

    applyConnectionButton.disabled = true;

    connectionStatusOutput.textContent =
        'Serververbindung wird geprüft...';

    try {
        const serverUrl = new URL(
            serverUrlInput.value.trim()
        );

        if (
            !['http:', 'https:'].includes(serverUrl.protocol) ||
            serverUrl.username ||
            serverUrl.password ||
            serverUrl.search ||
            serverUrl.hash ||
            serverUrl.pathname !== '/'
        ) {
            throw new Error(
                'Bitte eine gültige HTTP-Serveradresse eingeben.'
            );
        }

        const newServerUrl =
            serverUrl.origin;

        const host =
            coviseHostInput.value.trim();

        const port =
            Number(covisePortInput.value);

        if (
            !host ||
            !Number.isInteger(port) ||
            port < 1 ||
            port > 65535
        ) {
            throw new Error(
                'Ungültiger MapLink-Host oder Port.'
            );
        }

        // Zunächst prüfen, ob der Server erreichbar ist.
        const statusResponse = await fetch(
            `${newServerUrl}/connection-status`
        );

        if (!statusResponse.ok) {
            throw new Error(
                'Node.js-Server nicht erreichbar.'
            );
        }

        const currentStatus =
            await statusResponse.json();

        // Plugin nur umstellen, falls sich seine
        // Verbindungseinstellungen tatsächlich ändern.
        const pluginChanged =
            currentStatus.coviseHost !== host ||
            currentStatus.covisePort !== port;

        let result = currentStatus;

        if (pluginChanged) {

            const response = await fetch(
                `${newServerUrl}/configure-covise`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type':
                            'application/json'
                    },
                    body: JSON.stringify({
                        host,
                        port
                    })
                }
            );

            result = await response.json();

            if (!response.ok || result.success === false) {
                throw new Error(
                    result.error ||
                    'MapLink-Konfiguration fehlgeschlagen.'
                );
            }
        }

        // Erst nach erfolgreicher HTTP-Kommunikation
        // die Serveradresse übernehmen.
        SERVER_URL = newServerUrl;

        loadModuleTypesFromServer().catch(error => {
            console.warn("Modultypen konnten nicht geladen werden:", error);
        });

        connectionStatusOutput.textContent =
            result.coviseConnected
                ? 'Node.js-Server erreichbar. MapLink verbunden.'
                : 'Node.js-Server erreichbar. MapLink-Verbindung noch nicht bereit.';

    } catch (error) {

        SERVER_URL = previousServerUrl;

        connectionStatusOutput.textContent =
            `Verbindung fehlgeschlagen: ${error.message}`;

        console.error(
            'Verbindungseinstellungen:',
            error
        );

    } finally {
        applyConnectionButton.disabled = false;
    }
}


// =========================================================
// STANDARDWERTE WIEDERHERSTELLEN
// =========================================================

function resetConnectionSettings() {

    serverUrlInput.value =
        'http://localhost:8080';

    coviseHostInput.value =
        '127.0.0.1';

    covisePortInput.value =
        '31822';

    connectionStatusOutput.textContent =
        'Standardwerte eingetragen. Zum Übernehmen auf "Verbindung herstellen" klicken.';
}


applyConnectionButton.disabled = false;
resetConnectionButton.disabled = false;

applyConnectionButton.addEventListener(
    'click',
    applyConnectionSettings
);

resetConnectionButton.addEventListener(
    'click',
    resetConnectionSettings
);



// =========================================================
// DROPDOWN-MENÜS
// =========================================================

// Beide Dropdown-Menüs schließen
function closeToolMenus() {

    deleteMenu.hidden = true;
    importMenu.hidden = true;

    deleteMenuButton.setAttribute(
        'aria-expanded',
        'false'
    );

    importMenuButton.setAttribute(
        'aria-expanded',
        'false'
    );
}

// Löschmenü öffnen bzw. schließen
deleteMenuButton.addEventListener('click', event => {

    event.stopPropagation();

    const shouldOpen = deleteMenu.hidden;

    closeToolMenus();

    deleteMenu.hidden = !shouldOpen;

    deleteMenuButton.setAttribute(
        'aria-expanded',
        String(shouldOpen)
    );
});

// Importmenü öffnen bzw. schließen
importMenuButton.addEventListener('click', event => {

    event.stopPropagation();

    const shouldOpen = importMenu.hidden;

    closeToolMenus();

    importMenu.hidden = !shouldOpen;

    importMenuButton.setAttribute(
        'aria-expanded',
        String(shouldOpen)
    );
});

// Klick innerhalb des Menüs soll es nicht sofort schließen
deleteMenu.addEventListener('click', event => {
    event.stopPropagation();
});

importMenu.addEventListener('click', event => {
    event.stopPropagation();
});

// Löschen auswählen: Menü schließen
deleteButton.addEventListener('click', closeToolMenus);
clearButton.addEventListener('click', closeToolMenus);

// Dateiauswahl abgeschlossen: Menü schließen
loadProjectInput.addEventListener(
    'change',
    closeToolMenus
);

loadProjectFolderInput.addEventListener(
    'change',
    closeToolMenus
);

// Klick außerhalb: beide Menüs schließen
document.addEventListener('click', event => {

    if (
        !deleteMenuButton.contains(event.target) &&
        !deleteMenu.contains(event.target) &&
        !importMenuButton.contains(event.target) &&
        !importMenu.contains(event.target)
    ) {
        closeToolMenus();
    }
});

// Escape: offene Dropdowns schließen
document.addEventListener('keydown', event => {

    if (event.key === 'Escape') {
        closeToolMenus();
        closeSettingsPanel();
    }
});


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
    
let projectImportRunning = false;

async function handleProjectFileSelection(event) {

    const input = event.target;
    const files = Array.from(input.files ?? []);

    if (files.length === 0) {
        return;
    }

    if (projectImportRunning) {
        input.value = '';
        alert('Es läuft bereits ein Projektimport.');
        return;
    }

    projectImportRunning = true;

    loadProjectInput.disabled = true;
    loadProjectFolderInput.disabled = true;

    try {
        await loadProjectFiles(files);
    } catch (error) {
        console.error(
            'Projektimport fehlgeschlagen:',
            error
        );

        alert(
            `Projektimport fehlgeschlagen: ${error.message}`
        );
    } finally {
        projectImportRunning = false;

        loadProjectInput.disabled = false;
        loadProjectFolderInput.disabled = false;

        input.value = '';
    }
}

loadProjectInput.addEventListener(
    'change',
    handleProjectFileSelection
);

loadProjectFolderInput.addEventListener(
    'change',
    handleProjectFileSelection
);


// =========================================================
// MODULTYPENVERWALTUNG
// =========================================================

async function loadModuleTypesFromServer() {

    const response = await fetch(
        `${SERVER_URL}/module-types`
    );

    if (!response.ok) {
        throw new Error(
            "Modultypen konnten nicht geladen werden."
        );
    }

    const result = await response.json();

    if (
        !Array.isArray(result.moduleTypes) ||
        result.moduleTypes.length === 0 ||
        !result.moduleTypes.every(type =>
            type &&
            typeof type.id === "string" &&
            typeof type.name === "string" &&
            Number.isFinite(type.width) &&
            Number.isFinite(type.length)
        )
    ) {
        throw new Error(
            "Ungültige Modultypen-Antwort."
        );
    }

    const previousSelection = moduleTypeInput.value;

    // Modulformat-Auswahl neu befüllen
    moduleTypeInput.replaceChildren();

    // Liste im Einstellungsmenü aktualisieren
    availableModuleTypesList.replaceChildren();

    for (const type of result.moduleTypes) {

        const label =
            `${type.name} – ` +
            `${type.length.toFixed(3)} × ` +
            `${type.width.toFixed(3)} m`;

        const option = document.createElement("option");

        option.value = type.id;
        option.textContent = label;

        moduleTypeInput.appendChild(option);

        const item = document.createElement("li");

        item.textContent = `${label} (${type.model || "kein OBJ"})`;

        availableModuleTypesList.appendChild(item);
    }

    // Vorherige Auswahl erhalten
    if (
        Array.from(moduleTypeInput.options).some(
            option => option.value === previousSelection
        )
    ) {
        moduleTypeInput.value = previousSelection;
    }
}


// Formular anzeigen
showNewModuleTypeButton.addEventListener(
    "click",
    () => {
        newModuleTypeForm.hidden = false;
        showNewModuleTypeButton.hidden = true;
    }
);


// Formular schließen
cancelNewModuleTypeButton.addEventListener(
    "click",
    () => {
        newModuleTypeForm.hidden = true;
        showNewModuleTypeButton.hidden = false;
    }
);


// Neuen Modultyp speichern
saveNewModuleTypeButton.addEventListener(
    "click",
    async () => {

        if (isEditingArea) {
            moduleTypesStatus.textContent =
                "Bitte zuerst die aktuelle Modulfläche abschließen.";
            return;
        }

        const name = newModuleNameInput.value.trim();

        const width = Number(newModuleWidthInput.value);
        const length = Number(newModuleLengthInput.value);

        const model = newModuleModelInput.value.trim();

        if (
            !name ||
            !newModuleWidthInput.value.trim() ||
            !newModuleLengthInput.value.trim() ||
            !Number.isFinite(width) ||
            !Number.isFinite(length) ||
            width <= 0 ||
            length <= 0 ||
            !model
        ) {
            moduleTypesStatus.textContent =
                "Bitte alle Felder gültig ausfüllen.";
            return;
        }

        saveNewModuleTypeButton.disabled = true;
        moduleTypesStatus.textContent =
            "Modultyp wird gespeichert...";

        try {
            const response = await fetch(
                `${SERVER_URL}/module-types`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        name,
                        width,
                        length,
                        model
                    })
                }
            );

            const result = await response.json();

            if (!response.ok || result.success === false) {
                throw new Error(
                    result.error || "Speichern fehlgeschlagen."
                );
            }

            await loadModuleTypesFromServer();

            newModuleNameInput.value = "";
            newModuleWidthInput.value = "";
            newModuleLengthInput.value = "";
            newModuleModelInput.value = "";

            newModuleTypeForm.hidden = true;
            showNewModuleTypeButton.hidden = false;

            moduleTypesStatus.textContent =
                "Modultyp erfolgreich hinzugefügt.";

        } catch (error) {

            moduleTypesStatus.textContent =
                `Fehler: ${error.message}`;

            console.error(
                "Modultyp konnte nicht gespeichert werden:",
                error
            );

        } finally {
            saveNewModuleTypeButton.disabled = false;
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

loadModuleTypesFromServer().catch(error => {
    console.warn(
        "Modultypen konnten nicht geladen werden:",
        error.message
    );
});




// =========================================================
// OPENCOVER-SNAPSHOT: EREIGNISGESTEUERTE AKTUALISIERUNG
// =========================================================

let currentSnapshotUrl = null;
let snapshotRequestRunning = false;
let snapshotRefreshPending = false;
let snapshotRefreshTimer = null;
let snapshotRequestVersion = 0;

// Keine Snapshot-Anforderung bei Modulplatzierung, Vorschau
// oder Laden einer Projektdatei.
// Nur Kartenbewegung/Zoom und abgeschlossene Loeschungen
// rufen scheduleSnapshotRefresh() auf.

function hideSnapshotBelowMinimumZoom() {
    if (map.getView().getZoom() >= MIN_SNAPSHOT_ZOOM) {
        return;
    }

    ++snapshotRequestVersion;
    snapshotRefreshPending = false;

    if (snapshotRefreshTimer !== null) {
        clearTimeout(snapshotRefreshTimer);
        snapshotRefreshTimer = null;
    }

    snapshotLayer.setVisible(false);
}

function scheduleSnapshotRefresh(delayMs = 150) {
    if (map.getView().getZoom() < MIN_SNAPSHOT_ZOOM) {
        hideSnapshotBelowMinimumZoom();
        return;
    }

    // Laufende Antworten werden dadurch als veraltet markiert.
    ++snapshotRequestVersion;
    snapshotRefreshPending = true;

    if (snapshotRefreshTimer !== null) {
        clearTimeout(snapshotRefreshTimer);
    }

    // Debouncing bei dicht aufeinanderfolgenden Ereignissen.
    snapshotRefreshTimer = setTimeout(() => {
        snapshotRefreshTimer = null;
        void processPendingSnapshotRequests();
    }, delayMs);
}

async function processPendingSnapshotRequests() {
    if (snapshotRequestRunning || !snapshotRefreshPending) {
        return;
    }

    snapshotRequestRunning = true;

    try {
        // Immer nur eine Anfrage gleichzeitig.
        // Bei Aenderungen waehrend einer Anfrage wird
        // anschliessend ein neuer Snapshot angefordert.
        while (
            snapshotRefreshPending &&
            map.getView().getZoom() >= MIN_SNAPSHOT_ZOOM
        ) {
            snapshotRefreshPending = false;

            const requestVersion = snapshotRequestVersion;

            try {
                await fetchSnapshotForCurrentExtent(requestVersion);
            } catch (error) {
                console.error('Snapshot-Fehler:', error);

                if (requestVersion === snapshotRequestVersion) {
                    snapshotLayer.setVisible(false);
                }
            }
        }
    } finally {
        snapshotRequestRunning = false;
    }
}

async function fetchSnapshotForCurrentExtent(requestVersion) {

    // Sichtbarer Bereich in EPSG:3857
    const extent = map.getView().calculateExtent(
        map.getSize()
    );

    const centerX = (extent[0] + extent[2]) / 2;
    const centerY = (extent[1] + extent[3]) / 2;

    let extentWidth = extent[2] - extent[0];
    let extentHeight = extent[3] - extent[1];

    // Seitenverhaeltnis des bestehenden C++-Renderbuffers
    const snapshotAspect = 1024 / 768;

    if (extentWidth / extentHeight > snapshotAspect) {
        extentHeight = extentWidth / snapshotAspect;
    } else {
        extentWidth = extentHeight * snapshotAspect;
    }

    const snapshotExtent3857 = [
        centerX - extentWidth / 2,
        centerY - extentHeight / 2,
        centerX + extentWidth / 2,
        centerY + extentHeight / 2
    ];

    // EPSG:3857 -> EPSG:4326
    const geoExtent = transformExtent(
        snapshotExtent3857,
        'EPSG:3857',
        'EPSG:4326'
    );

    const snapshotRequest = {
        minLon: geoExtent[0],
        minLat: geoExtent[1],
        maxLon: geoExtent[2],
        maxLat: geoExtent[3]
    };

    console.log(
        'Snapshot-Anfrage:',
        snapshotRequest
    );

    // Anfrage an den bestehenden Node.js-Server
    const response = await fetch(
        `${SERVER_URL}/get-map`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(snapshotRequest)
        }
    );

    if (!response.ok) {
        throw new Error(
            `Snapshot-HTTP-Fehler: ${response.status}`
        );
    }

    const imageBlob = await response.blob();

    // Veraltete Snapshots nicht mehr anzeigen
    if (
        requestVersion !== snapshotRequestVersion ||
        map.getView().getZoom() < MIN_SNAPSHOT_ZOOM
    ) {
        return;
    }

    const imageUrl = URL.createObjectURL(imageBlob);

    const imageSource = new ImageStatic({
        url: imageUrl,
        imageExtent: snapshotExtent3857,
        projection: map.getView().getProjection()
    });

    snapshotLayer.setSource(imageSource);
    snapshotLayer.setVisible(true);

    if (currentSnapshotUrl) {
        URL.revokeObjectURL(currentSnapshotUrl);
    }

    currentSnapshotUrl = imageUrl;

    console.log(
        'OpenCOVER-Snapshot aktualisiert.'
    );
}

// =========================================================
// SNAPSHOT MANUELL AKTUALISIEREN
// =========================================================

function updateSnapshotLayer() {
    scheduleSnapshotRefresh(0);
}

// =========================================================
// SNAPSHOT BEI KARTENBEWEGUNG UND ZOOM
// =========================================================

// Sobald eine Kartenbewegung beginnt, ist ein eventuell
// laufender Snapshot nicht mehr aktuell.
map.on('movestart', () => {
    ++snapshotRequestVersion;
});

// Erst nach Abschluss des Verschiebens oder Zoomens
// wird ein neuer Snapshot angefordert.
map.on('moveend', () => {
    scheduleSnapshotRefresh(150);
});

// =========================================================
// SNAPSHOT BEIM HERAUSZOOMEN AUSBLENDEN
// =========================================================

map.getView().on(
    'change:resolution',
    () => {
        if (
            map.getView().getZoom() <
            MIN_SNAPSHOT_ZOOM
        ) {
            hideSnapshotBelowMinimumZoom();
        }
    }
);

// =========================================================
// TASTE M: SNAPSHOT MANUELL AKTUALISIEREN
// =========================================================

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

// =========================================================
// LAYER-REIHENFOLGE
// =========================================================

snapshotLayer.setZIndex(1);

moduleAreaLayer.setZIndex(10);
drawingLayer.setZIndex(20);
previewLayer.setZIndex(30);
selectionBoxLayer.setZIndex(40);

