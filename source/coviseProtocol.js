// =========================================================
// COVISE-PROTOKOLL
// =========================================================
//
// Diese Datei enthält:
// - MapLink Message Types
// - COVISE Message Header
// - TokenBuffer Lesen/Schreiben
// - Erzeugung der Nachrichten
// - Zerlegung eingehender COVISE-Nachrichten
//
// Keine Socket-Verbindung!
// =========================================================


// ---------------------------------------------------------
// MapLink Message Types
// ---------------------------------------------------------

const MSG_GetHeight = 500;
const MSG_GetMap = 501;
const MSG_SetModules = 502;
const MSG_DeleteModules = 503;
const MSG_ClearAllModules = 504;
const MSG_DeleteModuleRequest = 505;
const MSG_ProjectTransformReady = 506;


// ---------------------------------------------------------
// COVISE-Konstanten
// ---------------------------------------------------------

const COVISE_SENDER_ID = 1234;
const COVISE_SENDER_TYPE = 0;
const COVISE_MAPLINK_MESSAGE_TYPE = 10800;


// ---------------------------------------------------------
// TokenBuffer-Konstanten
// ---------------------------------------------------------

const TB_INT32 = 9;
const TB_FLOAT = 10;
const TB_DOUBLE = 11;


// =========================================================
// TOKENBUFFER SCHREIBEN
// =========================================================

function writeTbInt32(buffer, value, offset) {
    buffer.writeUInt8(TB_INT32, offset);
    offset += 1;

    buffer.writeInt32LE(value, offset);
    offset += 4;

    return offset;
}


function writeTbFloat(buffer, value, offset) {
    buffer.writeUInt8(TB_FLOAT, offset);
    offset += 1;

    buffer.writeFloatLE(value, offset);
    offset += 4;

    return offset;
}

function writeTbDouble(buffer, value, offset) {
    buffer.writeUInt8(TB_DOUBLE, offset);
    offset += 1;

    buffer.writeDoubleLE(value, offset);
    offset += 8;

    return offset;
}


// =========================================================
// TOKENBUFFER LESEN
// =========================================================

function readTokenBufferInt32(payload, offsetObj) {
    if (offsetObj.offset + 5 > payload.length) {
        throw new Error(
            "TokenBuffer: Nicht genügend Daten für TbInt32."
        );
    }

    const type = payload.readUInt8(offsetObj.offset);
    offsetObj.offset += 1;

    if (type !== TB_INT32) {
        throw new Error(
            `TokenBuffer: Erwartet TbInt32 (${TB_INT32}), erhalten ${type}`
        );
    }

    const value = payload.readInt32LE(offsetObj.offset);
    offsetObj.offset += 4;

    return value;
}


function readTokenBufferFloat(payload, offsetObj) {
    if (offsetObj.offset + 5 > payload.length) {
        throw new Error(
            "TokenBuffer: Nicht genügend Daten für TbFloat."
        );
    }

    const type = payload.readUInt8(offsetObj.offset);
    offsetObj.offset += 1;

    if (type !== TB_FLOAT) {
        throw new Error(
            `TokenBuffer: Erwartet TbFloat (${TB_FLOAT}), erhalten ${type}`
        );
    }

    const value = payload.readFloatLE(offsetObj.offset);
    offsetObj.offset += 4;

    return value;
}


// =========================================================
// COVISE MESSAGE HEADER
// =========================================================

function buildCoviseMessage(payload) {
    const header = Buffer.alloc(16);

    // COVISE Header verwendet Big Endian.
    header.writeInt32BE(COVISE_SENDER_ID, 0);
    header.writeInt32BE(COVISE_SENDER_TYPE, 4);
    header.writeInt32BE(COVISE_MAPLINK_MESSAGE_TYPE, 8);
    header.writeInt32BE(payload.length, 12);

    return Buffer.concat([
        header,
        payload
    ]);
}


// =========================================================
// MSG_GetHeight
// =========================================================
//
// Payload:
// controlByte
// command
// numPoints
// longitude, latitude je Punkt
// =========================================================

function createGetHeightMessage(points) {
    const payloadLength =
        1 +                  // TokenBuffer-Steuerbyte
        5 +                  // MSG_GetHeight
        5 +                  // numPoints
        points.length * 2 * 9; // longitude + latitude als double

    const payload = Buffer.alloc(payloadLength);

    let offset = 0;

    payload.writeUInt8(1, offset);
    offset += 1;

    offset = writeTbInt32(
        payload,
        MSG_GetHeight,
        offset
    );

    offset = writeTbInt32(
        payload,
        points.length,
        offset
    );

    for (const point of points) {
        if (
            !Number.isFinite(point.longitude) ||
            !Number.isFinite(point.latitude)
        ) {
            throw new Error(
                "Ungültige Koordinaten für MSG_GetHeight."
            );
        }

        offset = writeTbDouble(
            payload,
            point.longitude,
            offset
        );

        offset = writeTbDouble(
            payload,
            point.latitude,
            offset
        );
    }

    return buildCoviseMessage(payload);
}


/**
 * Snapshot-Anfrage an MapLink.
 *
 * x, y: linke untere Ecke im OpenCOVER-Projektraum
 * width, height: Ausdehnung in diesem Koordinatensystem
 * xRes, yRes: Bildauflösung in Pixeln
 */

function createGetMapMessage({
    minLon,
    minLat,
    maxLon,
    maxLat
}) {
    if (
        ![
            minLon,
            minLat,
            maxLon,
            maxLat
        ].every(Number.isFinite) ||
        minLon >= maxLon ||
        minLat >= maxLat
    ) {
        throw new Error(
            "Ungültiger geografischer Snapshot-Bereich."
        );
    }

    // Feste Auflösung des vorhandenen C++-Bildpuffers
    const xRes = 1024;
    const yRes = 768;

    const payload = Buffer.alloc(
        1 + 4 * 5 + 2 * 5 + 5
    );

    let offset = 0;

    payload.writeUInt8(1, offset++);

    offset = writeTbInt32(
        payload, MSG_GetMap, offset
    );

    for (const value of [
        minLon,
        minLat,
        maxLon,
        maxLat
    ]) {
        offset = writeTbFloat(
            payload, value, offset
        );
    }

    offset = writeTbInt32(
        payload, xRes, offset
    );

    offset = writeTbInt32(
        payload, yRes, offset
    );

    return buildCoviseMessage(payload);
}




// =========================================================
// MSG_SetModules
// =========================================================
//
// Payload:
// controlByte
// command
// numModules
//
// je Modul:
// moduleId
// 4 * (longitude, latitude, height)
// =========================================================

function createSetModulesMessage(modules) {
    const valuesPerCorner = 3;
    const cornersPerModule = 4;

    const payloadLength =
        1 +
        5 +
        5 +
        modules.length *
        (
            5 +
            cornersPerModule *
            valuesPerCorner *
            9
        );

    const payload = Buffer.alloc(payloadLength);

    let offset = 0;

    payload.writeUInt8(1, offset);
    offset += 1;

    offset = writeTbInt32(
        payload,
        MSG_SetModules,
        offset
    );

    offset = writeTbInt32(
        payload,
        modules.length,
        offset
    );

    for (const module of modules) {
        if (
            !Number.isInteger(module.id) ||
            !Array.isArray(module.corners) ||
            module.corners.length !== 4
        ) {
            throw new Error(
                "Ungültiges Modul für MSG_SetModules."
            );
        }

        offset = writeTbInt32(
            payload,
            module.id,
            offset
        );

        for (const corner of module.corners) {
            if (
                !Number.isFinite(corner.longitude) ||
                !Number.isFinite(corner.latitude) ||
                !Number.isFinite(corner.height)
            ) {
                throw new Error(
                    `Ungültige Eckpunktdaten für Modul ${module.id}.`
                );
            }

            offset = writeTbDouble(
                payload,
                corner.longitude,
                offset
            );

            offset = writeTbDouble(
                payload,
                corner.latitude,
                offset
            );

            offset = writeTbDouble(
                payload,
                corner.height,
                offset
            );
        }
    }

    return buildCoviseMessage(payload);
}


// =========================================================
// MSG_DeleteModules
// =========================================================
//
// Payload:
// controlByte
// command
// numModules
// moduleId je Modul
// =========================================================

function createDeleteModulesMessage(moduleIds) {
    const payloadLength =
        1 +
        5 +
        5 +
        moduleIds.length * 5;

    const payload = Buffer.alloc(payloadLength);

    let offset = 0;

    payload.writeUInt8(1, offset);
    offset += 1;

    offset = writeTbInt32(
        payload,
        MSG_DeleteModules,
        offset
    );

    offset = writeTbInt32(
        payload,
        moduleIds.length,
        offset
    );

    for (const moduleId of moduleIds) {
        if (!Number.isInteger(moduleId)) {
            throw new Error(
                `Ungültige Modul-ID: ${moduleId}`
            );
        }

        offset = writeTbInt32(
            payload,
            moduleId,
            offset
        );
    }

    return buildCoviseMessage(payload);
}


// =========================================================
// MSG_ClearAllModules
// =========================================================
//
// Payload:
// controlByte
// command
// =========================================================

function createClearAllModulesMessage() {
    const payload = Buffer.alloc(
        1 + 5
    );

    let offset = 0;

    payload.writeUInt8(1, offset);
    offset += 1;

    writeTbInt32(
        payload,
        MSG_ClearAllModules,
        offset
    );

    return buildCoviseMessage(payload);
}


// =========================================================
// COVISE TCP-NACHRICHTEN ZERLEGEN
// =========================================================
//
// TCP kann Nachrichten auf mehrere Pakete aufteilen oder
// mehrere Nachrichten in einem Paket liefern.
//
// Die Funktion bekommt den gesamten Empfangspuffer und gibt
// vollständige COVISE-Nachrichten + Restpuffer zurück.
// =========================================================

function extractCoviseMessages(receiveBuffer) {
    const messages = [];

    while (receiveBuffer.length >= 16) {
        const senderId =
            receiveBuffer.readInt32BE(0);

        const senderType =
            receiveBuffer.readInt32BE(4);

        const msgType =
            receiveBuffer.readInt32BE(8);

        const payloadLength =
            receiveBuffer.readInt32BE(12);

        if (payloadLength < 0) {
            throw new Error(
                "Ungültige COVISE Payload-Länge."
            );
        }

        const totalMessageLength =
            16 + payloadLength;

        if (
            receiveBuffer.length <
            totalMessageLength
        ) {
            break;
        }

        const payload =
            receiveBuffer.subarray(
                16,
                totalMessageLength
            );

        messages.push({
            senderId,
            senderType,
            msgType,
            payloadLength,
            payload
        });

        receiveBuffer =
            receiveBuffer.subarray(
                totalMessageLength
            );
    }

    return {
        messages,
        remainingBuffer: receiveBuffer
    };
}


// =========================================================
// MAPLINK PAYLOAD AUSWERTEN
// =========================================================

function parseMapLinkPayload(payload) {
    if (!payload || payload.length < 6) {
        throw new Error(
            "MapLink-Payload ist unvollständig."
        );
    }

    const offsetObj = {
        offset: 0
    };

    const controlByte =
        payload.readUInt8(
            offsetObj.offset
        );

    offsetObj.offset += 1;

    const command =
        readTokenBufferInt32(
            payload,
            offsetObj
        );



    // -----------------------------------------------------
    // MSG_GetMap: Snapshot-Antwort
    // -----------------------------------------------------

    if (command === MSG_GetMap) {
        const x = readTokenBufferFloat(
            payload, offsetObj
        );

        const y = readTokenBufferFloat(
            payload, offsetObj
        );

        const width = readTokenBufferFloat(
            payload, offsetObj
        );

        const height = readTokenBufferFloat(
            payload, offsetObj
        );

        const xRes = readTokenBufferInt32(
            payload, offsetObj
        );

        const yRes = readTokenBufferInt32(
            payload, offsetObj
        );

        if (
            xRes !== 1024 ||
            yRes !== 768
        ) {
            throw new Error(
                `Unerwartete Snapshot-Auflösung: ${xRes}x${yRes}`
            );
        }

        const byteLength = xRes * yRes * 4;

        if (
            payload.length - offsetObj.offset <
            byteLength
        ) {
            throw new Error(
                "Snapshot enthält zu wenige Bilddaten."
            );
        }

        // Das Bild ist das letzte Feld der Nachricht.
        // So muss der zusätzliche Header von
        // TokenBuffer::addBinary() hier nicht
        // als Pixeldaten interpretiert werden.
        const imageData = Buffer.from(
            payload.subarray(
                payload.length - byteLength
            )
        );

        return {
            controlByte,
            command,
            x,
            y,
            width,
            height,
            xRes,
            yRes,
            imageData
        };
    }


    // -----------------------------------------------------
    // MSG_GetHeight Antwort
    // -----------------------------------------------------

    if (command === MSG_GetHeight) {
        const numPoints =
            readTokenBufferInt32(
                payload,
                offsetObj
            );

        if (numPoints < 0) {
            throw new Error(
                "Ungültige Anzahl von Höhenwerten."
            );
        }

        const heights = [];

        for (
            let i = 0;
            i < numPoints;
            ++i
        ) {
            heights.push(
                readTokenBufferFloat(
                    payload,
                    offsetObj
                )
            );
        }

        return {
            controlByte,
            command,
            numPoints,
            heights
        };
    }


    // -----------------------------------------------------
    // MSG_SetModules Bestätigung
    // -----------------------------------------------------

    if (command === MSG_SetModules) {
        const numModules =
            readTokenBufferInt32(
                payload,
                offsetObj
            );

        return {
            controlByte,
            command,
            numModules
        };
    }


    // -----------------------------------------------------
    // MSG_DeleteModules Bestätigung
    // -----------------------------------------------------
    //
    // Falls das Plugin nach dem Löschen zusätzlich die
    // Anzahl gelöschter Module zurückgibt, wird sie gelesen.
    // Andernfalls bleibt nur die Kommando-Bestätigung.
    // -----------------------------------------------------

    if (command === MSG_DeleteModules) {
        let numModules = null;

        if (
            offsetObj.offset <
            payload.length
        ) {
            numModules =
                readTokenBufferInt32(
                    payload,
                    offsetObj
                );
        }

        return {
            controlByte,
            command,
            numModules
        };
    }


    // -----------------------------------------------------
    // MSG_ClearAllModules Bestätigung
    // -----------------------------------------------------

    if (command === MSG_ClearAllModules) {
        return {
            controlByte,
            command
        };
    }

    // -----------------------------------------------------
    // MSG_DeleteModuleRequest
    // -----------------------------------------------------
    // Plugin -> Server:
    // Benutzer hat in 3D ein PV-Modul zum Löschen ausgewählt.
    // Payload enthält die Modul-ID.
    // -----------------------------------------------------

    if (command === MSG_DeleteModuleRequest) {
        const moduleId =
            readTokenBufferInt32(
                payload,
                offsetObj
            );

        return {
            controlByte,
            command,
            moduleId
        };
    }

    // -----------------------------------------------------
    // MSG_ProjectTransformReady
    // -----------------------------------------------------
    // MapLink -> Node.js:
    // Der Projektursprung wurde gesetzt.
    // Die Modulsynchronisierung darf gestartet werden.
    // -----------------------------------------------------

    if (command === MSG_ProjectTransformReady) {
        return {
            controlByte,
            command
        };
    }

    // -----------------------------------------------------
    // Unbekannte / noch nicht behandelte Antwort
    // -----------------------------------------------------

    return {
        controlByte,
        command
    };
}


// =========================================================
// EXPORTS
// =========================================================

module.exports = {
    MSG_GetHeight,
    MSG_GetMap,
    MSG_SetModules,
    MSG_DeleteModules,
    MSG_ClearAllModules,
    MSG_DeleteModuleRequest,
    MSG_ProjectTransformReady,

    COVISE_MAPLINK_MESSAGE_TYPE,

    createGetHeightMessage,
    createGetMapMessage,
    createSetModulesMessage,
    createDeleteModulesMessage,
    createClearAllModulesMessage,

    extractCoviseMessages,
    parseMapLinkPayload
};