const express = require("express");
const { Resend } = require("resend");

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);

app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.get("/", (req, res) => {
  res.send("Serveur KeepCold OK");
});

app.post("/create-checkout", async (req, res) => {
  try {
    const { amount, email, nom, tel, addr, cp, ville } = req.body;

if (!amount || !email || !nom || !tel || !addr || !cp || !ville) {
  return res.status(400).json({ error: "Infos client manquantes" });
}

    await resend.emails.send({
      from: "Keep Cold <onboarding@resend.dev>",
      to: email,
      subject: "Commande reçue - Keep Cold",
      html: `
  <h2>Commande reçue ✅</h2>
  <p><strong>Montant :</strong> ${amount} €</p>

  <h3>Infos client :</h3>
  <p>
    Nom : ${nom}<br>
    Téléphone : ${tel}<br>
    Email : ${email}<br>
    Adresse : ${addr}<br>
    Code postal : ${cp}<br>
    Ville : ${ville}
  </p>

  <p>Nous préparons la commande 📦</p>
`
    });

    return res.json({
      success: true,
      message: "Email envoyé",
      url: null
    });

  } catch (error) {
    console.error("Erreur serveur :", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

const PORT = process.env.PORT || 3000;

app.post("/search-relays", async (req, res) => {
  const { cp } = req.body;

  try {
    const url = "https://api.mondialrelay.com/WebService.asmx/WSI4_PointRelais_Recherche";

    const params = new URLSearchParams({
      Enseigne: "CC23WJF1",
      Pays: "FR",
      CP: cp,
      Ville: "",
      NombreResultats: "10",
      Security: "" // on va le gérer après
    });

    const response = await fetch(url + "?" + params.toString());
    const text = await response.text();

    console.log(text);

    res.json({ success: true, raw: text });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erreur Mondial Relay" });
  }
});

app.listen(PORT, () => {
  console.log("Serveur lancé sur le port " + PORT);
});
