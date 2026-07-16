import type { Handler, RequestContext } from "./types.js";

interface Route {
  method: string;
  segments: string[];
  handler: Handler;
}

export class Router {
  readonly #routes: Route[] = [];

  add(method: string, pattern: string, handler: Handler): this {
    this.#routes.push({ method: method.toUpperCase(), segments: splitPath(pattern), handler });
    return this;
  }

  match(
    method: string,
    pathname: string,
  ): { handler: Handler; params: Record<string, string> } | null {
    const pathSegments = splitPath(pathname);
    for (const route of this.#routes) {
      if (route.method !== method.toUpperCase() || route.segments.length !== pathSegments.length)
        continue;
      const params: Record<string, string> = {};
      let matched = true;
      for (let index = 0; index < route.segments.length; index += 1) {
        const expected = route.segments[index];
        const actual = pathSegments[index];
        if (expected === undefined || actual === undefined) {
          matched = false;
          break;
        }
        if (expected.startsWith("{") && expected.endsWith("}")) {
          params[expected.slice(1, -1)] = decodeURIComponent(actual);
        } else if (expected !== actual) {
          matched = false;
          break;
        }
      }
      if (matched) return { handler: route.handler, params };
    }
    return null;
  }

  allowedMethods(pathname: string): readonly string[] {
    const pathSegments = splitPath(pathname);
    const methods = new Set<string>();
    for (const route of this.#routes) {
      if (route.segments.length !== pathSegments.length) continue;
      if (segmentsMatch(route.segments, pathSegments)) methods.add(route.method);
    }
    return [...methods].sort();
  }
}

export function withParams(
  context: RequestContext,
  params: Record<string, string>,
): RequestContext {
  return { ...context, params };
}

function splitPath(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function segmentsMatch(
  expectedSegments: readonly string[],
  actualSegments: readonly string[],
): boolean {
  return expectedSegments.every((expected, index) => {
    const actual = actualSegments[index];
    if (actual === undefined) return false;
    return (expected.startsWith("{") && expected.endsWith("}")) || expected === actual;
  });
}
