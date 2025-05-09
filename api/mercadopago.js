const admin = require('firebase-admin');
const crypto = require('crypto');

// ======================
// 1. Configuración Firebase
// ======================
try {
  console.log('[CONFIG] Validando variables de entorno...');
  
  if (!process.env.FIREBASE_PROJECT_ID || 
      !process.env.FIREBASE_CLIENT_EMAIL || 
      !process.env.FIREBASE_PRIVATE_KEY) {
    throw new Error('Variables de Firebase no configuradas correctamente');
  }

  console.log('[CONFIG] Inicializando Firebase...');
  
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });

  console.log('[CONFIG] Firebase inicializado correctamente');
} catch (firebaseError) {
  console.error('[ERROR] Fallo en Firebase:', {
    message: firebaseError.message,
    stack: firebaseError.stack,
    envVariables: {
      projectId: !!process.env.FIREBASE_PROJECT_ID,
      clientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: !!process.env.FIREBASE_PRIVATE_KEY
    }
  });
  throw firebaseError; // Detiene la ejecución si Firebase falla
}

// ======================
// 2. Manejador del Webhook
// ======================
module.exports = async (req, res) => {
  console.log('[WEBHOOK] Headers recibidos:', req.headers);
  console.log('[WEBHOOK] Cuerpo recibido:', req.body);

  // Validación básica del body
  if (!req.body || typeof req.body !== 'object') {
    console.error('[ERROR] Body inválido');
    return res.status(400).json({ error: 'Body must be a JSON object' });
  }

  try {
    // ======================
    // 3. Validación de Firma
    // ======================
    const signature = req.headers['x-signature'];
    if (!signature) {
      console.error('[ERROR] Falta header x-signature');
      return res.status(403).json({ error: 'Missing X-Signature header' });
    }

    if (!process.env.MP_WEBHOOK_SECRET) {
      console.error('[ERROR] MP_WEBHOOK_SECRET no configurado');
      return res.status(500).json({ error: 'Server misconfigured' });
    }

    // Generación de la firma esperada
    const rawBody = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', process.env.MP_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    console.log('[AUTH] Firma recibida:', signature);
    console.log('[AUTH] Firma generada:', expectedSignature);

    if (signature !== expectedSignature) {
      console.error('[ERROR] Firmas no coinciden');
      return res.status(403).json({ 
        error: 'Invalid signature',
        received: signature,
        expected: expectedSignature
      });
    }

    // ======================
    // 4. Procesamiento del Pago
    // ======================
    console.log('[PROCESO] Validando estructura del pago...');
    
    const { id, status } = req.body.data || {};
    if (!id || !status) {
      console.error('[ERROR] Datos de pago incompletos');
      return res.status(400).json({ error: 'Missing payment data' });
    }

    console.log(`[PROCESO] Registrando pago ${id} con estado ${status}`);

    await admin.firestore().collection('payments').doc(id).set({
      status,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      rawData: req.body // Opcional: guardar datos completos
    }, { merge: true });

    console.log('[PROCESO] Pago registrado exitosamente');

    // ======================
    // 5. Respuesta Exitosa
    // ======================
    return res.status(200).json({ 
      success: true,
      paymentId: id,
      status: status
    });

  } catch (error) {
    console.error('[ERROR CRÍTICO]', {
      message: error.message,
      stack: error.stack,
      bodyReceived: req.body
    });
    
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
};
