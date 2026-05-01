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
    await pool.query(
  `INSERT INTO orders 
   (checkout_id, reference, amount, email, nom, tel, addr, cp, ville, relais, paid, payment_status)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
   ON CONFLICT (checkout_id) DO NOTHING`,
  [
    data.id,
    checkoutReference,
    Number(amount),
    email,
    nom,
    tel,
    addr,
    cp,
    ville,
    JSON.stringify(relais),
    false,
    "PENDING"
  ]
);

console.log("COMMANDE ENREGISTRÉE EN DB :", checkoutReference);

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
<div style="margin:0;padding:0;background:#eef8ff;font-family:Arial,Helvetica,sans-serif;color:#102033;">
  <div style="max-width:640px;margin:0 auto;padding:24px 12px;">

    <div style="background:white;border-radius:22px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.10);">

      <div style="background:linear-gradient(135deg,#0077b6,#00c2ff);padding:28px 24px;text-align:center;color:white;">
        <div style="font-size:30px;font-weight:800;letter-spacing:0.5px;">KEEP COLD</div>
        <div style="font-size:15px;margin-top:6px;opacity:0.95;">Commande confirmée</div>
      </div>

      <div style="padding:26px 24px;">

        <h2 style="margin:0 0 10px;font-size:22px;color:#102033;">
          Merci ${order.nom || ""} !
        </h2>

        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569;">
          Nous avons bien reçu ta commande Keep Cold. Voici ton récapitulatif.
        </p>

        <div style="background:#f1faff;border:1px solid #d8f1ff;border-radius:16px;padding:16px;margin-bottom:20px;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr>
              <td style="padding:6px 0;color:#64748b;">Référence</td>
              <td style="padding:6px 0;text-align:right;font-weight:700;">${order.reference || "-"}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#64748b;">Date</td>
              <td style="padding:6px 0;text-align:right;font-weight:700;">${new Date().toLocaleString("fr-FR")}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#64748b;">Statut</td>
              <td style="padding:6px 0;text-align:right;">
                <span style="background:#d1fae5;color:#047857;padding:6px 10px;border-radius:999px;font-size:12px;font-weight:700;">
                  Paiement confirmé
                </span>
              </td>
            </tr>
          </table>
        </div>

        <h3 style="margin:0 0 12px;font-size:17px;">Reçu / récapitulatif</h3>

        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;font-size:14px;">
          <thead>
            <tr style="background:#023047;color:white;">
              <th style="padding:12px;text-align:left;">Produit</th>
              <th style="padding:12px;text-align:center;">Qté</th>
              <th style="padding:12px;text-align:right;">Montant</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:14px;border-bottom:1px solid #e2e8f0;">
                Commande Keep Cold
              </td>
              <td style="padding:14px;text-align:center;border-bottom:1px solid #e2e8f0;">
                1
              </td>
              <td style="padding:14px;text-align:right;border-bottom:1px solid #e2e8f0;font-weight:700;">
                ${order.amount || montant || "0"} €
              </td>
            </tr>
          </tbody>
        </table>

        <div style="text-align:right;margin:18px 0 24px;">
          <div style="font-size:14px;color:#64748b;">Total payé</div>
          <div style="font-size:28px;font-weight:800;color:#0077b6;">
            ${order.amount || montant || "0"} €
          </div>
        </div>

        <div style="display:block;background:#f8fafc;border-radius:16px;padding:16px;margin-bottom:18px;">
          <h3 style="margin:0 0 10px;font-size:16px;">Livraison</h3>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">
            <strong>${order.nom || nom || ""}</strong><br>
            ${order.addr || ""}<br>
            ${order.cp || ""} ${order.ville || ""}
          </p>
        </div>

        <p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:#475569;">
          Nous préparons ta commande. Tu recevras un nouvel email dès que ton colis sera expédié avec le numéro de suivi.
        </p>

        <div style="margin-top:24px;text-align:center;">
          <a href="https://keepcold.fr" style="display:inline-block;background:#0077b6;color:white;text-decoration:none;padding:13px 18px;border-radius:14px;font-weight:700;">
            Retourner sur keepcold.fr
          </a>
        </div>

      </div>

      <div style="background:#102033;color:white;text-align:center;padding:18px;font-size:12px;line-height:1.6;">
        <strong>Keep Cold</strong><br>
        Marseille — contact@keepcold.fr<br>
        Merci pour ta confiance.
      </div>

    </div>
  </div>
</div>
`

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
app.get("/test-db", async (req, res) => {
  try {
    console.log("DATABASE_URL existe ?", !!process.env.DATABASE_URL);

    const result = await pool.query("SELECT NOW()");

    res.json({
      success: true,
      time: result.rows[0]
    });
  } catch (err) {
    console.error("DB ERROR FULL:", err);

    res.status(500).json({
      success: false,
      error: err.message || String(err),
      code: err.code || null
    });
  }
});

app.get("/init-db", async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        checkout_id TEXT UNIQUE,
        reference TEXT,
        amount NUMERIC,
        email TEXT,
        nom TEXT,
        tel TEXT,
        addr TEXT,
        cp TEXT,
        ville TEXT,
        relais JSONB,
        paid BOOLEAN DEFAULT false,
        payment_status TEXT DEFAULT 'PENDING',
        expedition_number TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    res.json({ success: true, message: "Table orders créée" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/admin/orders", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        reference,
        checkout_id,
        amount,
        email,
        nom,
        tel,
        cp,
        ville,
        paid,
        payment_status,
        expedition_number,
        created_at
      FROM orders
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      orders: result.rows
    });
  } catch (err) {
    console.error("ERREUR ADMIN ORDERS :", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.get("/admin", async (req, res) => { if (req.query.key !== process.env.ADMIN_KEY) { return res.send("⛔ Accès refusé"); }

try { const key = req.query.key; const search = (req.query.search || "").trim().toLowerCase(); const status = req.query.status || "all";

const result = await pool.query(`
  SELECT *
  FROM orders
  ORDER BY created_at DESC
`);

let orders = result.rows;
const allOrders = result.rows;

orders = orders.filter(o => {
  const isPaid = o.paid || o.payment_status === "PAID";
  const isShipped = !!o.expedition_number;

  if (status === "paid" && !isPaid) return false;
  if (status === "pending" && isPaid) return false;
  if (status === "shipped" && !isShipped) return false;

  if (!search) return true;

  const fullText = `
    ${o.reference || ""}
    ${o.nom || ""}
    ${o.email || ""}
    ${o.tel || ""}
    ${o.addr || ""}
    ${o.cp || ""}
    ${o.ville || ""}
    ${o.expedition_number || ""}
  `.toLowerCase();

  return fullText.includes(search);
});

const totalCA = allOrders.reduce((sum, o) => sum + Number(o.amount || 0), 0);
const totalPaid = allOrders.filter(o => o.paid || o.payment_status === "PAID").length;
const totalPending = allOrders.filter(o => !(o.paid || o.payment_status === "PAID")).length;
const totalShipped = allOrders.filter(o => !!o.expedition_number).length;

let rows = orders.map(o => {
  const relais = o.relais || {};
  const isPaid = o.paid || o.payment_status === "PAID";
  const isShipped = !!o.expedition_number;
  const date = o.created_at ? new Date(o.created_at).toLocaleString("fr-FR") : "-";

  const relaisNom = relais.nom || relais.name || relais.Nom || relais.libelle || "-";
  const relaisAdresse = relais.adresse || relais.address || relais.Adresse || relais.adresse1 || "";
  const relaisVille = relais.ville || relais.city || relais.Ville || "";
  const relaisCode = relais.code || relais.id || relais.ID || relais.num || "";

  const trackingLink = o.expedition_number
    ? `<a href="https://www.mondialrelay.fr/suivi-de-colis/?numero=${encodeURIComponent(o.expedition_number)}" target="_blank">${o.expedition_number}</a>`
    : "-";

  return `
    <tr>
      <td>
        <strong>#${o.id}</strong><br>
        <small>${o.reference || "-"}</small>
      </td>
      <td>${date}</td>
      <td>
        <strong>${o.nom || "-"}</strong><br>
        <small>${o.email || "-"}</small><br>
        <small>${o.tel || "-"}</small>
      </td>
      <td>
        ${o.addr || "-"}<br>
        <small>${o.cp || ""} ${o.ville || ""}</small>
      </td>
      <td>
        <strong>${relaisNom}</strong><br>
        <small>${relaisAdresse}</small><br>
        <small>${relaisVille}</small><br>
        <small>${relaisCode}</small>
      </td>
      <td><strong>${o.amount || "0"} €</strong></td>
      <td>
        <span class="badge ${isPaid ? "paid" : "pending"}">
          ${isPaid ? "PAYÉ" : "EN ATTENTE"}
        </span>
      </td>
      <td>
        <span class="badge ${isShipped ? "shipped" : "pending"}">
          ${isShipped ? "EXPÉDIÉ" : "NON EXPÉDIÉ"}
        </span><br>
        <small>${trackingLink}</small>
      </td>
      <td class="actions">
        ${!isPaid ? `<button onclick="markPaid(${o.id})">✅ Marquer payé</button>` : `<button disabled>✅ Payé</button>`}
        <button onclick="addTracking(${o.id})">📦 Ajouter suivi</button>
      </td>
    </tr>
  `;
}).join("");

if (!rows) {
  rows = `<tr><td colspan="9" class="empty">Aucune commande trouvée.</td></tr>`;
}

res.send(`

<!DOCTYPE html><html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin Keep Cold</title>
<style>
  body { margin:0; font-family:Arial,sans-serif; background:linear-gradient(180deg,#e8f8ff,#f7fdff); color:#102033; }
  header { background:linear-gradient(135deg,#0077b6,#00c2ff); color:white; padding:28px 20px 34px; border-bottom-left-radius:28px; border-bottom-right-radius:28px; box-shadow:0 8px 22px rgba(0,119,182,.25); }
  header h1 { margin:0; font-size:30px; }
  header p { margin:8px 0 0; opacity:.95; font-size:16px; }
  .container { padding:18px; }
  .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:18px; }
  .card { background:white; padding:18px; border-radius:20px; box-shadow:0 8px 22px rgba(0,0,0,.08); }
  .card small { color:#64748b; font-size:14px; }
  .card strong { display:block; margin-top:8px; font-size:26px; }
  .toolbar { display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap; align-items:center; }
  .toolbar input,.toolbar select { padding:11px 12px; border-radius:12px; border:1px solid #cbd5e1; font-size:14px; }
  .btn { background:#0077b6; color:white; padding:11px 15px; border-radius:14px; border:none; text-decoration:none; font-weight:bold; cursor:pointer; box-shadow:0 5px 14px rgba(0,119,182,.22); }
  .btn.secondary { background:#023047; }
  .table-box { background:white; border-radius:22px; overflow-x:auto; box-shadow:0 8px 22px rgba(0,0,0,.08); }
  table { width:100%; min-width:1250px; border-collapse:collapse; }
  th { background:#023047; color:white; text-align:left; padding:15px; font-size:13px; white-space:nowrap; }
  td { padding:14px; border-bottom:1px solid #e5eef5; vertical-align:top; font-size:14px; }
  tr:hover { background:#f3fbff; }
  small { color:#64748b; }
  .badge { display:inline-block; padding:7px 11px; border-radius:999px; font-size:12px; font-weight:bold; }
  .paid { background:#d1fae5; color:#047857; }
  .pending { background:#fff7ed; color:#c2410c; }
  .shipped { background:#dbeafe; color:#1d4ed8; }
  .actions { display:flex; gap:6px; flex-direction:column; }
  .actions button { border:none; border-radius:10px; padding:8px 10px; cursor:pointer; font-weight:bold; background:#e0f2fe; color:#075985; }
  .actions button:disabled { opacity:.6; cursor:not-allowed; }
  .empty { text-align:center; padding:32px; color:#64748b; }
  @media(max-width:700px){ header h1{font-size:24px;} .stats{grid-template-columns:1fr;} .container{padding:14px;} }
</style>
</head>
<body>
<header>
  <h1>Admin Keep Cold ❄️</h1>
  <p>Commandes, paiements, points relais et suivis colis</p>
</header>
<div class="container">
  <div class="stats">
    <div class="card"><small>Total commandes</small><strong>${allOrders.length}</strong></div>
    <div class="card"><small>Payées</small><strong>${totalPaid}</strong></div>
    <div class="card"><small>En attente</small><strong>${totalPending}</strong></div>
    <div class="card"><small>CA total</small><strong>${totalCA.toFixed(2)} €</strong></div>
  </div>
  <form class="toolbar" method="GET" action="/admin">
    <input type="hidden" name="key" value="${key}">
    <input type="text" name="search" placeholder="Rechercher client, ville, email..." value="${search}">
    <select name="status">
      <option value="all" ${status === "all" ? "selected" : ""}>Toutes</option>
      <option value="paid" ${status === "paid" ? "selected" : ""}>Payées</option>
      <option value="pending" ${status === "pending" ? "selected" : ""}>En attente</option>
      <option value="shipped" ${status === "shipped" ? "selected" : ""}>Expédiées</option>
    </select>
    <button class="btn" type="submit">🔍 Filtrer</button>
    <a class="btn" href="/admin?key=${key}">🔄 Reset</a>
    <button class="btn secondary" type="button" onclick="exportCSV()">📊 Export CSV</button>
  </form>
  <div class="table-box">
    <table>
      <thead>
        <tr>
          <th>ID / Référence</th><th>Date</th><th>Client</th><th>Adresse</th><th>Point relais / Locker</th><th>Montant</th><th>Paiement</th><th>Expédition</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>
<script>
async function markPaid(id){
  if(!confirm("Marquer cette commande comme payée ?")) return;
  await fetch('/admin/pay/' + id, { method:'POST' });
  location.reload();
}
async function addTracking(id){
  const tracking = prompt("Numéro de suivi Mondial Relay");
  if(!tracking) return;
  await fetch('/admin/track/' + id, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ tracking }) });
  location.reload();
}
function exportCSV(){
  let csv = [];
  document.querySelectorAll("table tr").forEach(row => {
    let cols = row.querySelectorAll("td, th");
    let data = [...cols].map(c => '"' + c.innerText.replace(/"/g, '""').replace(/\n/g, " ") + '"');
    csv.push(data.join(";"));
  });
  let blob = new Blob(["\ufeff" + csv.join("\n")], { type:"text/csv;charset=utf-8;" });
  let a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "commandes-keepcold.csv";
  a.click();
}
</script>
</body>
</html>
    `);
  } catch (err) {
    console.error("ERREUR ADMIN :", err);
    res.send("Erreur admin : " + err.message);
  }
});app.post("/admin/pay/:id", async (req, res) => { try { await pool.query( "UPDATE orders SET paid=true, payment_status='PAID', updated_at=NOW() WHERE id=$1", [req.params.id] ); res.json({ success: true }); } catch (err) { console.error("ERREUR ADMIN PAY :", err); res.status(500).json({ success: false, error: err.message }); } });

app.post("/admin/track/:id", async (req, res) => { try { const { tracking } = req.body; await pool.query( "UPDATE orders SET expedition_number=$1, updated_at=NOW() WHERE id=$2", [tracking, req.params.id] ); res.json({ success: true }); } catch (err) { console.error("ERREUR ADMIN TRACK :", err); res.status(500).json({ success: false, error: err.message }); } });app.listen(PORT, () => {
  console.log("Serveur lancé sur le port " + PORT);
});
