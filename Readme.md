# 🖨️ Thermal Printer Service (Redis + Node.js)

A background Node.js service that listens to a Redis channel for print jobs and automatically prints PDF receipts using the system's configured thermal printer.  
Built for reliability, resilience, and full offline capability — designed for use in production environments like POS or order management systems.

---

## 🚀 Features

- 🔄 **Automatic Redis Subscription** — listens for incoming print jobs in real-time.  
- 🧾 **Direct Thermal Printing** — sends PDF files directly to the assigned printer.  
- 💓 **Heartbeat System** — continuously checks Redis connectivity to ensure uptime.  
- 🧹 **Auto Cleanup** — removes old logs and terminates previous instances before booting.  
- 🔁 **Self-Restart Mechanism** — refreshes automatically every 1.5 hours for stability.  
- 🪶 **Lightweight Logs** — stores daily logs (auto-pruned every 7 days).  
- ⚙️ **Windows Task Scheduler Integration** — runs silently in the background, even after reboot.

---

## 📂 Folder Structure

thermal-printer-script/
├── node-v16/
│ └── node.exe
├── Tawlaweb-app/
│ ├── scripts/
│ │ └── thermal-printer.js
│ └── task-template.xml
├── setup.bat
└── logs/
└── YYYY-MM-DD.log


---

## 🛠️ Setup Instructions

### 1️⃣ Install Requirements
- **Windows 10+**
- **Node.js v16 (portable build included)**
- **Redis server credentials**
- **PDF-capable thermal printer**

---

### 2️⃣ Configure Redis & Channel
Inside `thermal-printer.js`, set your Redis credentials and desired channel:
```js
const CHANNEL = "orders-<branch_id>";
```
💡 Tip: the batch setup script auto-replaces <branch_id> with user input.

### 3️⃣ Create Scheduled Task (Auto-start)

Run the setup batch file:

```bash
setup.bat
```

This will:

 - Ask for branch ID

 - Replace paths dynamically in the XML template

 - Create a Windows Task that restarts every 6 hours and runs on boot

 - Ensure the script restarts automatically if it crashes

### 4️⃣ Logs & Monitoring

Logs are saved daily under the /logs folder, e.g.:

logs/2025-10-12.log


Each log includes:

- Redis status updates

 - Print job details

 - System restarts and errors

### ⚙️ Key Settings (in task-template.xml)

 - Runs with highest privileges

 - Auto-restarts up to 10 times on failure

 - Disabled StopIfGoingOnBatteries for uninterrupted laptop operation

 - Stops previous instances before launching new ones

### 🧠 Troubleshooting

 | Issue                    | Cause                        | Fix                                          |
| ------------------------ | ---------------------------- | -------------------------------------------- |
| Port 3005 already in use | Previous instance not closed | Auto-handled via script (kills old instance) |
| Redis not responding     | Connection dropped           | System auto-restarts Redis subscriber        |
| Task not running         | Missing permissions          | Run `setup.bat` as **Administrator**         |
| Script exits early       | Node path incorrect          | Update `NODE_PATH` in setup.bat              |


### 👨‍💻 Developer Notes

- Built in Node.js v16

 - Uses pdf-to-printer, ioredis, axios, express, and WMIC for process control.

 - Automatically kills duplicate Node.js instances using WMIC and PID matching logic.

 - Includes self-healing and scheduled refresh via setInterval.

### 💡 Future Enhancements

🧠 GUI Dashboard (Electron) for live monitoring

📊 Real-time printer status display

🧩 Multi-printer / multi-branch support

🔒 Secure Redis auth token handling