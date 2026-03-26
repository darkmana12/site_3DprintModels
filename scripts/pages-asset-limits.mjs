/** Limite Cloudflare Pages : https://developers.cloudflare.com/pages/platform/limits/ */
export const MAX_PAGES_ASSET_BYTES = 25 * 1024 * 1024;

/** STL servis depuis le dépôt (raw) quand > limite — doit correspondre au repo public. */
export const RAW_STL_BASE =
  "https://raw.githubusercontent.com/darkmana12/site_3DprintModels/main/public/models/stl/";
