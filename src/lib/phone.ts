const UG_PHONE = /^(?:256)?7\d{8}$/;

export function toMsisdn(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  const normalized = digits.startsWith("0") ? `256${digits.slice(1)}` : digits;
  return UG_PHONE.test(normalized) ? normalized : null;
}

export function toE164(value: string): string {
  const msisdn = toMsisdn(value);
  if (!msisdn) throw new Error("Enter a valid Ugandan mobile number.");
  return msisdn;
}

export function detectProvider(value: string): "MTN" | "AIRTEL" | null {
  const msisdn = toMsisdn(value);
  if (!msisdn) return null;
  const subscriber = msisdn.slice(3, 5);
  if (["77", "78", "76", "39"].includes(subscriber)) return "MTN";
  if (["70", "75", "74", "20"].includes(subscriber)) return "AIRTEL";
  return null;
}
