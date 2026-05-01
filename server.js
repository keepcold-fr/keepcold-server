const express = require("express");
const { Resend } = require("resend");
const orders = {};
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

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

/* =========================
   CREATION PAIEMENT SUMUP
========================= */
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
        Authorization: "Bearer " + process.env.SUMUP_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        checkout_reference: checkoutReference,
        amount: Number(amount),
        currency: "EUR",
        pay_to_email: process.env.SUMUP_MERCHANT_EMAIL,
        description: "Commande Keep Cold",
        redirect_url: "https://keepcold.fr/merci.html",
        hosted_checkout: {
          enabled: true
        }
      })
    });

    const data = await response.json();
    console.log("SUMUP RESPONSE:", data);

    if (!response.ok || !data.id) {
      return res.status(500).json({
        error: data.message || "Erreur création paiement SumUp",
        details: data
      });
    }

    const checkoutDetails = await fetch(`https://api.sumup.com/v0.1/checkouts/${data.id}`, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + process.env.SUMUP_API_KEY
      }
    });

    const checkoutData = await checkoutDetails.json();
    console.log("CHECKOUT DETAILS:", checkoutData);
orders[data.id] = {
  checkout_id: data.id,
  reference: checkoutReference,
  amount,
  email,
  nom,
  tel,
  addr,
  cp,
  ville,
  relais,
  paid: false
};

console.log("COMMANDE STOCKÉE :", orders[data.id]);
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

/* =========================
   CONFIRMATION COMMANDE
========================= */
app.post("/confirm-order", async (req, res) => {
  try {
    console.log("CONFIRM ORDER RECU :", req.body);

    const { email, nom, montant } = req.body;

    await resend.emails.send({
      from: "Keep Cold <contact@keepcold.fr>",
      to: email,
      subject: "Commande confirmée ❄️",
      html: `
        <h2>Merci ${nom} 🙌</h2>
        <p>Ta commande Keep Cold est bien confirmée.</p>
        <p><strong>Montant :</strong> ${montant} €</p>
        <p>Nous préparons ta commande et t’enverrons le suivi très bientôt.</p>
      `
    });

    const shipmentResponse = await fetch("https://keepcold-server.onrender.com/create-shipment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(req.body)
    });

    const shipmentData = await shipmentResponse.json();
    console.log("SHIPMENT DATA :", shipmentData);

    return res.json({
      success: true,
      shipment: shipmentData
    });

  } catch (err) {
    console.error("ERREUR CONFIRM ORDER :", err);
    return res.status(500).json({ error: err.message });
  }
});

/* =========================
   CREATION EXPEDITION MR
========================= */
app.post("/create-shipment", async (req, res) => {
  try {
    console.log("CREATE SHIPMENT RECU :", req.body);

    const { nom, addr, cp, ville, email, tel, relais } = req.body;

    if (!nom || !addr || !cp || !ville || !email || !relais || !relais.code) {
      return res.status(400).json({
        success: false,
        error: "Infos client ou relais manquants"
      });
    }

    const enseigne = process.env.MR_ENSEIGNE;
    const cle = process.env.MR_PRIVATE_KEY;

    const params = {
      Enseigne: enseigne,
      ModeCol: "REL",
      ModeLiv: "24R",
      NDossier: "KC-" + Date.now(),
      NClient: nom,

      Expe_Langage: "FR",
      Expe_Ad1: "Keep Cold",
      Expe_Ad2: "",
      Expe_Ad3: "36 rue Andre Audoli",
      Expe_Ad4: "",
      Expe_Ville: "Marseille",
      Expe_CP: "13010",
      Expe_Pays: "FR",
      Expe_Tel1: "0624947059",
      Expe_Tel2: "",
      Expe_Mail: "contact@keepcold.fr",

      Dest_Langage: "FR",
      Dest_Ad1: nom,
      Dest_Ad2: "",
      Dest_Ad3: addr,
      Dest_Ad4: "",
      Dest_Ville: ville,
      Dest_CP: cp,
      Dest_Pays: "FR",
      Dest_Tel1: tel || "",
      Dest_Tel2: "",
      Dest_Mail: email,

      Poids: "3000",
      Longueur: "",
      Taille: "",
      NbColis: "1",

      CRT_Valeur: "0",
      CRT_Devise: "",
      Exp_Valeur: "",
      Exp_Devise: "",

      COL_Rel_Pays: "",
      COL_Rel: "",

      LIV_Rel_Pays: "FR",
      LIV_Rel: relais.code,

      TAvisage: "",
      TReprise: "",
      Montage: "",
      TRDV: "",
      Assurance: "",
      Instructions: "Commande Keep Cold"
    };

    const securityString =
      params.Enseigne +
      params.ModeCol +
      params.ModeLiv +
      params.NDossier +
      params.NClient +
      params.Expe_Langage +
      params.Expe_Ad1 +
      params.Expe_Ad2 +
      params.Expe_Ad3 +
      params.Expe_Ad4 +
      params.Expe_Ville +
      params.Expe_CP +
      params.Expe_Pays +
      params.Expe_Tel1 +
      params.Expe_Tel2 +
      params.Expe_Mail +
      params.Dest_Langage +
      params.Dest_Ad1 +
      params.Dest_Ad2 +
      params.Dest_Ad3 +
      params.Dest_Ad4 +
      params.Dest_Ville +
      params.Dest_CP +
      params.Dest_Pays +
      params.Dest_Tel1 +
      params.Dest_Tel2 +
      params.Dest_Mail +
      params.Poids +
      params.Longueur +
      params.Taille +
      params.NbColis +
      params.CRT_Valeur +
      params.CRT_Devise +
      params.Exp_Valeur +
      params.Exp_Devise +
      params.COL_Rel_Pays +
      params.COL_Rel +
      params.LIV_Rel_Pays +
      params.LIV_Rel +
      params.TAvisage +
      params.TReprise +
      params.Montage +
      params.TRDV +
      params.Assurance +
      params.Instructions +
      cle;

    const security = crypto
      .createHash("md5")
      .update(securityString)
      .digest("hex")
      .toUpperCase();

    const xml = `
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI2_CreationExpedition xmlns="http://www.mondialrelay.fr/webservice/">
      ${Object.entries(params).map(([key, value]) => `<${key}>${value}</${key}>`).join("")}
      <Security>${security}</Security>
    </WSI2_CreationExpedition>
  </soap:Body>
</soap:Envelope>`;

    const response = await fetch("https://api.mondialrelay.com/WebService.asmx", {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "http://www.mondialrelay.fr/webservice/WSI2_CreationExpedition"
      },
      body: xml
    });

    const text = await response.text();
    console.log("EXPEDITION MR :", text);

    let expeditionNumber = "NON TROUVÉ";

    try {
      const match =
        text.match(/<ExpeditionNum>(.*?)<\/ExpeditionNum>/) ||
        text.match(/<ExpeditionNum[^>]*>(.*?)<\/ExpeditionNum>/) ||
        text.match(/<Expedition>(.*?)<\/Expedition>/);

      if (match && match[1]) {
        expeditionNumber = match[1];
      }
    } catch (e) {
      console.log("Erreur extraction tracking");
    }

    console.log("TRACKING :", expeditionNumber);

    await resend.emails.send({
      from: "Keep Cold <contact@keepcold.fr>",
      to: "contact@keepcold.fr",
      subject: "📦 Nouvelle commande Keep Cold",
      html: `
        <h2>Nouvelle commande reçue</h2>

        <p><strong>Client :</strong> ${nom}</p>
        <p><strong>Email :</strong> ${email}</p>
        <p><strong>Téléphone :</strong> ${tel || "-"}</p>

        <hr>

        <p><strong>Adresse client :</strong><br>
        ${addr}<br>
        ${cp} ${ville}</p>

        <hr>

        <p><strong>Point relais :</strong><br>
        ${relais?.nom || ""}<br>
        ${relais?.adresse || ""}<br>
        ${relais?.ville || ""}<br>
        Code relais : ${relais?.code || ""}</p>

        <hr>

        <p><strong>Numéro de suivi :</strong><br>
        ${expeditionNumber}</p>

        <p>
          L’expédition a été créée sur Mondial Relay.<br>
          Connecte-toi à ton espace pro pour imprimer l’étiquette.
        </p>
      `
    });

    return res.json({
      success: true,
      raw: text,
      expeditionNumber
    });

  } catch (err) {
    console.error("ERREUR CREATE SHIPMENT :", err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/* =========================
   RECHERCHE POINT RELAIS
========================= */
app.post("/mondial-relay", async (req, res) => {
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
        SOAPAction: "http://www.mondialrelay.fr/webservice/WSI4_PointRelais_Recherche"
      },
      body: xml
    });

    const text = await response.text();
    console.log("Réponse MR relais :", text);

    return res.json({ success: true, raw: text });

  } catch (error) {
    console.error("Erreur Mondial Relay :", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
app.post("/verify-payment", async (req, res) => {
  try {
    const { checkout_id } = req.body;

    if (!checkout_id) {
      return res.status(400).json({
        success: false,
        error: "checkout_id manquant"
      });
    }

    const order = orders[checkout_id];

    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Commande introuvable sur le serveur"
      });
    }

    const response = await fetch(`https://api.sumup.com/v0.1/checkouts/${checkout_id}`, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + process.env.SUMUP_API_KEY
      }
    });

    const payment = await response.json();

    console.log("VERIF SUMUP :", payment);

    if (payment.status !== "PAID") {
      return res.json({
        success: false,
        status: payment.status,
        message: "Paiement non confirmé"
      });
    }

    if (order.paid) {
  console.log("COMMANDE DEJA TRAITEE :", checkout_id);

  return res.json({
    success: true,
    message: "Commande déjà traitée"
  });
}

    order.paid = true;
    console.log("ENVOI EMAIL CLIENT :", order.email);

    try {
  await resend.emails.send({
    from: "Keep Cold <contact@keepcold.fr>",
    to: order.email,
    subject: "Commande confirmée ❄️",
    html: `
      <h2>Merci ${order.nom} 🙌</h2>
      <p>Ta commande Keep Cold est bien confirmée.</p>
      <p><strong>Montant :</strong> ${order.amount}€</p>
    `
  });

  console.log("EMAIL CLIENT OK");

} catch (err) {
  console.error("ERREUR EMAIL CLIENT :", err);
}
    
    try {
  await resend.emails.send({
    from: "Keep Cold <contact@keepcold.fr>",
    to: "contact@keepcold.fr",
    subject: "💰 Paiement confirmé Keep Cold",
    html: `
      <h2>Paiement confirmé</h2>
      <p><strong>Référence :</strong> ${order.reference}</p>
      <p><strong>Montant :</strong> ${order.amount}€</p>
      <p><strong>Client :</strong> ${order.nom}</p>
      <p><strong>Email :</strong> ${order.email}</p>
    `
  });

  console.log("EMAIL ADMIN OK");

} catch (err) {
  console.error("ERREUR EMAIL ADMIN :", err);
}

    const shipmentResponse = await fetch("https://keepcold-server.onrender.com/create-shipment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(order)
    });

    const shipmentData = await shipmentResponse.json();

    console.log("EXPEDITION APRES PAIEMENT :", shipmentData);

    return res.json({
      success: true,
      payment,
      shipment: shipmentData
    });

  } catch (err) {
    console.error("ERREUR VERIFY PAYMENT :", err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Serveur lancé sur le port " + PORT);
});
