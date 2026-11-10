const dateFmt = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" });

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));

/** URL senza schema e senza ".git", per tabelle più leggibili. */
export const shortUrl = (url: string) => url.replace(/^https?:\/\//, "").replace(/\.git$/, "");

/** URL navigabile del repository (senza ".git"). */
export const repoHref = (url: string) => url.replace(/\.git$/, "");
