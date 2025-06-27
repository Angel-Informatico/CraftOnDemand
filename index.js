require('dotenv').config();
const mc = require('minecraft-protocol');
const axios = require('axios');

// --- Configuration and Validation ---
const {
    LISTEN_PORT,
    PTERO_HOST,
    PTERO_API_KEY,
    PTERO_SERVER_ID,
    MINECRAFT_SERVER_HOST,
    MINECRAFT_SERVER_PORT
} = process.env;

// Parse the online-mode setting from .env, defaulting to true (premium mode).
// This specific variable (IS_ONLINE_MODE) is not actively used in the current proxy logic
// for packet forwarding, but is kept for potential future use or if the real server's
// online-mode status needs to be known by the proxy. The proxy itself operates in 'offline-mode'.
const IS_ONLINE_MODE = (process.env.MINECRAFT_SERVER_ONLINE_MODE || 'true') === 'true';

const requiredVars = ['LISTEN_PORT', 'PTERO_HOST', 'PTERO_API_KEY', 'PTERO_SERVER_ID', 'MINECRAFT_SERVER_HOST', 'MINECRAFT_SERVER_PORT'];

for (const v of requiredVars) {
    if (!process.env[v]) {
        console.error(`[Error] Missing required environment variable: ${v}. Please check your .env file.`);
        process.exit(1);
    }
}

// --- Pterodactyl API Client ---
const pteroClient = axios.create({
    baseURL: PTERO_HOST,
    headers: {
        'Authorization': `Bearer ${PTERO_API_KEY}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }
});

/**
 * Fetches the current status of the Minecraft server from Pterodactyl.
 * @returns {Promise<string>} The server state (e.g., 'running', 'offline', 'starting').
 */
async function getServerStatus() {
    try {
        const response = await pteroClient.get(`/api/client/servers/${PTERO_SERVER_ID}/resources`);
        return response.data.attributes.current_state;
    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error(`[Pterodactyl] Error fetching server status: ${errorMessage}`);
        return 'error'; // Indicates an issue fetching status
    }
}

/**
 * Sends a 'start' signal to the Minecraft server via the Pterodactyl API.
 * @returns {Promise<boolean>} True if the command was sent successfully, false otherwise.
 */
async function startServer() {
    try {
        await pteroClient.post(`/api/client/servers/${PTERO_SERVER_ID}/power`, { signal: 'start' });
        console.log(`[Pterodactyl] Start command sent successfully to server ${PTERO_SERVER_ID}.`);
        return true;
    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error(`[Pterodactyl] Error sending start command to server ${PTERO_SERVER_ID}: ${errorMessage}`);
        return false;
    }
}

// A flag to prevent multiple start commands if several players attempt to join simultaneously.
let isStarting = false;
let startTime = null; // Tracks when the server began its start-up sequence.

// --- Minecraft Proxy Server ---
const server = mc.createServer({
    'online-mode': false, // The proxy operates in offline mode to handle initial connections.
    encryption: false,    // Encryption is typically handled by the backend Minecraft server.
    host: '0.0.0.0',      // Listen on all available network interfaces.
    port: parseInt(LISTEN_PORT),
    version: false,       // Allow clients of any Minecraft version to ping (useful with ViaVersion on backend).
});

console.log(`[Proxy] CraftOnDemand proxy listening for Minecraft connections on port ${LISTEN_PORT}.`);

server.on('status', async (client) => {
    const pteroStatus = await getServerStatus();
    let serverListResponse = {
        version: { name: 'CraftOnDemand', protocol: client.protocolVersion }, // Use client's protocol
        players: { max: 20, online: 0, sample: [] }, // Default values
        description: { text: 'Pinging server...' }    // Default description
    };

    if (pteroStatus === 'running') {
        try {
            // Ping the actual Minecraft server to get its current status.
            const realStatus = await mc.ping({
                host: MINECRAFT_SERVER_HOST,
                port: parseInt(MINECRAFT_SERVER_PORT),
                timeout: 2500 // Short timeout for quick check.
            });
            serverListResponse = realStatus; // Use the real server's response.
            isStarting = false; // Reset starting flag if server is confirmed running.
            startTime = null;   // Clear start time.
        } catch (pingError) {
            // The server is reported as 'running' by Pterodactyl but is not responding to pings.
            serverListResponse.description.text = '§cServer is unresponsive.\n§eJoin to attempt a restart.';
            console.warn(`[Proxy] Server ${PTERO_SERVER_ID} is 'running' but unresponsive to ping at ${MINECRAFT_SERVER_HOST}:${MINECRAFT_SERVER_PORT}.`);
        }
    } else if (pteroStatus === 'starting') {
        const minutesStarting = startTime ? Math.floor((Date.now() - startTime) / (1000 * 60)) : 0;
        serverListResponse.description.text = `§6Server is starting...\n§7Nearly there! (Started ${minutesStarting} min ago)`;
    } else if (pteroStatus === 'stopping') {
        serverListResponse.description.text = '§cServer is stopping...\n§7Please wait a moment before trying again.';
    } else if (pteroStatus === 'offline') {
        serverListResponse.description.text = '§aServer is Offline.\n§eJoin to start it!';
    } else { // Includes 'error' or any other unexpected state
        serverListResponse.description.text = '§cServer status is unknown or an error occurred.\n§7Please try again shortly.';
        console.error(`[Proxy] Pterodactyl server status for ${PTERO_SERVER_ID} is: ${pteroStatus}.`);
    }

    client.write('server_info', serverListResponse);
});

// Correctly respond to the client's ping packet to prevent network protocol errors during server list refresh.
server.on('ping', (client, packet) => {
    client.write('pong', { payload: packet.payload });
});

// This event is triggered when a client attempts a full login to the proxy.
server.on('login', async (client) => {
    const clientAddress = client.socket.remoteAddress;
    const clientPort = client.socket.remotePort;
    console.log(`[Proxy] Login attempt from ${clientAddress}:${clientPort} (username: ${client.username}, version: ${client.protocolVersion}).`);

    const pteroStatus = await getServerStatus();
    console.log(`[Pterodactyl] Server ${PTERO_SERVER_ID} status is: ${pteroStatus}.`);

    // Determine the effective operational status of the server.
    let isEffectivelyRunning = false;
    if (pteroStatus === 'running') {
        try {
            // A quick ping can help detect if the server process is alive but unresponsive (zombie).
            await mc.ping({ host: MINECRAFT_SERVER_HOST, port: parseInt(MINECRAFT_SERVER_PORT), timeout: 2500 });
            isEffectivelyRunning = true;
            startTime = null; // Clear start time if server is running.
        } catch (e) {
            console.warn(`[Proxy] Server ${PTERO_SERVER_ID} reported as 'running' by Pterodactyl, but is unresponsive. Treating as offline to trigger a start/restart.`);
            isEffectivelyRunning = false; // Treat as offline to allow a start attempt.
        }
    }

    // --- Act based on the effective server status ---

    if (isEffectivelyRunning) {
        // The server is running; instruct the user to connect directly.
        const connectTo = `${MINECRAFT_SERVER_HOST}:${MINECRAFT_SERVER_PORT}`;
        const message = { text: `§aThe server is now online!\n§ePlease connect directly to: ${connectTo}` };
        client.end(JSON.stringify(message));
        console.log(`[Proxy] Instructed ${client.username} to connect directly to ${connectTo}.`);
        return;
    }

    // --- Handle server start logic if it's not effectively running ---
    // This includes 'offline' or 'running' (but unresponsive/zombie).
    if (pteroStatus === 'offline' || (pteroStatus === 'running' && !isEffectivelyRunning)) {
        if (!isStarting) {
            isStarting = true;
            startTime = Date.now(); // Record the time the start sequence was initiated.
            console.log(`[Proxy] Server ${PTERO_SERVER_ID} is ${pteroStatus === 'offline' ? 'offline' : 'unresponsive'}. Attempting to start it now due to login from ${client.username}.`);

            const startSuccessful = await startServer();
            let messageText;

            if (startSuccessful) {
                messageText = pteroStatus === 'running' // Was unresponsive
                    ? '§cThe server was unresponsive. §eA restart has been triggered. Please refresh and try joining again in a moment.'
                    : '§eThe server is starting up! §aPlease refresh your server list and try joining again in a moment.';
            } else {
                messageText = '§cCould not send start command to the server. §7Please try again later or contact an administrator.';
                isStarting = false; // Reset flag as start command failed.
                startTime = null;
            }
            client.end(JSON.stringify({ text: messageText }));

            // Reset the 'isStarting' flag after a delay to allow the server time to boot
            // and prevent immediate subsequent start attempts if the first one is slow or fails silently.
            // This timeout should ideally be configurable or smarter.
            if(startSuccessful) {
                setTimeout(() => {
                    isStarting = false;
                    // We don't clear startTime here, as the server might still be in its 'starting' phase.
                    // startTime is cleared when the server is confirmed 'running' or if a new start is initiated.
                    console.log(`[Proxy] 'isStarting' flag automatically reset for server ${PTERO_SERVER_ID}.`);
                }, 30000); // 30 seconds
            }
        } else {
            // Server is already in the process of starting.
            const minutesStarting = startTime ? Math.floor((Date.now() - startTime) / (1000 * 60)) : 0;
            client.end(JSON.stringify({ text: `§6The server is already starting up! §7Please wait. (Attempt initiated ${minutesStarting} min ago)` }));
        }
        return;
    }

    // Handle other Pterodactyl states like 'starting', 'stopping', or 'error'.
    let disconnectMessageObject = { text: '§cThe server is currently unavailable. Please try again shortly.' }; // Default message
    if (pteroStatus === 'starting') {
        const minutesStarting = startTime ? Math.floor((Date.now() - startTime) / (1000 * 60)) : 0;
        disconnectMessageObject = { text: `§6The server is currently starting up! §7Please wait. (Started ${minutesStarting} min ago)` };
    } else if (pteroStatus === 'stopping') {
        disconnectMessageObject = { text: '§cThe server is currently stopping. §7Please wait a moment before trying to connect again.' };
    } else if (pteroStatus === 'error') {
        disconnectMessageObject = { text: '§cThere was an error retrieving the server status from the panel.\n§7Please try again later or contact an administrator.' };
    }

    console.log(`[Proxy] Disconnecting ${client.username} from ${clientAddress}:${clientPort}. Server ${PTERO_SERVER_ID} is ${pteroStatus}.`);
    client.end(JSON.stringify(disconnectMessageObject));
});

server.on('error', (error) => {
    console.error('[Proxy] An error occurred in the proxy server:', error);
});

server.on('listening', () => {
    console.log(`[Proxy] Proxy server is now fully operational and listening on port ${LISTEN_PORT}.`);
});