import { chromium, type Page } from "playwright";

export type AnuncioTendencia = {
  pageName: string;
  adText: string;
};

const TIEMPO_LIMITE_MS = 15_000;
const TIEMPO_NAVEGACION_MS = 12_000;
const MAX_RESULTADOS = 10;

const URL_AD_LIBRARY = "https://www.facebook.com/ads/library/";

/**
 * Busca anuncios activos en Meta Ad Library abriendo la página pública con
 * Playwright (sin login). Devuelve el mismo contrato que antes usaba la API
 * `ads_archive`: nombre de la página anunciante + texto del anuncio.
 *
 * La API de Ad Library está bloqueada por una verificación de identidad
 * pendiente, así que el scraping corre en el servidor dentro de la ruta API.
 */
export async function buscarTendenciaMetaAds(query: string): Promise<AnuncioTendencia[]> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      ejecutarScraping(query),
      new Promise<never>((_, rechazar) => {
        temporizador = setTimeout(() => {
          rechazar(new Error("Meta Ad Library tardó más de 15 segundos. Intenta de nuevo."));
        }, TIEMPO_LIMITE_MS);
      }),
    ]);
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}

async function ejecutarScraping(query: string): Promise<AnuncioTendencia[]> {
  // --no-sandbox y --disable-dev-shm-usage son necesarios dentro de Docker.
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const context = await browser.newContext({
      locale: "es-MX",
      viewport: { width: 1366, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    });
    // Algunos bundlers (esbuild/SWC con keepNames) agregan un helper `__name`
    // dentro del callback de page.evaluate. Lo definimos en la página para que
    // el scraping funcione igual en Next y en scripts con tsx.
    await context.addInitScript({ content: "globalThis.__name = globalThis.__name || ((fn) => fn);" });
    const page = await context.newPage();
    page.setDefaultTimeout(TIEMPO_NAVEGACION_MS);
    page.setDefaultNavigationTimeout(TIEMPO_NAVEGACION_MS);

    const url = new URL(URL_AD_LIBRARY);
    url.searchParams.set("active_status", "active");
    url.searchParams.set("ad_type", "all");
    url.searchParams.set("country", "MX");
    // Solo Facebook. Verificado contra Ad Library: el parámetro sí aplica el
    // filtro (la página muestra el chip "Plataforma: Facebook" y cambia el total).
    url.searchParams.set("publisher_platforms[0]", "facebook");
    url.searchParams.set("q", query);

    await page.goto(url.toString(), { waitUntil: "domcontentloaded" });

    await cerrarAvisoDeCookies(page);

    // Espera a que la app pinte al menos una tarjeta o diga que no hay anuncios.
    await page.waitForFunction(
      () => {
        const texto = (document.body?.innerText ?? "").replace(/\u200b/g, "");
        const hayTarjeta = /(?:^|\n)\s*(?:publicidad|patrocinado|sponsored)(?:\s*[•·]|\s*$)/im.test(texto);
        const sinResultados = /no hay ningún anuncio|no se encontraron anuncios|no ads found|no ads match|no hay resultados/i.test(texto);
        return hayTarjeta || sinResultados;
      },
      undefined,
      { timeout: 10_000 },
    ).catch(() => undefined);

    await page.waitForTimeout(600);

    const bloqueo = await detectarBloqueo(page);
    if (bloqueo) throw new Error(bloqueo);

    const anuncios = await page.evaluate((maximo) => {
      const sinRuido = (valor: string | null | undefined) => (valor ?? "").replace(/\u200b/g, "").replace(/\r/g, "");
      const normalizar = (valor: string) => valor.replace(/\s+/g, " ").trim();
      const aLineas = (valor: string) => sinRuido(valor).split("\n").map(normalizar).filter(Boolean);

      // Meta usa "Patrocinado"/"Sponsored" en inglés y "Publicidad" en español.
      // A veces la etiqueta trae "• Pagado por ...", así que aceptamos ese sufijo.
      const esEtiqueta = (linea: string) =>
        /^(publicidad|patrocinado|sponsored)(\b|\s*[•·])/i.test(linea);

      // Buscamos elementos cortos cuyo texto empiece con la etiqueta.
      const etiquetas = Array.from(document.querySelectorAll<HTMLElement>("*"))
        .filter((el) => {
          const texto = aLineas(el.textContent ?? "").join(" ");
          return texto.length <= 90 && esEtiqueta(texto);
        });

      const resultados: Array<{ pageName: string; adText: string }> = [];
      const cabecerasVistas = new Set<HTMLElement>();
      const clavesVistas = new Set<string>();

      const esCta = (linea: string) =>
        /^(enviar mensaje( de whatsapp)?|send message|send whatsapp message|más información|learn more|comprar ahora|shop now|reservar|book now|llamar|call now|solicitar información|sign up|registrarte|descargar|download|instalar|install)$/i.test(linea);
      const esDominio = (linea: string) =>
        /^[a-z0-9.-]+\.(com|mx|net|org|link|be|ly|app|shop|store)$/i.test(linea);
      const esDuracion = (linea: string) =>
        /^\d{1,2}:\d{2}(\s*\/\s*\d{1,2}:\d{2})?$/.test(linea);

      for (const etiqueta of etiquetas) {
        // La cabecera de la tarjeta es el ancestro más cercano cuyas líneas
        // terminan en "Publicidad"/"Patrocinado"/"Sponsored".
        let cabecera: HTMLElement | null = etiqueta;
        let intentos = 0;
        while (cabecera && intentos < 12) {
          const lineas = aLineas(cabecera.innerText ?? "");
          if (lineas.length >= 2 && esEtiqueta(lineas[lineas.length - 1])) break;
          cabecera = cabecera.parentElement;
          intentos++;
        }
        if (!cabecera || cabecerasVistas.has(cabecera)) continue;
        cabecerasVistas.add(cabecera);

        const lineasCabecera = aLineas(cabecera.innerText ?? "");
        const pageName = lineasCabecera[0] ?? "";
        if (!pageName) continue;

        // Subir hasta el contenedor que ya incluye el cuerpo del anuncio.
        let cuerpo: HTMLElement | null = cabecera;
        const largoCabecera = (cabecera.innerText ?? "").length;
        for (let nivel = 0; nivel < 8 && cuerpo; nivel++) {
          if ((cuerpo.innerText ?? "").length > largoCabecera + 15) break;
          cuerpo = cuerpo.parentElement;
        }
        if (!cuerpo) continue;

        const lineas = aLineas(cuerpo.innerText ?? "");
        const posicionEtiqueta = lineas.findIndex(esEtiqueta);
        const cuerpoAnuncio = posicionEtiqueta >= 0 ? lineas.slice(posicionEtiqueta + 1) : lineas;

        // Quitar el pie de la tarjeta: CTA, dominio del enlace, duración y el
        // nombre de la página repetido al final.
        while (cuerpoAnuncio.length > 0) {
          const ultima = cuerpoAnuncio[cuerpoAnuncio.length - 1];
          if (esCta(ultima) || esDominio(ultima) || esDuracion(ultima) || ultima === pageName) {
            cuerpoAnuncio.pop();
          } else {
            break;
          }
        }

        const adText = cuerpoAnuncio.join("\n").slice(0, 1_200);
        if (adText.length < 10) continue;

        const clave = `${pageName}|${adText.slice(0, 80)}`;
        if (clavesVistas.has(clave)) continue;
        clavesVistas.add(clave);
        resultados.push({ pageName, adText });
        if (resultados.length >= maximo) break;
      }

      return resultados;
    }, MAX_RESULTADOS);

    if (anuncios.length === 0) {
      const cuerpo = await page.locator("body").innerText({ timeout: 2_000 }).catch(() => "");
      if (/no hay ningún anuncio|no hay anuncios|no se encontraron anuncios|no ads found|no ads match|no hay resultados/i.test(cuerpo)) {
        return [];
      }
      // Si Meta sí pintó resultados pero no pudimos leer tarjetas, avisamos en
      // vez de devolver una lista vacía que parezca "sin anuncios".
      if (/resultados/i.test(cuerpo)) {
        throw new Error("Meta mostró resultados pero no pudimos leer las tarjetas. Puede haber cambiado la página; intenta de nuevo.");
      }
    }

    return anuncios;
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function cerrarAvisoDeCookies(page: Page) {
  const nombres = [
    /Permitir todas las cookies/i,
    /Allow all cookies/i,
    /Solo permitir cookies esenciales/i,
    /Only allow essential cookies/i,
  ];
  for (const nombre of nombres) {
    const boton = page.getByRole("button", { name: nombre }).first();
    if (await boton.count().catch(() => 0)) {
      await boton.click({ timeout: 1_500 }).catch(() => undefined);
      return;
    }
  }
}

async function detectarBloqueo(page: Page): Promise<string | null> {
  const url = page.url();
  const cuerpo = await page.locator("body").innerText({ timeout: 2_000 }).catch(() => "");
  if (/\/login|\/checkpoint/i.test(url) ||
      /inicia sesión|log in to continue|confirma que no eres un robot|temporarily blocked|hemos bloqueado/i.test(cuerpo)) {
    return "Meta pidió iniciar sesión o bloqueó la consulta. Intenta de nuevo más tarde.";
  }
  return null;
}
