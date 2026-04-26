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

app.post("/mondial-relay", async (req, res) => {
  const { cp, ville } = req.body;

  try {
    const axios = require("axios");

    const xml = `
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="http://www.mondialrelay.fr/webservice/">
      <soapenv:Header/>
      <soapenv:Body>
        <ws:WSI4_PointRelais_Recherche>
          <ws:Enseigne>${process.env.MR_ENSEIGNE}</ws:Enseigne>
          <ws:Pays>FR</ws:Pays>
          <ws:CP>${cp}</ws:CP>
          <ws:Ville>${ville}</ws:Ville>
          <ws:NombreResultats>5</ws:NombreResultats>
        </ws:WSI4_PointRelais_Recherche>
      </soapenv:Body>
    </soapenv:Envelope>
    `;

    const response = await axios.post(
      "https://api.mondialrelay.com/WebService.asmx",
      xml,
      {
        headers: {
          "Content-Type": "text/xml"
        }
      }
    );

    console.log(response.data);

    res.send(response.data);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur Mondial Relay" });
  }
});
app.listen(PORT, () => {
  console.log("Serveur lancé sur le port " + PORT);
});
