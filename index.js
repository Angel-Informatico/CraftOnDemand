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

// --- Minecraft Ping Listener ---
const server = mc.createServer({
    'online-mode': false,
    encryption: false,
    host: '0.0.0.0',
    port: parseInt(LISTEN_PORT),
    version: '1.20.1', // Use a common version for broad compatibility.
    motd: 'CraftOnDemand Proxy'
});

console.log(`[CraftOnDemand] Listening for Minecraft pings on port ${LISTEN_PORT}...`);

server.on('login', async (client) => {
    console.log(`[Server] Ping received from ${client.socket.remoteAddress}`);

    const status = await getServerStatus();
    console.log(`[Pterodactyl] Server status is: ${status}`);

    let response = {
        version: { name: 'CraftOnDemand', protocol: client.protocolVersion },
        players: { max: 20, online: 0, sample: [] },
        description: { text: 'Pinging server...' }
    };

    switch (status) {
        case 'offline':
            if (!isStarting) {
                isStarting = true;
                console.log('[Server] Server is offline. Attempting to start...');
                await startServer();
                response.description.text = '§eServer is starting up!\n§7Please refresh in a moment.';
                // Reset the flag after a cooldown to allow another start attempt if it fails.
                setTimeout(() => { isStarting = false; }, 30000); // 30-second cooldown.
            } else {
                console.log('[Server] Start command already sent recently. Waiting...');
                response.description.text = '§6Server is starting up!\n§7Please wait...';
            }
            break;

        case 'starting':
            isStarting = true; // Ensure flag is set if we catch it in this state.
            response.description.text = '§6Server is starting...\n§7Almost there!';
            break;

        case 'stopping':
            response.description.text = '§cServer is stopping...\n§7Please wait before trying again.';
            break;

        case 'running':
            isStarting = false; // Server is running, so reset the flag.
            console.log(`[Server] Server is running. Forwarding ping to ${MINECRAFT_SERVER_HOST}:${MINECRAFT_SERVER_PORT}`);
            try {
                const realStatus = await mc.ping({ host: MINECRAFT_SERVER_HOST, port: parseInt(MINECRAFT_SERVER_PORT) });
                response.version.name = realStatus.version.name;
                response.players = realStatus.players;
                response.description = realStatus.description;
                if (realStatus.favicon) response.favicon = realStatus.favicon;
            } catch (pingError) {
                console.error(`[Server] Could not ping the real Minecraft server: ${pingError.message}`);
                response.description.text = '§aServer is online!§r\n§cProxy could not get status.';
            }
            break;

        case 'error':
            response.description.text = '§cError communicating with Pterodactyl API.\n§7Please contact an administrator.';
            break;

        default:
            response.description.text = `§7Unknown server state: ${status}\n§7Please contact an administrator.`;
            break;
    }

    client.end(JSON.stringify(response));
});

server.on('error', (error) => console.error('[Server] An error occurred:', error));
server.on('listening', () => console.log('[Server] Minecraft listener is fully operational.'));