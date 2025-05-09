const express = require("express");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./firebase-admin-key.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const app = express();
app.use(express.json());

app.post("/guardar-email", async (req, res) => {
  try {
    console.log("📥 Recibido POST a /guardar-email");

    const { email } = req.body;
    if (!email) {
      console.log("⚠️ Falta el email");
      return res.status(400).send("Falta el email");
    }

    await db.collection("pagos_pendientes").add({ email, pagado: false });

    console.log("✅ Email guardado:", email);
    res.status(200).send("Email guardado");
  } catch (error) {
    console.error("❌ Error en /guardar-email:", error);
    res.status(500).send("Error interno");
  }
});


// Ruta para recibir el webhook de MercadoPago
app.post("/webhook-mercadopago", async (req, res) => {
  try {
    const { type, data } = req.body;

    if (type === "payment") {
      const paymentId = data.id;
      console.log("📥 Webhook recibido para pago ID:", paymentId);

      // Aquí deberías hacer una consulta real a la API de MP con tu token
      const pagoAprobado = true;

      if (pagoAprobado) {
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
        } else {
          console.warn("⚠️ No hay registros pendientes de pago.");
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error en /webhook-mercadopago:", error);
    res.sendStatus(500);
  }
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
