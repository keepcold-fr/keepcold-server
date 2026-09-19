(function () {
  "use strict";

  const STATUS_URL = "https://keepcold-server.onrender.com/shop-status";
  const CONTACT_EMAIL = "contact@keepcold.fr";
  const CLOSED_MESSAGE =
    "Les commandes en ligne sont temporairement suspendues pendant la pause hivernale.";

  const shop = {
    ordersOpen: false,
    showPause() {
      window.alert(CLOSED_MESSAGE);
    }
  };

  window.KeepColdShop = shop;

  function createPausePanel() {
    const panel = document.createElement("section");
    panel.id = "kc-seasonal-pause";
    panel.setAttribute("role", "status");
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML = `
      <div class="kc-seasonal-pause__icon" aria-hidden="true">❄️</div>
      <p class="kc-seasonal-pause__eyebrow">Pause hivernale</p>
      <h1>Les commandes en ligne sont temporairement fermées</h1>
      <p>Keep Cold prépare la prochaine saison. La date de réouverture sera annoncée directement sur le site.</p>
      <a href="mailto:${CONTACT_EMAIL}?subject=Demande%20professionnelle%20Keep%20Cold">
        Une demande professionnelle ? Écrivez-nous
      </a>
    `;
    return panel;
  }

  function ensurePauseStyles() {
    if (document.getElementById("kc-seasonal-pause-styles")) return;

    const style = document.createElement("style");
    style.id = "kc-seasonal-pause-styles";
    style.textContent = `
      #kc-seasonal-pause {
        box-sizing: border-box;
        max-width: 920px;
        margin: 24px auto;
        padding: 28px 22px;
        border: 1px solid rgba(14, 116, 144, 0.24);
        border-radius: 24px;
        background: linear-gradient(135deg, #effaff 0%, #ffffff 50%, #e0f2fe 100%);
        box-shadow: 0 18px 45px rgba(14, 116, 144, 0.14);
        color: #0f172a;
        text-align: center;
      }
      .kc-seasonal-pause__icon { font-size: 2.4rem; line-height: 1; }
      .kc-seasonal-pause__eyebrow {
        margin: 12px 0 6px;
        color: #0369a1;
        font-size: 0.78rem;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }
      #kc-seasonal-pause h1 {
        margin: 0;
        color: #0c4a6e;
        font-size: clamp(1.45rem, 4vw, 2.25rem);
        line-height: 1.15;
      }
      #kc-seasonal-pause p:not(.kc-seasonal-pause__eyebrow) {
        max-width: 650px;
        margin: 14px auto 20px;
        color: #475569;
        line-height: 1.55;
      }
      #kc-seasonal-pause a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 46px;
        padding: 0 20px;
        border-radius: 999px;
        background: #0369a1;
        color: #ffffff;
        font-weight: 700;
        text-decoration: none;
      }
      .kc-shop-hidden { display: none !important; }
      @media (max-width: 640px) {
        #kc-seasonal-pause { margin: 16px 12px; padding: 24px 16px; }
        #kc-seasonal-pause a { width: 100%; box-sizing: border-box; }
      }
    `;
    document.head.appendChild(style);
  }

  function elementsToPause() {
    const path = window.location.pathname.toLowerCase();

    if (path.endsWith("/panier.html") || path.endsWith("/parfums.html")) {
      return Array.from(document.querySelectorAll("main"));
    }

    return Array.from(document.querySelectorAll([
      "#flavors",
      "#packs",
      ".cart-summary",
      "#floating-cart",
      ".trust-strip",
      ".nav-cta",
      "a[href='#flavors']",
      "a[href='#packs']",
      "a[href='panier.html']",
      "a[href='pack.html']",
      "button[onclick*=\"goToCart\"]",
      "button[onclick*=\"scrollToId('flavors')\"]",
      "button[onclick*=\"window.location.href='pack.html\"]"
    ].join(",")));
  }

  function setOrderingAvailability(isOpen) {
    shop.ordersOpen = Boolean(isOpen);

    elementsToPause().forEach((element) => {
      element.classList.toggle("kc-shop-hidden", !shop.ordersOpen);
      element.setAttribute("aria-hidden", shop.ordersOpen ? "false" : "true");
    });

    let panel = document.getElementById("kc-seasonal-pause");

    if (!shop.ordersOpen && !panel) {
      panel = createPausePanel();
      const header = document.querySelector("header");
      if (header) header.insertAdjacentElement("afterend", panel);
      else document.body.insertAdjacentElement("afterbegin", panel);
    }

    if (shop.ordersOpen && panel) panel.remove();
  }

  async function loadShopStatus() {
    ensurePauseStyles();
    setOrderingAvailability(false);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(STATUS_URL, {
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) return;

      const status = await response.json();
      setOrderingAvailability(status.orders_open === true);
    } catch (error) {
      console.warn("Statut de la boutique indisponible : commandes maintenues fermées.");
    } finally {
      window.clearTimeout(timeout);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadShopStatus, { once: true });
  } else {
    loadShopStatus();
  }
})();
