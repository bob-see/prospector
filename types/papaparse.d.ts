declare module "papaparse" {
  export type ParseError = {
    type: string;
    code: string;
    message: string;
    row?: number;
    index?: number;
  };

  export type ParseResult<T> = {
    data: T[];
    errors: ParseError[];
    meta: Record<string, unknown>;
  };

  export type ParseConfig = {
    header?: boolean;
    skipEmptyLines?: boolean | "greedy";
    transformHeader?: (header: string) => string;
  };

  const Papa: {
    parse<T = unknown>(input: string, config?: ParseConfig): ParseResult<T>;
  };

  export default Papa;
}
