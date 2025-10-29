const { execSync } = require("child_process");
const path = require("path");

try {
  const scriptFullPath = path.resolve(__filename).toLowerCase();
  const command = `wmic process where "name='node.exe'" get ProcessId,CommandLine /VALUE`;
  const output = execSync(command, { stdio: ["pipe", "pipe", "ignore"] }).toString();

  const blocks = output.split(/\n\s*\n/);
  blocks.forEach(block => {
    const pidMatch = block.match(/ProcessId=(\d+)/);
    const cmdMatch = block.match(/CommandLine=(.+)/);

    if (pidMatch && cmdMatch) {
      const pid = pidMatch[1];
      const cmdLine = cmdMatch[1].toLowerCase();

      // ✅ Kill if same script path but not this current process
      if (cmdLine.includes(scriptFullPath) && pid !== String(process.pid)) {
        console.log(`🧹 Killing old instance with PID ${pid}`);
        execSync(`taskkill /PID ${pid} /F`);
      }
    }
  });
} catch (err) {
  console.error("⚠️ Error checking/killing old instance:", err.message);
}
