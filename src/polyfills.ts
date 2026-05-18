/**
 * Minimal browser-ish globals. Kept around for any future pure-JS lib that
 * assumes them. pdfjs was the original reason, but it has since moved to a
 * planned Dev Client-based implementation (see docs/dev-client-setup.md).
 */

type Mutable = Record<string, unknown>;
const g = globalThis as unknown as Mutable;

g.navigator ??= {} as Mutable;
const nav = g.navigator as Mutable;
nav.platform ??= '';
nav.userAgent ??= '';

export {};
