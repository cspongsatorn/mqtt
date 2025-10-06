import express from "express";
import mysql from "mysql2/promise";
import { WebSocketServer } from "ws";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = 3000;

// Path สำหรับหน้าเว็บ
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(bodyParser.json());

// เชื่อมต่อ MySQL
const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "test_sw",
  port: 3306
});

// ส่งหน้าเว็บ
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// WebSocket server (port 8080)
const wss = new WebSocketServer({ port: 8080, host: "0.0.0.0" });
console.log("WebSocket server listening on port 8080");
let webClients = [];

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (message) => {
    console.log("Received:", message.toString());

    try {
      const data = JSON.parse(message.toString());
      if (data.type === "status") {
        // ส่ง callback ไปยังเว็บ client
        webClients.forEach(client => {
          if (client.readyState === 1) {
            client.send(JSON.stringify(data));
          }
        });
      }
    } catch (err) {
      console.error(err);
    }
  });

  // จัดเก็บ web client
  webClients.push(ws);

  ws.on("close", () => {
    webClients = webClients.filter(client => client !== ws);
  });
});

// API: หน้าเว็บส่งคำสั่งเปิดรีเลย์
app.post("/api/setRelay", async (req, res) => {
  const { id, relay, value } = req.body;
  try {
    await pool.query(
      `UPDATE BOX SET IO_${relay} = ? WHERE ID = ?`,
      [value, id]
    );

    const data = JSON.stringify({
      type: "set",
      relay: relay,
      value: value
    });

    // ส่ง WebSocket Push ไป ESP32
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(data);
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://192.168.1.17:${PORT}`);
});
