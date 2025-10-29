const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const os = require("os");
const axios = require("axios");
const printer = require("pdf-to-printer");
const Redis = require("ioredis");

const { execSync } = require("child_process");

let app;
let server;
let subscriber;
let heartbeatInterval = null; // ❤️ added
let lastMessageTime = Date.now(); // Track when we last got a Redis message

const PORT = 3005;
const CHANNEL = "orders-147";

const LOG_DIR = path.join(__dirname, "logs");
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 🧹 Cleanup old logs (keep last 7 days)
fs.readdirSync(LOG_DIR)
  .filter(file => {
    const datePart = file.replace(".log", "");
    const fileDate = new Date(datePart);
    const ageDays = (Date.now() - fileDate.getTime()) / (1000 * 60 * 60 * 24);
    return ageDays > 7;
  })
  .forEach(oldFile => {
    try {
      fs.unlinkSync(path.join(LOG_DIR, oldFile));
      console.log(`🧹 Deleted old log file: ${oldFile}`);
    } catch (err) {
      console.error(`⚠️ Failed to delete old log ${oldFile}: ${err.message}`);
    }
  });

function logTime() {
  return new Date().toISOString().replace("T", " ").split(".")[0];
}

function log(msg, icon = "ℹ️") {
  const timestamp = `[${logTime()}]`;
  const line = `${icon} ${timestamp} ${msg}`;
  console.log(line);

  try {
    const logFile = path.join(LOG_DIR, `${new Date().toISOString().split("T")[0]}.log`);
    fs.appendFileSync(logFile, line + "\n", "utf8");
  } catch (err) {
    console.error("❌ Failed to write log file:", err.message);
  }
}

function killPreviousInstance() {
  try { 
    log("[check 1] Checking for existing instances...", "🔍");

    const tasks = execSync(`wmic process where "name='node.exe'" get ProcessId,CommandLine`, { encoding: "utf8" });

    const lines = tasks.split("\n").filter(line => line.includes("thermal.js"));
    if (lines.length > 0) {
      for (const line of lines) {
        const match = line.match(/(\d+)\s*$/); // extract PID at end of line
        if (match) {
          const pid = match[1];
          log(`Found old instance with PID ${pid}. Killing... 💀`);
          try {
            process.kill(pid, "SIGTERM");
          } catch {
            exec(`taskkill /PID ${pid} /F`);
          }
          log(`Killed previous instance PID ${pid}`, "✅");
        }
      }
    } else {
      log("No previous instances found.", "✨");
    }
  } catch (err) {
    log(`Error checking/killing previous instances: ${err.message}`, "❌");
  }

  try {
    log("[check 2] Checking for existing instances...", "🔍");
    const scriptName = path.basename(__filename).toLowerCase();
    const currentPid = process.pid;

    // Grab every node.exe with its command line
    const output = execSync(`wmic process where "name='node.exe'" get ProcessId,CommandLine /VALUE`, {
      stdio: ["pipe", "pipe", "ignore"],
      encoding: "utf8"
    });

    const processes = output
      .split(/\n\n+/)
      .map(block => {
        const cmdMatch = block.match(/CommandLine=(.*)/i);
        const pidMatch = block.match(/ProcessId=(\d+)/i);
        if (!cmdMatch || !pidMatch) return null;

        return {
          pid: parseInt(pidMatch[1]),
          cmd: cmdMatch[1].toLowerCase()
        };
      })
      .filter(Boolean);

    const duplicates = processes.filter(
      p =>
        p.pid !== currentPid &&
        (p.cmd.includes(scriptName) || p.cmd.includes(__dirname.toLowerCase()))
    );

    if (duplicates.length === 0) {
      log("No other instances found.", "✅");
    } else {
      for (const proc of duplicates) {
        log(`Killing old instance with PID ${proc.pid}`, "🧹");
        try {
          execSync(`taskkill /PID ${proc.pid} /F`);
        } catch (killErr) {
          log(`Failed to kill PID ${proc.pid}: ${killErr.message}`, "⚠️");
        }
      }
    }
  } catch (err) {
    log(`Error checking/killing old instance: ${err.message}`, "⚠️");
  }
}

async function startSystem() {
  log("Booting Local Print Server + Redis subscriber...", "🚀");

  await stopSystem(); // ensure clean restart

  // --- EXPRESS SETUP ---
  app = express();
  app.use(cors());
  app.use(bodyParser.json());
  app.use(express.urlencoded({ extended: true }));

  app.get("/", (req, res) => {
    res.send("Local Print Server is running ✅");
  });

  app.get("/printers", async (req, res) => {
    try {
      const printers = await printer.getPrinters();
      res.json({ success: true, printers });
    } catch (err) {
      log("Error fetching printers: " + err, "❌");
      res.status(500).json({ success: false, error: err.message });
    }
  });

  server = app.listen(PORT, () => {
    log(`Local Print Server is running on http://localhost:${PORT}`, "✅");
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      log(`Port 3005 already in use. Retrying in 3 seconds...`, "⚠️");
      setTimeout(startSystem, 3000);
    } else {
      log(" Server error: " + err, "🚨");
    }
  });

  // --- REDIS SETUP ---
  subscriber = new Redis({
    host: "3.29.68.97",
    port: 6379,
    password: "TawlaRedis@0101",
    connectTimeout: 5000,
    retryStrategy: (times) => {
      const delay = Math.min(times * 200, 2000);
      log(`Reconnecting to Redis in ${delay}ms...`, "🔄");
      return delay;
    },
  });

  setupRedisListeners(subscriber);
}

function setupRedisListeners(client) {
  client.on("ready", async () => {
    log("Redis is ready, setting up subscription...", "✅");
    try {
      await client.unsubscribe(CHANNEL);
    } catch (_) { }

    client.subscribe(CHANNEL, (err, count) => {
      if (err) log("Failed to subscribe: " + err, "❌");
      else log("Subscribed successfully! Listening to " + count + " channel(s)...", "📡");
    });

    client.on("message", handleMessage);

    // ❤️ Start heartbeat after connection is ready
    startHeartbeat(client);
  });

  client.on("error", (err) => {
    log("Redis error: " + err.message, "❌");
    if (err.message.includes("ECONNRESET")) {
      log("Fatal Redis error detected — restarting system...", "⚠️");
      restartSystem();
    }
  });

  client.on("end", async () => {
    log("Redis connection closed — restarting system...", "⚠️");
    await restartSystem();
  });
}

// ❤️ HEARTBEAT FUNCTION
function startHeartbeat(client) {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(async () => {
    try {
      await client.ping();
      log("Redis heartbeat OK", "💓");
    } catch (err) {
      log("Redis heartbeat failed: " + err.message, "💔");
    }
  }, 300000); // 5 minutes = 5 * 60 * 1000 = 300000
}

async function handleMessage(channel, message) {
  log("New message on " + channel + ": " + message, "📩");
  lastMessageTime = Date.now(); // Update the last message time
  try {
    const data = JSON.parse(message);
    const filePath = data.file_path;
    const printerName = data.printer_name;

    if (!filePath || !printerName) {
      log("Missing file_path or printer_name", "❌");
      return;
    }

    const isUrl = filePath.startsWith("http://") || filePath.startsWith("https://");
    let tmpPath = "";

    if (isUrl) {
      tmpPath = path.join(os.tmpdir(), `${Date.now()}.pdf`);
      const response = await axios.get(filePath, { responseType: "arraybuffer" });
      fs.writeFileSync(tmpPath, response.data);
    } else {
      tmpPath = path.resolve(filePath);
      if (!fs.existsSync(tmpPath)) {
        log("File does not exist: " + tmpPath, "❌");
        return;
      }
    }

    await printer.print(tmpPath, { printer: printerName });
    if (isUrl && fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);

    log("Print job sent successfully!", "✅");
  } catch (err) {
    log("Print error: " + err.message, "❌");
  }
}

async function stopSystem() {
  if (heartbeatInterval) clearInterval(heartbeatInterval); // ❤️ stop heartbeat on shutdown

  if (subscriber) {
    try {
      subscriber.removeAllListeners();
      await subscriber.quit();
      log("Redis subscriber closed.", "🧹");
    } catch (_) { }
    subscriber = null;
  }

  if (server) {
    await new Promise((resolve) => server.close(resolve));
    log("Express server stopped.", "🛑");
    server = null;
  }
}

async function restartSystem() {
  lastMessageTime = Date.now();
  log("Restarting Local Print Server and Redis...", "♻️");
  await stopSystem();
  setTimeout(startSystem, 3000);
}
killPreviousInstance();
startSystem();

// Restart system every 1.5 hours 
setInterval(async () => {
  log("Scheduled 1.5-hour restart triggered — refreshing system...", "⏳");
  await restartSystem();
}, 5400000); // 1.5 hours
