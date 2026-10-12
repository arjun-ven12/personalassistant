import type pg from "pg";

/** Fixed metadata-only scope for the five historical DDL migrations. No rows. */
export async function migrationReviewSchema(client: Pick<pg.PoolClient, "query">) {
  const tables = [
    "universal_tool_providers",
    "universal_tool_definitions",
    "universal_tool_invocation_receipts",
    "universal_tool_reviews",
    "marketing_campaigns",
    "marketing_artifacts",
    "engineering_github_repositories",
    "engineering_github_creations",
    "engineering_cloud_workspaces",
  ];
  const columns = await client.query<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
    character_maximum_length: number | null;
  }>(
    "SELECT table_name,column_name,data_type,is_nullable,column_default,character_maximum_length FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=ANY($1::text[]) ORDER BY table_name,ordinal_position",
    [tables],
  );
  const constraints = await client.query<{
    table_name: string;
    name: string;
    definition: string;
    convalidated: boolean;
  }>(
    "SELECT t.relname AS table_name,c.conname AS name,pg_get_constraintdef(c.oid) AS definition,c.convalidated FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname=ANY($1::text[]) AND c.contype IN ('p','u','f','c') ORDER BY t.relname,c.conname",
    [tables],
  );
  const indexes = await client.query<{
    table_name: string;
    name: string;
    definition: string;
    indisvalid: boolean;
    indisready: boolean;
  }>(
    "SELECT t.relname AS table_name,ix.relname AS name,split_part(pg_get_indexdef(ix.oid),' ON ',1) || ' ON ' || t.relname || ' USING ' || split_part(pg_get_indexdef(ix.oid),' USING ',2) AS definition,i.indisvalid,i.indisready FROM pg_index i JOIN pg_class ix ON ix.oid=i.indexrelid JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname=ANY($1::text[]) ORDER BY t.relname,ix.relname",
    [tables],
  );
  return {
    columns: columns.rows,
    constraints: constraints.rows,
    indexes: indexes.rows,
  };
}
