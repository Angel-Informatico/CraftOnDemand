# 🌍 CraftOnDemand

> 🛠️ Automatically start your Pterodactyl-hosted Minecraft server when a player tries to join.

---

## 🚀 What is CraftOnDemand?

**CraftOnDemand** is a Node.js-based utility designed to automatically start your **Pterodactyl-hosted Minecraft server** whenever a player pings or tries to connect. Ideal for saving resources while still providing on-demand availability!

---

## ✨ Features

- 🕹️ Auto-start Minecraft servers hosted on **Pterodactyl**
- 🔐 Uses Pterodactyl’s API securely with a token
- ⏱️ Lightweight and fast response times
- 🌿 Environment-based configuration via `.env`
- 💬 Console logs and status feedback

---

## 📦 Installation

1. Clone this repository:
<br><code>git clone https://github.com/yourusername/CraftOnDemand.git</code>
<br><code>cd CraftOnDemand</code>

2. Install dependencies:
<br><code>npm install</code>

3. Create a `.env` file based on the example:
<br>**Linux/MacOS:** <code>cp .env.example .env</code>
<br>**Windows (CMD):** <code>copy .env.example .env</code>
<br>**Windows (PowerShell):** <code>Copy-Item .env.example .env</code>

4. Edit your `.env` with the correct values for your server.

---

## ⚙️ How it Works

1. A player attempts to join your Minecraft server.
2. CraftOnDemand listens on the default Minecraft port (`25565`).
3. It checks the server status via Pterodactyl’s API.
4. If the server is offline, it sends a power action to start it.
5. It waits until the server is ready, then lets the player connect.

---

## 🔐 Requirements

- A Minecraft server hosted on a **Pterodactyl panel**
- An API key with permission to **start servers**
- The server must be **offline or suspended** when idle
- Your hosting provider must allow **API-based actions**

---

## 📜 Example `.env`
<code>LISTEN_PORT=25565
PTERO_HOST=https://panel.yourhost.com
PTERO_API_KEY=XXXXXXXXXXXXXXXXXXXXXXXXXXXX
PTERO_SERVER_ID=12345678-90ab-cdef-1234-567890abcdef
PING_TIMEOUT=15000
MAX_ATTEMPTS=5
</code>

---

## 🧪 Testing

Start the app: <code>node index.js</code>

Then try to enter your Minecraft server from the client, it should auto-start if it's offline.

---

## 🧠 Future Ideas

- Web UI for server monitoring 📈  
- Discord webhook notifications 🤖  
- Auto-shutdown after inactivity 🔌  
- Multiple server support 🧵

---

## 📜 License

This project is licensed under the **GNU General Public License v3.0**.  
You are free to use, modify, and distribute this software under the terms of that license.

See `LICENSE` or visit [gnu.org/licenses/gpl-3.0](https://www.gnu.org/licenses/gpl-3.0.html) for more details.

---

## 💬 Feedback

Issues, feature requests, or ideas? [Open an issue](https://github.com/Angel-Informatico/CraftOnDemand/issues) or contribute directly.  
Made with ❤️ by Ángel Dev
