import { Injectable } from '@nestjs/common';
import { ProjectRoles, UITypes } from 'nocodb-sdk';
import type { NcContext } from '~/interface/config';
import { AppHooksListenerService } from '~/services/app-hooks-listener.service';
import { Audit, ColumnRoleVisibility, PresignedUrl } from '~/models';
import { AppHooksService } from '~/services/app-hooks/app-hooks.service';
import { processConcurrently } from '~/utils/dataUtils';

@Injectable()
export class AuditsService {
  constructor(
    protected readonly appHooksListenerService: AppHooksListenerService,
    protected readonly appHooksService: AppHooksService,
  ) {}

  async recordAuditList(
    context: NcContext,
    param: {
      row_id: string;
      fk_model_id: string;
      cursor?: string;
      retentionLimit?: number;
    },
  ) {
    const audits = await Audit.recordAuditList(context, param);

    // Resolve column IDs hidden for the current user's role (revision history excludes these)
    const hiddenColumnIds = await this.getHiddenColumnIdsForContext(context);

    for (const audit of audits.list) {
      try {
        const details = JSON.parse(audit.details || '{}');
        const { column_meta, data, old_data } = details as {
          column_meta: Record<
            string,
            { id: string; title: string; type: string }
          >;
          data: Record<string, any>;
          old_data: Record<string, any>;
        };

        for (const col of Object.values(column_meta || {})) {
          // re-generate new signedUrl for attachment files
          // to prevent it from expiring when displayed
          if (col.type === UITypes.Attachment) {
            if (data && data[col.title]) {
              await processConcurrently(
                data[col.title],
                async (item: any) => {
                  try {
                    await PresignedUrl.signAttachment({
                      attachment: item,
                      filename: item.title,
                    });
                  } catch (e) {}
                },
                15,
              );
            }

            if (old_data && old_data[col.title]) {
              await processConcurrently(
                old_data[col.title],
                async (item: any) => {
                  try {
                    await PresignedUrl.signAttachment({
                      attachment: item,
                      filename: item.title,
                    });
                  } catch (e) {}
                },
                15,
              );
            }
          }
        }

        // Exclude columns with role visibility disabled from revision history
        if (hiddenColumnIds.size > 0 && column_meta) {
          for (const [title, meta] of Object.entries(column_meta)) {
            if (meta?.id && hiddenColumnIds.has(meta.id)) {
              delete details.column_meta[title];
              if (details.data) delete details.data[title];
              if (details.old_data) delete details.old_data[title];
            }
          }
        }

        audit.details = JSON.stringify(details);
      } catch (e) {}
    }

    return audits;
  }

  /**
   * Returns the set of column IDs that are hidden for the current user's role
   * (ColumnRoleVisibility.disabled = true). Used to filter revision history.
   */
  private async getHiddenColumnIdsForContext(
    context: NcContext,
  ): Promise<Set<string>> {
    if (
      !context.base_id ||
      !context.user?.base_roles ||
      (context.user as any)?.is_api_token
    ) {
      return new Set();
    }

    const userRoles = Object.keys(context.user.base_roles).filter(
      (role) => context.user.base_roles[role],
    );
    const rolePriority = [
      ProjectRoles.OWNER,
      ProjectRoles.CREATOR,
      ProjectRoles.EDITOR,
      ProjectRoles.COMMENTER,
      ProjectRoles.VIEWER,
    ];
    const userRole =
      rolePriority.find((role) => userRoles.includes(role)) ??
      ProjectRoles.VIEWER;

    const visibilityList = await ColumnRoleVisibility.list(
      context,
      context.base_id,
    );
    const hidden = new Set<string>();
    for (const v of visibilityList) {
      if (v.role === userRole && v.disabled && v.fk_column_id) {
        hidden.add(v.fk_column_id);
      }
    }
    return hidden;
  }
}
