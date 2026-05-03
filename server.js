const express = require("express");
const { Resend } = require("resend");
const crypto = require("crypto");
const { Pool } = require("pg");
const orders = {};

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.json());

/* =========================
   CORS
========================= */
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

/* =========================
   ROOT
========================= */
app.get("/", (req, res) => {
  res.send("🚀 Serveur KeepCold OK");
});

/* =========================
   INIT DB (AMÉLIORÉ)
========================= */
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
        status TEXT DEFAULT 'NOUVELLE',
        printed BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   SÉCURITÉ ADMIN
========================= */
function checkAdmin(req, res) {
  if (req.query.key !== process.env.ADMIN_KEY) {
    res.status(403).send("⛔ Accès refusé");
    return false;
  }
  return true;
}

/* =========================
   CREATION PAIEMENT SUMUP
========================= */
app.post("/create-checkout", async (req, res) => {
  try {
    const { amount, email, nom, tel, addr, cp, ville, relais } = req.body;

    if (!amount || !email || !nom || !tel || !addr || !cp || !ville || !relais) {
      return res.status(400).json({
        success: false,
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
        success: false,
        error: data.message || "Erreur création paiement SumUp",
        details: data
      });
    }

    const checkoutDetails = await fetch(
      `https://api.sumup.com/v0.1/checkouts/${data.id}`,
      {
        method: "GET",
        headers: {
          Authorization: "Bearer " + process.env.SUMUP_API_KEY
        }
      }
    );

    const checkoutData = await checkoutDetails.json();

    const orderData = {
      checkout_id: data.id,
      reference: checkoutReference,
      amount: Number(amount),
      email,
      nom,
      tel,
      addr,
      cp,
      ville,
      relais,
      paid: false,
      payment_status: "PENDING",
      status: "NOUVELLE"
    };

    orders[data.id] = orderData;

    await pool.query(
      `
      INSERT INTO orders
      (
        checkout_id,
        reference,
        amount,
        email,
        nom,
        tel,
        addr,
        cp,
        ville,
        relais,
        paid,
        payment_status,
        status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (checkout_id) DO NOTHING
      `,
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
        "PENDING",
        "NOUVELLE"
      ]
    );

    console.log("COMMANDE ENREGISTRÉE :", checkoutReference);

    return res.json({
      success: true,
      url: checkoutData.hosted_checkout_url,
      checkout_id: data.id,
      reference: checkoutReference
    });

  } catch (err) {
    console.error("ERREUR CREATE CHECKOUT :", err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/* =========================
   CONFIRMATION COMMANDE SIMPLE
========================= */
app.post("/confirm-order", async (req, res) => {
  try {
    const { email, nom, montant } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email manquant"
      });
    }

    await resend.emails.send({
      from: "Keep Cold <contact@keepcold.fr>",
      to: email,
      subject: "Commande Keep Cold confirmée ❄️",
      html: `
        <h2>Merci ${nom || ""} 🙌</h2>
        <p>Ta commande Keep Cold est bien confirmée.</p>
        <p><strong>Montant :</strong> ${montant || ""} €</p>
        <p>Nous préparons ta commande et tu recevras le suivi dès l'expédition.</p>
      `
    });

    return res.json({
      success: true,
      message: "Email confirmation envoyé"
    });

  } catch (err) {
    console.error("ERREUR CONFIRM ORDER :", err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/* =========================
   OUTILS EXPÉDITION
========================= */
function cleanPhone(phone) {
  let p = String(phone || "").replace(/\s+/g, "").replace(/\./g, "");
  if (p.startsWith("0")) p = "+33" + p.substring(1);
  if (!p.startsWith("+")) p = "+33" + p;
  return p;
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/* =========================
   CREATION EXPEDITION MONDIAL RELAY
========================= */
app.post("/create-shipment", async (req, res) => {
  try {
    const { email, nom, tel, addr, cp, ville, relais, reference } = req.body;

    if (!email || !nom || !tel || !addr || !cp || !ville) {
      return res.status(400).json({
        success: false,
        error: "Infos client manquantes pour créer l'expédition"
      });
    }

    const phoneClient = cleanPhone(tel);
    const relayCode = relais?.code || relais?.Num || relais?.num || "FR00001";
    const orderNo = reference || "KC" + Date.now();

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<ShipmentCreationRequest xmlns="http://www.example.org/Request">
  <Context>
    <Login>${escapeXml(process.env.MR_API2_LOGIN)}</Login>
    <Password>${escapeXml(process.env.MR_API2_PASSWORD)}</Password>
    <CustomerId>CC23WJF1</CustomerId>
    <Culture>fr-FR</Culture>
    <VersionAPI>1.0</VersionAPI>
  </Context>

  <OutputOptions>
    <OutputFormat>PDF</OutputFormat>
    <OutputType>PdfUrl</OutputType>
  </OutputOptions>

  <ShipmentsList>
    <Shipment>
      <OrderNo>${escapeXml(orderNo)}</OrderNo>
      <CustomerNo>1</CustomerNo>
      <ParcelCount>1</ParcelCount>

      <DeliveryMode Mode="24R" Location="${escapeXml(relayCode)}" />
      <CollectionMode Mode="REL" />

      <Parcels>
        <Parcel>
          <Content>Commande Keep Cold</Content>
          <Weight Value="5.1" Unit="kg" />
        </Parcel>
      </Parcels>

      <Sender>
        <Address>
          <Firstname>Jerome</Firstname>
          <Lastname>Carrio</Lastname>
          <Streetname>36 RUE ANDRE AUDOLI</Streetname>
          <CountryCode>FR</CountryCode>
          <PostCode>13010</PostCode>
          <City>MARSEILLE</City>
          <MobileNo>+33624947059</MobileNo>
          <Email>contact@keepcold.fr</Email>
        </Address>
      </Sender>

      <Recipient>
        <Address>
          <Firstname>${escapeXml(nom || "Client")}</Firstname>
          <Lastname>KeepCold</Lastname>
          <Streetname>${escapeXml(addr)}</Streetname>
          <CountryCode>FR</CountryCode>
          <PostCode>${escapeXml(cp)}</PostCode>
          <City>${escapeXml(ville)}</City>
          <MobileNo>${escapeXml(phoneClient)}</MobileNo>
          <Email>${escapeXml(email)}</Email>
        </Address>
      </Recipient>
    </Shipment>
  </ShipmentsList>
</ShipmentCreationRequest>`;

    console.log("XML ENVOYÉ API2 :", xml);

    const response = await fetch("https://connect-api.mondialrelay.com/api/Shipment", {
      method: "POST",
      headers: {
        Accept: "application/xml",
        "Content-Type": "text/xml; charset=utf-8",
        Authorization:
          "Basic " +
          Buffer.from(
            process.env.MR_API2_LOGIN + ":" + process.env.MR_API2_PASSWORD
          ).toString("base64")
      },
      body: xml
    });

    const text = await response.text();
    console.log("RÉPONSE API2 :", text);

    const match = text.match(/<Output>([\s\S]*?)<\/Output>/);

    if (!match) {
      return res.json({
        success: false,
        error: "Aucune étiquette trouvée",
        raw: text
      });
    }

    const base64 = match[1].trim();

    return res.json({
      success: true,
      label: base64,
      raw: text
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

/* =========================
   VERIFICATION PAIEMENT SUMUP
========================= */
app.post("/verify-payment", async (req, res) => {
  try {
    const { checkout_id } = req.body;

    if (!checkout_id) {
      return res.status(400).json({
        success: false,
        error: "checkout_id manquant"
      });
    }

    let order = orders[checkout_id];

    if (!order) {
      const dbOrder = await pool.query(
        "SELECT * FROM orders WHERE checkout_id = $1",
        [checkout_id]
      );

      if (!dbOrder.rows.length) {
        return res.status(404).json({
          success: false,
          error: "Commande introuvable"
        });
      }

      order = dbOrder.rows[0];
    }

    const response = await fetch(
      `https://api.sumup.com/v0.1/checkouts/${checkout_id}`,
      {
        method: "GET",
        headers: {
          Authorization: "Bearer " + process.env.SUMUP_API_KEY
        }
      }
    );

    const payment = await response.json();
    console.log("VERIF SUMUP :", payment);

    if (payment.status !== "PAID") {
      await pool.query(
        `
        UPDATE orders 
        SET payment_status = $1, updated_at = NOW()
        WHERE checkout_id = $2
        `,
        [payment.status || "PENDING", checkout_id]
      );

      return res.json({
        success: false,
        status: payment.status,
        message: "Paiement non confirmé"
      });
    }

    if (order.paid) {
      return res.json({
        success: true,
        message: "Commande déjà payée",
        payment
      });
    }

    await pool.query(
      `
      UPDATE orders
      SET paid = true,
          payment_status = 'PAID',
          status = 'PAYEE',
          updated_at = NOW()
      WHERE checkout_id = $1
      `,
      [checkout_id]
    );

    try {
      await resend.emails.send({
        from: "Keep Cold <contact@keepcold.fr>",
        to: order.email,
        subject: "Commande Keep Cold confirmée ❄️",
        html: `
          <h2>Merci ${order.nom || ""} 🙌</h2>
          <p>Ta commande Keep Cold est bien confirmée.</p>
          <p><strong>Montant :</strong> ${order.amount} €</p>
          <p>Nous préparons ta commande et tu recevras le suivi dès l'expédition.</p>
        `
      });
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
          <p><strong>Montant :</strong> ${order.amount} €</p>
          <p><strong>Client :</strong> ${order.nom}</p>
          <p><strong>Email :</strong> ${order.email}</p>
          <p><strong>Téléphone :</strong> ${order.tel || ""}</p>
        `
      });
    } catch (err) {
      console.error("ERREUR EMAIL ADMIN :", err);
    }

    return res.json({
      success: true,
      payment,
      message: "Paiement confirmé"
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

/* =========================
   ADMIN - ACTIONS COMMANDES
========================= */

app.post("/admin/pay/:id", async (req, res) => {
  if (!checkAdmin(req, res)) return;

  try {
    await pool.query(
      `
      UPDATE orders
      SET paid = true,
          payment_status = 'PAID',
          status = 'PAYEE',
          updated_at = NOW()
      WHERE id = $1
      `,
      [req.params.id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/admin/status/:id", async (req, res) => {
  if (!checkAdmin(req, res)) return;

  try {
    const { status } = req.body;

    await pool.query(
      `
      UPDATE orders
      SET status = $1,
          updated_at = NOW()
      WHERE id = $2
      `,
      [status || "NOUVELLE", req.params.id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/admin/track/:id", async (req, res) => {
  if (!checkAdmin(req, res)) return;

  try {
    const { tracking } = req.body;

    await pool.query(
      `
      UPDATE orders
      SET expedition_number = $1,
          status = 'EXPEDIEE',
          updated_at = NOW()
      WHERE id = $2
      `,
      [tracking, req.params.id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/admin/printed/:id", async (req, res) => {
  if (!checkAdmin(req, res)) return;

  try {
    await pool.query(
      `
      UPDATE orders
      SET printed = true,
          status = 'IMPRIMEE',
          updated_at = NOW()
      WHERE id = $1
      `,
      [req.params.id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =========================
   ADMIN - GENERER ETIQUETTE SOLO
========================= */
app.post("/admin/generate-label/:id", async (req, res) => {
  if (!checkAdmin(req, res)) return;

  try {
    const result = await pool.query(
      "SELECT * FROM orders WHERE id = $1",
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        error: "Commande introuvable"
      });
    }

    const order = result.rows[0];

    if (!order.paid) {
      return res.json({
        success: false,
        error: "Commande non payée"
      });
    }

    const shipmentResponse = await fetch(
      "https://keepcold-server.onrender.com/create-shipment",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(order)
      }
    );

    const shipmentData = await shipmentResponse.json();

    if (!shipmentData.success) {
      return res.json(shipmentData);
    }

    await pool.query(
      `
      UPDATE orders
      SET expedition_number = $1,
          status = 'ETIQUETTE',
          updated_at = NOW()
      WHERE id = $2
      `,
      [shipmentData.label, req.params.id]
    );

    res.json({
      success: true,
      label: shipmentData.label
        
/* =========================
   ADMIN - ACTIONS EN MASSE
========================= */
app.post("/admin/bulk-status", async (req, res) => {
  if (!checkAdmin(req, res)) return;

  try {
    const { ids, status } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.json({
        success: false,
        error: "Aucune commande sélectionnée"
      });
    }

    await pool.query(
      `
      UPDATE orders
      SET status = $1,
          updated_at = NOW()
      WHERE id = ANY($2::int[])
      `,
      [status || "NOUVELLE", ids]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.post("/admin/bulk-printed", async (req, res) => {
  if (!checkAdmin(req, res)) return;

  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.json({
        success: false,
        error: "Aucune commande sélectionnée"
      });
    }

    await pool.query(
      `
      UPDATE orders
      SET printed = true,
          status = 'IMPRIMEE',
          updated_at = NOW()
      WHERE id = ANY($1::int[])
      `,
      [ids]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.post("/admin/bulk-shipped", async (req, res) => {
  if (!checkAdmin(req, res)) return;

  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.json({
        success: false,
        error: "Aucune commande sélectionnée"
      });
    }

    await pool.query(
      `
      UPDATE orders
      SET status = 'EXPEDIEE',
          updated_at = NOW()
      WHERE id = ANY($1::int[])
      `,
      [ids]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});
     
    app.get("/admin", async (req, res) => {
  if (!checkAdmin(req, res)) return;

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
    const totalLabels = orders.filter(o => o.expedition_number).length;

    let rows = orders.map(o => {
      const relais = o.relais || {};
      const date = o.created_at
        ? new Date(o.created_at).toLocaleString("fr-FR")
        : "-";

      const status = o.status || "NOUVELLE";

      return `
        <tr>
          <td><input type="checkbox" class="order-check" value="${o.id}"></td>
          <td><strong>#${o.id}</strong><br><small>${o.reference || "-"}</small></td>
          <td>${date}</td>
          <td><strong>${o.nom || "-"}</strong><br><small>${o.email || "-"}</small><br><small>${o.tel || "-"}</small></td>
          <td>${o.addr || "-"}<br><small>${o.cp || ""} ${o.ville || ""}</small></td>
          <td>
            <strong>${relais.nom || relais.Name || "-"}</strong><br>
            <small>${relais.adresse || relais.Address || ""}</small><br>
            <small>${relais.code || relais.Num || ""}</small>
          </td>
          <td><strong>${o.amount || "0"} €</strong></td>
          <td><span class="badge ${o.paid ? "paid" : "pending"}">${o.paid ? "PAYÉ" : (o.payment_status || "PENDING")}</span></td>
          <td><span class="status ${status.toLowerCase()}">${status}</span>${o.printed ? `<br><small>🖨️ Imprimée</small>` : ""}</td>
          <td>${o.expedition_number ? `<a class="label-btn" href="/label/${o.checkout_id}?key=${req.query.key}" target="_blank">🧾 Étiquette</a>` : "-"}</td>
          <td class="actions">
            <button onclick="markPaid(${o.id})">✅ Payé</button>
            <button onclick="generateLabel(${o.id})">🧾 Étiquette</button>
            <button onclick="setStatus(${o.id}, 'PREPARATION')">📦 Prépa</button>
            <button onclick="setStatus(${o.id}, 'EXPEDIEE')">🚚 Expédiée</button>
            <button onclick="addTracking(${o.id})">🔢 Suivi</button>
          </td>
        </tr>
      `;
    }).join("");

    if (!rows) {
      rows = `<tr><td colspan="11" class="empty">Aucune commande pour le moment.</td></tr>`;
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
    background: #eefaff;
    color: #102033;
  }

  header {
    background: linear-gradient(135deg, #0077b6, #00c2ff);
    color: white;
    padding: 26px 18px 32px;
    border-bottom-left-radius: 28px;
    border-bottom-right-radius: 28px;
    box-shadow: 0 8px 22px rgba(0,119,182,0.25);
  }

  header h1 {
    margin: 0;
    font-size: 28px;
  }

  header p {
    margin: 7px 0 0;
    opacity: 0.95;
  }

  .container {
    padding: 16px;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 16px;
  }

  .card {
    background: white;
    padding: 16px;
    border-radius: 18px;
    box-shadow: 0 8px 22px rgba(0,0,0,0.08);
  }

  .card small {
    color: #64748b;
  }

  .card strong {
    display: block;
    margin-top: 7px;
    font-size: 25px;
  }

  .toolbar {
    display: flex;
    gap: 9px;
    flex-wrap: wrap;
    margin-bottom: 14px;
  }

  .btn {
    background: #0077b6;
    color: white;
    padding: 10px 13px;
    border-radius: 13px;
    border: none;
    text-decoration: none;
    font-weight: bold;
    cursor: pointer;
  }

  .btn.dark {
    background: #023047;
  }

  .btn.green {
    background: #047857;
  }

  .btn.orange {
    background: #c2410c;
  }

  .table-box {
    background: white;
    border-radius: 20px;
    overflow-x: auto;
    box-shadow: 0 8px 22px rgba(0,0,0,0.08);
  }

  table {
    width: 100%;
    min-width: 1350px;
    border-collapse: collapse;
  }

  th {
    background: #023047;
    color: white;
    text-align: left;
    padding: 13px;
    font-size: 13px;
    white-space: nowrap;
  }

  td {
    padding: 12px;
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

  .badge,
  .status {
    display: inline-block;
    padding: 7px 10px;
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

  .nouvelle {
    background: #e0f2fe;
    color: #075985;
  }

  .payee {
    background: #d1fae5;
    color: #047857;
  }

  .etiquette {
    background: #ede9fe;
    color: #6d28d9;
  }

  .imprimee {
    background: #fef3c7;
    color: #92400e;
  }

  .preparation {
    background: #ccfbf1;
    color: #0f766e;
  }

  .expediee {
    background: #dcfce7;
    color: #166534;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .actions button,
  .label-btn {
    border: none;
    border-radius: 10px;
    padding: 8px 10px;
    cursor: pointer;
    font-weight: bold;
    text-decoration: none;
    text-align: center;
    background: #e0f2fe;
    color: #075985;
    font-size: 13px;
  }

  .label-btn {
    display: inline-block;
    background: #d1fae5;
    color: #047857;
  }

  .empty {
    text-align: center;
    padding: 32px;
    color: #64748b;
  }

  @media (max-width: 700px) {
    .stats {
      grid-template-columns: 1fr;
    }

    header h1 {
      font-size: 23px;
    }
  }
</style>
</head>

<body>

<header>
  <h1>Admin Keep Cold ❄️</h1>
  <p>Gestion des commandes (mode pro)</p>
</header>

<div class="container">

  <div class="stats">
    <div class="card">
      <small>Total commandes</small>
      <strong>${orders.length}</strong>
    </div>

    <div class="card">
      <small>Payées</small>
      <strong>${totalPaid}</strong>
    </div>

    <div class="card">
      <small>CA total</small>
      <strong>${totalCA.toFixed(2)} €</strong>
    </div>

    <div class="card">
      <small>Étiquettes</small>
      <strong>${totalLabels}</strong>
    </div>
  </div>

  <div class="toolbar">
    <button class="btn" onclick="bulkLabel()">🧾 Générer étiquettes</button>
    <button class="btn green" onclick="bulkPrinted()">🖨️ Marquer imprimé</button>
    <button class="btn orange" onclick="bulkShipped()">🚚 Expédier</button>
    <button class="btn dark" onclick="exportCSV()">📊 Export CSV</button>
  </div>

  <div class="table-box">
    <table>
      <thead>
        <tr>
          <th></th>
          <th>ID</th>
          <th>Date</th>
          <th>Client</th>
          <th>Adresse</th>
          <th>Relais</th>
          <th>Montant</th>
          <th>Paiement</th>
          <th>Status</th>
          <th>Étiquette</th>
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
const key = new URLSearchParams(window.location.search).get("key");

function selectedIds() {
  return [...document.querySelectorAll(".order-check:checked")]
    .map(cb => Number(cb.value));
}

async function postJSON(url, body = {}) {
  const res = await fetch(url + "?key=" + key, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  return await res.json();
}

async function markPaid(id) {
  if (!confirm("Marquer cette commande comme payée ?")) return;

  await postJSON("/admin/pay/" + id);
  location.reload();
}

async function setStatus(id, status) {
  await postJSON("/admin/status/" + id, { status });
  location.reload();
}

async function generateLabel(id) {
  if (!confirm("Générer l'étiquette de cette commande ?")) return;

  const data = await postJSON("/admin/generate-label/" + id);

  if (!data.success) {
    alert(data.error || "Erreur étiquette");
    return;
  }

  alert("Étiquette générée !");
  location.reload();
}

async function addTracking(id) {
  const tracking = prompt("Numéro de suivi ou info expédition :");
  if (!tracking) return;

  await postJSON("/admin/track/" + id, { tracking });
  location.reload();
}

async function bulkLabel() {
  const ids = selectedIds();

  if (!ids.length) {
    alert("Sélectionne au moins une commande.");
    return;
  }

  if (!confirm("Générer les étiquettes pour les commandes sélectionnées ?")) return;

  const data = await postJSON("/admin/bulk-generate-labels", { ids });

  if (!data.success) {
    alert(data.error || "Erreur génération en masse");
    return;
  }

  alert("Terminé. OK : " + data.done.length + " / Erreurs : " + data.errors.length);
  location.reload();
}

async function bulkPrinted() {
  const ids = selectedIds();

  if (!ids.length) {
    alert("Sélectionne au moins une commande.");
    return;
  }

  await postJSON("/admin/bulk-printed", { ids });
  location.reload();
}

async function bulkShipped() {
  const ids = selectedIds();

  if (!ids.length) {
    alert("Sélectionne au moins une commande.");
    return;
  }

  if (!confirm("Marquer ces commandes comme expédiées ?")) return;

  await postJSON("/admin/bulk-shipped", { ids });
  location.reload();
}

function exportCSV() {
  let csv = [];

  document.querySelectorAll("table tr").forEach(row => {
    let cols = row.querySelectorAll("td, th");
    let data = [...cols].map(c => {
      return '"' + c.innerText.replace(/"/g, '""') + '"';
    });
    csv.push(data.join(";"));
  });

  let blob = new Blob(["\ufeff" + csv.join("\n")], {
    type: "text/csv;charset=utf-8;"
  });

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
    app.get("/test-shipment", async (req, res) => {
  try {
    const fakeOrder = {
      email: "test@test.com",
      nom: "Test Client",
      tel: "0600000000",
      addr: "10 rue test",
      cp: "13010",
      ville: "Marseille",
      relais: {
        code: "131809" // ✅ vrai relais de tes logs
      },
      amount: 3
    };

    const response = await fetch("https://keepcold-server.onrender.com/create-shipment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(fakeOrder)
    });

    const data = await response.json();

    console.log("TEST SHIPMENT RESULT :", data);

    return res.json(data);

  } catch (err) {
    console.error("TEST ERROR :", err);
    return res.status(500).json({ error: err.message });
  }
});
app.get("/label/:checkout_id", async (req, res) => {
  if (req.query.key !== process.env.ADMIN_KEY) {
    return res.send("⛔ Accès refusé");
  }

  const result = await pool.query(
    "SELECT expedition_number FROM orders WHERE checkout_id = $1",
    [req.params.checkout_id]
  );

  if (!result.rows.length) {
    return res.send("Commande introuvable");
  }

  const base64 = result.rows[0].expedition_number;

  if (!base64 || base64 === "OK") {
    return res.send("Étiquette non disponible");
  }

  res.setHeader("Content-Type", "application/pdf");
  res.send(Buffer.from(base64, "base64"));
});

app.listen(PORT, () => {
  console.log("Serveur lancé sur le port " + PORT);
});
