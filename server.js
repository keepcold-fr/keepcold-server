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
    const { amount, email, nom, tel, addr, cp, ville, relais } = req.body;

    if (!amount || !email || !nom || !tel || !addr || !cp || !ville || !relais) {
      return res.status(400).json({
        error: "Infos client, panier ou point relais manquant"
      });
    }

    const checkoutReference = "KC-" + Date.now();

    const response = await fetch("https://api.sumup.com/v0.1/checkouts", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.SUMUP_API_KEY,
        "Content-Type": "application/json"
      },
body: JSON.stringify({
  checkout_reference: checkoutReference,
  amount: Number(amount),
  currency: "EUR",
  pay_to_email: process.env.SUMUP_MERCHANT_EMAIL,
  description: "Commande Keep Cold",
  return_url: "https://keepcold.fr/merci.html",
  hosted_checkout: {
    enabled: true
  }
})
    });

    const data = await response.json();
    const checkoutDetails = await fetch(`https://api.sumup.com/v0.1/checkouts/${data.id}`, {
  method: "GET",
  headers: {
    "Authorization": "Bearer " + process.env.SUMUP_API_KEY
  }
});

const checkoutData = await checkoutDetails.json();

console.log("CHECKOUT DETAILS:", checkoutData);
    console.log("SUMUP RESPONSE:", data);

    if (!response.ok) {
      return res.status(500).json({
        error: data.message || "Erreur création paiement SumUp",
        details: data
      });
    }

  return res.json({
  url: checkoutData.hosted_checkout_url,
  checkout_id: data.id,
  reference: checkoutReference
});

  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
});


app.post("/confirm-order", async (req, res) => {
  try {
    const { email, nom, montant } = req.body;

    await resend.emails.send({
      from: "Keep Cold <contact@keepcold.fr>",
      to: email,
      subject: "Commande confirmée ❄️",
      html: `
        <h2>Merci ${nom} 🙌</h2>
        <p>Ta commande Keep Cold est bien confirmée et payée.</p>
        <p>Montant : ${montant} €</p>
        <p>Nous préparons ta commande et t’enverrons le suivi très bientôt.</p>
      `
    });

    await fetch("https://keepcold-server.onrender.com/create-shipment", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify(req.body)
});

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/create-shipment", async (req, res) => {
  const crypto = require("crypto");

  try {
    const { nom, addr, cp, ville, email, relais } = req.body;

    const enseigne = process.env.MR_ENSEIGNE;
    const cle = process.env.MR_PRIVATE_KEY;

    // ⚠️ paramètres Mondial Relay simplifiés
    const expedition = {
      Enseigne: enseigne,
      ModeCol: "REL", // livraison relais
      ModeLiv: "24R", // relais pickup
      NDossier: "KC-" + Date.now(),
      NClient: nom,
      Expe_Langage: "FR",
      Expe_Ad1: "Keep Cold",
      Expe_CP: "13830",
      Expe_Ville: "Roquefort la Bédoule",

      Dest_Langage: "FR",
      Dest_Ad1: nom,
      Dest_Ad3: addr,
      Dest_CP: cp,
      Dest_Ville: ville,
      Dest_Mail: email,

      // relais sélectionné
      LIV_Rel: relais?.nom || "",

      Poids: "1000"
    };

    // 🔐 signature sécurité
    const securityString =
      Object.values(expedition).join("") + cle;

    const security = crypto
      .createHash("md5")
      .update(securityString)
      .digest("hex")
      .toUpperCase();

    const xml = `
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI2_CreationExpedition xmlns="http://www.mondialrelay.fr/webservice/">
      ${Object.entries(expedition).map(([k, v]) => `<${k}>${v}</${k}>`).join("")}
      <Security>${security}</Security>
    </WSI2_CreationExpedition>
  </soap:Body>
</soap:Envelope>`;

    const response = await fetch("https://api.mondialrelay.com/WebService.asmx", {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": "http://www.mondialrelay.fr/webservice/WSI2_CreationExpedition"
      },
      body: xml
    });

    const text = await response.text();

    console.log("EXPEDITION MR:", text);

    return res.json({ success: true, raw: text });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.post("/mondial-relay", async (req, res) => {
  const crypto = require("crypto");
  const { cp, ville } = req.body;

  try {
    const enseigne = process.env.MR_ENSEIGNE;
    const cle = process.env.MR_PRIVATE_KEY;

    const params = {
      Enseigne: enseigne,
      Pays: "FR",
      Ville: ville || "",
      CP: cp,
      Taille: "",
      Poids: "",
      Action: "",
      DelaiEnvoi: "0",
      RayonRecherche: "20",
      TypeActivite: "",
      NombreResultats: "5"
    };

    const securityString =
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
      cle;

    const security = crypto
      .createHash("md5")
      .update(securityString)
      .digest("hex")
      .toUpperCase();

    const xml = `
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI4_PointRelais_Recherche xmlns="http://www.mondialrelay.fr/webservice/">
      <Enseigne>${params.Enseigne}</Enseigne>
      <Pays>${params.Pays}</Pays>
      <Ville>${params.Ville}</Ville>
      <CP>${params.CP}</CP>
      <Taille>${params.Taille}</Taille>
      <Poids>${params.Poids}</Poids>
      <Action>${params.Action}</Action>
      <DelaiEnvoi>${params.DelaiEnvoi}</DelaiEnvoi>
      <RayonRecherche>${params.RayonRecherche}</RayonRecherche>
      <TypeActivite>${params.TypeActivite}</TypeActivite>
      <NombreResultats>${params.NombreResultats}</NombreResultats>
      <Security>${security}</Security>
    </WSI4_PointRelais_Recherche>
  </soap:Body>
</soap:Envelope>`;

    const response = await fetch("https://api.mondialrelay.com/WebService.asmx", {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": "http://www.mondialrelay.fr/webservice/WSI4_PointRelais_Recherche"
      },
      body: xml
    });

    const text = await response.text();
    console.log("Réponse MR :", text);

    return res.json({ success: true, raw: text });

  } catch (error) {
    console.error("Erreur Mondial Relay :", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Serveur lancé sur le port " + PORT);
});
