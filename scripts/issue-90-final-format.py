from pathlib import Path

players_path = Path('apps/api/src/routes/players.ts')
players = players_path.read_text()
optimized_marker = '                    if (normalizedQuery.length > 0 && leagueIds.length === 0) {'
optimized_start = players.index(optimized_marker)
legacy_start = players.index('\n                    return sql<{', optimized_start) + 1
legacy_end = players.index('`.execute(db);', legacy_start) + len('`.execute(db);')
legacy_lines = players[legacy_start:legacy_end].splitlines()
for index in range(1, len(legacy_lines)):
    if legacy_lines[index].startswith('                '):
        legacy_lines[index] = legacy_lines[index][16:]
players = players[:legacy_start] + '\n'.join(legacy_lines) + players[legacy_end:]
players_path.write_text(players)

test_path = Path('apps/api/src/__tests__/search-pagination.integration.test.ts')
tests = test_path.read_text()
tests = tests.replace(
    "\nit('pages a common-name search without changing totals or stable ordering'",
    "\n  it('pages a common-name search without changing totals or stable ordering'",
)
tests = tests.replace('\n  });\n\n});\n\ndescribe(\'paginated tournament search\'', '\n  });\n});\n\ndescribe(\'paginated tournament search\'')
test_path.write_text(tests)

print('Applied final issue 90 formatting cleanup.')
