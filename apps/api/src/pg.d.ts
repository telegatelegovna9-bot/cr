declare module 'pg' {
  export class Pool {
    constructor(config?: any);
    query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
    end(): Promise<void>;
  }
  export interface QueryResult<T = any> {
    rows: T[];
    rowCount: number | null;
    command: string;
    oid: number;
    fields: any[];
  }
}
