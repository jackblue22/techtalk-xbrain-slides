import type { QueryResult, QueryResultRow } from 'pg';

export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<R>>;
}

export interface OrderItemInput {
  sku: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateOrderInput {
  customerRef: string;
  items: OrderItemInput[];
}

