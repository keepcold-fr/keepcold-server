const express = require("express");
const { Renvoyer } = require("renvoyer");
const commandes = {};
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);
const pool = new Pool({
  chaîne de connexion : process.env.DATABASE_URL,
  ssl : {
    rejetNon autorisé : faux
  }
});

app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  si (req.method === "OPTIONS") retourner res.sendStatus(200);
  suivant();
});

app.get("/", (req, res) => {
  res.send("Serveur KeepCold OK");
});

/* =========================
   RÉSUMÉ DES PAIEMENTS DE CRÉATION
========================= */
app.post("/create-checkout", async (req, res) => {
  essayer {
    const { montant, email, nom, tel, addr, cp, ville, relais } = req.body;

    if (!amount || !email || !nom || !tel || !addr || !cp || !ville || !relais) {
      retourner res.status(400).json({
        erreur : "Infos client, panier ou point relais manquant"
      });
    }

    const checkoutReference = "KC-" + Date.now();

    const response = await fetch("https://api.sumup.com/v0.1/checkouts", {
      méthode : « POST »,
      en-têtes : {
        Autorisation : « Bearer » + process.env.SUMUP_API_KEY,
        "Content-Type": "application/json"
      },
      corps : JSON.stringify({
        référence_de_boutique : référence_de_boutique,
        montant : Nombre(montant),
        devise : « EUR »,
        payer_par_courriel : process.env.SUMUP_MERCHANT_EMAIL,
        description : "Commande Keep Cold",
        redirect_url: "https://keepcold.fr/merci.html",
        Hosted_checkout : {
          activé : vrai
        }
      })
    });

    const data = await response.json();
    console.log("RÉPONSE SOMMAIRE :", données);

    si (!response.ok || !data.id) {
      retourner res.status(500).json({
        erreur : data.message || "Erreur de création de paiement SumUp",
        détails : données
      });
    }

    const checkoutDetails = await fetch(`https://api.sumup.com/v0.1/checkouts/${data.id}`, {
      méthode : "GET",
      en-têtes : {
        Autorisation : « Bearer » + process.env.SUMUP_API_KEY
      }
    });

    const checkoutData = await checkoutDetails.json();
    console.log("DÉTAILS DE LA COMMANDE :", checkoutData);
commandes[data.id] = {
  checkout_id : data.id,
  référence : checkoutReference,
  montant,
  e-mail,
  nom,
  tél,
  adresse,
  cp,
  ville,
  relais,
  payé : faux
};
    attendre pool.query(
  `INSERT INTO orders
   (checkout_id, reference, amount, email, nom, tel, addr, cp, ville, relais, paid, payment_status)
   VALEURS (1 $, 2 $, 3 $, 4 $, 5 $, 6 $, 7 $, 8 $, 9 $, 10 $, 11 $, 12 $)
   EN CAS DE CONFLIT (checkout_id) NE RIEN FAIRE`,
  [
    données.id,
    checkoutReference,
    Nombre (montant),
    e-mail,
    nom,
    tél,
    adresse,
    cp,
    ville,
    JSON.stringify(relais),
    FAUX,
    "EN ATTENTE"
  ]
);

console.log("COMMANDE ENREGISTRÉE EN DB :", checkoutReference);

console.log("COMMANDE STOCKÉE :", commandes[data.id]);
    retourner res.json({
      URL : checkoutData.hosted_checkout_url,
      checkout_id : data.id,
      référence : checkoutReference
    });

  } attraper (erreur) {
    retourner res.status(500).json({
      erreur : err.message
    });
  }
});

/* =========================
   CONFIRMATION COMMANDE
========================= */
app.post("/confirm-order", async (req, res) => {
  essayer {
    console.log("CONFIRMATION DE LA COMMANDE RECU :", req.body);

    const { email, nom, montant } = req.body;

    attendre resend.emails.send({
      de : « Keep Cold <contact@keepcold.fr> »,
      à : courriel,
      sujet : "Commande confirmée ❄️",
      html: `
        <h2>Merci ${nom} 🙌</h2>
        <p>Ta commande Keep Cold est bien confirmée.</p>
        <p><strong>Montant :</strong> ${montant} €</p>
        <p>Nous préparons ta commande et t'enverrons le suivi très bientôt.</p>
      `
    });

    const shippingResponse = await fetch("https://keepcold-server.onrender.com/create-shipment", {
      méthode : « POST »,
      en-têtes : {
        "Content-Type": "application/json"
      },
      corps : JSON.stringify(req.body)
    });

    const shippingData = await shippingResponse.json();
    console.log("DONNÉES D'EXPÉDITION :", shippingData);

    retourner res.json({
      succès : vrai,
      expédition : données d'expédition
    });

  } attraper (erreur) {
    console.error("ERREUR DE CONFIRMATION DE COMMANDE :", err);
    return res.status(500).json({ error: err.message });
  }
});

/* =========================
   EXPÉDITION CRÉATION M.
========================= */
app.post("/create-shipment", async (req, res) => {
  essayer {
    console.log("CRÉER UN RÉCUPÉ D'EXPÉDITION :", req.body);

    const { nom, adresse, cp, ville, email, tel, relais } = req.body;

    if (!nom || !addr || !cp || !ville || !email || !relais || !relais.code) {
      retourner res.status(400).json({
        succès : faux,
        erreur : "Infos client ou relais manquants"
      });
    }

    const enseigne = process.env.MR_ENSEIGNE;
    const cle = process.env.MR_PRIVATE_KEY;

    params const = {
      Enseigne: enseigne,
      ModeCol: "REL",
      ModeLiv : "24R",
      NDossier : "KC-" + Date.now(),
      NClient : nom,

      Expe_Langage: "FR",
      Expe_Ad1 : « Garder au frais »,
      Expe_Ad2 : "",
      Expe_Ad3 : "36 rue André Audoli",
      Expe_Ad4: "",
      Expe_Ville : "Marseille",
      Expe_CP : "13010",
      Expe_Pays : "FR",
      Expe_Tel1 : "0624947059",
      Expe_Tel2: "",
      Expe_Mail : "contact@keepcold.fr",

      Langue de destination : "FR",
      Dest_Ad1 : nom,
      Dest_Ad2: "",
      Dest_Ad3 : adresse,
      Dest_Ad4: "",
      Dest_Ville : ville,
      Dest_CP : cp,
      Pays de destination : "FR",
      Dest_Tel1: tel || "",
      Dest_Tel2: "",
      Courriel de destination : courriel,

      Poids : "3000",
      Longueur : "",
      Taille : "",
      NbColis : "1",

      CRT_Valeur : "0",
      CRT_Devis : "",
      Exp_Valeur : "",
      Exp_Devise : "",

      COL_Rel_Pays: "",
      COL_Rel: "",

      LIV_Rel_Pays : "FR",
      LIV_Rel : code relais,

      TAvisage : "",
      TReprise : "",
      Montage : "",
      TRDV : "",
      Assurance : "",
      Mode d'emploi : "Commande Keep Cold"
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
      params.Dest_Language +
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
      paramètres.Assurance +
      params.Instructions +
      clé;

    const sécurité = crypto
      .createHash("md5")
      .mise à jour(chaîne de sécurité)
      .digest("hex")
      .toUpperCase();

    const xml = `
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Corps>
    <WSI2_CreationExpedition xmlns="http://www.mondialrelay.fr/webservice/">
      ${Object.entries(params).map(([key, value]) => `<${key}>${value}</${key}>`).join("")}
      <Security>${security}</Security>
    </WSI2_CreationExpedition>
  </soap:Body>
</soap:Envelope>`;

    const response = await fetch("https://api.mondialrelay.com/WebService.asmx", {
      méthode : « POST »,
      en-têtes : {
        "Content-Type": "text/xml; charset=utf-8",
        Action SOAP : "http://www.mondialrelay.fr/webservice/WSI2_CreationExpedition"
      },
      corps : xml
    });

    const text = await response.text();
    console.log("EXPÉDITION MR :", texte);

    let expéditionNumber = "NON TROUVÉ";

    essayer {
      const match =
        text.match(/<ExpeditionNum>(.*?)<\/ExpeditionNum>/) ||
        text.match(/<ExpeditionNum[^>]*>(.*?)<\/ExpeditionNum>/) ||
        text.match(/<Expédition>(.*?)<\/Expédition>/);

      si (correspondance && correspondance[1]) {
        numéroExpédition = correspondance[1];
      }
    } attraper (e) {
      console.log("Suivi des erreurs d'extraction");
    }

    console.log("SUIVI :", numéroExpedition);

    attendre resend.emails.send({
      de : « Keep Cold <contact@keepcold.fr> »,
      à : "contact@keepcold.fr",
      sujet : "📦Nouvelle commande Keep Cold",
      html: `
        <h2>Nouvelle commande reçue</h2>

        <p><strong>Client :</strong> ${nom}</p>
        <p><strong>Courriel :</strong> ${email}</p>
        <p><strong>Téléphone :</strong> ${tel || "-"</p>

        <hr>

        <p><strong>Adresse du client :</strong><br>
        ${addr}<br>
        ${cp} ${ville}</p>

        <hr>

        <p><strong>Point relais :</strong><br>
        ${relais?.nom || ""}<br>
        ${relais?.adresse || ""}<br>
        ${relais?.ville || ""}<br>
        Code relais : ${relais?.code || ""</p>

        <hr>

        <p><strong>Numéro de suivi :</strong><br>
        ${expeditionNumber}</p>

        <p>
          L'expédition a été créée sur Mondial Relay.<br>
          Connectez-vous à votre espace pro pour imprimer l'étiquette.
        </p>
      `
    });

    retourner res.json({
      succès : vrai,
      brut : texte,
      numéro d'expédition
    });

  } attraper (erreur) {
    console.error("ERREUR DE CRÉATION DE L'EXPÉDITION :", err);
    retourner res.status(500).json({
      succès : faux,
      erreur : err.message
    });
  }
});

/* =========================
   RECHERCHE POINT RELAIS
========================= */
app.post("/mondial-relay", async (req, res) => {
  const { cp, ville } = req.body;

  essayer {
    const enseigne = process.env.MR_ENSEIGNE;
    const cle = process.env.MR_PRIVATE_KEY;

    params const = {
      Enseigne: enseigne,
      Pays : "FR",
      Ville: ville || "",
      CP : cp,
      Taille : "",
      Poids : "",
      Action: "",
      DelaiEnvoi: "0",
      RayonRecherche: "20",
      TypeActivité : "",
      NombreRésultats: "5"
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
      params.TypeActivité +
      params.NombreRésultats +
      clé;

    const sécurité = crypto
      .createHash("md5")
      .mise à jour(chaîne de sécurité)
      .digest("hex")
      .toUpperCase();

    const xml = `
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Corps>
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
      méthode : « POST »,
      en-têtes : {
        "Content-Type": "text/xml; charset=utf-8",
        Action SOAP : "http://www.mondialrelay.fr/webservice/WSI4_PointRelais_Recherche"
      },
      corps : xml
    });

    const text = await response.text();
    console.log("Réponse MR relais :", texte);

    return res.json({ success: true, raw: text });

  } attraper (erreur) {
    console.error("Erreur Mondial Relay :", error);
    retourner res.status(500).json({
      succès : faux,
      erreur : message d'erreur
    });
  }
});
app.post("/verify-payment", async (req, res) => {
  essayer {
    const { checkout_id } = req.body;

    si (!checkout_id) {
      retourner res.status(400).json({
        succès : faux,
        erreur : « checkout_id manquant »
      });
    }

    const commande = commandes[checkout_id];

    si (!ordre) {
      retourner res.status(404).json({
        succès : faux,
        erreur : "Commande introuvable sur le serveur"
      });
    }

    const response = await fetch(`https://api.sumup.com/v0.1/checkouts/${checkout_id}`, {
      méthode : "GET",
      en-têtes : {
        Autorisation : « Bearer » + process.env.SUMUP_API_KEY
      }
    });

    const paiement = attendre la réponse.json();

    console.log("VERIF SUMUP :", payment);

    si (payment.status !== "PAID") {
      retourner res.json({
        succès : faux,
        statut : paiement.statut,
        message : "Paiement non confirmé"
      });
    }

    si (commande.payée) {
  console.log("COMMANDE DEJA TRAITEE :", checkout_id);

  retourner res.json({
    succès : vrai,
    message : "Commande déjà traitée"
  });
}

    commande.payée = vrai;
    console.log("ENVOI EMAIL CLIENT :", order.email);

    essayer {
  attendre resend.emails.send({
    de : « Keep Cold <contact@keepcold.fr> »,
    à : commande.email,
    sujet : "Commande confirmée ❄️",
    html: `
      <h2>Merci ${order.nom} 🙌</h2>
      <p>Ta commande Keep Cold est bien confirmée.</p>
      <p><strong>Montant :</strong> ${order.amount}€</p>
    `
  });

  console.log("CLIENT DE COURRIEL OK");

} attraper (erreur) {
  console.error("ERREUR EMAIL CLIENT :", err);
}
    
    essayer {
  attendre resend.emails.send({
    de : « Keep Cold <contact@keepcold.fr> »,
    à : "contact@keepcold.fr",
    sujet : "💰 Paiement confirmé Keep Cold",
    html: `
      <h2>Paiement confirmé</h2>
      <p><strong>Référence :</strong> ${order.reference}</p>
      <p><strong>Montant :</strong> ${order.amount}€</p>
      <p><strong>Client :</strong> ${order.nom}</p>
      <p><strong>Courriel :</strong> ${order.email}</p>
    `
  });

  console.log("EMAIL ADMIN OK");

} attraper (erreur) {
  console.error("ERREUR EMAIL ADMIN :", err);
}

    const shippingResponse = await fetch("https://keepcold-server.onrender.com/create-shipment", {
      méthode : « POST »,
      en-têtes : {
        "Content-Type": "application/json"
      },
      corps : JSON.stringify(ordre)
    });

    const shippingData = await shippingResponse.json();

    console.log("EXPEDITION APRES PAIEMENT :", expéditionData);

    retourner res.json({
      succès : vrai,
      paiement,
      expédition : données d'expédition
    });

  } attraper (erreur) {
    console.error("ERREUR DE VÉRIFICATION DU PAIEMENT :", err);
    retourner res.status(500).json({
      succès : faux,
      erreur : err.message
    });
  }
});
const PORT = process.env.PORT || 3000;
app.get("/test-db", async (req, res) => {
  essayer {
    console.log("L'URL de la base de données existe-t-elle ?", !!process.env.DATABASE_URL);

    const result = await pool.query("SELECT NOW()");

    res.json({
      succès : vrai,
      temps : résultat.lignes[0]
    });
  } attraper (erreur) {
    console.error("ERREUR DE BASE DE DONNÉES COMPLÈTE :", err);

    res.status(500).json({
      succès : faux,
      erreur : err.message || String(err),
      code : err.code || null
    });
  }
});

app.get("/init-db", async (req, res) => {
  essayer {
    attendre pool.query(`
      CRÉER LA TABLE SI ELLE N'EXISTE PAS commandes (
        id CLÉ PRIMAIRE SÉRIE,
        checkout_id TEXTE UNIQUE,
        TEXTE de référence,
        montant NUMÉRIQUE,
        Courriel TEXTE,
        nom TEXTE,
        tel TEXT,
        adresse TEXTE,
        cp TEXTE,
        ville TEXTE,
        relais JSONB,
        payé BOOLÉEN PAR DÉFAUT faux,
        statut_paiement TEXT PAR DÉFAUT 'EN ATTENTE',
        numéro_expédition TEXTE,
        créé_à TIMESTAMP DEFAULT NOW(),
        mis à jour à TIMESTAMP DEFAULT NOW()
      )
    `);

    res.json({ success: true, message: "Table commandes créées" });
  } attraper (erreur) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/admin/orders", async (req, res) => {
  essayer {
    const résultat = await pool.query(`
      SÉLECTIONNER
        identifiant,
        référence,
        identifiant_de_la_boutique,
        montant,
        e-mail,
        nom,
        tél,
        cp,
        ville,
        payé,
        statut_de_paiement,
        numéro_expédition,
        créé_à
      À PARTIR DES commandes
      TRIER PAR created_at DESC
    `);

    res.json({
      succès : vrai,
      commandes : résultat.lignes
    });
  } attraper (erreur) {
    console.error("ERREUR COMMANDES ADMINISTRATIVES :", err);
    res.status(500).json({
      succès : faux,
      erreur : err.message
    });
  }
});

app.get("/admin", async (req, res) => { if (req.query.key !== process.env.ADMIN_KEY) { return res.send("⛔ Accès refusé"); }

try { const key = req.query.key; const search = (req.query.search || "").trim().toLowerCase(); const status = req.query.status || "all";

const résultat = await pool.query(`
  SÉLECTIONNER *
  À PARTIR DES commandes
  TRIER PAR created_at DESC
`);

soit orders = result.rows;
const allOrders = result.rows;

commandes = commandes.filter(o => {
  const isPaid = o.paid || o.payment_status === "PAID";
  const isShipped = !!o.numéro_expédition;

  si (statut === "payé" && !isPaid) retourner faux ;
  if (statut === "en attente" && isPaid) renvoie false ;
  si (statut === "expédié" && !estExpédié) retourner faux ;

  si (!recherche) retourner vrai ;

  const fullText = `
    ${o.reference || ""}
    ${o.nom || ""}
    ${o.email || ""}
    ${o.tel || ""}
    ${o.addr || ""}
    ${o.cp || ""}
    ${o.ville || ""}
    ${o.numéro_expédition || ""}
  `.toLowerCase();

  retourner fullText.includes(search);
});

const totalCA = allOrders.reduce((sum, o) => sum + Number(o.amount || 0), 0);
const totalPaid = allOrders.filter(o => o.paid || o.payment_status === "PAID").length;
const totalPending = allOrders.filter(o => !(o.paid || o.payment_status === "PAID")).length;
const totalExpédié = toutesLesCommandes.filter(o => !!o.numéro_expédition).length;

let rows = orders.map(o => {
  const relais = o.relais || {} ;
  const isPaid = o.paid || o.payment_status === "PAID";
  const isShipped = !!o.numéro_expédition;
  const date = o.created_at ? new Date(o.created_at).toLocaleString("fr-FR") : "-";

  const relaisNom = relais.nom || relais.nom || relais.Nom || relais.libelle || "-" ;
  const relaisAdresse = relais.adresse || relais.adresse || relais.Adresse || relais.adresse1 || "" ;
  const relaisVille = relais.ville || relais.city || relais.Ville || "" ;
  const relaisCode = relais.code || relais.id || relais.ID || relais.num || "" ;

  const trackingLink = o.numéro_expédition
    ? `<a href="https://www.mondialrelay.fr/suivi-de-colis/?numero=${encodeURIComponent(o.expedition_number)}" target="_blank">${o.expedition_number}</a>`
    : "-";

  retourner `
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
        <span class="badge ${isPaid ? "payé" : "en attente"}">
          ${isPaid ? "PAYÉ" : "EN ATTENTE"}
        </span>
      </td>
      <td>
        <span class="badge ${isShipped ? "expédié" : "en attente"}">
          ${isExpédié ? "EXPÉDIÉ" : "NON EXPÉDIÉ"}
        </span><br>
        <small>${trackingLink}</small>
      </td>
      <td class="actions">
        ${!isPaid ? `<button onclick="markPaid(${o.id})">✅ Marquer payé</button>` : `<button Disabled>✅ Payé</button>`}
        <button onclick="addTracking(${o.id})">📦 Ajouter suivi</button>
      </td>
    </tr>
  `;
}).rejoindre("");

si (!lignes) {
  rows = `<tr><td colspan="9" class="empty">Aucune commande trouvée.</td></tr>`;
}

res.send(`

<!DOCTYPE html><html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin Keep Cold</title>
<style>
  corps { marge:0; police:Arial,sans-serif; arrière-plan:dégradé-linéaire(180deg,#e8f8ff,#f7fdff); couleur:#102033; }
  header { background:linear-gradient(135deg,#0077b6,#00c2ff); color:white; padding:28px 20px 34px; border-bottom-left-radius:28px; border-bottom-right-radius:28px; box-shadow:0 8px 22px rgba(0,119,182,.25); }
  titre h1 { marge:0; taille de police:30px; }
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
  tableau { largeur:100%; largeur-min:1250px; bordure-réduction:réduction; }
  th { background:#023047; color:white; text-align:left; padding:15px; font-size:13px; white-space:nowrap; }
  td { padding:14px; border-bottom:1px solid #e5eef5; vertical-align:top; font-size:14px; }
  tr:hover { background:#f3fbff; }
  petit { couleur:#64748b; }
  .badge { display:inline-block; padding:7px 11px; border-radius:999px; font-size:12px; font-weight:bold; }
  .paid { background:#d1fae5; color:#047857; }
  .pending { background:#fff7ed; color:#c2410c; }
  .shipped { background:#dbeafe; color:#1d4ed8; }
  .actions { display:flex; gap:6px; flex-direction:column; }
  .actions button { border:none; border-radius:10px; padding:8px 10px; cursor:pointer; font-weight:bold; background:#e0f2fe; color:#075985; }
  .actions bouton:désactivé { opacité:.6; curseur:non autorisé; }
  .empty { text-align:center; padding:32px; color:#64748b; }
  @media(max-width:700px){ header h1{font-size:24px;} .stats{grid-template-columns:1fr;} .container{padding:14px;} }
</style>
</head>
<corps>
<header>
  <h1>Admin Gardez le froid ❄️</h1>
  <p>Commandes, paiements, points relais et suivis colis</p>
</header>
<div class="container">
  <div class="stats">
    <div class="card"><small>Nombre total de commandes</small><strong>${allOrders.length}</strong></div>
    <div class="card"><small>Payées</small><strong>${totalPaid}</strong></div>
    <div class="card"><small>En attente</small><strong>${totalPending}</strong></div>
    <div class="card"><small>Total CA</small><strong>${totalCA.toFixed(2)} €</strong></div>
  </div>
  <form class="toolbar" method="GET" action="/admin">
    <input type="hidden" name="key" value="${key}">
    <input type="text" name="search" placeholder="Rechercher client, ville, email..." value="${search}">
    <select name="statut">
      <option value="all" ${status === "all" ? "selected" : ""}>Toutes</option>
      <option value="paid" ${status === "paid" ? "selected" : ""}>Payées</option>
      <option value="pending" ${status === "pending" ? "selected" : ""}>En attente</option>
      <option value="shipped" ${status === "shipped" ? "selected" : ""}>Expédiés</option>
    </select>
    <button class="btn" type="submit">🔍 Filtrer</button>
    <a class="btn" href="/admin?key=${key}">🔄 Réinitialiser</a>
    <button class="btn secondary" type="button" onclick="exportCSV()">📊 Exporter au format CSV</button>
  </form>
  <div class="table-box">
    <table>
      <thead>
        <tr>
          <th>ID / Référence</th><th>Date</th><th>Client</th><th>Adresse</th><th>Point relais / Casier</th><th>Montant</th><th>Paiement</th><th>Expédition</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>
<script>
fonction asynchrone markPaid(id){
  if(!confirm("Marquer cette commande comme payée ?")) return;
  await fetch('/admin/pay/' + id, { method:'POST' });
  location.recharger();
}
fonction asynchrone ajouterTracking(id){
  const tracking = prompt("Numéro de suivi Mondial Relay");
  si (!suivi) retourner;
  await fetch('/admin/track/' + id, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ tracking }) });
  location.recharger();
}
fonction exportCSV(){
  soit csv = [];
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
  } attraper (erreur) {
    console.error("ERREUR ADMIN :", err);
    res.send("Erreur admin : " + err.message);
  }
});app.post("/admin/pay/:id", async (req, res) => { try { await pool.query( "UPDATE orders SET paid=true, payment_status='PAID', updated_at=NOW() WHERE id=$1", [req.params.id] ); res.json({ success: true }); } catch (err) { console.error("ERREUR ADMIN PAY :", err); res.status(500).json({ success: false, error: err.message }); } });

app.post("/admin/track/:id", async (req, res) => { try { const { tracking } = req.body; await pool.query( "UPDATE orders SET expedition_number=$1, updated_at=NOW() WHERE id=$2", [tracking, req.params.id] ); res.json({ success: true }); } catch (err) { console.error("ERREUR ADMIN TRACK :", err); res.status(500).json({ success: false, error: err.message }); } });app.listen(PORT, () => {
  console.log("Serveur lancé sur le port " + PORT);
});
