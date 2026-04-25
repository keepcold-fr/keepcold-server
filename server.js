const express = require("express");
const app = express();

app.use(express.json());

// 🔥 autorise ton site à appeler ton serveur
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// test simple
app.get("/", (req, res) => {
  res.send("Serveur KeepCold OK");
});

// paiement (mode test)
app.post("/create-checkout", (req, res) => {
  console.log("Requête reçue :", req.body);

  return res.json({
    success: false,
    message: "Paiement pas encore actif"
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Serveur lancé sur le port " + PORT);
});app.listen(3000, () => {
  console.log("Serveur lancé sur http://localhost:3000");
});
