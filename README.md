# 🌍 CraftOnDemand - Minecraft Server Auto-Starter

> 🛠️ Automatically starts your Pterodactyl-hosted Minecraft server when a player attempts to join.

---

## 🚀 What is CraftOnDemand?

**CraftOnDemand** is a lightweight Node.js application designed to monitor connection attempts to your Minecraft server. If the server (hosted on Pterodactyl Panel) is offline, CraftOnDemand will automatically send a start-up command via the Pterodactyl API. This is ideal for saving server resources by keeping the server off during idle periods, whilst still providing on-demand availability for players.

The script acts as a proxy listener:
*   It listens for Minecraft client pings (server list refresh) and actual join attempts on a specified port.
*   When a player pings, it shows the real server status if running, or a custom message if offline/starting.
*   When a player attempts to join an offline or unresponsive server, it triggers the Pterodactyl API to start the server and informs the player to try again shortly.
*   If the server is already running, it informs the player to connect directly to the game server's address.

---

## ✨ Key Features

-   **Automatic Server Start-up**: Initiates server boot on Pterodactyl when a player tries to connect to an offline server.
-   **Pterodactyl API Integration**: Securely interacts with your Pterodactyl panel using an API key.
-   **Dynamic Server List Messages (MOTD)**: Provides players with real-time status information (e.g., "Offline, join to start!", "Starting...", "Unresponsive, join to restart").
-   **Resource Efficient**: Helps save server resources by only running your Minecraft server when needed.
-   **Configurable**: Uses a simple `.env` file for all settings.
-   **Informative Logging**: Outputs status and actions to the console for monitoring.
-   **Zombie Process Detection**: Attempts to identify and restart servers that are marked as 'running' in Pterodactyl but are unresponsive.

---

## ⚙️ How It Works - The Technical Bit

1.  **Listening**: CraftOnDemand listens on a designated port (e.g., `25565`) for Minecraft client pings (server list) and login attempts.
2.  **Status Check**:
    *   **On Ping**: It queries the Pterodactyl API for the server's current state.
        *   If `running`, it pings your actual Minecraft server and relays its status. If the actual server is unresponsive, it displays a "Server is unresponsive" message.
        *   If `offline`, `starting`, or `stopping`, it provides a relevant message in the server list.
    *   **On Login Attempt**: It again checks the Pterodactyl API.
3.  **Action Triggered**:
    *   If the server is `offline`, or `running` but unresponsive (a "zombie" process), CraftOnDemand sends a "start" command to the Pterodactyl API. The connecting player is then disconnected with a message asking them to refresh and try again in a moment.
    *   If the server is already `running` and responsive, the player is disconnected with a message providing the direct IP/hostname and port of the actual Minecraft server.
    *   If the server is already in the process of `starting` or `stopping`, the player is informed and asked to wait.
4.  **User Notification**: Players receive messages in their Minecraft client (either in the server list or as a disconnect message) about the server's status and actions being taken.

---

## 📦 Installation and Setup

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/your-username/CraftOnDemand.git # Replace with the actual repository URL
    cd CraftOnDemand
    ```

2.  **Install Dependencies**:
    Requires Node.js (preferably a recent LTS version).
    ```bash
    npm install
    ```

3.  **Configure Environment Variables**:
    Copy the example environment file:
    *   On Linux/macOS: `cp .env.example .env`
    *   On Windows (Command Prompt): `copy .env.example .env`
    *   On Windows (PowerShell): `Copy-Item .env.example .env`

    Now, edit the newly created `.env` file with your specific Pterodactyl and server details. Refer to the [`.env.example`](#example-env-file) section for detailed explanations of each variable. **Important**: Ensure this script is run on a machine that can reach both your Pterodactyl panel and your Minecraft game server over the network.

4.  **Run the Application**:
    ```bash
    node index.js
    ```
    It's recommended to run this script using a process manager like PM2 or within a screen/tmux session for continuous operation.

---

## 🔐 Requirements

-   A Minecraft server hosted on a Pterodactyl panel.
-   Access to create a Pterodactyl Client API key with permissions to:
    *   Read server status/resources (`GET /api/client/servers/{server_id}/resources`)
    *   Control server power state (`POST /api/client/servers/{server_id}/power`)
-   The server should typically be `offline` when not in use to benefit from this script.
-   Your hosting environment must allow outbound API requests from where this script is run to your Pterodactyl panel.
-   Node.js installed on the system where CraftOnDemand will run.

---

## 📜 Example `.env` File

Ensure you replace the placeholder values with your actual details.

```ini
# .env

# Port for CraftOnDemand to listen on for Minecraft client pings and join attempts.
# This is the port players will add to their Minecraft server list.
# Default Minecraft port is 25565.
LISTEN_PORT=25565

# --- Pterodactyl Panel API Details ---

# Full URL of your Pterodactyl panel (e.g., https://panel.yourhost.com).
# Do NOT include a trailing slash.
PTERO_HOST=https://panel.example.com

# Pterodactyl Client API Key.
# Generate this from your Pterodactyl panel under "Account API" or "Application API"
# It needs permissions to view server status and send power commands (start).
PTERO_API_KEY=YOUR_PTERODACTYL_CLIENT_API_KEY_HERE

# Full UUID of your Minecraft server on Pterodactyl.
# This is NOT the short 8-character ID. You can find it in the URL when viewing your server
# (e.g., https://panel.example.com/server/12345678-90ab-cdef-1234-567890abcdef).
PTERO_SERVER_ID=YOUR_FULL_PTERODACTYL_SERVER_UUID

# --- Actual Minecraft Server Details ---
# These details are used by CraftOnDemand to:
# 1. Ping your actual server when Pterodactyl reports it as 'running' to get live player counts/MOTD.
# 2. Tell players where to connect once the server is confirmed to be online.

# Hostname or IP address of your actual Minecraft game server.
# If CraftOnDemand runs on the same machine as your Pterodactyl daemon (Wings) AND your game server,
# '127.0.0.1' might be appropriate. Otherwise, use its public or private IP as reachable by this script.
MINECRAFT_SERVER_HOST=your.minecraft.server.ip.or.hostname

# Port your actual Minecraft game server runs on.
# This is the port defined in your Minecraft server's server.properties and Pterodactyl server allocation.
MINECRAFT_SERVER_PORT=25566

# --- Minecraft Server Online Mode ---
# This setting informs the proxy about the authentication mode of your backend Minecraft server.
# The CraftOnDemand proxy itself always operates in an 'offline-mode' fashion to intercept initial connections.
# This variable is currently for informational purposes within the script but could be used for future enhancements
# (e.g. if the proxy were to handle full player session forwarding).
# Set to 'true' if your Minecraft server's server.properties has online-mode=true (premium/paid accounts only).
# Set to 'false' if your Minecraft server's server.properties has online-mode=false (cracked/offline accounts allowed).
MINECRAFT_SERVER_ONLINE_MODE=true
```

---

## 🧪 Testing

1.  Ensure your Minecraft server is **offline** in the Pterodactyl panel.
2.  Start CraftOnDemand: `node index.js`.
3.  In your Minecraft client, add a server with the IP/hostname of where CraftOnDemand is running and the `LISTEN_PORT` (e.g., `your.craftondemand.host:25565`).
4.  Refresh your server list. You should see the "Server is Offline. Join to start it!" message (or similar).
5.  Attempt to join the server.
    *   CraftOnDemand should detect the join attempt and log that it's starting the server.
    *   You should be disconnected with a message like "Server is starting up! Please refresh...".
    *   Check your Pterodactyl panel; the server should now be starting.
6.  Wait a minute or two for the server to fully boot.
7.  Refresh your server list in Minecraft. You should now see the actual server's MOTD, player count, etc.
8.  Attempt to join again. You should be disconnected with a message like "The server is now online! Please connect directly to: your.minecraft.server.ip.or.hostname:25566".
9.  Connect to your actual Minecraft server using its direct address (`MINECRAFT_SERVER_HOST`:`MINECRAFT_SERVER_PORT`).

---

## 💡 Potential Future Enhancements

-   **Web Interface**: A simple web page for basic monitoring or status.
-   **Discord Notifications**: Send alerts to a Discord channel when the server starts or stops.
-   **Automatic Shutdown**: Option to signal the server to stop after a configurable period of inactivity (would require more complex player tracking or log parsing).
-   **Multiple Server Support**: Manage several servers with one CraftOnDemand instance.
-   **Graceful Shutdown Commands**: Option to use Pterodactyl's "send command" feature to issue a `stop` or `save-all` command before powering off (for servers that benefit from this).

---

## 📜 Licence

This project is licensed under the **GNU General Public License v3.0**.
You are free to use, modify, and distribute this software under the terms of that licence.

For the full licence text, please see the `LICENSE` file in this repository or visit [www.gnu.org/licenses/gpl-3.0.html](https://www.gnu.org/licenses/gpl-3.0.html).

---

## 💬 Feedback and Contributions

Encountered a bug? Have an idea for a new feature? We'd love to hear from you!
Please [open an issue](https://github.com/Angel-Informatico/CraftOnDemand/issues) on GitHub.
Contributions via pull requests are also welcome!

---
Made with ❤️ by Ángel Dev. Adapted and enhanced by AI.
```
