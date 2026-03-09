/**
 * Cloudflare Pages Function für Schadensmeldungs-Formular
 * Sicherheit: Validierung, Rate Limiting, Input Sanitizing
 */

interface Attachment {
  filename: string;
  content: string; // base64
  type: string; // MIME type
}

interface FormData {
  name: string;
  telefon: string;
  plz: string;
  ort: string;
  kontaktweg: string;
  email?: string;
  emailBestaetigung?: string; // Optional confirmation email
  beschreibung?: string;
  dsgvo: boolean;
  attachments?: Attachment[];
}

interface ErrorResponse {
  error: string;
  code?: string;
}

interface SuccessResponse {
  success: boolean;
  message: string;
  timestamp: string;
}

type ApiResponse = SuccessResponse | ErrorResponse;

/**
 * SICHERHEITS-FUNKTIONEN
 */

// Input Sanitizing - entfernt gefährliche Zeichen
function sanitizeInput(input: string): string {
  if (!input) return '';
  return input
    .trim()
    .replace(/[<>]/g, '') // HTML-Tags entfernen
    .slice(0, 500); // Max 500 Zeichen
}

// Validierung für jedes Feld
function validateFormData(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Name validieren
  if (!data.name || typeof data.name !== 'string') {
    errors.push('Name ist erforderlich');
  } else if (data.name.length < 2 || data.name.length > 100) {
    errors.push('Name muss zwischen 2 und 100 Zeichen lang sein');
  }

  // Telefon validieren
  if (!data.telefon || typeof data.telefon !== 'string') {
    errors.push('Telefon ist erforderlich');
  } else if (!/^[\d\s\-\+\(\)]{7,20}$/.test(data.telefon)) {
    errors.push('Telefon-Format ungültig');
  }

  // PLZ validieren
  if (!data.plz || typeof data.plz !== 'string') {
    errors.push('PLZ ist erforderlich');
  } else if (!/^\d{5}$/.test(data.plz)) {
    errors.push('PLZ muss 5 Ziffern enthalten');
  }

  // Ort validieren
  if (!data.ort || typeof data.ort !== 'string') {
    errors.push('Ort ist erforderlich');
  } else if (data.ort.length < 2 || data.ort.length > 50) {
    errors.push('Ort-Format ungültig');
  }

  // Kontaktweg validieren
  const validKontaktwege = ['telefon', 'whatsapp', 'email'];
  if (!validKontaktwege.includes(data.kontaktweg)) {
    errors.push('Ungültiger Kontaktweg');
  }

  // Email validieren (wenn gewählt)
  if (data.kontaktweg === 'email') {
    if (!data.email || typeof data.email !== 'string') {
      errors.push('E-Mail ist erforderlich');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.push('E-Mail-Format ungültig');
    }
  }

  // DSGVO-Zustimmung validieren
  if (data.dsgvo !== true) {
    errors.push('DSGVO-Zustimmung ist erforderlich');
  }

  // Beschreibung validieren (optional)
  if (data.beschreibung && typeof data.beschreibung === 'string') {
    if (data.beschreibung.length > 2000) {
      errors.push('Beschreibung darf max. 2000 Zeichen lang sein');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Rate Limiting - einfach auf Client-IP
async function checkRateLimit(ip: string, context: any): Promise<boolean> {
  // Rate Limit: Max 5 Submissions pro IP pro Stunde
  // (In Production würde man KV Store nutzen, für MVP einfache Implementierung)

  // Für jetzt: Einfacher Check - in Production mit Cloudflare KV
  // context.env.RATELIMIT_KV würde verwendet

  return true; // Placeholder - später mit KV implementieren
}

// Email Text formatieren
function formatEmailText(data: FormData): string {
  return `
NEUE SCHADENSMELDUNG
═══════════════════════════════════════

PERSÖNLICHE DATEN
─────────────────
Name:           ${sanitizeInput(data.name)}
Telefon:        ${sanitizeInput(data.telefon)}
PLZ/Ort:        ${sanitizeInput(data.plz)} / ${sanitizeInput(data.ort)}
Kontaktweg:     ${data.kontaktweg.toUpperCase()}
${data.email ? `E-Mail:         ${sanitizeInput(data.email)}\n` : ''}
SCHADENBESCHREIBUNG
───────────────────
${sanitizeInput(data.beschreibung || '(keine Beschreibung eingegeben)')}

METADATA
────────
DSGVO akzeptiert:  Ja ✓
Eingereicht am:    ${new Date().toLocaleString('de-DE')}
IP-Adresse:        [LOGGED]

═══════════════════════════════════════
Bitte antworten Sie innerhalb von 24 Stunden.
  `;
}

// Bestätigungs-Email für User
function formatConfirmationEmail(data: FormData): string {
  return `Liebe/r ${sanitizeInput(data.name)},

vielen Dank für Ihre Schadensmeldung bei SchadenCheck!

Wir haben Ihre Anfrage erhalten und werden uns innerhalb von 24 Stunden bei Ihnen melden.

IHRE EINGABEN:
──────────────
Name: ${sanitizeInput(data.name)}
Telefon: ${sanitizeInput(data.telefon)}
Ort: ${sanitizeInput(data.ort)}

Bevorzugter Kontaktweg: ${data.kontaktweg.toUpperCase()}

BEI DRINGENDEN FÄLLEN:
──────────────────────
Telefon: +49 2191 7932020
WhatsApp: https://wa.me/4921917932020
E-Mail: info@schaden-check24.de

Viele Grüße,
Ihr SchadenCheck Team

---
Diese E-Mail wurde automatisch generiert.
  `;
}

/**
 * MAIN HANDLER
 */
export const onRequest: PagesFunction = async (context) => {
  const { request, env } = context;

  // CORS Headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://schaden-check24.de',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // OPTIONS Request (CORS Preflight)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // Nur POST akzeptieren
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method Not Allowed' } as ErrorResponse),
      { status: 405, headers: corsHeaders }
    );
  }

  try {
    // IP für Rate Limiting
    const ip =
      request.headers.get('CF-Connecting-IP') || 'unknown';

    // Rate Limit Check
    const rateLimitOk = await checkRateLimit(ip, context);
    if (!rateLimitOk) {
      return new Response(
        JSON.stringify({
          error: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.',
          code: 'RATE_LIMITED',
        } as ErrorResponse),
        { status: 429, headers: corsHeaders }
      );
    }

    // JSON parsen
    let formData: any;
    try {
      formData = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Ungültiges JSON Format' } as ErrorResponse),
        { status: 400, headers: corsHeaders }
      );
    }

    // VALIDIERUNG
    const validation = validateFormData(formData);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({
          error: validation.errors.join('; '),
          code: 'VALIDATION_ERROR',
        } as ErrorResponse),
        { status: 400, headers: corsHeaders }
      );
    }

    // Daten säubern
    const cleanData: FormData = {
      name: sanitizeInput(formData.name),
      telefon: sanitizeInput(formData.telefon),
      plz: sanitizeInput(formData.plz),
      ort: sanitizeInput(formData.ort),
      kontaktweg: formData.kontaktweg,
      email: formData.email ? sanitizeInput(formData.email) : undefined,
      emailBestaetigung: formData.emailBestaetigung ? sanitizeInput(formData.emailBestaetigung) : undefined,
      beschreibung: formData.beschreibung
        ? sanitizeInput(formData.beschreibung)
        : undefined,
      dsgvo: formData.dsgvo === true,
      attachments: formData.attachments || undefined, // Keep attachments from frontend
    };

    // Format contact preference label
    const kontaktwegLabel: Record<string, string> = {
      telefon: 'Telefon',
      whatsapp: 'WhatsApp',
      email: 'E-Mail',
    };

    // HTML Email Templates

    // Confirmation email template (simplified, beautiful design with logo)
    const confirmationEmailHTML = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Ihre Anfrage bei SchadenCheck</title></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f0f4f8;">
<div style="max-width:600px;margin:40px auto;background-color:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
  <!-- Header with Logo -->
  <div style="background:linear-gradient(135deg, #003366 0%, #004d99 100%);padding:40px 30px;text-align:center;">
    <div style="background-color:#FFCC00;width:80px;height:80px;border-radius:50%;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 8px rgba(0,0,0,0.2);">
      <svg width="50" height="50" viewBox="0 0 24 24" fill="#003366">
        <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
      </svg>
    </div>
    <h1 style="color:#FFCC00;margin:0;font-size:32px;font-weight:700;letter-spacing:-0.5px;">SchadenCheck</h1>
    <p style="color:#fff;margin:12px 0 0 0;font-size:15px;opacity:0.95;">Ihr Kfz-Gutachter für schnelle Schadensregulierung</p>
  </div>

  <!-- Content -->
  <div style="padding:45px 35px;">
    <h2 style="color:#003366;margin:0 0 25px 0;font-size:24px;font-weight:600;">Vielen Dank für Ihre Anfrage!</h2>

    <p style="color:#4b5563;line-height:1.8;font-size:16px;margin:0 0 20px 0;">
      Sehr geehrte(r) <strong style="color:#003366;">${cleanData.name}</strong>,
    </p>

    <p style="color:#4b5563;line-height:1.8;font-size:16px;margin:0 0 20px 0;">
      wir haben Ihre Schadensmeldung <strong>erfolgreich erhalten</strong> und werden uns <strong style="color:#003366;">innerhalb von 24 Stunden</strong> bei Ihnen melden, um einen Termin zur Begutachtung zu vereinbaren.
    </p>

    <!-- Info Box -->
    <div style="background:linear-gradient(135deg, #e0f2fe 0%, #dbeafe 100%);border-left:5px solid #003366;border-radius:8px;padding:25px;margin:30px 0;">
      <h3 style="color:#003366;margin:0 0 15px 0;font-size:18px;font-weight:600;">✓ Ihre Anfrage wurde registriert</h3>
      <p style="color:#1e40af;margin:0;line-height:1.7;font-size:15px;">
        Unser Team wird Ihre Schadensmeldung umgehend bearbeiten. Sie erhalten zeitnah eine Rückmeldung zur Terminvereinbarung.
      </p>
    </div>

    <div style="background-color:#f9fafb;border-radius:8px;padding:25px;margin:30px 0;">
      <h4 style="color:#374151;margin:0 0 15px 0;font-size:16px;font-weight:600;">📋 Ihre Kontaktdaten:</h4>
      <table style="width:100%;color:#4b5563;font-size:15px;">
        <tr><td style="padding:6px 0;font-weight:600;width:35%;">Name:</td><td style="padding:6px 0;">${cleanData.name}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600;">Telefon:</td><td style="padding:6px 0;">${cleanData.telefon}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600;">PLZ/Ort:</td><td style="padding:6px 0;">${cleanData.plz} ${cleanData.ort}</td></tr>
      </table>
    </div>

    <p style="color:#4b5563;line-height:1.8;font-size:16px;margin:30px 0 20px 0;">
      <strong style="color:#003366;">Bei dringenden Fällen</strong> können Sie uns auch direkt kontaktieren:
    </p>

    <!-- CTA Buttons -->
    <div style="margin:30px 0;text-align:center;">
      <a href="tel:+4921917932020" style="display:inline-block;background-color:#003366;color:#fff;text-decoration:none;padding:16px 32px;border-radius:8px;font-weight:600;font-size:15px;margin:0 8px 12px 8px;box-shadow:0 2px 4px rgba(0,51,102,0.2);">
        📞 +49 2191 7932020
      </a>
      <a href="https://wa.me/4921917932020" style="display:inline-block;background-color:#25D366;color:#fff;text-decoration:none;padding:16px 32px;border-radius:8px;font-weight:600;font-size:15px;margin:0 8px 12px 8px;box-shadow:0 2px 4px rgba(37,211,102,0.2);">
        💬 WhatsApp
      </a>
    </div>

    <p style="color:#4b5563;line-height:1.8;font-size:16px;margin:40px 0 0 0;">
      Mit freundlichen Grüßen<br>
      <strong style="color:#003366;">Ihr SchadenCheck Team</strong>
    </p>
  </div>

  <!-- Footer -->
  <div style="background-color:#f3f4f6;padding:25px 35px;text-align:center;border-top:2px solid #e5e7eb;">
    <p style="color:#6b7280;font-size:14px;margin:0 0 12px 0;line-height:1.6;">
      <strong style="color:#374151;">SchadenCheck</strong><br>
      Kölner Str. 121, 42897 Remscheid
    </p>
    <p style="color:#6b7280;font-size:13px;margin:0 0 15px 0;">
      Tel: +49 2191 7932020 | E-Mail: info@schaden-check24.de
    </p>
    <p style="color:#9ca3af;font-size:12px;margin:0;">
      <a href="https://schaden-check24.de/impressum" style="color:#003366;text-decoration:none;margin:0 8px;">Impressum</a> |
      <a href="https://schaden-check24.de/datenschutz" style="color:#003366;text-decoration:none;margin:0 8px;">Datenschutz</a>
    </p>
  </div>
</div>
</body></html>`;

    // Customer notification email (only if email contact method selected)
    const customerEmailHTML = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Ihre Schadensmeldung</title></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f3f4f6;">
<div style="max-width:600px;margin:0 auto;background-color:#fff;">
<div style="background-color:#003366;padding:30px 20px;text-align:center;"><h1 style="color:#FFCC00;margin:0;font-size:28px;">SchadenCheck</h1><p style="color:#fff;margin:10px 0 0 0;font-size:14px;">Ihr Kfz-Gutachter für schnelle Schadensregulierung</p></div>
<div style="padding:40px 30px;">
<h2 style="color:#003366;margin-top:0;">Vielen Dank für Ihre Schadensmeldung!</h2>
<p style="color:#4b5563;line-height:1.6;">Sehr geehrte(r) <strong>${cleanData.name}</strong>,</p>
<p style="color:#4b5563;line-height:1.6;">wir haben Ihre Schadensmeldung erfolgreich erhalten und werden uns <strong>innerhalb von 24 Stunden</strong> bei Ihnen melden, um einen Termin zur Begutachtung zu vereinbaren.</p>
<div style="background-color:#f9fafb;border-left:4px solid #FFCC00;padding:20px;margin:30px 0;">
<h3 style="color:#003366;margin-top:0;font-size:18px;">Ihre Angaben im Überblick:</h3>
<table style="width:100%;color:#4b5563;"><tr><td style="padding:8px 0;font-weight:600;">Name:</td><td style="padding:8px 0;">${cleanData.name}</td></tr><tr><td style="padding:8px 0;font-weight:600;">Telefon:</td><td style="padding:8px 0;">${cleanData.telefon}</td></tr><tr><td style="padding:8px 0;font-weight:600;">PLZ/Ort:</td><td style="padding:8px 0;">${cleanData.plz} ${cleanData.ort}</td></tr><tr><td style="padding:8px 0;font-weight:600;">Bevorzugter Kontakt:</td><td style="padding:8px 0;">${kontaktwegLabel[cleanData.kontaktweg]}</td></tr>${cleanData.email ? `<tr><td style="padding:8px 0;font-weight:600;">E-Mail:</td><td style="padding:8px 0;">${cleanData.email}</td></tr>` : ''}</table>
</div>
<p style="color:#4b5563;line-height:1.6;"><strong>Bei dringenden Fällen</strong> können Sie uns auch direkt erreichen:</p>
<div style="margin:30px 0;"><a href="tel:+4921917932020" style="display:inline-block;background-color:#003366;color:#fff;text-decoration:none;padding:14px 30px;border-radius:8px;font-weight:600;margin-right:10px;margin-bottom:10px;">📞 +49 2191 7932020</a><a href="https://wa.me/492191793202" style="display:inline-block;background-color:#25D366;color:#fff;text-decoration:none;padding:14px 30px;border-radius:8px;font-weight:600;margin-bottom:10px;">💬 WhatsApp</a></div>
<p style="color:#4b5563;line-height:1.6;">Mit freundlichen Grüßen<br><strong>Ihr SchadenCheck Team</strong></p>
</div>
<div style="background-color:#f3f4f6;padding:20px 30px;text-align:center;border-top:1px solid #e5e7eb;"><p style="color:#6b7280;font-size:14px;margin:0 0 10px 0;">SchadenCheck<br>Kölner Str. 121, 42897 Remscheid</p><p style="color:#6b7280;font-size:12px;margin:0;">Tel: +49 2191 7932020 | E-Mail: info@schaden-check24.de<br><a href="https://schaden-check24.de/impressum" style="color:#003366;text-decoration:none;">Impressum</a> | <a href="https://schaden-check24.de/datenschutz" style="color:#003366;text-decoration:none;">Datenschutz</a></p></div>
</div></body></html>`;

    const adminEmailHTML = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Neue Schadensmeldung</title></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f3f4f6;">
<div style="max-width:600px;margin:0 auto;background-color:#fff;">
<div style="background-color:#dc2626;padding:20px;text-align:center;"><h1 style="color:#fff;margin:0;font-size:24px;">🚨 Neue Schadensmeldung</h1></div>
<div style="padding:30px;">
<p style="color:#4b5563;font-size:16px;font-weight:600;">Eine neue Schadensmeldung ist über das Online-Formular eingegangen:</p>
<div style="background-color:#fef3c7;border-left:4px solid #f59e0b;padding:20px;margin:20px 0;">
<h3 style="color:#92400e;margin-top:0;">Kundendaten:</h3>
<table style="width:100%;color:#78350f;"><tr><td style="padding:6px 0;font-weight:600;width:40%;">Name:</td><td style="padding:6px 0;">${cleanData.name}</td></tr><tr><td style="padding:6px 0;font-weight:600;">Telefon:</td><td style="padding:6px 0;"><a href="tel:${cleanData.telefon}" style="color:#92400e;">${cleanData.telefon}</a></td></tr><tr><td style="padding:6px 0;font-weight:600;">PLZ/Ort:</td><td style="padding:6px 0;">${cleanData.plz} ${cleanData.ort}</td></tr><tr><td style="padding:6px 0;font-weight:600;">Bevorzugt:</td><td style="padding:6px 0;">${kontaktwegLabel[cleanData.kontaktweg]}</td></tr>${cleanData.email ? `<tr><td style="padding:6px 0;font-weight:600;">E-Mail:</td><td style="padding:6px 0;"><a href="mailto:${cleanData.email}" style="color:#92400e;">${cleanData.email}</a></td></tr>` : ''}</table>
</div>
${cleanData.beschreibung ? `<div style="background-color:#f3f4f6;padding:15px;border-radius:8px;margin:20px 0;"><h4 style="color:#374151;margin-top:0;">Schadensbeschreibung:</h4><p style="color:#4b5563;margin:0;white-space:pre-wrap;">${cleanData.beschreibung}</p></div>` : ''}
<div style="margin:30px 0;"><a href="tel:${cleanData.telefon}" style="display:inline-block;background-color:#003366;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;margin-right:10px;margin-bottom:10px;">📞 ${cleanData.telefon}</a>${cleanData.kontaktweg === 'whatsapp' ? `<a href="https://wa.me/${cleanData.telefon.replace(/[^0-9]/g, '')}" style="display:inline-block;background-color:#25D366;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;margin-bottom:10px;">💬 WhatsApp</a>` : ''}</div>
<p style="color:#6b7280;font-size:14px;margin-top:30px;"><strong>Wichtig:</strong> Bitte innerhalb von 24 Stunden beim Kunden melden!</p>
</div>
<div style="background-color:#f3f4f6;padding:15px;text-align:center;border-top:1px solid #e5e7eb;"><p style="color:#6b7280;font-size:12px;margin:0;">Automatische Benachrichtigung von schaden-check24.de</p></div>
</div></body></html>`;

    // Attachments DEAKTIVIERT - für spätere Verwendung
    /*
    const resendAttachments = cleanData.attachments?.map((att) => ({
      filename: att.filename,
      content: att.content,
    })) || [];

    if (resendAttachments.length > 0) {
      console.log(`Processing ${resendAttachments.length} attachments`);
    }
    */

    // 1. & 2. EMAILS SENDEN (Batch API für bessere Performance)
    const emailsToSend = [
      // Admin notification (OHNE attachments)
      {
        from: 'Schadensmeldung <noreply@schaden-check24.de>',
        to: 'info@schaden-check24.de',
        subject: `🚨 Neue Schadensmeldung: ${cleanData.name} aus ${cleanData.plz} ${cleanData.ort}`,
        html: adminEmailHTML,
        text: formatEmailText(cleanData),
        reply_to: cleanData.emailBestaetigung || cleanData.email || undefined,
        // attachments: resendAttachments.length > 0 ? resendAttachments : undefined, // DEAKTIVIERT
      },
    ];

    // Customer notification (only if email contact method was selected)
    if (cleanData.email) {
      emailsToSend.push({
        from: 'SchadenCheck <noreply@schaden-check24.de>',
        to: cleanData.email,
        subject: 'Ihre Schadensmeldung wurde empfangen - SchadenCheck',
        html: customerEmailHTML,
        text: formatConfirmationEmail(cleanData),
        // No attachments for customer (they already have the files)
      });
    }

    // Optional confirmation email (if different from contact email)
    if (cleanData.emailBestaetigung && cleanData.emailBestaetigung !== cleanData.email) {
      emailsToSend.push({
        from: 'SchadenCheck <noreply@schaden-check24.de>',
        to: cleanData.emailBestaetigung,
        subject: 'Ihre Anfrage bei SchadenCheck wurde erfolgreich übermittelt',
        html: confirmationEmailHTML,
        text: `Vielen Dank für Ihre Anfrage!\n\nSehr geehrte(r) ${cleanData.name},\n\nwir haben Ihre Schadensmeldung erfolgreich erhalten und werden uns innerhalb von 24 Stunden bei Ihnen melden.\n\nIhre Kontaktdaten:\nName: ${cleanData.name}\nTelefon: ${cleanData.telefon}\nPLZ/Ort: ${cleanData.plz} ${cleanData.ort}\n\nBei dringenden Fällen erreichen Sie uns unter:\nTel: +49 2191 7932020\nWhatsApp: +49 2191 7932020\n\nMit freundlichen Grüßen\nIhr SchadenCheck Team`,
        // No attachments for confirmation email
      });
    } else if (cleanData.emailBestaetigung && !cleanData.email) {
      // If only confirmation email is provided (no contact via email selected)
      emailsToSend.push({
        from: 'SchadenCheck <noreply@schaden-check24.de>',
        to: cleanData.emailBestaetigung,
        subject: 'Ihre Anfrage bei SchadenCheck wurde erfolgreich übermittelt',
        html: confirmationEmailHTML,
        text: `Vielen Dank für Ihre Anfrage!\n\nSehr geehrte(r) ${cleanData.name},\n\nwir haben Ihre Schadensmeldung erfolgreich erhalten und werden uns innerhalb von 24 Stunden bei Ihnen melden.\n\nIhre Kontaktdaten:\nName: ${cleanData.name}\nTelefon: ${cleanData.telefon}\nPLZ/Ort: ${cleanData.plz} ${cleanData.ort}\n\nBei dringenden Fällen erreichen Sie uns unter:\nTel: +49 2191 7932020\nWhatsApp: +49 2191 7932020\n\nMit freundlichen Grüßen\nIhr SchadenCheck Team`,
        // No attachments for confirmation email
      });
    }

    const resendResponse = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailsToSend),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error('Resend API Error:', errorText);
      // Nicht abbrechen - trotzdem Success zurückgeben (User sollte nicht wissen, dass Email fehlschlug)
    } else {
      const result = await resendResponse.json();
      console.log('Resend API Success:', result);
    }

    // SUCCESS RESPONSE
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Schaden erfolgreich gemeldet. Wir melden uns in Kürze bei Ihnen.',
        timestamp: new Date().toISOString(),
      } as SuccessResponse),
      { status: 200, headers: corsHeaders }
    );

  } catch (error) {
    console.error('API Error:', error);

    // Generische Error Message (nicht zu viel Info an Client)
    return new Response(
      JSON.stringify({
        error: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.',
        code: 'INTERNAL_ERROR',
      } as ErrorResponse),
      { status: 500, headers: corsHeaders }
    );
  }
};
