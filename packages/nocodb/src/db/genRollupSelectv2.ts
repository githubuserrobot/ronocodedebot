import {
  isBtLikeV2Junction,
  isMMOrMMLike,
  NC_ERROR_SENTINEL,
  NcDataErrorCodes,
  RelationTypes,
  UITypes,
} from 'nocodb-sdk';
import { CircularRefContext } from 'nocodb-sdk';
import type { IBaseModelSqlV2 } from './IBaseModelSqlV2';
import type { Knex } from 'knex';
import type {
  ButtonColumn,
  FormulaColumn,
  LinkToAnotherRecordColumn,
  RollupColumn,
} from '~/models';
import type { XKnex } from '~/db/CustomKnex';
import { LinksColumn } from '~/models';
import { NcError } from '~/helpers/ncError';
import { RelationManager } from '~/db/relation-manager';
import { Column, Model } from '~/models';
import formulaQueryBuilderv2 from '~/db/formulav2/formulaQueryBuilderv2';
import { extractLinkRelFiltersAndApply } from '~/db/conditionV2';
import { getAliasedSoftDeleteFilter } from '~/helpers/dbHelpers';
import { Profiler } from '~/helpers/profiler';

export default async function genRollupSelectv2(param: {
  baseModelSqlv2: IBaseModelSqlV2;
  knex: XKnex;
  alias?: string;
  columnOptions: RollupColumn | LinksColumn;
  parentColumns?: CircularRefContext;
  nestedLevel?: number;
  outerQb?: Knex.QueryBuilder & Knex.QueryInterface;
}): Promise<{ builder: Knex.QueryBuilder | any; expression?: Knex.Raw }> {
  const { baseModelSqlv2, knex, alias, columnOptions, nestedLevel = 0 } = param;
  let { parentColumns } = param;

  if ((columnOptions as RollupColumn).error) {
    return { builder: knex.raw(`?`, [NC_ERROR_SENTINEL]) };
  }

  const context = baseModelSqlv2.context;
  parentColumns = parentColumns ?? CircularRefContext.make();
  const profiler = Profiler.start(
    'DEBUG:/genRollupSelectv2/' + columnOptions.fk_column_id,
  );
  const column = await Column.get(context, {
    colId: columnOptions.fk_column_id,
  });
  if (column) {
    const model = await Model.getByAliasOrId(context, {
      base_id: context.base_id,
      aliasOrId: column.fk_model_id,
    });
    parentColumns = parentColumns.cloneAndAdd({
      id: column.id,
      title: column.title,
      table: model?.title,
    });
  }
  profiler.log('cloneAndAdd done');
  let relationColumn: Column;
  if (!columnOptions.getRelationColumn) {
    relationColumn = await Column.get(context, {
      colId: columnOptions.fk_relation_column_id,
    });
  } else {
    relationColumn = await columnOptions.getRelationColumn(context);
  }
  profiler.log('getRelationColumn done');

  if (!relationColumn) {
    return { builder: knex.raw(`?`, [NC_ERROR_SENTINEL]) };
  }

  const relationColumnOption: LinkToAnotherRecordColumn =
    (await relationColumn.getColOptions(context)) as LinkToAnotherRecordColumn;
  const { parentContext, childContext, mmContext, refContext } =
    await relationColumnOption.getParentChildContext(context);

  const isMMLike = isMMOrMMLike(relationColumn);

  const rollupColumn = columnOptions.getRollupColumn
    ? await columnOptions.getRollupColumn(refContext)
    : await Column.get(refContext, {
        colId: columnOptions.fk_rollup_column_id,
      });
  profiler.log('get relation (parent/child) columns');

  if (!rollupColumn) {
    NcError.get(context).fieldNotFound(columnOptions.fk_rollup_column_id);
  }

  const childCol = await relationColumnOption.getChildColumn(childContext);
  const childModel = await childCol?.getModel(childContext);
  const parentCol = await relationColumnOption.getParentColumn(parentContext);
  const parentModel = await parentCol?.getModel(parentContext);
  const refTableAlias =
    `__nc_rollup_` + Math.random().toString(36).substring(2, 8);
  profiler.log('get base model');

  const parentBaseModel = await Model.getBaseModelSQL(parentContext, {
    model: parentModel,
    dbDriver: knex,
  });
  const childBaseModel = await Model.getBaseModelSQL(childContext, {
    model: childModel,
    dbDriver: knex,
  });

  const refBaseModel =
    rollupColumn.fk_model_id === childModel.id
      ? childBaseModel
      : parentBaseModel;

  const applyFunction = async (qb: any) => {
    profiler.log('applyFunction ' + rollupColumn.uidt);
    let selectColumnName = knex.raw('??.??', [
      refTableAlias,
      rollupColumn.column_name,
    ]);
    if (rollupColumn.uidt === UITypes.Formula) {
      const formulOption = await rollupColumn.getColOptions<
        FormulaColumn | ButtonColumn
      >(context);

      const formulaQb = await formulaQueryBuilderv2({
        baseModel: RelationManager.isRelationReversed(
          relationColumn,
          relationColumnOption,
        )
          ? parentBaseModel
          : childBaseModel,
        tree: formulOption.formula,
        model: RelationManager.isRelationReversed(
          relationColumn,
          relationColumnOption,
        )
          ? parentModel
          : childModel,
        column: rollupColumn,
        aliasToColumn: {},
        tableAlias: refTableAlias,
        validateFormula: false,
        parsedTree: formulOption.getParsedTree(),
        baseUsers: undefined,
        parentColumns,
      });
      selectColumnName = knex.raw(formulaQb.builder).wrap('(', ')');
    } else if ([UITypes.Rollup].includes(rollupColumn.uidt)) {
      const knex = refBaseModel.dbDriver;

      // Rollup-of-rollup: compute inner rollup correlated to the current level
      const inner = await genRollupSelectv2({
        baseModelSqlv2: refBaseModel,
        knex,
        alias: refTableAlias,
        columnOptions: await rollupColumn.getColOptions<RollupColumn>(
          refContext,
        ),
        nestedLevel: nestedLevel + 1,
        parentColumns,
      });

      // Use the inner builder directly as a subquery
      selectColumnName = knex.raw('(?)', [inner.builder]);
    } else if (
      [
        UITypes.CreatedTime,
        UITypes.CreatedBy,
        UITypes.LastModifiedTime,
        UITypes.LastModifiedBy,
      ].includes(rollupColumn.uidt)
    ) {
      // since all field are virtual field,
      // we use formula to generate query that can represent the column
      // to prevent duplicate logic
      const formulaQb = await formulaQueryBuilderv2({
        baseModel: RelationManager.isRelationReversed(
          relationColumn,
          relationColumnOption,
        )
          ? parentBaseModel
          : childBaseModel,
        tree: '{{' + rollupColumn.id + '}}',
        model: RelationManager.isRelationReversed(
          relationColumn,
          relationColumnOption,
        )
          ? parentModel
          : childModel,
        column: rollupColumn,
        tableAlias: refTableAlias,
        parsedTree: {
          type: 'Identifier',
          name: rollupColumn.id,
          raw: '{{' + rollupColumn.id + '}}',
          dataType: [UITypes.CreatedTime, UITypes.LastModifiedTime].includes(
            rollupColumn.uidt,
          )
            ? 'date'
            : 'string',
        },
      });

      selectColumnName = knex.raw(formulaQb.builder).wrap('(', ')');
    }

    // if postgres and rollup function is sum/sumDistinct/avgDistinct/avg, then cast the column to integer when type is boolean
    if (
      baseModelSqlv2.isPg &&
      ['sum', 'sumDistinct', 'avgDistinct', 'avg'].includes(
        columnOptions.rollup_function,
      ) &&
      ['bool', 'boolean'].includes(rollupColumn.dt)
    ) {
      qb[columnOptions.rollup_function as string]?.(
        knex.raw('??::integer', [selectColumnName]),
      );
      profiler.log('applyFunction done');
      return;
    }

    if (
      ['sum', 'sumDistinct', 'avgDistinct', 'avg'].includes(
        columnOptions.rollup_function,
      )
    ) {
      qb.select(
        knex.raw(`COALESCE((??), 0)`, [
          knex[columnOptions.rollup_function as string]?.(selectColumnName),
        ]),
      );
    } else {
      qb[columnOptions.rollup_function as string]?.(selectColumnName);
    }
    profiler.log('applyFunction done');
  };

  const relationType = isMMLike
    ? RelationTypes.MANY_TO_MANY
    : relationColumnOption.type;

  switch (relationType) {
    case RelationTypes.HAS_MANY: {
      profiler.log('Relation: ' + relationColumnOption.type);
      const queryBuilder: any = knex(
        knex.raw(`?? as ??`, [
          childBaseModel.getTnPath(childModel),
          refTableAlias,
        ]),
      ).where(
        knex.ref(
          `${alias || parentBaseModel.getTnPath(parentModel.table_name)}.${
            parentCol.column_name
          }`,
        ),
        '=',
        knex.ref(`${refTableAlias}.${childCol.column_name}`),
      );

      // Exclude soft-deleted child records from HM rollup
      const hmSoftDeleteFilter = await getAliasedSoftDeleteFilter(
        childBaseModel,
        refTableAlias,
      );
      if (hmSoftDeleteFilter) {
        queryBuilder.where(hmSoftDeleteFilter);
      }

      await applyFunction(queryBuilder);

      if (column) {
        await extractLinkRelFiltersAndApply({
          qb: queryBuilder,
          column,
          alias: refTableAlias,
          table: childBaseModel.model,
          baseModel: childBaseModel,
          context: childBaseModel.context,
        });
      }
      profiler.end();
      return {
        builder: queryBuilder,
      };
    }

    case RelationTypes.ONE_TO_ONE: {
      profiler.log('Relation: ' + relationColumnOption.type);
      const qb = knex(
        knex.raw(`?? as ??`, [
          childBaseModel.getTnPath(childModel?.table_name),
          refTableAlias,
        ]),
      ).where(
        knex.ref(
          `${alias || parentBaseModel.getTnPath(parentModel.table_name)}.${
            parentCol.column_name
          }`,
        ),
        '=',
        knex.ref(`${refTableAlias}.${childCol.column_name}`),
      );

      // Exclude soft-deleted child records from OO rollup
      const ooSoftDeleteFilter = await getAliasedSoftDeleteFilter(
        childBaseModel,
        refTableAlias,
      );
      if (ooSoftDeleteFilter) {
        qb.where(ooSoftDeleteFilter);
      }

      await extractLinkRelFiltersAndApply({
        qb,
        column,
        alias: refTableAlias,
        table: childBaseModel.model,
        baseModel: childBaseModel,
        context: childBaseModel.context,
      });

      await applyFunction(qb);
      profiler.end();
      return {
        builder: qb,
      };
    }

    case RelationTypes.MANY_TO_MANY: {
      profiler.log('Relation: ' + relationColumnOption.type);

      // Virtual link columns — no actual MM table to query
      if (columnOptions instanceof LinksColumn) {
        const qb = knex.select(knex.raw('1')).first();
        return { builder: qb };
      }

      const mmModel = await relationColumnOption.getMMModel(mmContext);
      const mmChildCol = await relationColumnOption.getMMChildColumn(mmContext);
      const mmParentCol = await relationColumnOption.getMMParentColumn(
        mmContext,
      );
      const assocBaseModel = await Model.getBaseModelSQL(mmContext, {
        id: mmModel.id,
        dbDriver: knex,
      });
      if (!mmModel) {
        return this.dbDriver.raw(`?`, [
          NcDataErrorCodes.NC_ERR_MM_MODEL_NOT_FOUND,
        ]);
      }

      // Use CTE to pre-compute rollup aggregation for all parent rows at once
      // instead of a correlated subquery that re-executes per row
      const prejoined = 'prejoined';
      const mmTn = assocBaseModel.getTnPath(mmModel.table_name);
      const mmChildColRef = `${mmTn}.${mmChildCol.column_name}`;
      const childColRef = `"${prejoined}"."${childCol.column_name}"`;

      // Build the rollup SELECT expression for the CTE
      let rollupSelectSql: string;
      if (
        baseModelSqlv2.isPg &&
        ['sum', 'sumDistinct', 'avgDistinct', 'avg'].includes(
          columnOptions.rollup_function,
        ) &&
        ['bool', 'boolean'].includes(rollupColumn.dt)
      ) {
        rollupSelectSql = `${childColRef}::integer`;
      } else if (
        ['sum', 'sumDistinct', 'avgDistinct', 'avg'].includes(
          columnOptions.rollup_function,
        )
      ) {
        rollupSelectSql = childColRef;
      }

      const cteQuery = knex(
        knex.raw(`?? as ??`, [
          parentBaseModel.getTnPath(parentModel?.table_name),
          prejoined,
        ]),
      ).innerJoin(
        mmTn as any,
        knex.ref(`${mmTn}.${mmParentCol.column_name}`) as any,
        '=',
        knex.ref(`${prejoined}.${parentCol.column_name}`) as any,
      );

      // Apply soft-delete filter inside CTE (on the prejoined parent alias)
      const mmSoftDeleteFilter = await getAliasedSoftDeleteFilter(
        parentBaseModel,
        prejoined,
      );
      if (mmSoftDeleteFilter) {
        cteQuery.where(mmSoftDeleteFilter);
      }

      // Apply link relation filters inside CTE
      await extractLinkRelFiltersAndApply({
        qb: cteQuery,
        column,
        alias: prejoined,
        table: parentBaseModel.model,
        baseModel: parentBaseModel,
        context: parentBaseModel.context,
      });

      // Generate the rollup function SQL and build the CTE select
      const isSumAvg = ['sum', 'sumDistinct', 'avgDistinct', 'avg'].includes(
        columnOptions.rollup_function,
      );
      let cteSelectSql: string;
      if (isSumAvg) {
        cteSelectSql = `${mmChildColRef} as __grp, COALESCE((${columnOptions.rollup_function}(${rollupSelectSql})), 0) as __val`;
      } else {
        cteSelectSql = `${mmChildColRef} as __grp, ${columnOptions.rollup_function}(${childColRef}) as __val`;
      }
      cteQuery.select(knex.raw(cteSelectSql));
      cteQuery.groupBy(knex.ref(mmChildColRef));

      const { outerQb } = param;

      if (outerQb) {
        // Optimized path: add CTE once at outer query level + LEFT JOIN
        // instead of a correlated subquery that re-executes per row
        outerQb.withMaterialized(refTableAlias, cteQuery);
        outerQb.leftJoin(
          refTableAlias,
          `${refTableAlias}.__grp` as any,
          '=',
          knex.ref(
            `${alias || childBaseModel.getTnPath(childModel.table_name)}.${
              childCol.column_name
            }`,
          ) as any,
        );
        profiler.end();
        return {
          builder: knex.raw(`"${refTableAlias}"."__val"`),
          expression: knex.raw(`"${refTableAlias}"."__val"`),
        };
      }

      // Outer query selects from CTE, correlated on mmChildCol = childCol
      const qb = knex(refTableAlias)
        .select(knex.raw('__val'))
        .withMaterialized(refTableAlias, cteQuery)
        .where(
          knex.ref(`${refTableAlias}.__grp`),
          '=',
          knex.ref(
            `${alias || childBaseModel.getTnPath(childModel.table_name)}.${
              childCol.column_name
            }`,
          ),
        );

      // V2 MO/OO: single-record semantics — limit to 1 row
      if (isBtLikeV2Junction(relationColumn)) {
        qb.limit(1);
      }

      profiler.end();
      return {
        builder: qb,
      };
    }

    default:
      NcError.get(context).unSupportedRelation(relationColumnOption.type);
  }
}
