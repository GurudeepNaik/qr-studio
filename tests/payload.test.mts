import assert from "node:assert";
const P = (await import("../lib/payload.ts")) as typeof import("../lib/payload");
const up = (o: Partial<{ id: string; name: string; amount: string; note: string }>) => P.checkUpi({ id: "", name: "", amount: "", note: "", ...o });
const r1 = up({ id: "asha.rao@okicici", name: "Asha Rao", amount: "250", note: "Tea stall" });
assert.ok(r1.ok); assert.equal(r1.ok && r1.value, "upi://pay?pa=asha.rao%40okicici&pn=Asha%20Rao&am=250.00&cu=INR&tn=Tea%20stall");
assert.equal((up({ id: "9876543210@ybl" }) as { value: string }).value, "upi://pay?pa=9876543210%40ybl&cu=INR", "no amount: payer types it");
for (const bad of ["", "nobank", "a@", "@bank", "a b@ok", "x@1bank"]) assert.equal(up({ id: bad }).ok, false, `rejects UPI ID "${bad}"`);
for (const bad of ["0", "-5", "abc", "100000.01", "12.345"]) assert.equal(up({ id: "a.b@ok", amount: bad }).ok, false, `rejects amount "${bad}"`);
assert.ok(up({ id: "a.b@ok", amount: "100000" }).ok, "₹1 lakh is allowed");
assert.equal((P.checkLink("example.com/menu") as { value: string }).value, "https://example.com/menu");
assert.equal((P.checkLink("  https://wa.me/919876543210  ") as { value: string }).value, "https://wa.me/919876543210");
for (const bad of ["", "javascript:alert(1)", "ftp://x.com", "hello", "not a link .com"]) assert.equal(P.checkLink(bad).ok, false, `rejects link "${bad}"`);
assert.equal(P.rupees("1250"), "₹1,250");
console.log("PAYLOAD OK");

// Phones, WhatsApp, Call
assert.equal((P.checkWhatsApp("98765 43210", "Hi, is the shop open?") as { value: string }).value, "https://wa.me/919876543210?text=Hi%2C%20is%20the%20shop%20open%3F");
assert.equal((P.checkWhatsApp("+91 98765-43210", "") as { value: string }).value, "https://wa.me/919876543210");
assert.equal((P.checkWhatsApp("+44 7700 900123", "") as { value: string }).value, "https://wa.me/447700900123");
assert.equal(P.checkWhatsApp("4412345678", "").ok, false, "WhatsApp needs a mobile");
assert.equal((P.checkCall("044 1234 5678") as { value: string }).value, "tel:+914412345678", "landline with leading 0");
for (const bad of ["", "12345", "+1234567890123456"]) assert.equal(P.checkCall(bad).ok, false, `rejects phone "${bad}"`);
assert.equal(P.prettyPhone("919876543210"), "+91 98765 43210");
// Directions
assert.equal((P.checkMap("Asha Tea Stall, MG Road, Bhatkal") as { value: string }).value, "https://www.google.com/maps/dir/?api=1&destination=Asha%20Tea%20Stall%2C%20MG%20Road%2C%20Bhatkal");
assert.equal((P.checkMap("13.9853, 74.5553") as { value: string }).value, "https://www.google.com/maps/dir/?api=1&destination=13.9853%2C74.5553");
assert.equal((P.checkMap("https://maps.app.goo.gl/AbC123") as { value: string }).value, "https://maps.app.goo.gl/AbC123");
for (const bad of ["", "https://evil.example/maps", "95.1, 10"]) assert.equal(P.checkMap(bad).ok, false, `rejects place "${bad}"`);
// Wi-Fi
assert.equal((P.checkWifi("Asha Cafe", "chai;1234", "WPA") as { value: string }).value, "WIFI:T:WPA;S:Asha Cafe;P:chai\\;1234;;");
assert.equal((P.checkWifi("Guest", "", "nopass") as { value: string }).value, "WIFI:T:nopass;S:Guest;;");
assert.equal(P.checkWifi("Guest", "short", "WPA").ok, false, "WPA needs 8+ characters");
assert.equal(P.checkWifi("", "password1", "WPA").ok, false, "needs a name");
console.log("MORE TYPES OK");

// Google Maps "Share" text and the Android share sheet
{
  const M = (await import("../lib/modes.ts")) as typeof import("../lib/modes");
  const shareText = "Asha Tea Stall, MG Road, Bhatkal, Karnataka 581320 https://maps.app.goo.gl/AbC123xyz";
  assert.equal((P.checkMap(shareText) as { value: string }).value, "https://maps.app.goo.gl/AbC123xyz", "link pulled out of share text");
  assert.equal(M.cardLines("map", { place: shareText }, "https://maps.app.goo.gl/AbC123xyz").lines[0], "Asha Tea Stall, MG Road, Bhatkal, Karnataka 581320".slice(0, 34));
  assert.deepEqual(M.fromShare("Asha Tea Stall", "", "https://maps.app.goo.gl/AbC123xyz"), { mode: "map", f: { place: "https://maps.app.goo.gl/AbC123xyz", label: "Asha Tea Stall" } });
  assert.deepEqual(M.fromShare("", "Asha Tea Stall\nMG Road\nhttps://maps.app.goo.gl/AbC123xyz", ""), { mode: "map", f: { place: "https://maps.app.goo.gl/AbC123xyz", label: "Asha Tea Stall" } });
  assert.deepEqual(M.fromShare("", "look https://example.com/x", ""), { mode: "link", f: { url: "https://example.com/x" } });
  assert.equal(M.fromShare("", "", ""), null);
  console.log("MAPS SHARE OK");
}
