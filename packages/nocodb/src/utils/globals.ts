export enum MetaTable {
  PROJECT = 'nc_bases_v2',
  BASES = 'nc_sources_v2',
  MODELS = 'nc_models_v2',
  COLUMNS = 'nc_columns_v2',
  COLUMN_VALIDATIONS = 'nc_columns_validations_v2',
  COL_PROPS = 'nc_col_props_v2',
  COL_RELATIONS = 'nc_col_relations_v2',
  COL_SELECT_OPTIONS = 'nc_col_select_options_v2',
  COL_LOOKUP = 'nc_col_lookup_v2',
  COL_ROLLUP = 'nc_col_rollup_v2',
  COL_FORMULA = 'nc_col_formula_v2',
  COL_QRCODE = 'nc_col_qrcode_v2',
  COL_BARCODE = 'nc_col_barcode_v2',
  FILTER_EXP = 'nc_filter_exp_v2',
  // HOOK_FILTER_EXP = 'nc_hook_filter_exp_v2',
  SORT = 'nc_sort_v2',
  SHARED_VIEWS = 'nc_shared_views_v2',
  ACL = 'nc_acl_v2',
  FORM_VIEW = 'nc_form_view_v2',
  FORM_VIEW_COLUMNS = 'nc_form_view_columns_v2',
  GALLERY_VIEW = 'nc_gallery_view_v2',
  GALLERY_VIEW_COLUMNS = 'nc_gallery_view_columns_v2',
  CALENDAR_VIEW = 'nc_calendar_view_v2',
  CALENDAR_VIEW_COLUMNS = 'nc_calendar_view_columns_v2',
  CALENDAR_VIEW_RANGE = 'nc_calendar_view_range_v2',
  GRID_VIEW = 'nc_grid_view_v2',
  GRID_VIEW_COLUMNS = 'nc_grid_view_columns_v2',
  KANBAN_VIEW = 'nc_kanban_view_v2',
  KANBAN_VIEW_COLUMNS = 'nc_kanban_view_columns_v2',
  USERS = 'nc_users_v2',
  ORGS_OLD = 'nc_orgs_v2',
  TEAMS = 'nc_teams_v2',
  TEAM_USERS = 'nc_team_users_v2',
  VIEWS = 'nc_views_v2',
  AUDIT = 'nc_audit_v2',
  HOOKS = 'nc_hooks_v2',
  HOOK_LOGS = 'nc_hook_logs_v2',
  PLUGIN = 'nc_plugins_v2',
  PROJECT_USERS = 'nc_base_users_v2',
  MODEL_ROLE_VISIBILITY = 'nc_disabled_models_for_role_v2',
  API_TOKENS = 'nc_api_tokens',
  SYNC_SOURCE = 'nc_sync_source_v2',
  SYNC_LOGS = 'nc_sync_logs_v2',
  MAP_VIEW = 'nc_map_view_v2',
  MAP_VIEW_COLUMNS = 'nc_map_view_columns_v2',
  STORE = 'nc_store',
  NOTIFICATION = 'notification',
  USER_REFRESH_TOKENS = 'nc_user_refresh_tokens',
  EXTENSIONS = 'nc_extensions',
  COMMENTS = 'nc_comments',
  USER_COMMENTS_NOTIFICATIONS_PREFERENCE = 'nc_user_comment_notifications_preference',
  COMMENTS_REACTIONS = 'nc_comment_reactions',
  JOBS = 'nc_jobs',
  INTEGRATIONS = 'nc_integrations_v2',
}

export enum MetaTableOldV2 {
  PROJECT = 'nc_projects_v2',
  PROJECT_USERS = 'nc_project_users_v2',
  BASES = 'nc_bases_v2',
}

export const orderedMetaTables = [
  MetaTable.MODEL_ROLE_VISIBILITY,
  MetaTable.PLUGIN,
  MetaTable.AUDIT,
  MetaTable.TEAM_USERS,
  MetaTable.TEAMS,
  MetaTable.ORGS_OLD,
  MetaTable.PROJECT_USERS,
  MetaTable.USERS,
  MetaTable.MAP_VIEW,
  MetaTable.MAP_VIEW_COLUMNS,
  MetaTable.KANBAN_VIEW_COLUMNS,
  MetaTable.KANBAN_VIEW,
  MetaTable.CALENDAR_VIEW,
  MetaTable.CALENDAR_VIEW_COLUMNS,
  MetaTable.CALENDAR_VIEW_RANGE,
  MetaTable.GRID_VIEW_COLUMNS,
  MetaTable.GRID_VIEW,
  MetaTable.GALLERY_VIEW_COLUMNS,
  MetaTable.GALLERY_VIEW,
  MetaTable.FORM_VIEW_COLUMNS,
  MetaTable.FORM_VIEW,
  MetaTable.SHARED_VIEWS,
  MetaTable.SORT,
  MetaTable.FILTER_EXP,
  MetaTable.HOOK_LOGS,
  MetaTable.HOOKS,
  MetaTable.VIEWS,
  MetaTable.COL_FORMULA,
  MetaTable.COL_ROLLUP,
  MetaTable.COL_LOOKUP,
  MetaTable.COL_SELECT_OPTIONS,
  MetaTable.COL_RELATIONS,
  MetaTable.COLUMN_VALIDATIONS,
  MetaTable.COLUMNS,
  MetaTable.MODELS,
  MetaTable.BASES,
  MetaTable.PROJECT,
];

export const sakilaTableNames = [
  'actor',
  'address',
  'category',
  'city',
  'country',
  'customer',
  'film',
  'film_actor',
  'film_category',
  'film_text',
  'inventory',
  'language',
  'payment',
  'rental',
  'staff',
  'store',
  'actor_info',
  'customer_list',
  'film_list',
  'nicer_but_slower_film_list',
  'sales_by_film_category',
  'sales_by_store',
  'staff_list',
];

export enum CacheScope {
  PROJECT = 'base',
  BASE = 'source',
  MODEL = 'model',
  COLUMN = 'column',
  COL_PROP = 'colProp',
  COL_RELATION = 'colRelation',
  COL_SELECT_OPTION = 'colSelectOption',
  COL_LOOKUP = 'colLookup',
  COL_ROLLUP = 'colRollup',
  COL_FORMULA = 'colFormula',
  COL_QRCODE = 'colQRCode',
  COL_BARCODE = 'colBarcode',
  FILTER_EXP = 'filterExp',
  SORT = 'sort',
  SHARED_VIEW = 'sharedView',
  ACL = 'acl',
  FORM_VIEW = 'formView',
  FORM_VIEW_COLUMN = 'formViewColumn',
  GALLERY_VIEW = 'galleryView',
  GALLERY_VIEW_COLUMN = 'galleryViewColumn',
  GRID_VIEW = 'gridView',
  GRID_VIEW_COLUMN = 'gridViewColumn',
  KANBAN_VIEW = 'kanbanView',
  CALENDAR_VIEW = 'calendarView',
  CALENDAR_VIEW_COLUMN = 'calendarViewColumn',
  CALENDAR_VIEW_RANGE = 'calendarViewRange',
  MAP_VIEW = 'mapView',
  MAP_VIEW_COLUMN = 'mapViewColumn',
  KANBAN_VIEW_COLUMN = 'kanbanViewColumn',
  USER = 'user',
  ORGS_OLD = 'orgs',
  TEAM = 'team',
  TEAM_USER = 'teamUser',
  VIEW = 'view',
  AUDIT = 'audit',
  HOOK = 'hook',
  PLUGIN = 'plugin',
  BASE_USER = 'baseUser',
  MODEL_ROLE_VISIBILITY = 'modelRoleVisibility',
  API_TOKEN = 'apiToken',
  INSTANCE_META = 'instanceMeta',
  USER_BASE = 'userBase',
  DASHBOARD_PROJECT_DB_PROJECT_LINKING = 'dashboardProjectDBProjectLinking',
  SINGLE_QUERY = 'singleQuery',
  JOBS = 'nc_jobs',
  JOBS_POLLING = 'nc_jobs_polling',
  PRESIGNED_URL = 'presignedUrl',
  STORE = 'store',
  PROJECT_ALIAS = 'baseAlias',
  MODEL_ALIAS = 'modelAlias',
  VIEW_ALIAS = 'viewAlias',
  SSO_CLIENT = 'ssoClient',
  EXTENSION = 'uiExtension',
  INTEGRATION = 'integration',
}

export enum CacheGetType {
  TYPE_ARRAY = 'TYPE_ARRAY',
  TYPE_OBJECT = 'TYPE_OBJECT',
  TYPE_STRING = 'TYPE_STRING',
}

export enum CacheDelDirection {
  PARENT_TO_CHILD = 'PARENT_TO_CHILD',
  CHILD_TO_PARENT = 'CHILD_TO_PARENT',
}

export const GROUPBY_COMPARISON_OPS = <const>[
  // these are used for groupby
  'gb_eq',
  'gb_null',
];
export const COMPARISON_OPS = <const>[
  'eq',
  'neq',
  'not',
  'like',
  'nlike',
  'empty',
  'notempty',
  'null',
  'notnull',
  'checked',
  'notchecked',
  'blank',
  'notblank',
  'allof',
  'anyof',
  'nallof',
  'nanyof',
  'gt',
  'lt',
  'gte',
  'lte',
  'ge',
  'le',
  'in',
  'isnot',
  'is',
  'isWithin',
  'btw',
  'nbtw',
];

export const IS_WITHIN_COMPARISON_SUB_OPS = <const>[
  'pastWeek',
  'pastMonth',
  'pastYear',
  'nextWeek',
  'nextMonth',
  'nextYear',
  'pastNumberOfDays',
  'nextNumberOfDays',
];

export const COMPARISON_SUB_OPS = <const>[
  'today',
  'tomorrow',
  'yesterday',
  'oneWeekAgo',
  'oneWeekFromNow',
  'oneMonthAgo',
  'oneMonthFromNow',
  'daysAgo',
  'daysFromNow',
  'exactDate',
  ...IS_WITHIN_COMPARISON_SUB_OPS,
];

export const DB_TYPES = <const>[
  'mysql2',
  'sqlite3',
  'mysql',
  'mssql',
  'snowflake',
  'oracledb',
  'pg',
  'databricks',
];

export enum RootScopes {
  ROOT = 'root',
  ORG = 'org',
  WORKSPACE = 'workspace',
  BASE = 'base',
  // This scope only used for extract-ids middleware to get initial entity
  BYPASS = 'bypass',
}

export const RootScopeTables = {
  [RootScopes.ROOT]: [
    MetaTable.USERS,
    MetaTable.USER_REFRESH_TOKENS,
    MetaTable.API_TOKENS,
    MetaTable.PLUGIN,
    MetaTable.STORE,
    MetaTable.NOTIFICATION,
    MetaTable.JOBS,
    // Temporarily added need to be discussed within team
    MetaTable.AUDIT,
  ],
  [RootScopes.BASE]: [MetaTable.PROJECT],
};
