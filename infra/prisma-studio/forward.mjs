// Inoltro TCP <IP del container>:PORT -> 127.0.0.1:PORT.
//
// Prisma Studio ascolta solo su 127.0.0.1, e rifiuta (403) le richieste il cui Origin ha
// una porta diversa dalla sua: per questo l'inoltro usa la stessa porta, ma sugli indirizzi
// di rete del container (quelli che raggiunge la mappatura delle porte di Docker).
import net from "node:net";
import os from "node:os";

const port = Number(process.argv[2] ?? 5555);
const addresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((a) => a && !a.internal && a.family === "IPv4")
  .map((a) => a.address);

for (const address of addresses) {
  net
    .createServer((client) => {
      const studio = net.connect(port, "127.0.0.1");
      client.pipe(studio).pipe(client);
      client.on("error", () => studio.destroy());
      studio.on("error", () => client.destroy());
    })
    .listen(port, address);
}
console.log(`Prisma Studio: http://localhost:${port} (inoltro su ${addresses.join(", ")})`);
