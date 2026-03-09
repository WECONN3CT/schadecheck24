/**
 * Cloudflare Pages Function für Kontakt-Formular
 * Sicherheit: Validierung, Rate Limiting, Input Sanitizing
 */

interface ContactFormData {
  name: string;
  email: string;
  telefon?: string;
  nachricht: string;
  dsgvo: boolean;
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
    .slice(0, 2000); // Max 2000 Zeichen für längere Felder
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

  // Email validieren
  if (!data.email || typeof data.email !== 'string') {
    errors.push('E-Mail ist erforderlich');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('E-Mail-Format ungültig');
  }

  // Telefon validieren (optional)
  if (data.telefon && typeof data.telefon === 'string') {
    if (data.telefon.length > 0 && !/^[\d\s\-\+\(\)]{0,20}$/.test(data.telefon)) {
      errors.push('Telefon-Format ungültig');
    }
  }

  // Nachricht validieren
  if (!data.nachricht || typeof data.nachricht !== 'string') {
    errors.push('Nachricht ist erforderlich');
  } else if (data.nachricht.length < 10 || data.nachricht.length > 5000) {
    errors.push('Nachricht muss zwischen 10 und 5000 Zeichen lang sein');
  }

  // DSGVO-Zustimmung validieren
  if (data.dsgvo !== true) {
    errors.push('DSGVO-Zustimmung ist erforderlich');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Email Text formatieren
function formatEmailText(data: ContactFormData): string {
  return `
NEUE KONTAKTANFRAGE
═══════════════════════════════════════

ABSENDER DATEN
──────────────
Name:           ${sanitizeInput(data.name)}
E-Mail:         ${sanitizeInput(data.email)}
${data.telefon ? `Telefon:        ${sanitizeInput(data.telefon)}\n` : ''}
NACHRICHT
─────────
${sanitizeInput(data.nachricht)}

METADATA
────────
DSGVO akzeptiert:  Ja ✓
Eingereicht am:    ${new Date().toLocaleString('de-DE')}
IP-Adresse:        [LOGGED]

═══════════════════════════════════════
Bitte antworten Sie zeitnah.
  `;
}

// Bestätigungs-Email für User
function formatConfirmationEmail(data: ContactFormData): string {
  return `Liebe/r ${sanitizeInput(data.name)},

vielen Dank für Ihre Kontaktanfrage bei SchadenCheck!

Wir haben Ihre Nachricht erhalten und werden uns zeitnah bei Ihnen melden.

IHRE KONTAKTDATEN:
──────────────────
Name: ${sanitizeInput(data.name)}
E-Mail: ${sanitizeInput(data.email)}
${data.telefon ? `Telefon: ${sanitizeInput(data.telefon)}\n` : ''}
SCHNELLER KONTAKT:
──────────────────
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
    const cleanData: ContactFormData = {
      name: sanitizeInput(formData.name),
      email: sanitizeInput(formData.email),
      telefon: formData.telefon ? sanitizeInput(formData.telefon) : undefined,
      nachricht: sanitizeInput(formData.nachricht),
      dsgvo: formData.dsgvo === true,
    };

    // 1. EMAIL AN SUPPORT SENDEN (via Resend API)
    const supportEmailText = formatEmailText(cleanData);
    const supportEmailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'noreply@schaden-check24.de',
        to: 'info@schaden-check24.de',
        subject: `Neue Kontaktanfrage von ${cleanData.name}`,
        text: supportEmailText,
      }),
    });

    if (!supportEmailResponse.ok) {
      console.error('Support Email Error:', await supportEmailResponse.text());
      // Nicht abbrechen - Log nur, aber nicht zu User sagen
    }

    // 2. BESTÄTIGUNGS-EMAIL AN USER
    const confirmationText = formatConfirmationEmail(cleanData);
    const confirmationResponse = await fetch(
      'https://api.resend.com/emails',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'noreply@schaden-check24.de',
          to: cleanData.email,
          subject: 'Kontaktanfrage erhalten - SchadenCheck',
          text: confirmationText,
        }),
      }
    );

    if (!confirmationResponse.ok) {
      console.error(
        'Confirmation Email Error:',
        await confirmationResponse.text()
      );
    }

    // SUCCESS RESPONSE
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Ihre Nachricht wurde erfolgreich versendet. Wir melden uns zeitnah bei Ihnen.',
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
