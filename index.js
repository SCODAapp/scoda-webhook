const express = require("express");
const crypto = require("crypto");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./firebase-admin-key.json");

// Firebase
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const app = express();

// Middleware solo para JSON (NO afecta /webhook-mercadopago)
app.use("/guardar-email", express.json());

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

// Middleware raw solo para la ruta del webhook
app.use("/webhook-mercadopago", express.raw({ type: "*/*" }));

app.post("/webhook-mercadopago", async (req, res) => {
  try {
    const signature = req.headers["x-signature"];
    const secret = process.env.MP_WEBHOOK_SECRET;

    if (!signature || !secret) {
      console.error("⚠️ Falta X-Signature o el secreto");
      return res.status(400).send("Faltan datos de autenticación");
    }

    const rawBody = req.body;
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(rawBody);
    const expectedSignature = hmac.digest("hex");

    if (signature !== expectedSignature) {
      console.error("❌ Firmas no coinciden");
      console.log("Recibida:", signature);
      console.log("Generada:", expectedSignature);
      return res.status(403).send("Firma no válida");
    }

    const parsed = JSON.parse(rawBody.toString());

    const { type, data } = parsed;

    if (type === "payment") {
      const paymentId = data.id;
      console.log("📥 Webhook válido recibido para pago ID:", paymentId);

      // Aquí deberías validar contra la API real de MercadoPago
      const pagoAprobado = true;

      if (pagoAprobado) {
        const pendientes = await db
          .collection("pagos_pendientes")
          .where("pagado", "==", false)
          .limit(1)
          .get();

        if (!pendientes.empty) {
          const doc = pendientes.docs[0];
          const email = doc.data().email;

          await db.collection("usuarios").add({
            email,
            creado_en: new Date(),
            rol: "cliente",
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

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
