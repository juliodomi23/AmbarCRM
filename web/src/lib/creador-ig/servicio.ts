import { transaccionTenant } from "@/lib/retail-db";
import { graphMensajeriaMeta } from "@/lib/channel/meta-mensajeria";

export type CuentaInstagram = {
  id: string;
  nombre: string;
  instagramId: string;
  username: string | null;
};

export type PerfilInstagram = {
  username: string;
  followersCount: number;
  mediaCount: number;
  profilePictureUrl: string | null;
};

export type MediaInstagram = {
  id: string;
  caption: string | null;
  mediaType: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  permalink: string;
  timestamp: string;
  likeCount: number;
  commentsCount: number;
};

type ConfigCanal = Record<string, unknown> & {
  instagramId?: string;
  username?: string;
};

function configCanal(config: unknown): ConfigCanal {
  return (config && typeof config === "object" ? config : {}) as ConfigCanal;
}

export async function listarCuentasInstagram(orgId: bigint): Promise<CuentaInstagram[]> {
  return transaccionTenant(orgId, async (tx) => {
    const filas = await tx.canalWhatsapp.findMany({
      where: { proveedor: "instagram", estado: "conectado" },
      select: { id: true, nombre: true, config: true },
      orderBy: { id: "asc" },
    });
    return filas.flatMap((fila) => {
      const config = configCanal(fila.config);
      if (!config.instagramId) return [];
      return [{
        id: String(fila.id),
        nombre: fila.nombre,
        instagramId: String(config.instagramId),
        username: typeof config.username === "string" ? config.username : null,
      }];
    });
  });
}

async function canalInstagram(orgId: bigint, canalId: bigint) {
  return transaccionTenant(orgId, async (tx) => {
    const fila = await tx.canalWhatsapp.findFirst({
      where: { id: canalId, proveedor: "instagram", estado: "conectado" },
      select: { config: true },
    });
    const config = configCanal(fila?.config);
    return typeof config.instagramId === "string" && config.instagramId ? config : null;
  });
}

export async function obtenerPerfilInstagram(orgId: bigint, canalId: bigint): Promise<PerfilInstagram | null> {
  try {
    const config = await canalInstagram(orgId, canalId);
    if (!config) return null;
    const data = await graphMensajeriaMeta(config, `${config.instagramId}?fields=username,followers_count,media_count,profile_picture_url`);
    return {
      username: typeof data.username === "string" ? data.username : "",
      followersCount: Number(data.followers_count ?? 0),
      mediaCount: Number(data.media_count ?? 0),
      profilePictureUrl: typeof data.profile_picture_url === "string" ? data.profile_picture_url : null,
    };
  } catch {
    return null;
  }
}

export async function listarMediaInstagram(orgId: bigint, canalId: bigint, limite = 25): Promise<MediaInstagram[]> {
  try {
    const config = await canalInstagram(orgId, canalId);
    if (!config) return [];
    const data = await graphMensajeriaMeta(config, `${config.instagramId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=${limite}`);
    const media = Array.isArray(data?.data) ? data.data as Array<Record<string, unknown>> : [];
    return media.map((item) => ({
      id: String(item.id ?? ""),
      caption: typeof item.caption === "string" ? item.caption : null,
      mediaType: typeof item.media_type === "string" ? item.media_type : "unknown",
      mediaUrl: typeof item.media_url === "string" ? item.media_url : null,
      thumbnailUrl: typeof item.thumbnail_url === "string" ? item.thumbnail_url : null,
      permalink: typeof item.permalink === "string" ? item.permalink : "",
      timestamp: typeof item.timestamp === "string" ? item.timestamp : "",
      likeCount: Number(item.like_count ?? 0),
      commentsCount: Number(item.comments_count ?? 0),
    }));
  } catch {
    return [];
  }
}