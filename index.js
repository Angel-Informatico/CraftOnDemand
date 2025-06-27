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

// Parse the online-mode setting from .env, defaulting to true (premium mode)
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
        return 'error';
    }
}

/**
 * Sends a 'start' signal to the Minecraft server via the Pterodactyl API.
 * @returns {Promise<boolean>} True if the command was sent successfully, false otherwise.
 */
async function startServer() {
    try {
        await pteroClient.post(`/api/client/servers/${PTERO_SERVER_ID}/power`, { signal: 'start' });
        console.log(`[Pterodactyl] Start command sent successfully.`);
        return true;
    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error(`[Pterodactyl] Error sending start command: ${errorMessage}`);
        return false;
    }
}

// A flag to prevent spamming the start command if multiple players ping at once.
let isStarting = false;
let startTime = null; // Tracks when the server started attempting to boot.

// --- Minecraft Ping Listener ---
const server = mc.createServer({
    'online-mode': false, // This is for the proxy itself, not the connection to the real server
    encryption: false,
    host: '0.0.0.0',
    port: parseInt(LISTEN_PORT),
    version: false, // Allow players from any Minecraft version to join (ViaVersion compatibility)
});

console.log(`[CraftOnDemand] Listening for Minecraft pings on port ${LISTEN_PORT}...`);

server.on('status', async (client) => {
    const pteroStatus = await getServerStatus();
    let response = {
        version: { name: 'CraftOnDemand', protocol: client.protocolVersion },
        players: { max: 20, online: 0, sample: [] },
        description: { text: 'Pinging server...' }
    };

    if (pteroStatus === 'running') {
        try {
            const realStatus = await mc.ping({ host: MINECRAFT_SERVER_HOST, port: parseInt(MINECRAFT_SERVER_PORT), timeout: 2500 });
            response = realStatus;
            isStarting = false;
        } catch (pingError) {
            response.description.text = '§cServer is unresponsive\n§eJoin to attempt a restart';
        }
    } else if (pteroStatus === 'starting') {
        const minutesStarting = startTime ? Math.floor((Date.now() - startTime) / (1000 * 60)) : 0;
        response.description.text = `§6Server is starting...\n§7Almost there! (Started ${minutesStarting} min ago)`;
    } else if (pteroStatus === 'stopping') {
        response.description.text = '§cServer is stopping...\n§7Please wait before trying again.';
    } else {
        response.description.text = '§aServer is Offline\n§eJoin to start it!';
    }

    client.write('server_info', response);
});

// Responde correctamente al paquete de ping del cliente para evitar el error de protocolo de red
server.on('ping', (client, packet) => {
    client.write('pong', { payload: packet.payload });
});

// This event is fired when a client attempts to fully log in
server.on('login', async (client) => {
    const clientAddress = client.socket.remoteAddress;
    const clientPort = client.socket.remotePort;
    console.log(`[Server] Login attempt from ${clientAddress}:${clientPort} (username: ${client.username}, version: ${client.protocolVersion})`);

    const pteroStatus = await getServerStatus();
    console.log(`[Pterodactyl] Server status is: ${pteroStatus}`);

    // Determine the effective status of the server
    let isEffectivelyRunning = false;
    if (pteroStatus === 'running') {
        try {
            // A quick ping is enough to check for a completely dead process.
            await mc.ping({ host: MINECRAFT_SERVER_HOST, port: parseInt(MINECRAFT_SERVER_PORT), timeout: 2500 });
            isEffectivelyRunning = true;
        } catch (e) {
            console.log('[Server] Server is unresponsive (zombie). Treating as offline to trigger a start.');
            isEffectivelyRunning = false;
        }
    }

    // --- Act based on the effective status ---

    if (isEffectivelyRunning) {
        // El servidor está encendido, avisamos al usuario que debe conectarse directamente
        client.end({ text: '§a¡El servidor ya está encendido!\n§eConéctate directamente a: emerald.magmanode.com:31435' });
        return;
    }

    // --- Handle server start logic if not running ---
    if (pteroStatus === 'offline' || pteroStatus === 'running' /* and is a zombie */) {
        if (!isStarting) {
            isStarting = true;
            startTime = Date.now();
            console.log('[Server] Server is offline/unresponsive. Starting now due to login attempt...');
            await startServer();
            const message = pteroStatus === 'running'
                ? { text: '§cServer was unresponsive. §eA restart has been triggered. Please join again in a moment.' }
                : { text: '§eServer is starting up! §aPlease refresh and join again in a moment.' };
            client.end(message);
            setTimeout(() => { isStarting = false; }, 30000);
        } else {
            client.end({ text: '§6Server is already starting! §7Please wait...' });
        }
        return;
    }

    // Handle other states like 'starting', 'stopping', 'error'
    let disconnectMessage = { text: '§cThe server is currently unavailable.' };
    if (pteroStatus === 'starting') {
        const minutesStarting = startTime ? Math.floor((Date.now() - startTime) / (1000 * 60)) : 0;
        disconnectMessage = { text: `§6Server is starting up! Please wait. (Started ${minutesStarting} min ago)` };
    } else if (pteroStatus === 'stopping') {
        disconnectMessage = { text: '§cServer is stopping. Please wait before trying again.' };
    } else if (pteroStatus === 'error') {
        disconnectMessage = { text: '§cError communicating with Pterodactyl API.\n§7Please contact an administrator.' };
    }
    console.log(`[Server] Disconnecting ${clientAddress}:${clientPort}. Server is ${pteroStatus}.`);
    client.end(disconnectMessage);
});

server.on('error', (error) => console.error('[Server] An error occurred:', error));
server.on('listening', () => console.log('[Server] Minecraft listener is fully operational.'));