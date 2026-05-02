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
    const { email, nom, tel, addr, cp, ville, relais, amount } = req.body;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ShipmentCreationRequest xmlns="http://www.mondialrelay.fr/webservice/">
  <Context>
    <Login>${process.env.MR_API2_LOGIN}</Login>
    <Password>${process.env.MR_API2_PASSWORD}</Password>
    <CustomerId>${process.env.MR_API2_BRAND_ID}</CustomerId>
    <Culture>fr-FR</Culture>
    <VersionAPI>1.0</VersionAPI>
  </Context>
  <OutputOptions>
    <OutputFormat>10x15</OutputFormat>
    <OutputType>PdfUrl</OutputType>
  </OutputOptions>
  <ShipmentsList>
    <Shipment>
      <OrderNo>KC${Date.now().toString().slice(-10)}</OrderNo>
      <CustomerNo>KC</CustomerNo>
      <ParcelCount>1</ParcelCount>
      <DeliveryMode>
        <Mode>24R</Mode>
        <Location>${relais?.code || ""}</Location>
      </DeliveryMode>
      <CollectionMode>
        <Mode>REL</Mode>
      </CollectionMode>
      <Parcels>
        <Parcel>
          <Content>Commande Keep Cold</Content>
          <Weight>
            <Value>3000</Value>
            <Unit>g</Unit>
          </Weight>
        </Parcel>
      </Parcels>
      <Sender>
        <Address>
          <Title>Keep Cold</Title>
          <Firstname>Keep</Firstname>
          <Lastname>Cold</Lastname>
          <Streetname>36 rue Andre Audoli</Streetname>
          <HouseNo></HouseNo>
          <CountryCode>FR</CountryCode>
          <PostCode>13010</PostCode>
          <City>Marseille</City>
          <PhoneNo>0624947059</PhoneNo>
          <Email>contact@keepcold.fr</Email>
        </Address>
      </Sender>
      <Recipient>
        <Address>
          <Title>${nom || "Client"}</Title>
          <Firstname>${nom || "Client"}</Firstname>
          <Lastname>Client</Lastname>
          <Streetname>${addr || ""}</Streetname>
          <HouseNo></HouseNo>
          <CountryCode>FR</CountryCode>
          <PostCode>${cp || ""}</PostCode>
          <City>${ville || ""}</City>
          <PhoneNo>${tel || ""}</PhoneNo>
          <Email>${email || ""}</Email>
        </Address>
      </Recipient>
    </Shipment>
  </ShipmentsList>
</ShipmentCreationRequest>`;

    const response = await fetch("https://connect-api.mondialrelay.com/api/Shipment", {
      method: "POST",
      headers: {
  "Accept": "application/xml",
  "Content-Type": "text/xml",
  "Authorization":
    "Basic " +
    Buffer.from(
      process.env.MR_API2_LOGIN + ":" + process.env.MR_API2_PASSWORD
    ).toString("base64")
},
body: xml
  });

    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    console.log("MR API2 RESPONSE :", data);

    await resend.emails.send({
      from: "Keep Cold <contact@keepcold.fr>",
      to: "contact@keepcold.fr",
      subject: "📦 Nouvelle commande Keep Cold",
      html: `
        <h2>Nouvelle commande reçue</h2>

        <p><strong>Client :</strong> ${nom || "-"}</p>
        <p><strong>Email :</strong> ${email || "-"}</p>
        <p><strong>Téléphone :</strong> ${tel || "-"}</p>
        <p><strong>Montant :</strong> ${amount || "-"} €</p>

        <hr>

        <p><strong>Adresse client :</strong><br>
        ${addr || "-"}<br>
        ${cp || ""} ${ville || ""}</p>

        <hr>

        <p><strong>Point relais :</strong><br>
        ${relais?.nom || ""}<br>
        ${relais?.adresse || ""}<br>
        ${relais?.ville || ""}<br>
        Code relais : ${relais?.code || ""}</p>

        <hr>

        <p><strong>Réponse Mondial Relay API 2 :</strong></p>
        <pre>${JSON.stringify(data, null, 2)}</pre>
      `
    });

    return res.json({
      success: response.ok,
      shipment: data
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

app.get("/admin", async (req, res) => {
  if (req.query.key !== process.env.ADMIN_KEY) {
    return res.send("⛔ Accès refusé");
  }

  try {
    const result = await pool.query(`
      SELECT *
      FROM orders
      ORDER BY created_at DESC
    `);

    const orders = result.rows;
    const totalCA = orders.reduce((sum, o) => sum + Number(o.amount || 0), 0);
    const totalPaid = orders.filter(o => o.paid).length;
    const totalPending = orders.filter(o => !o.paid).length;

    let rows = orders.map(o => {
      const relais = o.relais || {};
      const date = o.created_at ? new Date(o.created_at).toLocaleString("fr-FR") : "-";

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
            <strong>${relais.nom || "-"}</strong><br>
            <small>${relais.adresse || ""}</small><br>
            <small>${relais.code || ""}</small>
          </td>
          <td><strong>${o.amount || "0"} €</strong></td>
          <td>
            <span class="badge ${o.paid ? "paid" : "pending"}">
              ${o.paid ? "PAYÉ" : (o.payment_status || "PENDING")}
            </span>
          </td>
          <td>${o.expedition_number || "-"}</td>
          <td class="actions">
            <button onclick="markPaid(${o.id})">✅ Payé</button>
            <button onclick="addTracking(${o.id})">📦 Suivi</button>
          </td>
        </tr>
      `;
    }).join("");

    if (!rows) {
      rows = `<tr><td colspan="9" class="empty">Aucune commande pour le moment.</td></tr>`;
    }

    res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin Keep Cold</title>

<style>
  body {
    margin: 0;
    font-family: Arial, sans-serif;
    background: linear-gradient(180deg, #e8f8ff, #f7fdff);
    color: #102033;
  }

  header {
    background: linear-gradient(135deg, #0077b6, #00c2ff);
    color: white;
    padding: 28px 20px 34px;
    border-bottom-left-radius: 28px;
    border-bottom-right-radius: 28px;
    box-shadow: 0 8px 22px rgba(0,119,182,0.25);
  }

  header h1 {
    margin: 0;
    font-size: 30px;
  }

  header p {
    margin: 8px 0 0;
    opacity: 0.95;
    font-size: 16px;
  }

  .container {
    padding: 18px;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    margin-top: -8px;
    margin-bottom: 18px;
  }

  .card {
    background: white;
    padding: 18px;
    border-radius: 20px;
    box-shadow: 0 8px 22px rgba(0,0,0,0.08);
  }

  .card small {
    color: #64748b;
    font-size: 14px;
  }

  .card strong {
    display: block;
    margin-top: 8px;
    font-size: 28px;
  }

  .toolbar {
    display: flex;
    gap: 10px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .btn {
    background: #0077b6;
    color: white;
    padding: 11px 15px;
    border-radius: 14px;
    border: none;
    text-decoration: none;
    font-weight: bold;
    cursor: pointer;
    box-shadow: 0 5px 14px rgba(0,119,182,0.22);
  }

  .btn.secondary {
    background: #023047;
  }

  .table-box {
    background: white;
    border-radius: 22px;
    overflow-x: auto;
    box-shadow: 0 8px 22px rgba(0,0,0,0.08);
  }

  table {
    width: 100%;
    min-width: 1150px;
    border-collapse: collapse;
  }

  th {
    background: #023047;
    color: white;
    text-align: left;
    padding: 15px;
    font-size: 13px;
    white-space: nowrap;
  }

  td {
    padding: 14px;
    border-bottom: 1px solid #e5eef5;
    vertical-align: top;
    font-size: 14px;
  }

  tr:hover {
    background: #f3fbff;
  }

  small {
    color: #64748b;
  }

  .badge {
    display: inline-block;
    padding: 7px 11px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: bold;
  }

  .paid {
    background: #d1fae5;
    color: #047857;
  }

  .pending {
    background: #fff7ed;
    color: #c2410c;
  }

  .actions {
    display: flex;
    gap: 6px;
    flex-direction: column;
  }

  .actions button {
    border: none;
    border-radius: 10px;
    padding: 8px 10px;
    cursor: pointer;
    font-weight: bold;
    background: #e0f2fe;
    color: #075985;
  }

  .actions button:hover {
    opacity: 0.8;
  }

  .empty {
    text-align: center;
    padding: 32px;
    color: #64748b;
  }

  @media (max-width: 700px) {
    header h1 {
      font-size: 24px;
    }

    .stats {
      grid-template-columns: 1fr;
    }

    .container {
      padding: 14px;
    }
  }
</style>
</head>

<body>

<header>
  <h1>Admin Keep Cold ❄️</h1>
  <p>Tableau de bord des commandes</p>
</header>

<div class="container">

  <div class="stats">
    <div class="card">
      <small>Total commandes</small>
      <strong>${orders.length}</strong>
    </div>

    <div class="card">
      <small>Commandes payées</small>
      <strong>${totalPaid}</strong>
    </div>

    <div class="card">
      <small>CA total</small>
      <strong>${totalCA.toFixed(2)} €</strong>
    </div>
  </div>

  <div class="toolbar">
    <a class="btn" href="/admin?key=${req.query.key}">🔄 Actualiser</a>
    <button class="btn secondary" onclick="exportCSV()">📊 Export CSV</button>
  </div>

  <div class="table-box">
    <table>
      <thead>
        <tr>
          <th>ID / Référence</th>
          <th>Date</th>
          <th>Client</th>
          <th>Adresse</th>
          <th>Point relais</th>
          <th>Montant</th>
          <th>Paiement</th>
          <th>Suivi MR</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>

</div>

<script>
async function markPaid(id) {
  await fetch('/admin/pay/' + id, { method: 'POST' });
  location.reload();
}

async function addTracking(id) {
  const tracking = prompt("Numéro de suivi Mondial Relay");
  if (!tracking) return;

  await fetch('/admin/track/' + id, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tracking })
  });

  location.reload();
}

function exportCSV() {
  let csv = [];
  document.querySelectorAll("table tr").forEach(row => {
    let cols = row.querySelectorAll("td, th");
    let data = [...cols].map(c => '"' + c.innerText.replace(/"/g, '""') + '"');
    csv.push(data.join(";"));
  });

  let blob = new Blob(["\\ufeff" + csv.join("\\n")], { type: "text/csv;charset=utf-8;" });
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
});
app.listen(PORT, () => {
  console.log("Serveur lancé sur le port " + PORT);
});
