declare module "bun:sqlite" {
  export interface Statement<
    Row = Record<string, unknown>,
    Parameters extends unknown[] = unknown[],
  > {
    all(...parameters: Parameters): Row[];
  }

  export class Database {
    constructor(
      filename: string,
      options?: { readonly?: boolean; strict?: boolean },
    );

    query<
      Row = Record<string, unknown>,
      Parameters extends unknown[] = unknown[],
    >(sql: string): Statement<Row, Parameters>;

    close(): void;
  }
}
