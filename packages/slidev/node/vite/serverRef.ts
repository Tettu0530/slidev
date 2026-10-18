import type { ResolvedSlidevOptions, SlidevPluginOptions } from '@slidev/types'
import type { Plugin, ViteDevServer } from 'vite'
import ServerRef from 'vite-plugin-vue-server-ref'
import { loadDrawings, writeDrawings } from '../integrations/drawings'
import { loadSnapshots, writeSnapshots } from '../integrations/snapshots'

const serverRefStates = new WeakMap<ResolvedSlidevOptions, Record<string, any>>()

/**
 * Access the server-side state shared with the clients via
 * `vite-plugin-vue-server-ref` (e.g. `nav` holds the current position of the
 * live presentation).
 */
export function getServerRefState(options: ResolvedSlidevOptions): Record<string, any> | undefined {
  return serverRefStates.get(options)
}

export async function createServerRefPlugin(
  options: ResolvedSlidevOptions,
  pluginOptions: SlidevPluginOptions,
) {
  const state: Record<string, any> = {
    sync: false,
    nav: {
      page: 0,
      clicks: 0,
      timer: {
        status: 'stopped',
        slides: {},
        startedAt: 0,
        pausedAt: 0,
      },
    },
    drawings: await loadDrawings(options),
    snapshots: await loadSnapshots(options),
    ...pluginOptions.serverRef?.state,
  }
  serverRefStates.set(options, state)

  const plugin = ServerRef({
    debug: false, // process.env.NODE_ENV === 'development',
    state,
    onChanged(key, data, patch, timestamp) {
      pluginOptions.serverRef?.onChanged?.(key, data, patch, timestamp)

      if (options.data.config.drawings.persist && key === 'drawings')
        writeDrawings(options, patch ?? data)

      if (key === 'snapshots')
        writeSnapshots(options, data)
    },
  })

  return withBase(plugin)
}

/**
 * `vite-plugin-vue-server-ref` posts to `/@server-*` without the base, and its
 * middleware runs before Vite strips the base. Make both work under a sub-path.
 */
function withBase(plugin: Plugin): Plugin {
  const configureServer = plugin.configureServer as ((server: ViteDevServer) => void) | undefined
  const load = plugin.load as ((this: unknown, id: string) => Promise<string | undefined>) | undefined
  return {
    ...plugin,
    configureServer(server) {
      const base = server.config.base
      if (base !== '/') {
        server.middlewares.use((req, _res, next) => {
          // Only the POSTs from the client; module GETs go through Vite's own base handling
          if (req.method === 'POST' && req.url?.startsWith(`${base}@server-`))
            req.url = req.url.slice(base.length - 1)
          next()
        })
      }
      return configureServer?.(server)
    },
    async load(id) {
      const code = await load?.call(this, id)
      return code?.replaceAll(`fetch('/@server-`, `fetch(import.meta.env.BASE_URL + '@server-`)
    },
  }
}
