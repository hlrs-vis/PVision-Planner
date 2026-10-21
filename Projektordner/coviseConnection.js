// =========================================================
// COVISE TCP-VERBINDUNG
// =========================================================

const net = require("net");
const EventEmitter = require("events");

const {
    extractCoviseMessages
} = require("./coviseProtocol");


class CoviseConnection extends EventEmitter {

    constructor({
        host,
        port,
        reconnectMs = 2000
    }) {
        super();

        this.host = host;
        this.port = port;
        this.reconnectMs = reconnectMs;

        this.socket = null;
        this.reconnectTimer = null;
        this.receiveBuffer = Buffer.alloc(0);

        this.handshakeComplete = false;
        this.intentionallyClosed = false;
    }


    // =====================================================
    // VERBINDUNG AUFBAUEN
    // =====================================================

    connect() {
        if (this.socket && !this.socket.destroyed) {
            return;
        }

        console.log("Versuche Verbindung zu COVISE...");

        this.intentionallyClosed = false;
        this.handshakeComplete = false;
        this.receiveBuffer = Buffer.alloc(0);

        this.socket = new net.Socket();

        this.socket.connect(
            this.port,
            this.host,
            () => {
                console.log("Mit COVISE Raw Socket verbunden");
            }
        );

        this.socket.on("data", data => {
            this.handleIncomingData(data);
        });

        this.socket.on("error", error => {
            console.error(
                "COVISE Fehler:",
                error.message
            );

            this.emit(
                "connectionError",
                error
            );
        });

        this.socket.on("close", () => {
            console.log("COVISE Verbindung geschlossen");

            this.handshakeComplete = false;
            this.socket = null;

            this.emit("close");

            if (!this.intentionallyClosed) {
                this.scheduleReconnect();
            }
        });
    }


    // =====================================================
    // HANDSHAKE + DATENEMPFANG
    // =====================================================

    handleIncomingData(data) {
        if (!this.handshakeComplete) {
            if (data.length === 0) {
                return;
            }

            const dataFormat = data.readUInt8(0);

            console.log(
                "Datenformat:",
                dataFormat
            );

            const response = Buffer.alloc(1);
            response.writeUInt8(1, 0);

            this.socket.write(response);

            this.handshakeComplete = true;

            console.log(
                "COVISE Handshake abgeschlossen"
            );

            this.emit("ready");

            // Falls im selben TCP-Paket hinter dem
            // Handshake bereits normale Daten stehen.
            if (data.length > 1) {
                const remaining = data.subarray(1);
                this.processData(remaining);
            }

            return;
        }

        this.processData(data);
    }


    // =====================================================
    // NORMALE COVISE-DATEN
    // =====================================================

    processData(data) {
        this.receiveBuffer = Buffer.concat([
            this.receiveBuffer,
            data
        ]);

        const result = extractCoviseMessages(
            this.receiveBuffer
        );

        this.receiveBuffer = result.remainingBuffer;

        for (const message of result.messages) {
            this.emit(
                "message",
                message
            );
        }
    }


    // =====================================================
    // NACHRICHT SENDEN
    // =====================================================

    send(message) {
        if (
            !this.socket ||
            this.socket.destroyed ||
            !this.handshakeComplete
        ) {
            throw new Error(
                "Keine aktive COVISE-Verbindung."
            );
        }

        this.socket.write(message);
    }


    // =====================================================
    // RECONNECT
    // =====================================================

    scheduleReconnect() {
        if (this.reconnectTimer) {
            return;
        }

        console.log(
            `Neuer Verbindungsversuch in ${this.reconnectMs} ms`
        );

        this.reconnectTimer = setTimeout(
            () => {
                this.reconnectTimer = null;
                this.connect();
            },
            this.reconnectMs
        );
    }


    // =====================================================
    // VERBINDUNG BEENDEN
    // =====================================================

    close() {
        this.intentionallyClosed = true;

        if (this.reconnectTimer) {
            clearTimeout(
                this.reconnectTimer
            );

            this.reconnectTimer = null;
        }

        if (
            this.socket &&
            !this.socket.destroyed
        ) {
            this.socket.destroy();
        }
    }
}


// =========================================================
// EXPORT
// =========================================================

module.exports = {
    CoviseConnection
};