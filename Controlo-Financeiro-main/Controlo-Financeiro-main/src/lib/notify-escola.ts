/**
 * Notificações para o telemóvel/WhatsApp da escola (serviços gratuitos).
 *
 * Configuração (variáveis de ambiente no Vercel):
 *
 * 1) CallMeBot (gratuito) — recomendado para começar:
 *    - No WhatsApp da escola, envie para +34 644 49 70 74 a mensagem:
 *      "I allow callmebot to send me messages"
 *    - Recebe um apikey. Defina:
 *      CALLMEBOT_APIKEY=xxxxxxxx
 *      ESCOLA_WHATSAPP=244922637640   (com indicativo, sem + nem espaços)
 *
 * 2) Webhook genérico (n8n, Make.com free, Cloudflare Worker, etc.):
 *      NOTIFY_WEBHOOK_URL=https://hooks.example.com/escola
 *    Envia POST JSON: { text, type, phone, ...payload }
 *
 * 3) Só log (padrão se nada estiver configurado).
 */

export type NotifyTipo = "inquerito-saude" | "agendamento" | "regulamento" | "outro";

export type NotifyPayload = {
  type: NotifyTipo;
  text: string;
  /** Dados extra para o webhook. */
  data?: Record<string, unknown>;
};

function escolaPhone(): string {
  // Preferir 922637640; aceitar com ou sem 244
  const raw = (process.env.ESCOLA_WHATSAPP || "244922637640").replace(/\D/g, "");
  if (raw.startsWith("244")) return raw;
  if (raw.length === 9) return `244${raw}`;
  return raw || "244922637640";
}

/** Formatação legível para mensagens. */
export function escolaWhatsAppDisplay(): string {
  const d = escolaPhone().replace(/^244/, "");
  if (d.length === 9) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return d;
}

/**
 * Envia notificação (CallMeBot e/ou webhook). Nunca lança — falhas só no log.
 */
export async function notifyEscola(payload: NotifyPayload): Promise<{
  ok: boolean;
  channels: string[];
}> {
  const channels: string[] = [];
  const phone = escolaPhone();
  const text = payload.text.slice(0, 1500);

  // 1) CallMeBot (HTTP GET, gratuito)
  const apikey = (process.env.CALLMEBOT_APIKEY || "").trim();
  if (apikey) {
    try {
      const url =
        `https://api.callmebot.com/whatsapp.php` +
        `?phone=${encodeURIComponent(phone)}` +
        `&text=${encodeURIComponent(text)}` +
        `&apikey=${encodeURIComponent(apikey)}`;
      const res = await fetch(url, { method: "GET" });
      const body = await res.text().catch(() => "");
      if (res.ok || /Message sent|queued|OK/i.test(body)) {
        channels.push("callmebot");
      } else {
        console.warn("[notify] CallMeBot resposta:", res.status, body.slice(0, 200));
      }
    } catch (e) {
      console.warn("[notify] CallMeBot erro", e);
    }
  }

  // 2) Webhook genérico (POST JSON)
  const webhook = (process.env.NOTIFY_WEBHOOK_URL || "").trim();
  if (webhook) {
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          type: payload.type,
          text,
          ...payload.data,
          source: "ecole-consulaire-controlo-financeiro",
          at: new Date().toISOString(),
        }),
      });
      if (res.ok) channels.push("webhook");
      else console.warn("[notify] Webhook status", res.status);
    } catch (e) {
      console.warn("[notify] Webhook erro", e);
    }
  }

  // 3) Log sempre (útil em preview / sem config)
  console.info(
    `[notify] → WhatsApp ${phone} | ${payload.type} | canais=${channels.join(",") || "log"} | ${text.slice(0, 180)}`,
  );

  return { ok: channels.length > 0, channels };
}
