// =========================================================
// HTTP-SERVER
// =========================================================

const http = require("http");


// =========================================================
// JSON-ANTWORT
// =========================================================

function sendJson(res, statusCode, data = null) {
    res.statusCode = statusCode;

    res.setHeader(
        "Access-Control-Allow-Origin",
        "*"
    );

    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );

    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS"
    );

    if (statusCode === 204) {
        res.end();
        return;
    }

    res.setHeader(
        "Content-Type",
        "application/json; charset=utf-8"
    );

    res.end(
        JSON.stringify(data)
    );
}


// =========================================================
// JSON-BODY LESEN
// =========================================================

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";

        req.on("data", chunk => {
            body += chunk.toString();
        });

        req.on("end", () => {
            if (!body.trim()) {
                resolve({});
                return;
            }

            try {
                resolve(
                    JSON.parse(body)
                );
            } catch {
                reject(
                    new Error(
                        "Ungültiger JSON-Body."
                    )
                );
            }
        });

        req.on("error", reject);
    });
}


// =========================================================
// HTTP-SERVER STARTEN
// =========================================================

function startHttpServer({
    port,
    onSetRoof,
    onUpdateRoofDraft,
    onResyncModules,
    onFinishRoof,
    onCancelRoof,
    onDeleteModules,
    onClearModules,
    onLoadProject,
    onGetBrowserEvents,
    onGetMap,
    onGetConnectionStatus,
    onConfigureCovise,
    onGetModuleTypes,
    onAddModuleType
}) {
    const server = http.createServer(
        async (req, res) => {
            if (req.method === "OPTIONS") {
                sendJson(
                    res,
                    204
                );
                return;
            }

            try {

                
                // =========================================================
                // MODULE AUS OPENLAYERS WIEDERHERSTELLEN
                // =========================================================

                if (
                    req.method === "POST" &&
                    req.url === "/resync-modules"
                ) {
                    const body = await readJsonBody(req);

                    const result = await onResyncModules(body);

                    sendJson(res, 200, {
                        success: true,
                        ...result
                    });

                    return;
                }

                
                
                // =========================================
                // MODULTYPEN ABRUFEN
                // =========================================

                if (
                    req.method === "GET" &&
                    req.url === "/module-types"
                ) {
                    const result = await onGetModuleTypes();

                    sendJson(res, 200, {
                        success: true,
                        ...result
                    });

                    return;
                }

                // =========================================
                // NEUEN MODULTYP HINZUFÜGEN
                // =========================================

                if (
                    req.method === "POST" &&
                    req.url === "/module-types"
                ) {
                    // Vorläufig nur lokale Administration
                    const isLocal = [
                        "127.0.0.1",
                        "::1",
                        "::ffff:127.0.0.1"
                    ].includes(req.socket.remoteAddress);

                    if (!isLocal) {
                        sendJson(res, 403, {
                            success: false,
                            error:
                                "Modultypen dürfen derzeit nur lokal hinzugefügt werden."
                        });
                        return;
                    }

                    const body = await readJsonBody(req);

                    const result = await onAddModuleType(body);

                    sendJson(res, 200, {
                        success: true,
                        ...result
                    });

                    return;
                }


                // =========================================
                // VERBINDUNGSSTATUS ABFRAGEN
                // =========================================

                if (
                    req.method === "GET" &&
                    req.url === "/connection-status"
                ) {
                    const result =
                        await onGetConnectionStatus();

                    sendJson(res, 200, {
                        success: true,
                        ...result
                    });

                    return;
                }

                // =========================================
                // MAPLINK-VERBINDUNG KONFIGURIEREN
                // =========================================

                if (
                    req.method === "POST" &&
                    req.url === "/configure-covise"
                ) {
                    // Vorläufig nur lokale Administration.
                    const address =
                        req.socket.remoteAddress;

                    const isLocal = [
                        "127.0.0.1",
                        "::1",
                        "::ffff:127.0.0.1"
                    ].includes(address);

                    if (!isLocal) {
                        sendJson(res, 403, {
                            success: false,
                            error:
                                "Verbindungseinstellungen können derzeit nur lokal geändert werden."
                        });

                        return;
                    }

                    const body = await readJsonBody(req);

                    const result =
                        await onConfigureCovise(body);

                    sendJson(res, 200, {
                        success: true,
                        ...result
                    });

                    return;
                }




                if (req.method === "GET" &&
                    req.url === "/browser-events"
                ) {
                    if (!onGetBrowserEvents) {
                        throw new Error(
                            "Handler für /browser-events fehlt."
                        );
                    }

                    const result =
                        await onGetBrowserEvents();

                    sendJson(
                        res,
                        200,
                        {
                            success: true,
                            ...result
                        }
                    );

                    return;
                }

                
                if (
                    req.method === "POST" &&
                    req.url === "/get-map"
                ) {
                    if (!onGetMap) {
                        throw new Error(
                            "Handler für /get-map fehlt."
                        );
                    }

                    const body = await readJsonBody(req);

                    const pngBuffer = await onGetMap(body);

                    res.statusCode = 200;

                    res.setHeader(
                        "Access-Control-Allow-Origin",
                        "*"
                    );

                    res.setHeader(
                        "Content-Type",
                        "image/png"
                    );

                    res.setHeader(
                        "Cache-Control",
                        "no-store"
                    );

                    res.end(pngBuffer);

                    return;
                }


                if (
                    req.method === "POST" &&
                    req.url === "/set-roof"
                ) {
                    if (!onSetRoof) {
                        throw new Error(
                            "Handler für /set-roof fehlt."
                        );
                    }

                    const body =
                        await readJsonBody(req);

                    const result =
                        await onSetRoof(body);

                    sendJson(
                        res,
                        200,
                        {
                            success: true,
                            ...result
                        }
                    );

                    return;
                }

                if (
                    req.method === "POST" &&
                    req.url === "/update-roof-draft"
                ) {
                    if (!onUpdateRoofDraft) {
                        throw new Error(
                            "Handler für /update-roof-draft fehlt."
                        );
                    }

                    const body =
                        await readJsonBody(req);

                    const result =
                        await onUpdateRoofDraft(body);

                    sendJson(
                        res,
                        200,
                        {
                            success: true,
                            ...result
                        }
                    );

                    return;
                }

                if (
                    req.method === "POST" &&
                    req.url === "/finish-roof"
                ) {
                    if (!onFinishRoof) {
                        throw new Error(
                            "Handler für /finish-roof fehlt."
                        );
                    }

                    const body =
                        await readJsonBody(req);

                    const result =
                        await onFinishRoof(body);

                    sendJson(
                        res,
                        200,
                        {
                            success: true,
                            ...result
                        }
                    );

                    return;
                }

                if (
                    req.method === "POST" &&
                    req.url === "/cancel-roof"
                ) {
                    if (!onCancelRoof) {
                        throw new Error(
                            "Handler für /cancel-roof fehlt."
                        );
                    }

                    const body =
                        await readJsonBody(req);

                    const result =
                        await onCancelRoof(body);

                    sendJson(
                        res,
                        200,
                        {
                            success: true,
                            ...result
                        }
                    );

                    return;
                }

                if (
                    req.method === "POST" &&
                    req.url === "/load-project"
                ) {
                    if (!onLoadProject) {
                        throw new Error(
                            "Handler für /load-project fehlt."
                        );
                    }

                    const body =
                        await readJsonBody(req);

                    const result =
                        await onLoadProject(body);

                    sendJson(
                        res,
                        200,
                        {
                            success: true,
                            ...result
                        }
                    );

                    return;
                }

                if (
                    req.method === "POST" &&
                    req.url === "/delete-modules"
                ) {
                    if (!onDeleteModules) {
                        throw new Error(
                            "Handler für /delete-modules fehlt."
                        );
                    }

                    const body =
                        await readJsonBody(req);

                    const result =
                        await onDeleteModules(body);

                    sendJson(
                        res,
                        200,
                        {
                            success: true,
                            ...result
                        }
                    );

                    return;
                }

                if (
                    req.method === "POST" &&
                    req.url === "/clear-modules"
                ) {
                    if (!onClearModules) {
                        throw new Error(
                            "Handler für /clear-modules fehlt."
                        );
                    }

                    const body =
                        await readJsonBody(req);

                    const result =
                        await onClearModules(body);

                    sendJson(
                        res,
                        200,
                        {
                            success: true,
                            ...result
                        }
                    );

                    return;
                }

                sendJson(
                    res,
                    404,
                    {
                        success: false,
                        error: "Unbekannter Endpunkt."
                    }
                );

            } catch (error) {
                console.error(
                    "HTTP-Fehler:",
                    error.message
                );

                sendJson(
                    res,
                    400,
                    {
                        success: false,
                        error: error.message
                    }
                );
            }
        }
    );

    server.listen(
        port,
        () => {
            console.log(
                `HTTP-Server läuft auf Port ${port}`
            );
        }
    );

    return server;
}


// =========================================================
// EXPORT
// =========================================================

module.exports = {
    startHttpServer
};