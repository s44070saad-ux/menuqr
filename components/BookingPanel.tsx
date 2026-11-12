"use client";
import { useEffect, useRef, useState } from "react";
import { CalendarCheck, PartyPopper, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

/**
 * Phase 6 — public Reservations + Catering (menu page).
 * Rendered only when the owner enabled the feature and the plan
 * allows it (the create_* RPCs re-check both server-side). Booking
 * status is polled through the token-gated get_reservation RPC,
 * the same pattern as order tracking.
 */

type Lang3 = "en" | "ur" | "es";
const L: Record<Lang3, Record<string, string>> = {
  en: {
    bookTable: "Book a table", planEvent: "Planning an event?",
    guests: "Guests", date: "Date", time: "Time", yourName: "Your name", phone: "Phone number",
    note: "Note (optional)", notePh: "e.g. Window seat, birthday…",
    send: "Send request", sending: "Sending…",
    received: "Request received!", pendingMsg: "The restaurant will confirm your table shortly. Keep this page open — the status updates here.",
    confirmed: "Confirmed — see you then!", waitlisted: "You're on the waitlist — the restaurant will confirm if a table opens.",
    cancelled: "This booking was cancelled by the restaurant.", done: "Done",
    eventDate: "Event date", budget: "Budget (optional)", message: "Tell us about your event",
    messagePh: "e.g. Office dinner for 40, need a separate hall…",
    enquirySent: "Enquiry sent!", enquiryMsg: "The restaurant will contact you to plan your event.",
    errGeneric: "Something went wrong. Please try again.", errPhone: "Please enter a valid phone number.",
    close: "Close", status: "Status",
  },
  ur: {
    bookTable: "ٹیبل بک کریں", planEvent: "کوئی تقریب ہے؟",
    guests: "مہمان", date: "تاریخ", time: "وقت", yourName: "آپ کا نام", phone: "فون نمبر",
    note: "نوٹ (اختیاری)", notePh: "مثلاً کھڑکی والی نشست، سالگرہ…",
    send: "درخواست بھیجیں", sending: "بھیجا جا رہا ہے…",
    received: "درخواست موصول ہو گئی!", pendingMsg: "ریسٹورنٹ جلد آپ کی ٹیبل کی تصدیق کرے گا۔ یہ صفحہ کھلا رکھیں — صورتحال یہیں اپڈیٹ ہوگی۔",
    confirmed: "تصدیق ہو گئی — انتظار رہے گا!", waitlisted: "آپ ویٹ لسٹ میں ہیں — ٹیبل خالی ہوتے ہی ریسٹورنٹ تصدیق کرے گا۔",
    cancelled: "ریسٹورنٹ نے یہ بکنگ منسوخ کر دی ہے۔", done: "مکمل",
    eventDate: "تقریب کی تاریخ", budget: "بجٹ (اختیاری)", message: "اپنی تقریب کے بارے میں بتائیں",
    messagePh: "مثلاً 40 افراد کا دفتری کھانا، علیحدہ ہال چاہیے…",
    enquirySent: "استفسار بھیج دیا گیا!", enquiryMsg: "ریسٹورنٹ آپ کی تقریب کے لیے رابطہ کرے گا۔",
    errGeneric: "کچھ غلط ہو گیا۔ دوبارہ کوشش کریں۔", errPhone: "درست فون نمبر درج کریں۔",
    close: "بند کریں", status: "صورتحال",
  },
  es: {
    bookTable: "Reservar mesa", planEvent: "¿Planeas un evento?",
    guests: "Invitados", date: "Fecha", time: "Hora", yourName: "Tu nombre", phone: "Número de teléfono",
    note: "Nota (opcional)", notePh: "p. ej. Mesa junto a la ventana, cumpleaños…",
    send: "Enviar solicitud", sending: "Enviando…",
    received: "¡Solicitud recibida!", pendingMsg: "El restaurante confirmará tu mesa en breve. Mantén esta página abierta: el estado se actualiza aquí.",
    confirmed: "Confirmado — ¡nos vemos entonces!", waitlisted: "Estás en lista de espera: el restaurante confirmará si se libera una mesa.",
    cancelled: "El restaurante canceló esta reserva.", done: "Listo",
    eventDate: "Fecha del evento", budget: "Presupuesto (opcional)", message: "Cuéntanos sobre tu evento",
    messagePh: "p. ej. Cena de empresa para 40, necesitamos un salón separado…",
    enquirySent: "¡Consulta enviada!", enquiryMsg: "El restaurante te contactará para planificar tu evento.",
    errGeneric: "Algo salió mal. Inténtalo de nuevo.", errPhone: "Ingresa un número de teléfono válido.",
    close: "Cerrar", status: "Estado",
  },
};

interface MyReservation { id: string; token: string; status: string }

export default function BookingPanel({ restaurantId, accent, dark, lang, reservationsOn, cateringOn }: {
  restaurantId: string;
  accent: string;
  dark: boolean;
  lang: string;
  reservationsOn: boolean;
  cateringOn: boolean;
}) {
  const t = L[lang === "ur" ? "ur" : lang === "es" ? "es" : "en"];
  const [sheet, setSheet] = useState<"book" | "cater" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myRes, setMyRes] = useState<MyReservation | null>(null);
  const [enquiryDone, setEnquiryDone] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [party, setParty] = useState(2);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:00");
  const [note, setNote] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [guests, setGuests] = useState("");
  const [budget, setBudget] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`velora_res_${restaurantId}`);
      if (raw) setMyRes(JSON.parse(raw) as MyReservation);
    } catch { /* ignore */ }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [restaurantId]);

  async function refreshStatus(r: MyReservation) {
    if (!supabase) return;
    const { data } = await supabase.rpc("get_reservation", { p_id: r.id, p_token: r.token });
    const row = data as { status?: string } | null;
    if (row?.status) setMyRes((prev) => (prev ? { ...prev, status: row.status! } : prev));
  }

  useEffect(() => {
    if (!myRes || myRes.status !== "pending") return;
    void refreshStatus(myRes);
    pollRef.current = setInterval(() => void refreshStatus(myRes), 15000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myRes?.id, myRes?.status]);

  async function submitBooking() {
    if (!supabase) return;
    setBusy(true); setError(null);
    const { data, error: err } = await supabase.rpc("create_reservation", {
      p_restaurant_id: restaurantId, p_name: name, p_phone: phone, p_email: null,
      p_party_size: party, p_date: date, p_time: time, p_note: note || null,
    });
    setBusy(false);
    if (err) {
      setError(err.message.includes("BAD_PHONE") ? t.errPhone : t.errGeneric);
      return;
    }
    const res = data as { reservation_id: string; customer_token: string; status: string };
    const mine: MyReservation = { id: res.reservation_id, token: res.customer_token, status: res.status };
    setMyRes(mine);
    try { localStorage.setItem(`velora_res_${restaurantId}`, JSON.stringify(mine)); } catch { /* ignore */ }
  }

  async function submitCatering() {
    if (!supabase) return;
    setBusy(true); setError(null);
    const { error: err } = await supabase.rpc("create_catering_enquiry", {
      p_restaurant_id: restaurantId, p_name: name, p_phone: phone, p_email: null,
      p_event_date: eventDate || null, p_guests: guests ? Number(guests) : null,
      p_budget: budget ? Number(budget) : null, p_message: message || null,
    });
    setBusy(false);
    if (err) {
      setError(err.message.includes("BAD_PHONE") ? t.errPhone : t.errGeneric);
      return;
    }
    setEnquiryDone(true);
  }

  const inputCls = `w-full rounded-xl border px-3 py-2.5 text-[16px] ${dark ? "border-neutral-700 bg-neutral-800 text-white" : "border-slate-300 bg-white text-ink"}`;
  const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide opacity-70";
  const statusText = myRes
    ? myRes.status === "confirmed" ? t.confirmed
      : myRes.status === "waitlisted" ? t.waitlisted
      : myRes.status === "cancelled" || myRes.status === "no_show" ? t.cancelled
      : myRes.status === "completed" ? t.done
      : t.pendingMsg
    : "";

  if (!reservationsOn && !cateringOn) return null;

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-2">
        {reservationsOn && (
          <button type="button" onClick={() => { setSheet("book"); setError(null); }}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-card" style={{ background: accent }}>
            <CalendarCheck size={17} /> {myRes ? `${t.bookTable} · ${t.status}: ${myRes.status}` : t.bookTable}
          </button>
        )}
        {cateringOn && (
          <button type="button" onClick={() => { setSheet("cater"); setError(null); setEnquiryDone(false); }}
            className={`inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${dark ? "border-neutral-700 bg-neutral-900 text-white" : "border-slate-300 bg-white text-ink"}`}>
            <PartyPopper size={17} /> {t.planEvent}
          </button>
        )}
      </div>

      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true">
          <div className={`max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl ${dark ? "bg-neutral-900 text-white" : "bg-white text-ink"}`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-lg font-bold">{sheet === "book" ? t.bookTable : t.planEvent}</h2>
              <button type="button" onClick={() => setSheet(null)} aria-label={t.close} className="rounded-full p-1.5 hover:bg-black/5"><X size={20} /></button>
            </div>

            {sheet === "book" && myRes ? (
              <div>
                <p className="font-heading text-base font-semibold">{t.received}</p>
                <p className={`mt-2 text-sm leading-relaxed ${dark ? "text-neutral-300" : "text-slate-600"}`}>{statusText}</p>
                <button type="button" onClick={() => setSheet(null)} className="mt-5 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white" style={{ background: accent }}>{t.close}</button>
              </div>
            ) : sheet === "cater" && enquiryDone ? (
              <div>
                <p className="font-heading text-base font-semibold">{t.enquirySent}</p>
                <p className={`mt-2 text-sm leading-relaxed ${dark ? "text-neutral-300" : "text-slate-600"}`}>{t.enquiryMsg}</p>
                <button type="button" onClick={() => setSheet(null)} className="mt-5 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white" style={{ background: accent }}>{t.close}</button>
              </div>
            ) : (
              <div className="space-y-3.5">
                <div>
                  <label className={labelCls}>{t.yourName}</label>
                  <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </div>
                <div>
                  <label className={labelCls}>{t.phone}</label>
                  <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" />
                </div>
                {sheet === "book" ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>{t.date}</label>
                        <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
                      </div>
                      <div>
                        <label className={labelCls}>{t.time}</label>
                        <input type="time" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>{t.guests}: {party}</label>
                      <input type="range" min={1} max={30} value={party} onChange={(e) => setParty(Number(e.target.value))} className="w-full accent-teal-700" />
                    </div>
                    <div>
                      <label className={labelCls}>{t.note}</label>
                      <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.notePh} />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>{t.eventDate}</label>
                        <input type="date" className={inputCls} value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
                      </div>
                      <div>
                        <label className={labelCls}>{t.guests}</label>
                        <input type="number" min={1} className={inputCls} value={guests} onChange={(e) => setGuests(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>{t.budget}</label>
                      <input type="number" min={0} className={inputCls} value={budget} onChange={(e) => setBudget(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>{t.message}</label>
                      <textarea rows={3} className={inputCls} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t.messagePh} />
                    </div>
                  </>
                )}
                {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{error}</p>}
                <button type="button" disabled={busy || name.trim().length < 2 || phone.trim().length < 7 || (sheet === "book" && !date)}
                  onClick={sheet === "book" ? submitBooking : submitCatering}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-50" style={{ background: accent }}>
                  {busy ? t.sending : t.send}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
