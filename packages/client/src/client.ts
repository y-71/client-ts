import { FetcherExtraProps, FetchImpl } from './api/fetcher';
import { XataPlugin, XataPluginOptions } from './plugins';
import { SchemaPlugin, SchemaPluginResult } from './schema';
import { CacheImpl, NoCache } from './schema/cache';
import { BaseData } from './schema/record';
import { LinkDictionary } from './schema/repository';
import { SearchPlugin, SearchPluginResult } from './search';
import { BranchStrategy, BranchStrategyOption, BranchStrategyValue, isBranchStrategyBuilder } from './util/branches';
import { getAPIKey, getCurrentBranchName, getDatabaseURL } from './util/config';
import { getFetchImplementation } from './util/fetch';
import { AllRequired, StringKeys } from './util/types';

export type BaseClientOptions = {
  fetch?: FetchImpl;
  apiKey?: string;
  databaseURL?: string;
  branch?: BranchStrategyOption;
  cache?: CacheImpl;
};

export const buildClient = <Plugins extends Record<string, XataPlugin> = {}>(plugins?: Plugins) =>
  class {
    #branch: BranchStrategyValue;
    db: SchemaPluginResult<any>;
    search: SearchPluginResult<any>;

    constructor(options: BaseClientOptions = {}, links?: LinkDictionary) {
      const safeOptions = this.#parseOptions(options);
      const pluginOptions: XataPluginOptions = {
        getFetchProps: () => this.#getFetchProps(safeOptions),
        cache: safeOptions.cache
      };

      const db = new SchemaPlugin(links).build(pluginOptions);
      const search = new SearchPlugin(db, links ?? {}).build(pluginOptions);

      // We assign the namespaces after creating in case the user overrides the db plugin
      this.db = db;
      this.search = search;

      for (const [key, namespace] of Object.entries(plugins ?? {})) {
        if (!namespace) continue;
        const result = namespace.build(pluginOptions);

        if (result instanceof Promise) {
          void result.then((namespace: unknown) => {
            // @ts-ignore
            this[key] = namespace;
          });
        } else {
          // @ts-ignore
          this[key] = result;
        }
      }
    }

    #parseOptions(options?: BaseClientOptions) {
      const fetch = getFetchImplementation(options?.fetch);
      const databaseURL = options?.databaseURL || getDatabaseURL();
      const apiKey = options?.apiKey || getAPIKey();
      const cache = options?.cache ?? new NoCache();
      const branch = async () =>
        options?.branch
          ? await this.#evaluateBranch(options.branch)
          : await getCurrentBranchName({ apiKey, databaseURL, fetchImpl: options?.fetch });

      if (!databaseURL || !apiKey) {
        throw new Error('Options databaseURL and apiKey are required');
      }

      return { fetch, databaseURL, apiKey, branch, cache };
    }

    async #getFetchProps({
      fetch,
      apiKey,
      databaseURL,
      branch
    }: AllRequired<BaseClientOptions>): Promise<FetcherExtraProps> {
      const branchValue = await this.#evaluateBranch(branch);
      if (!branchValue) throw new Error('Unable to resolve branch value');

      return {
        fetchImpl: fetch,
        apiKey,
        apiUrl: '',
        // Instead of using workspace and dbBranch, we inject a probably CNAME'd URL
        workspacesApiUrl: (path, params) => {
          const hasBranch = params.dbBranchName ?? params.branch;
          const newPath = path.replace(/^\/db\/[^/]+/, hasBranch ? `:${branchValue}` : '');
          return databaseURL + newPath;
        }
      };
    }

    async #evaluateBranch(param?: BranchStrategyOption): Promise<string | undefined> {
      if (this.#branch) return this.#branch;
      if (!param) return undefined;

      const strategies = Array.isArray(param) ? [...param] : [param];

      const evaluateBranch = async (strategy: BranchStrategy) => {
        return isBranchStrategyBuilder(strategy) ? await strategy() : strategy;
      };

      for await (const strategy of strategies) {
        const branch = await evaluateBranch(strategy);
        if (branch) {
          this.#branch = branch;
          return branch;
        }
      }
    }
  } as unknown as ClientConstructor<Plugins>;

export interface ClientConstructor<Plugins extends Record<string, XataPlugin>> {
  new <Schemas extends Record<string, BaseData>>(options?: Partial<BaseClientOptions>, links?: LinkDictionary): Omit<
    {
      db: Awaited<ReturnType<SchemaPlugin<Schemas>['build']>>;
      search: Awaited<ReturnType<SearchPlugin<Schemas>['build']>>;
    },
    keyof Plugins
  > & {
    [Key in StringKeys<NonNullable<Plugins>>]: Awaited<ReturnType<NonNullable<Plugins>[Key]['build']>>;
  };
}

export class BaseClient extends buildClient()<Record<string, any>> {}
