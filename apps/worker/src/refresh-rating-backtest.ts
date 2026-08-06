import dotenv from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { db } from '@tt-players/db';
import { runRatingBacktest } from './ratings/rating-backtest.js';
import { renderRatingBacktestHtml } from './ratings/rating-backtest-report.js';

dotenv.config();

const modelKey = argumentValue('--model');
const evaluationDays = integerArgument('--evaluation-days');
const evaluationEndDate = argumentValue('--end-date');
const windows = argumentValue('--windows')
    ?.split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
const outputJson = resolve(argumentValue('--output-json') ?? 'rating-backtest.json');
const outputHtml = resolve(argumentValue('--output-html') ?? 'rating-backtest.html');

try {
    const snapshot = await runRatingBacktest(db, {
        modelKey,
        evaluationDays,
        evaluationEndDate,
        windows,
        log: (message) => console.log(message),
    });

    await mkdir(dirname(outputJson), { recursive: true });
    await mkdir(dirname(outputHtml), { recursive: true });
    await writeFile(outputJson, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    await writeFile(outputHtml, renderRatingBacktestHtml(snapshot), 'utf8');

    const comparable = snapshot.metrics.filter((metric) => metric.evaluated_matches > 0);
    const best = comparable.slice().sort((left, right) =>
        left.brier_score - right.brier_score
        || left.log_loss - right.log_loss,
    )[0];

    console.log(`Rating backtest generated at ${snapshot.generated_at}`);
    console.log(`Evaluation period: ${snapshot.evaluation_start_date} to ${snapshot.evaluation_end_date}`);
    console.log(`JSON report: ${outputJson}`);
    console.log(`HTML report: ${outputHtml}`);
    console.log(`RATING_BACKTEST=${JSON.stringify({
        generatedAt: snapshot.generated_at,
        model: snapshot.model,
        evaluationStartDate: snapshot.evaluation_start_date,
        evaluationEndDate: snapshot.evaluation_end_date,
        bestWindowYears: best?.window_years ?? null,
        bestBrierScore: best?.brier_score ?? null,
        evaluatedMatches: best?.evaluated_matches ?? 0,
        outputJson,
        outputHtml,
    })}`);
} finally {
    await db.destroy();
}

function argumentValue(name: string): string | undefined {
    const argument = process.argv.find((value) => value.startsWith(`${name}=`));
    return argument?.slice(name.length + 1) || undefined;
}

function integerArgument(name: string): number | undefined {
    const value = argumentValue(name);
    if (value === undefined) return undefined;
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer`);
    return parsed;
}
