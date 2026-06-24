import { type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable('staging.feedback')
        .addColumn('github_issue_url', 'varchar')
        .addColumn('triaged_at', 'timestamp')
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable('staging.feedback')
        .dropColumn('triaged_at')
        .dropColumn('github_issue_url')
        .execute();
}
