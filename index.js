const express = require("express");
const axios = require("axios");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./firebase-admin-key.json");

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();
const app = express();
app.use(express.json());

app.post("/webhook-mercadopago", async (req, res) => {
  const { type, data } = req.body;

  if (type === "payment") {
    const paymentId = data.id;

    try {
      const response = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        },
      });

      const pago = response.data;

      if (pago.status === "approved") {
        await db.collection("pagos").doc(`${paymentId}`).set(pago);
        console.log("✅ Pago aprobado guardado en Firestore");
      }

    } catch (error) {
      console.error("❌ Error al consultar Mercado Pago:", error.response?.data || error.message);
    }
  }

  res.status(200).send("OK");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
