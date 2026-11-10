import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

// fetch verso URL forniti dagli utenti (form pubblici): solo https sulla porta 443 e solo
// host che risolvono su indirizzi pubblici, anche dopo ogni redirect. Evita che il form
// diventi un modo per interrogare servizi interni (SSRF: metadati del cloud, Postgres,
// OpenSearch, la rete dei container).

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32],
  ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) blocked.addSubnet(net, prefix, "ipv6");

// Niente regola ::ffff:0:0/96: BlockList confronta ogni IPv4 anche con le regole IPv6 nella
// forma ::ffff:a.b.c.d, quindi bloccherebbe tutto l'IPv4. Gli IPv4-mapped si controllano qui sotto.
export const isPublicAddress = (address: string): boolean => {
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return isPublicAddress(mapped[1]!);
  const family = isIP(address);
  return family !== 0 && !blocked.check(address, family === 6 ? "ipv6" : "ipv4");
};

export class UnsafeUrlError extends Error {}

export async function assertPublicUrl(raw: string): Promise<URL> {
  const u = new URL(raw);
  if (u.protocol !== "https:") throw new UnsafeUrlError("solo URL https");
  if (u.port && u.port !== "443") throw new UnsafeUrlError("solo la porta 443");
  if (u.username || u.password) throw new UnsafeUrlError("niente credenziali nell'URL");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  if (addresses.length === 0 || !addresses.every((a) => isPublicAddress(a.address))) {
    throw new UnsafeUrlError(`${host} non è un indirizzo pubblico`);
  }
  return u;
}

/**
 * GET con i controlli sopra, redirect seguiti a mano (massimo 3) e ricontrollati.
 * Resta il caso di un DNS che cambia risposta tra il controllo e la connessione
 * (DNS rebinding): per chiuderlo servirebbe connettersi all'IP verificato; il rischio
 * qui è basso perché la risposta viene solo validata e mai restituita per intero.
 */
export async function safeFetch(raw: string, init: RequestInit = {}, maxRedirects = 3): Promise<Response> {
  let url = raw;
  for (let i = 0; i <= maxRedirects; i++) {
    await assertPublicUrl(url);
    const res = await fetch(url, { ...init, redirect: "manual" });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url).toString();
      continue;
    }
    return res;
  }
  throw new UnsafeUrlError("troppi redirect");
}
