const admin = require('firebase-admin');
const crypto = require('crypto');

console.log('Inicializando Firebase...'); // Debug 1

try {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
  });
  console.log('Firebase inicializado correctamente'); // Debug 2
} catch (firebaseError) {
  console.error('Error inicializando Firebase:', firebaseError);
}

module.exports = async (req, res) => {
  console.log('Webhook recibido. Body:', req.body); // Debug 3
  
  try {
    // 1. Validar firma
    const signature = req.headers['x-signature'];
    if (!signature) {
      console.error('Falta header x-signature');
      return res.status(403).json({ error: 'Firma no proporcionada' });
    }

    const hash = crypto
      .createHmac('sha256', process.env.MP_WEBHOOK_SECRET || '')
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== signature) {
      console.error('Firma inválida recibida');
      return res.status(403).json({ error: 'Firma inválida' });
    }

    // 2. Procesar pago
    if (!req.body?.data?.id) {
      console.error('Body inválido:', req.body);
      return res.status(400).json({ error: 'Datos incompletos' });
    }

    const { id, status } = req.body.data;
    console.log(`Procesando pago ${id} con estado ${status}`); // Debug 4

    await admin.firestore().collection('payments').doc(id).set({
      status,
      processedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('Pago registrado exitosamente'); // Debug 5
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Error en el webhook:', error);
    return res.status(500).json({ 
      error: 'Error interno',
      details: error.message 
    });
  }
};
