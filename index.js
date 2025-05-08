const express = require("express");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const axios = require("axios");
const serviceAccount = require("./firebase-admin-key.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const app = express();
app.use(express.json());

// Ruta para guardar el email antes del pago
app.post("/guardar-email", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).send("Falta el email");
  await db.collection("pagos_pendientes").add({ email, pagado: false });
  res.status(200).send("Email guardado");
});

// Webhook de MercadoPago
app.post("/webhook-mercadopago", async (req, res) => {
  const { type, data } = req.body;

  if (type === "payment") {
    const paymentId = data.id;

    try {
      const mpResponse = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`
        }
      });

      const status = mpResponse.data.status;
      if (status === "approved") {
        const pendientes = await db.collection("pagos_pendientes")
          .where("pagado", "==", false)
          .limit(1)
          .get();

        if (!pendientes.empty) {
          const doc = pendientes.docs[0];
          const email = doc.data().email;

          await db.collection("usuarios").add({
            email,
            creado_en: new Date(),
            rol: "cliente"
          });

          await doc.ref.update({ pagado: true });
          console.log("✅ Usuario creado para:", email);
        }
      }
    } catch (error) {
      console.error("Error al consultar MercadoPago:", error.message);
    }
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
