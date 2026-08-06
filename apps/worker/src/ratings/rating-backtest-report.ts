import type { RatingBacktestSnapshot } from './rating-backtest.js';

export function renderRatingBacktestHtml(snapshot: RatingBacktestSnapshot): string {
    const metricsRows = snapshot.metrics.map((metric) => `
        <tr>
            <td>${metric.window_years} years</td>
            <td>${escapeHtml(metric.training_start_date)}</td>
            <td>${formatInteger(metric.evaluated_matches)}</td>
            <td>${formatInteger(metric.cold_start_matches)}</td>
            <td>${metric.brier_score.toFixed(4)}</td>
            <td>${metric.log_loss.toFixed(4)}</td>
            <td>${formatPercent(metric.favourite_accuracy)}</td>
            <td>${metric.calibration_error.toFixed(4)}</td>
        </tr>
    `).join('');

    const detailSections = snapshot.metrics.map((metric) => {
        const calibrationRows = metric.calibration.map((bucket) => `
            <tr>
                <td>${Math.round(bucket.lower_bound * 100)}–${Math.round(bucket.upper_bound * 100)}%</td>
                <td>${formatInteger(bucket.count)}</td>
                <td>${formatPercent(bucket.average_prediction)}</td>
                <td>${formatPercent(bucket.observed_home_win_rate)}</td>
            </tr>
        `).join('');
        const topPlayerRows = metric.top_players.map((player, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(player.player_name)}</td>
                <td>${Math.round(player.rating)}</td>
                <td>${Math.round(player.rating_deviation)}</td>
                <td>${Math.round(player.conservative_rating)}</td>
                <td>${formatInteger(player.rated_matches)}</td>
                <td>${escapeHtml(player.last_rated_date)}</td>
            </tr>
        `).join('');

        return `
            <section>
                <h2>${metric.window_years}-year window</h2>
                <div class="metric-grid">
                    <article><span>Brier score</span><strong>${metric.brier_score.toFixed(4)}</strong></article>
                    <article><span>Log loss</span><strong>${metric.log_loss.toFixed(4)}</strong></article>
                    <article><span>Favourite accuracy</span><strong>${formatPercent(metric.favourite_accuracy)}</strong></article>
                    <article><span>Calibration error</span><strong>${metric.calibration_error.toFixed(4)}</strong></article>
                </div>
                <h3>Calibration</h3>
                <table>
                    <thead><tr><th>Predicted band</th><th>Matches</th><th>Average prediction</th><th>Observed home wins</th></tr></thead>
                    <tbody>${calibrationRows}</tbody>
                </table>
                <h3>Final top 25 for this replay</h3>
                <table>
                    <thead><tr><th>#</th><th>Player</th><th>Rating</th><th>RD</th><th>Conservative</th><th>Matches</th><th>Last match</th></tr></thead>
                    <tbody>${topPlayerRows}</tbody>
                </table>
            </section>
        `;
    }).join('');

    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>TT Players rating backtest</title>
    <style>
        :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
        body { margin: 0; background: #f4f6f8; color: #17202a; }
        main { max-width: 1180px; margin: 0 auto; padding: 32px 20px 64px; }
        header, section { background: white; border: 1px solid #dde3e8; border-radius: 16px; padding: 24px; margin-bottom: 20px; box-shadow: 0 6px 20px rgba(0,0,0,.04); }
        h1, h2, h3 { margin-top: 0; }
        .muted { color: #5f6b76; }
        .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin: 18px 0 24px; }
        .metric-grid article { border: 1px solid #e1e6ea; border-radius: 12px; padding: 14px; }
        .metric-grid span { display: block; color: #66727d; font-size: 13px; }
        .metric-grid strong { display: block; margin-top: 5px; font-size: 22px; }
        .table-wrap { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        th, td { border-bottom: 1px solid #e5e9ed; padding: 10px 8px; text-align: left; white-space: nowrap; }
        th { color: #4d5964; font-size: 13px; }
        code { background: #eef2f5; padding: 2px 6px; border-radius: 6px; }
        ul { line-height: 1.6; }
        @media (prefers-color-scheme: dark) {
            body { background: #11161b; color: #ecf1f5; }
            header, section { background: #192027; border-color: #303b44; }
            .muted, .metric-grid span, th { color: #abb7c1; }
            .metric-grid article, th, td { border-color: #303b44; }
            code { background: #27313a; }
        }
    </style>
</head>
<body>
<main>
    <header>
        <p class="muted">TT Players · Rating quality laboratory</p>
        <h1>Chronological rating backtest</h1>
        <p>
            Model <code>${escapeHtml(snapshot.model)}</code> · evaluation
            ${escapeHtml(snapshot.evaluation_start_date)} to ${escapeHtml(snapshot.evaluation_end_date)} ·
            generated ${escapeHtml(snapshot.generated_at)}
        </p>
        <ul>
            ${snapshot.methodology.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}
        </ul>
    </header>

    <section>
        <h2>Window comparison</h2>
        <p class="muted">Lower Brier score, log loss and calibration error are better. Higher favourite accuracy is better.</p>
        <div class="table-wrap">
            <table>
                <thead>
                    <tr><th>History window</th><th>Training starts</th><th>Evaluated</th><th>Cold starts</th><th>Brier</th><th>Log loss</th><th>Favourite accuracy</th><th>Calibration error</th></tr>
                </thead>
                <tbody>${metricsRows}</tbody>
            </table>
        </div>
    </section>

    ${detailSections}
</main>
</body>
</html>`;
}

function formatInteger(value: number): string {
    return new Intl.NumberFormat('en-GB').format(value);
}

function formatPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
}

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}
