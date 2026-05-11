export interface SqlPreparationOptions {
  projectId?: string | number;
  eventDateStart?: string;
  eventDateEnd?: string;
  defaultEventPartDate?: boolean;
  now?: Date;
}

export interface PreparedSql {
  sql: string;
  projectId?: string;
  eventTable?: string;
  userTable?: string;
  addedEventPartDate: boolean;
  eventPartDateRange?: {
    start: string;
    end: string;
  };
}

const PROJECT_ID_ENV_NAMES = ["THINKINGDATA_PROJECT_ID", "PROJECT_ID"] as const;
const TABLE_PLACEHOLDER_PATTERN =
  /{{\s*(project_id|event_table|user_table)\s*}}|\bv_(?:event|user)\b(?!_[A-Za-z0-9_])/i;
const EVENT_TABLE_PATTERN = /\bv_event(?:_[A-Za-z0-9_]+)?\b/i;
const PART_DATE_FILTER_PATTERN =
  /["'`]?\$part_date["'`]?\s*(?:=|!=|<>|>=|<=|>|<|\bin\b|\bnot\s+in\b|\bbetween\b|\bis\b|\blike\b)/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function resolveProjectId(projectId?: string | number, required = false) {
  const raw =
    projectId ??
    process.env.THINKINGDATA_PROJECT_ID ??
    process.env.PROJECT_ID;

  if (raw === undefined || raw === null || String(raw).trim() === "") {
    if (required) {
      throw new Error(
        `Missing projectId. Pass projectId or set ${PROJECT_ID_ENV_NAMES.join(" / ")}.`,
      );
    }
    return undefined;
  }

  const resolved = String(raw).trim();
  if (!/^\d+$/.test(resolved)) {
    throw new Error("projectId must be numeric because it is used in TE table names.");
  }

  return resolved;
}

export function prepareThinkingDataSql(
  sql: string,
  options: SqlPreparationOptions = {},
): PreparedSql {
  if (!sql.trim()) {
    throw new Error("SQL must not be empty.");
  }

  const projectId = resolveProjectId(
    options.projectId,
    TABLE_PLACEHOLDER_PATTERN.test(sql),
  );
  const eventTable = projectId ? `v_event_${projectId}` : undefined;
  const userTable = projectId ? `v_user_${projectId}` : undefined;
  let preparedSql = applyTableNames(sql, projectId);
  let addedEventPartDate = false;
  let eventPartDateRange: PreparedSql["eventPartDateRange"];

  if (
    options.defaultEventPartDate !== false &&
    EVENT_TABLE_PATTERN.test(preparedSql) &&
    !PART_DATE_FILTER_PATTERN.test(preparedSql)
  ) {
    eventPartDateRange = resolveEventPartDateRange(options);
    preparedSql = addWhereCondition(
      preparedSql,
      `"$part_date" between '${eventPartDateRange.start}' and '${eventPartDateRange.end}'`,
    );
    addedEventPartDate = true;
  }

  return {
    sql: preparedSql,
    projectId,
    eventTable,
    userTable,
    addedEventPartDate,
    eventPartDateRange,
  };
}

function applyTableNames(sql: string, projectId?: string) {
  if (!projectId) {
    return sql;
  }

  return sql
    .replace(/{{\s*project_id\s*}}/gi, projectId)
    .replace(/{{\s*event_table\s*}}/gi, `v_event_${projectId}`)
    .replace(/{{\s*user_table\s*}}/gi, `v_user_${projectId}`)
    .replace(/\bv_event\b(?!_[A-Za-z0-9_])/gi, `v_event_${projectId}`)
    .replace(/\bv_user\b(?!_[A-Za-z0-9_])/gi, `v_user_${projectId}`);
}

function resolveEventPartDateRange(options: SqlPreparationOptions) {
  const end = options.eventDateEnd ?? formatLocalDate(options.now ?? new Date());
  const start =
    options.eventDateStart ??
    formatLocalDate(addDays(parseLocalDate(end), -6));

  validateDate("eventDateStart", start);
  validateDate("eventDateEnd", end);

  if (start > end) {
    throw new Error("eventDateStart must be earlier than or equal to eventDateEnd.");
  }

  return { start, end };
}

function addWhereCondition(sql: string, condition: string) {
  const trimmed = sql.trim();
  const semicolon = trimmed.endsWith(";") ? ";" : "";
  const withoutSemicolon = trimmed.replace(/;+\s*$/, "");
  const clauseIndex = findTrailingClauseIndex(withoutSemicolon);
  const head =
    clauseIndex === -1 ? withoutSemicolon : withoutSemicolon.slice(0, clauseIndex);
  const tail = clauseIndex === -1 ? "" : withoutSemicolon.slice(clauseIndex);
  const connector = /\bwhere\b/i.test(head) ? " and " : " where ";

  return `${head}${connector}${condition}${tail}${semicolon}`;
}

function findTrailingClauseIndex(sql: string) {
  const match = /\s+(group\s+by|having|order\s+by|limit|offset)\b/i.exec(sql);
  return match?.index ?? -1;
}

function validateDate(name: string, value: string) {
  if (!DATE_PATTERN.test(value)) {
    throw new Error(`${name} must use YYYY-MM-DD format.`);
  }
}

function parseLocalDate(value: string) {
  validateDate("date", value);
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
