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
  const crypto = require("crypto");
  const { cp, ville } = req.body;

  const ENSEIGNE = process.env.MR_ENSEIGNE;
  const CLE_PRIVEE = process.env.MR_PRIVATE_KEY;

  try {
    const params = {
      Enseigne: ENSEIGNE,
      Pays: "FR",
      Ville: ville || "",
      CP: cp,
      Taille: "",
      Poids: "",
      Action: "",
      DelaiEnvoi: "0",
      RayonRecherche: "20",
      TypeActivite: "",
      NombreResultats: "10"
    };

    const chaine =
      params.Enseigne +
      params.Pays +
      params.Ville +
      params.CP +
      params.Taille +
      params.Poids +
      params.Action +
      params.DelaiEnvoi +
      params.RayonRecherche +
      params.TypeActivite +
      params.NombreResultats +
      CLE_PRIVEE;

    params.Security = crypto
      .createHash("md5")
      .update(chaine)
      .digest("hex")
      .toUpperCase();

    const url =
      "https://api.mondialrelay.com/WebService.asmx/WSI4_PointRelais_Recherche?" +
      new URLSearchParams(params).toString();

    const response = await fetch(url);
    const xml = await response.text();

    console.log("Réponse Mondial Relay :", xml);

    res.json({
      success: true,
      raw: xml
    });

  } catch (error) {
    console.error("Erreur Mondial Relay :", error);
    res.status(500).json({ error: "Erreur API Mondial Relay" });
  }
});
app.listen(PORT, () => {
  console.log("Serveur lancé sur le port " + PORT);
});
