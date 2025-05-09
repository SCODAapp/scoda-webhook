const admin = require('firebase-admin');
const crypto = require('crypto');

// Configuración con variables de entorno (se configurarán en Vercel)
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  })
});

module.exports = async (req, res) => {
  try {
    // 1. Validar firma de MercadoPago
    const signature = req.headers['x-signature'];
    const hash = crypto
      .createHmac('sha256', process.env.MP_WEBHOOK_SECRET)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== signature) {
      return res.status(403).json({ error: 'Firma inválida' });
    }

    // 2. Procesar el pago
    const { id, status } = req.body.data;
    await admin.firestore().collection('payments').doc(id).set({
      status,
      processedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 3. Respuesta obligatoria para MP
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Error en webhook:', error);
    return res.status(500).json({ error: 'Error interno' });
  }
};
