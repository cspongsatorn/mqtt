const express = require("express");
const mysql = require("mysql2");
const mqtt = require("mqtt");

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

const db = mysql.createConnection({
    host: "gateway01.ap-southeast-1.prod.aws.tidbcloud.com",
    user: "3r7jSwUzoNxFYHZ.root",
    password: "xsoDcx5QsE01vL4M",
    database: "test",
    port: 4000,
    ssl: { rejectUnauthorized: true }
});

db.connect(err => { if(err) console.log(err); else console.log("DB connected"); });

// MQTT broker
const mqttClient = mqtt.connect("mqtt://d95dc9e87f914ee3b02b3eb8aa30241c.s1.eu.hivemq.cloud:8883");

mqttClient.on("connect", () => {
    console.log("✅ MQTT connected");
    mqttClient.subscribe("relay/control");
    mqttClient.subscribe("relay/callback");
});

mqttClient.on("message", (topic, message) => {
    console.log(`📩 ${topic}: ${message.toString()}`);
    if(topic === "relay/callback") {
        let data = JSON.parse(message.toString());
        let { io_1 } = data;
        db.query("UPDATE box SET IO_1=? WHERE id=1", [io_1], (err) => {
            if(err) console.log(err);
        });
    }
});

// API หน้าเว็บ
app.get("/api/state", (req, res) => {
    db.query("SELECT id, IO_1 FROM box", (err, results) => {
        if(err) return res.status(500).json({error: err});
        res.json(results);
    });
});

app.post("/api/control", (req, res) => {
    const { io_1 } = req.body;
    mqttClient.publish("relay/control", JSON.stringify({ io_1 }));
    db.query("UPDATE box SET IO_1=? WHERE id=1", [io_1], (err) => {
        if(err) return res.status(500).json({error: err});
        res.json({status: "sent", io_1});
    });
});

app.listen(3000, () => console.log("Server running on port 3000"));
