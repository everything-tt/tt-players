export function serializeJsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function buildQueryStateScript(value: unknown): string {
  return `<script id="__TT_QUERY_STATE__" type="application/json">${serializeJsonForHtml(value)}</script>`;
}
