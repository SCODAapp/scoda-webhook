const express = require("express");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// Cargar las credenciales desde la variable de entorno
const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_KEY);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const app = express();
app.use(express.json());

// Resto del código...


// Guardar email antes del pago
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

    // Consulta a MercadoPago (usaremos un token real luego)
    // Aquí simularías la consulta si no tienes el token
    const pagoAprobado = true;

    if (pagoAprobado) {
      // Supongamos que el ID de pago ya estaba en pagos_pendientes
      const pendientes = await db.collection("pagos_pendientes")
        .where("pagado", "==", false)
        .limit(1)
        .get();

      if (!pendientes.empty) {
        const doc = pendientes.docs[0];
        const email = doc.data().email;

        // Crea usuario en tu app (ajustar esto a tu sistema)
        await db.collection("usuarios").add({
          email,
          creado_en: new Date(),
          rol: "cliente"
        });

        await doc.ref.update({ pagado: true });
        console.log("✅ Usuario creado para:", email);
      }
    }
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

