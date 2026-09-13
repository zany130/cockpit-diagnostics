/**
 * Turn sanitized plot SVG into an <img> src that Cockpit's CSP allows.
 *
 * Cockpit's default Content-Security-Policy is:
 *   img-src 'self' <ws-origin> data:;
 * It does not include `blob:`. URL.createObjectURL() therefore shows a
 * broken image in the Cockpit shell (alt text only), even though the same
 * blob URL works in the fixture preview, which has no CSP.
 *
 * A data:image/svg+xml URL is permitted by that img-src list. SVG loaded
 * as an image still cannot run script or navigate the Cockpit origin.
 * encodeURIComponent preserves characters such as # inside clip-path ids.
 */
export function bootPlotImageSrc(svg: string): string {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
