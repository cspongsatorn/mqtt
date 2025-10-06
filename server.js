const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const mysql = require("mysql2/promise");
const path = require("path");

// ===== Express App =====
const app = express();
app.use(express.json());

// serve หน้าเว็บ
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ===== MySQL (TiDB Cloud) Connection Pool =====
const pool = mysql.createPool({
  host: "gateway01.ap-southeast-1.prod.aws.tidbcloud.com",
  user: "3r7jSwUzoNxFYHZ.root",
  password: "xsoDcx5QsE01vL4M",
  database: "test",
  port: 4000,
  ssl: { rejectUnauthorized: true },
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
});

pool.getConnection()
  .then(conn => {
    console.log("✅ Connected to TiDB Cloud via pool");
    conn.release();
  })
  .catch(err => {
    console.error("❌ Database connection error:", err.message);
  });

// ===== API Routes =====

// GET: อ่านข้อมูลจากตาราง box ตาม id
app.get("/api/get/:id", async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM box WHERE id=?", [
      req.params.id,
    ]);
    res.json(rows[0] || {});
  } catch (err) {
    console.error("❌ DB Error (GET):", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// POST: อัปเดตรีเลย์ และส่งไปให้ ESP32 ผ่าน WS
app.post("/api/setRelay", async (req, res) => {
  try {
    const { id, value } = req.body;
    console.log("SetRelay API:", id, value);

    await pool.execute("UPDATE box SET IO_1=? WHERE id=?", [value, id]);

    // ส่งต่อไป ESP32
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "set", relay: 1, value }));
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error("❌ DB Error (SET):", err.message);
    res.status(500).json({ error: "Database error" });
  }
});

// ===== WebSocket Server =====
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// WS Events + heartbeat
wss.on("connection", (ws, req) => {
  console.log("🔌 WS client connected:", req.socket.remoteAddress);

  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));

  ws.on("message", (msg) => {
    console.log("📩 Message:", msg.toString());
  });

  ws.on("close", () => {
    console.log("❌ WS client disconnected");
  });
});

// ตรวจสอบ connection ทุก 30 วิ
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// ===== Start Server =====
const PORT = process.env.PORT || 10000;
server.listen(PORT, () =>
  console.log(`✅ HTTP + WSS listening on port ${PORT}`)
);
