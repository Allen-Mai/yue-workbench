/* ==========================================================================
   core/router.ts · 极简 hash 路由（#/<模块>/<子页>/<参数>）
   ========================================================================== */

export interface Route {
  segments: string[];
  query: URLSearchParams;
  hash: string;
}

export type RouteListener = (route: Route) => void;

function parse(hash: string): Route {
  const raw = (hash || '#/hub').replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
  return {
    segments,
    query: new URLSearchParams(queryPart ?? ''),
    hash: `#/${pathPart}`,
  };
}

export class Router {
  private listeners = new Set<RouteListener>();
  private current: Route = parse(location.hash || '#/hub');
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    window.addEventListener('hashchange', () => this.dispatch());
    this.dispatch();
  }

  on(fn: RouteListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  go(hash: string, replace = false): void {
    const target = hash.startsWith('#') ? hash : `#/${hash.replace(/^\/+/, '')}`;
    if (replace) {
      history.replaceState(null, '', target);
      this.dispatch();
    } else if (location.hash === target) {
      this.dispatch();
    } else {
      location.hash = target;
    }
  }

  back(fallback = '#/hub'): void {
    if (history.length > 1) history.back();
    else this.go(fallback);
  }

  route(): Route {
    return this.current;
  }

  /** 当前模块 id */
  moduleId(): string {
    return this.current.segments[0] || 'hub';
  }

  private dispatch(): void {
    this.current = parse(location.hash || '#/hub');
    for (const fn of Array.from(this.listeners)) {
      try {
        fn(this.current);
      } catch (err) {
        console.error('[router] 处理失败', err);
      }
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
}

export const router = new Router();
