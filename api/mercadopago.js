const admin = require('firebase-admin');
const crypto = require('crypto');

// =============================================
// 1. Configuración de Firebase (con validación)
// =============================================
try {
  console.log('[CONFIG] Validando variables de Firebase...');
  
  if (!process.env.FIREBASE_PROJECT_ID || 
      !process.env.FIREBASE_CLIENT_EMAIL || 
      !process.env.FIREBASE_PRIVATE_KEY) {
    throw new Error('Faltan variables de Firebase en Vercel');
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
  console.log('[CONFIG] Firebase configurado correctamente');
} catch (firebaseError) {
  console.error('[ERROR FATAL] Configuración de Firebase falló:', {
    error: firebaseError.message,
    variablesSet: {
      projectId: !!process.env.FIREBASE_PROJECT_ID,
      clientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: !!process.env.FIREBASE_PRIVATE_KEY
    }
  });
  process.exit(1); // Detiene la ejecución si Firebase no se inicia
}

// =============================================
// 2. Manejador del Webhook
// =============================================
module.exports = async (req, res) => {
  console.log('[WEBHOOK] Nueva solicitud recibida');
  
  // Validación básica del método HTTP
  if (req.method !== 'POST') {
    console.warn('[WARN] Método no permitido:', req.method);
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    // =============================================
    // 3. Parseo y validación del cuerpo
    // =============================================
    if (!req.body || typeof req.body !== 'object') {
      console.error('[ERROR] Body inválido o vacío');
      return res.status(400).json({ error: 'Body debe ser un JSON válido' });
    }

    console.log('[WEBHOOK] Body recibido:', JSON.stringify(req.body, null, 2));

    // =============================================
    // 4. Validación de la firma (Adaptado a MP 2023+)
    // =============================================
    const signatureHeader = req.headers['x-signature'];
    console.log('[AUTH] Header X-Signature recibido:', signatureHeader);

    if (!signatureHeader) {
      console.error('[ERROR] Falta header X-Signature');
      return res.status(403).json({ error: 'Falta cabecera de autenticación' });
    }

    // Extrae la firma del formato "ts=...,v1=..."
    const signatureParts = signatureHeader.split(',v1=');
    if (signatureParts.length !== 2) {
      console.error('[ERROR] Formato de firma inválido');
      return res.status(400).json({ error: 'Formato de firma no reconocido' });
    }

    const signature = signatureParts[1].trim();
    if (!signature || !/^[a-f0-9]{64}$/.test(signature)) {
      console.error('[ERROR] Firma SHA256 inválida');
      return res.status(400).json({ error: 'Firma mal formada' });
    }

    // Generación de la firma esperada
    if (!process.env.MP_WEBHOOK_SECRET) {
      console.error('[ERROR] MP_WEBHOOK_SECRET no configurado');
      return res.status(500).json({ error: 'Error de configuración del servidor' });
    }

    const rawBody = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', process.env.MP_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    console.log('[AUTH] Comparación de firmas:', {
      recibida: signature,
      generada: expectedSignature,
      bodyUsado: rawBody
    });

    if (signature !== expectedSignature) {
      console.error('[ERROR] Firmas no coinciden');
      return res.status(403).json({ 
        error: 'Firma inválida',
        details: 'La firma no coincide con el payload y secret'
      });
    }

    // =============================================
    // 5. Procesamiento del pago
    // =============================================
    const { id, status } = req.body.data || {};
    if (!id || !status) {
      console.error('[ERROR] Datos de pago incompletos');
      return res.status(400).json({ error: 'Faltan campos obligatorios en el body' });
    }

    console.log(`[PROCESO] Registrando pago ${id} con estado ${status}`);

    await admin.firestore().collection('payments').doc(id).set({
      status,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      metadata: {
        source: 'MercadoPago',
        live_mode: req.body.live_mode || false
      }
    }, { merge: true });

    console.log('[PROCESO] Pago registrado exitosamente en Firestore');

    // =============================================
    // 6. Respuesta exitosa
    // =============================================
    return res.status(200).json({ 
      success: true,
      paymentId: id,
      status: status
    });

  } catch (error) {
    console.error('[ERROR CRÍTICO]', {
      message: error.message,
      stack: error.stack,
      body: req.body,
      headers: req.headers
    });
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      requestId: req.headers['x-request-id']
    });
  }
};
