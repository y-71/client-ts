import { FilterExpression } from '../api/schemas';
import { compact, toBase64 } from '../util/lang';
import { NonEmptyArray, OmitBy, RequiredBy } from '../util/types';
import { Filter } from './filters';
import {
  CursorNavigationOptions,
  OffsetNavigationOptions,
  Page,
  Paginable,
  PaginationQueryMeta,
  PAGINATION_MAX_SIZE
} from './pagination';
import { XataRecord } from './record';
import { Repository } from './repository';
import { SelectableColumn, SelectedPick, ValueAtColumn } from './selection';
import { SortDirection, SortFilter } from './sorting';

type BaseOptions<T extends XataRecord> = {
  columns?: NonEmptyArray<SelectableColumn<T>>;
  cache?: number;
};

type CursorQueryOptions = {
  pagination?: CursorNavigationOptions & OffsetNavigationOptions;
  filter?: never;
  sort?: never;
};

type OffsetQueryOptions<T extends XataRecord> = {
  pagination?: OffsetNavigationOptions;
  filter?: FilterExpression;
  sort?: SortFilter<T> | SortFilter<T>[];
};

export type QueryOptions<T extends XataRecord> = BaseOptions<T> & (CursorQueryOptions | OffsetQueryOptions<T>);

/**
 * Query objects contain the information of all filters, sorting, etc. to be included in the database query.
 *
 * Query objects are immutable. Any method that adds more constraints or options to the query will return
 * a new Query object containing the both the previous and the new constraints and options.
 */
export class Query<Record extends XataRecord, Result extends XataRecord = Record> implements Paginable<Record, Result> {
  #table: string;
  #repository: Repository<Record>;
  #data: QueryOptions<Record> = { filter: {} };

  // Implements pagination
  readonly meta: PaginationQueryMeta = { page: { cursor: 'start', more: true } };
  readonly records: Result[] = [];

  constructor(
    repository: Repository<Record> | null,
    table: string,
    data: Partial<QueryOptions<Record>>,
    parent?: Partial<QueryOptions<Record>>
  ) {
    this.#table = table;

    if (repository) {
      this.#repository = repository;
    } else {
      this.#repository = this as any;
    }

    this.#data.filter = data.filter ?? parent?.filter ?? {};
    this.#data.filter.$any = data.filter?.$any ?? parent?.filter?.$any;
    this.#data.filter.$all = data.filter?.$all ?? parent?.filter?.$all;
    this.#data.filter.$not = data.filter?.$not ?? parent?.filter?.$not;
    this.#data.filter.$none = data.filter?.$none ?? parent?.filter?.$none;
    this.#data.sort = data.sort ?? parent?.sort;
    this.#data.columns = data.columns ?? parent?.columns ?? ['*'];
    this.#data.pagination = data.pagination ?? parent?.pagination;
    this.#data.cache = data.cache ?? parent?.cache;

    this.any = this.any.bind(this);
    this.all = this.all.bind(this);
    this.not = this.not.bind(this);
    this.filter = this.filter.bind(this);
    this.sort = this.sort.bind(this);
    this.none = this.none.bind(this);

    Object.defineProperty(this, 'table', { enumerable: false });
    Object.defineProperty(this, 'repository', { enumerable: false });
  }

  getQueryOptions(): QueryOptions<Record> {
    return this.#data;
  }

  key(): string {
    const { columns = [], filter = {}, sort = [], pagination = {} } = this.#data;
    const key = JSON.stringify({ columns, filter, sort, pagination });
    return toBase64(key);
  }

  /**
   * Builds a new query object representing a logical OR between the given subqueries.
   * @param queries An array of subqueries.
   * @returns A new Query object.
   */
  any(...queries: Query<Record, any>[]): Query<Record, Result> {
    const $any = queries.map((query) => query.getQueryOptions().filter ?? {});
    return new Query<Record, Result>(this.#repository, this.#table, { filter: { $any } }, this.#data);
  }

  /**
   * Builds a new query object representing a logical AND between the given subqueries.
   * @param queries An array of subqueries.
   * @returns A new Query object.
   */
  all(...queries: Query<Record, any>[]): Query<Record, Result> {
    const $all = queries.map((query) => query.getQueryOptions().filter ?? {});
    return new Query<Record, Result>(this.#repository, this.#table, { filter: { $all } }, this.#data);
  }

  /**
   * Builds a new query object representing a logical OR negating each subquery. In pseudo-code: !q1 OR !q2
   * @param queries An array of subqueries.
   * @returns A new Query object.
   */
  not(...queries: Query<Record, any>[]): Query<Record, Result> {
    const $not = queries.map((query) => query.getQueryOptions().filter ?? {});
    return new Query<Record, Result>(this.#repository, this.#table, { filter: { $not } }, this.#data);
  }

  /**
   * Builds a new query object representing a logical AND negating each subquery. In pseudo-code: !q1 AND !q2
   * @param queries An array of subqueries.
   * @returns A new Query object.
   */
  none(...queries: Query<Record, any>[]): Query<Record, Result> {
    const $none = queries.map((query) => query.getQueryOptions().filter ?? {});
    return new Query<Record, Result>(this.#repository, this.#table, { filter: { $none } }, this.#data);
  }

  /**
   * Builds a new query object adding one or more constraints. Examples:
   *
   * ```
   * query.filter("columnName", columnValue)
   * query.filter({
   *   "columnName": columnValue
   * })
   * query.filter({
   *   "columnName": operator(columnValue) // Use gt, gte, lt, lte, startsWith,...
   * })
   * ```
   *
   * @returns A new Query object.
   */
  filter(filters: Filter<Record>): Query<Record, Result>;
  filter<F extends SelectableColumn<Record>>(column: F, value: Filter<ValueAtColumn<Record, F>>): Query<Record, Result>;
  filter(a: any, b?: any): Query<Record, Result> {
    if (arguments.length === 1) {
      const constraints = Object.entries(a).map(([column, constraint]) => ({ [column]: constraint as any }));
      const $all = compact([this.#data.filter?.$all].flat().concat(constraints));

      return new Query<Record, Result>(this.#repository, this.#table, { filter: { $all } }, this.#data);
    } else {
      const $all = compact([this.#data.filter?.$all].flat().concat([{ [a]: b }]));

      return new Query<Record, Result>(this.#repository, this.#table, { filter: { $all } }, this.#data);
    }
  }

  /**
   * Builds a new query with a new sort option.
   * @param column The column name.
   * @param direction The direction. Either ascending or descending.
   * @returns A new Query object.
   */
  sort<F extends SelectableColumn<Record>>(column: F, direction: SortDirection): Query<Record, Result> {
    const originalSort = [this.#data.sort ?? []].flat() as SortFilter<Record>[];
    const sort = [...originalSort, { column, direction }];
    return new Query<Record, Result>(this.#repository, this.#table, { sort }, this.#data);
  }

  /**
   * Builds a new query specifying the set of columns to be returned in the query response.
   * @param columns Array of column names to be returned by the query.
   * @returns A new Query object.
   */
  select<K extends SelectableColumn<Record>>(columns: NonEmptyArray<K>) {
    return new Query<Record, SelectedPick<Record, typeof columns>>(
      this.#repository,
      this.#table,
      { columns },
      this.#data
    );
  }

  getPaginated(): Promise<Page<Record, Result>>;
  getPaginated(options: OmitBy<QueryOptions<Record>, 'columns'>): Promise<Page<Record, Result>>;
  getPaginated<Options extends RequiredBy<QueryOptions<Record>, 'columns'>>(
    options: Options
  ): Promise<Page<Record, SelectedPick<Record, typeof options['columns']>>>;
  getPaginated<Result extends XataRecord>(options: QueryOptions<Record> = {}): Promise<Page<Record, Result>> {
    const query = new Query<Record, Result>(this.#repository, this.#table, options, this.#data);
    return this.#repository.query(query);
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<Result> {
    for await (const [record] of this.getIterator({ batchSize: 1 })) {
      yield record;
    }
  }

  getIterator(): AsyncGenerator<Result[]>;
  getIterator(
    options: OmitBy<QueryOptions<Record>, 'columns' | 'pagination'> & { batchSize?: number }
  ): AsyncGenerator<Result[]>;
  getIterator<
    Options extends RequiredBy<OmitBy<QueryOptions<Record>, 'pagination'>, 'columns'> & { batchSize?: number }
  >(options: Options): AsyncGenerator<SelectedPick<Record, typeof options['columns']>[]>;
  async *getIterator<Result extends XataRecord>(
    options: QueryOptions<Record> & { batchSize?: number } = {}
  ): AsyncGenerator<Result[]> {
    const { batchSize = 1 } = options;
    let offset = 0;
    let end = false;

    while (!end) {
      const { records, meta } = await this.getPaginated({ ...options, pagination: { size: batchSize, offset } });
      // Method overloading does not provide type inference for the return type.
      yield records as unknown as Result[];

      offset += batchSize;
      end = !meta.page.more;
    }
  }

  /**
   * Performs the query in the database and returns a set of results.
   * @param options Additional options to be used when performing the query.
   * @returns An array of records from the database.
   */
  getMany(): Promise<Result[]>;
  getMany(options: OmitBy<QueryOptions<Record>, 'columns'>): Promise<Result[]>;
  getMany<Options extends RequiredBy<QueryOptions<Record>, 'columns'>>(
    options: Options
  ): Promise<SelectedPick<Record, typeof options['columns']>[]>;
  async getMany<Result extends XataRecord>(options: QueryOptions<Record> = {}): Promise<Result[]> {
    const { records } = await this.getPaginated(options);
    // Method overloading does not provide type inference for the return type.
    return records as unknown as Result[];
  }

  /**
   * Performs the query in the database and returns all the results.
   * Warning: If there are a large number of results, this method can have performance implications.
   * @param options Additional options to be used when performing the query.
   * @returns An array of records from the database.
   */
  getAll(): Promise<Result[]>;
  getAll(options: OmitBy<QueryOptions<Record>, 'columns' | 'pagination'> & { batchSize?: number }): Promise<Result[]>;
  getAll<Options extends RequiredBy<OmitBy<QueryOptions<Record>, 'pagination'>, 'columns'> & { batchSize?: number }>(
    options: Options
  ): Promise<SelectedPick<Record, typeof options['columns']>[]>;
  async getAll<Result extends XataRecord>(
    options: QueryOptions<Record> & { batchSize?: number } = {}
  ): Promise<Result[]> {
    const { batchSize = PAGINATION_MAX_SIZE, ...rest } = options;
    const results = [];

    for await (const page of this.getIterator({ ...rest, batchSize })) {
      results.push(...page);
    }

    // Method overloading does not provide type inference for the return type.
    return results as unknown as Result[];
  }

  /**
   * Performs the query in the database and returns the first result.
   * @param options Additional options to be used when performing the query.
   * @returns The first record that matches the query, or null if no record matched the query.
   */
  getFirst(): Promise<Result | null>;
  getFirst(options: OmitBy<QueryOptions<Record>, 'columns' | 'pagination'>): Promise<Result | null>;
  getFirst<Options extends RequiredBy<OmitBy<QueryOptions<Record>, 'pagination'>, 'columns'>>(
    options: Options
  ): Promise<SelectedPick<Record, typeof options['columns']> | null>;
  async getFirst<Result extends XataRecord>(options: QueryOptions<Record> = {}): Promise<Result | null> {
    const records = await this.getMany({ ...options, pagination: { size: 1 } });
    // Method overloading does not provide type inference for the return type.
    return (records[0] as unknown as Result) ?? null;
  }

  /**
   * Builds a new query object adding a cache TTL in milliseconds.
   * @param ttl The cache TTL in milliseconds.
   * @returns A new Query object.
   */
  cache(ttl: number): Query<Record, Result> {
    return new Query<Record, Result>(this.#repository, this.#table, { cache: ttl }, this.#data);
  }

  nextPage(size?: number, offset?: number): Promise<Page<Record, Result>> {
    return this.firstPage(size, offset);
  }

  previousPage(size?: number, offset?: number): Promise<Page<Record, Result>> {
    return this.firstPage(size, offset);
  }

  firstPage(size?: number, offset?: number): Promise<Page<Record, Result>> {
    return this.getPaginated({ pagination: { size, offset } });
  }

  lastPage(size?: number, offset?: number): Promise<Page<Record, Result>> {
    return this.getPaginated({ pagination: { size, offset, before: 'end' } });
  }

  hasNextPage(): boolean {
    return this.meta.page.more;
  }
}
