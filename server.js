const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

app.post("/create-checkout", async (req, res) => {
  const { amount } = req.body;

  try {
    const response = await fetch("https://api.sumup.com/v0.1/checkouts", {
      method: "POST",
      headers: {
        "Authorization": "Bearer TON_TOKEN_SUMUP",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        checkout_reference: "order-" + Date.now(),
        amount: amount,
        currency: "EUR",
        pay_to_email: "TON_EMAIL_SUMUP",
        description: "Commande Keep Cold"
      })
    });

    const data = await response.json();

    res.json({
      url: data.hosted_checkout_url
    });

  } catch (err) {
    res.status(500).json({ error: "Erreur paiement" });
  }
});

app.listen(3000, () => {
  console.log("Serveur lancé sur http://localhost:3000");
});
