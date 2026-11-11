import { formatPrice } from "@/lib/utils";
import type { Order } from "@/lib/types";

/**
 * Phase 1.6 — printable kitchen ticket / customer receipt.
 * Rendered into .ticket-print-area (off-screen on screen, isolated by
 * the @media print rules in globals.css) and printed via window.print().
 * Kitchen kind hides prices (the kitchen cooks, the counter bills);
 * receipt kind shows the full Phase 1.4 charge breakdown.
 */
export default function PrintTicket({
  restaurantName, currency, order, kind,
}: {
  restaurantName: string;
  currency: string;
  order: Order;
  kind: "kitchen" | "receipt";
}) {
  const when = new Date(order.created_at);
  const shortId = order.id.slice(0, 8).toUpperCase();
  const hasCharges = order.subtotal_amount != null &&
    (Number(order.tax_amount ?? 0) > 0 || Number(order.service_amount ?? 0) > 0 ||
     Number(order.discount_amount ?? 0) > 0 || Number(order.gift_card_amount ?? 0) > 0);
  return (
    <div className="ticket-print-area" style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace", color: "#000" }}>
      <div style={{ textAlign: "center", borderBottom: "2px solid #000", paddingBottom: 8 }}>
        <p style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>{restaurantName}</p>
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, margin: "3px 0 0" }}>
          {kind === "kitchen" ? "KITCHEN TICKET" : "RECEIPT"}
        </p>
      </div>
      <div style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.55 }}>
        <p style={{ margin: 0 }}>Order #{shortId}</p>
        <p style={{ margin: 0 }}>
          {when.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} ·{" "}
          {when.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" })}
        </p>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 13.5 }}>
          {order.order_type === "dine_in"
            ? `DINE-IN · TABLE ${order.table_number ?? "—"}`
            : `TAKEAWAY${order.customer_name ? ` · ${order.customer_name}` : ""}`}
        </p>
        {order.order_type === "takeaway" && order.customer_phone && (
          <p style={{ margin: 0 }}>{order.customer_phone}</p>
        )}
      </div>
      <div style={{ borderTop: "1px dashed #000", marginTop: 8, paddingTop: 8 }}>
        {(order.items ?? []).map((it) => (
          <div key={it.id} style={{ marginBottom: 7 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: kind === "kitchen" ? 14.5 : 13, fontWeight: 700 }}>
              <span>{it.quantity} × {it.item_name}</span>
              {kind === "receipt" && <span>{formatPrice(Number(it.subtotal), currency)}</span>}
            </div>
            {it.options_snapshot && it.options_snapshot.length > 0 && (
              <p style={{ margin: "1px 0 0 14px", fontSize: 12 }}>
                {it.options_snapshot.map((op) => `${op.group_name}: ${op.option_name}`).join(" · ")}
              </p>
            )}
          </div>
        ))}
      </div>
      {order.note && (
        <p style={{ border: "1.5px solid #000", padding: "6px 8px", fontSize: 12.5, fontWeight: 700, margin: "4px 0 0" }}>
          NOTE: {order.note}
        </p>
      )}
      {kind === "receipt" && (
        <div style={{ borderTop: "1px dashed #000", marginTop: 8, paddingTop: 8, fontSize: 12.5, lineHeight: 1.6 }}>
          {hasCharges && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Subtotal</span><span>{formatPrice(Number(order.subtotal_amount), currency)}</span>
              </div>
              {Number(order.discount_amount ?? 0) > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Coupon {order.coupon_code ?? ""}</span><span>-{formatPrice(Number(order.discount_amount), currency)}</span>
                </div>
              )}
              {Number(order.tax_amount ?? 0) > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Tax</span><span>{formatPrice(Number(order.tax_amount), currency)}</span>
                </div>
              )}
              {Number(order.service_amount ?? 0) > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Service</span><span>{formatPrice(Number(order.service_amount), currency)}</span>
                </div>
              )}
              {Number(order.gift_card_amount ?? 0) > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Gift card</span><span>-{formatPrice(Number(order.gift_card_amount), currency)}</span>
                </div>
              )}
            </>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800, borderTop: "1px solid #000", marginTop: 4, paddingTop: 5 }}>
            <span>TOTAL</span><span>{formatPrice(Number(order.total_amount), currency)}</span>
          </div>
          <p style={{ textAlign: "center", fontSize: 11.5, margin: "10px 0 0" }}>
            Pay at the counter · Thank you!
          </p>
        </div>
      )}
      <p style={{ textAlign: "center", fontSize: 10.5, margin: "8px 0 0", borderTop: "1px dashed #000", paddingTop: 6 }}>
        Powered by Velora
      </p>
    </div>
  );
}
