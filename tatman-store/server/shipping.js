import fs from "node:fs";
import path from "node:path";
import { uploadsDir } from "./db.js";
import { isSaudiApiCourier, saudiApiReady } from "../src/data/couriers.js";

const SMSA_URL = "https://track.smsaexpress.com/SECOM/SMSAwebService.asmx";
const ARAMEX_CITIES = "https://ws.aramex.net/ShippingAPI.V2/Location/Service_1_0.svc/json/FetchCities";
const ARAMEX_SHIP = "https://ws.aramex.net/ShippingAPI.V2/Shipping/Service_1_0.svc/json/CreateShipments";

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function fetchText(url, options, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

function smsaEnvelope(method, fields) {
  const inner = Object.entries(fields)
    .map(([key, value]) => `<${key}>${xmlEscape(value)}</${key}>`)
    .join("");
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${method} xmlns="http://track.smsaexpress.com/secom/">${inner}</${method}>
  </soap:Body>
</soap:Envelope>`;
}

function smsaResult(xml, method) {
  const src = String(xml || "");
  const status = src.match(/<RequestStatus[^>]*>([\s\S]*?)<\/RequestStatus>/i);
  if (status) return status[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
  const tag = `${method}Result`;
  const match = src.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return (match ? match[1] : src).replace(/<!\[CDATA\[|\]\]>/g, "").trim();
}

async function smsaCall(method, fields) {
  const { text, status } = await fetchText(SMSA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: `"http://track.smsaexpress.com/secom/${method}"`,
    },
    body: smsaEnvelope(method, fields),
  });
  const result = smsaResult(text, method);
  const lower = `${text}\n${result}`.toLowerCase();
  if (
    status >= 400 ||
    text.includes("soap:Fault") ||
    lower.includes("invalid") ||
    lower.includes("error") ||
    lower.includes("fail")
  ) {
    return { ok: false, error: result.slice(0, 240) || `smsa_${status}` };
  }
  return { ok: true, result };
}

function aramexClient(courier) {
  return {
    UserName: courier.apiUsername,
    Password: courier.apiPassword,
    Version: "v1.0",
    AccountNumber: courier.apiAccountNumber,
    AccountPin: courier.apiAccountPin,
    AccountEntity: courier.apiAccountEntity || "RUH",
    AccountCountryCode: "SA",
  };
}

async function aramexJson(url, payload) {
  const { text, status } = await fetchText(url, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: text.slice(0, 240) || `aramex_${status}` };
  }
  const hasError =
    data.HasErrors === true ||
    (Array.isArray(data.Notifications) && data.Notifications.some((n) => String(n.Code || "") && String(n.Code) !== "0"));
  if (status >= 400 || hasError) {
    const note = data.Notifications?.[0];
    return { ok: false, error: (note?.Message || text).toString().slice(0, 240) };
  }
  return { ok: true, data };
}

export async function testSaudiCourier(courier) {
  if (!isSaudiApiCourier("sa", courier)) return { ok: false, error: "not_saudi_courier" };
  if (courier.id === "smsa") {
    const city = courier.pickupCity || "Riyadh";
    const out = await smsaCall("getShipCharges", {
      passKey: courier.apiPassKey,
      shipCity: city,
      shipCntry: "SA",
      destCity: city,
      destCntry: "SA",
      shipType: "DLV",
      codAmt: "0",
      weight: "1",
    });
    if (!out.ok) return out;
    return { ok: true, message: "تم الاتصال بسمسا." };
  }
  const out = await aramexJson(ARAMEX_CITIES, {
    ClientInfo: aramexClient(courier),
    Transaction: { Reference1: "TATMAN-TEST" },
    CountryCode: "SA",
    NameStartsWith: "Riy",
  });
  if (!out.ok) return out;
  return { ok: true, message: "تم الاتصال بأرامكس." };
}

function itemDesc(order) {
  return (order.items || [])
    .map((i) => `${i.nameAr || i.nameEn || i.id} × ${i.qty}`)
    .join(", ")
    .slice(0, 160) || "Veterinary products";
}

function weightOf(order, courier) {
  const n = Number(courier.weightKg);
  if (Number.isFinite(n) && n > 0) return n;
  return 1;
}

async function savePdf(orderId, buf) {
  if (!buf || !buf.length) return "";
  fs.mkdirSync(uploadsDir, { recursive: true });
  const name = `awb-${orderId}-${Date.now().toString(36)}.pdf`;
  fs.writeFileSync(path.join(uploadsDir, name), buf);
  return `/uploads/${name}`;
}

async function smsaCreate(order, courier) {
  const cod = order.paymentMethod === "cod" ? String(order.total || 0) : "0";
  const out = await smsaCall("addShipment", {
    passKey: courier.apiPassKey,
    refNo: order.id,
    sentDate: new Date().toISOString().slice(0, 10),
    idNo: "",
    cName: order.customer?.name || "",
    cntry: "SA",
    cCity: order.customer?.city || courier.pickupCity || "Riyadh",
    cZip: "",
    cPOBox: "",
    cMobile: String(order.customer?.phone || "").replace(/\D/g, ""),
    cTel1: String(order.customer?.phone || "").replace(/\D/g, ""),
    cTel2: "",
    cAddr1: order.customer?.address || order.customer?.city || "",
    cAddr2: "",
    shipType: "DLV",
    PCs: 1,
    cEmail: "",
    carrValue: "",
    carrCurr: "",
    codAmt: cod,
    weight: String(weightOf(order, courier)),
    custVal: "",
    custCurr: "SAR",
    insrAmt: "",
    insrCurr: "",
    itemDesc: itemDesc(order),
  });
  if (!out.ok) return out;
  const awb = String(out.result || "").replace(/\D/g, "") || String(out.result || "").trim();
  if (!awb) return { ok: false, error: out.result || "smsa_no_awb" };
  let labelUrl = "";
  try {
    const pdf = await smsaCall("getPDF", { awbNo: awb, passKey: courier.apiPassKey });
    if (pdf.ok && pdf.result && !pdf.result.startsWith("<")) {
      // some accounts return base64
    }
    const raw = await fetchText(SMSA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"http://track.smsaexpress.com/secom/getPDF"`,
      },
      body: smsaEnvelope("getPDF", { awbNo: awb, passKey: courier.apiPassKey }),
    });
    const b64 = smsaResult(raw.text, "getPDF");
    if (b64 && /^[A-Za-z0-9+/=\s]+$/.test(b64) && b64.length > 80) {
      labelUrl = await savePdf(order.id, Buffer.from(b64.replace(/\s/g, ""), "base64"));
    }
  } catch {
    labelUrl = "";
  }
  return { ok: true, trackingNumber: awb, labelUrl };
}

async function aramexCreate(order, courier) {
  const shipperPhone = courier.senderPhone || courier.phone || "";
  const payload = {
    ClientInfo: aramexClient(courier),
    LabelInfo: { ReportID: 9201, ReportType: "URL" },
    Shipments: [
      {
        Reference1: order.id,
        Shipper: {
          AccountNumber: courier.apiAccountNumber,
          PartyAddress: {
            Line1: courier.pickupAddress || courier.storeName || "Tatman",
            City: courier.pickupCity || "Riyadh",
            CountryCode: "SA",
          },
          Contact: {
            PersonName: courier.senderName || courier.storeName || "Tatman",
            CompanyName: courier.storeName || "Tatman",
            PhoneNumber1: shipperPhone,
            CellPhone: shipperPhone,
          },
        },
        Consignee: {
          PartyAddress: {
            Line1: order.customer?.address || order.customer?.city || "",
            City: order.customer?.city || courier.pickupCity || "Riyadh",
            CountryCode: "SA",
          },
          Contact: {
            PersonName: order.customer?.name || "",
            CompanyName: order.customer?.name || "",
            PhoneNumber1: order.customer?.phone || "",
            CellPhone: order.customer?.phone || "",
          },
        },
        ShippingDateTime: `/Date(${Date.now()})/`,
        Details: {
          Dimensions: { Length: 10, Width: 10, Height: 10, Unit: "CM" },
          ActualWeight: { Value: weightOf(order, courier), Unit: "KG" },
          ChargeableWeight: { Value: weightOf(order, courier), Unit: "KG" },
          DescriptionOfGoods: itemDesc(order),
          GoodsOriginCountry: "SA",
          NumberOfPieces: 1,
          ProductGroup: "DOM",
          ProductType: courier.apiProductType || "OND",
          PaymentType: "P",
          Services: order.paymentMethod === "cod" ? "CODS" : "",
          CashOnDeliveryAmount:
            order.paymentMethod === "cod" ? { Value: Number(order.total) || 0, CurrencyCode: "SAR" } : undefined,
        },
      },
    ],
  };
  const out = await aramexJson(ARAMEX_SHIP, payload);
  if (!out.ok) return out;
  const shipment = out.data?.Shipments?.[0] || out.data?.ProcessedShipment || {};
  const notifications = shipment.Notifications || out.data?.Notifications || [];
  if (shipment.HasErrors || notifications.some((n) => n.Code && n.Code !== "0")) {
    return { ok: false, error: (notifications[0]?.Message || "aramex_create_failed").toString().slice(0, 240) };
  }
  const trackingNumber = String(shipment.ID || shipment.ShipmentNumber || shipment.Reference1 || "").trim();
  if (!trackingNumber) return { ok: false, error: "aramex_no_awb" };
  const labelUrl = shipment.ShipmentLabel?.LabelURL || shipment.LabelURL || "";
  return { ok: true, trackingNumber, labelUrl: String(labelUrl).slice(0, 400) };
}

export async function createSaudiShipment(order, courier) {
  if (!isSaudiApiCourier("sa", courier)) return { ok: false, error: "not_saudi_courier" };
  if (!saudiApiReady("sa", courier)) return { ok: false, error: "api_not_ready" };
  if (order?.country !== "sa") return { ok: false, error: "saudi_only" };
  if (courier.id === "smsa") return smsaCreate(order, courier);
  return aramexCreate(order, courier);
}
