# UK Ready League Scrape Progress

Started: 2026-03-22T12:25:09.887Z

- Total ready leagues scheduled: 190
- Mode: isolated sequential scrape by league using an internal campaign queue
- Progress checkpoint cadence: every 10 minutes

## Log

- 2026-03-22T12:25:09.949Z shared queue snapshot (ignored by isolated campaign runner): total=1340, runnable=1277, deferred=0, exhausted=63
- 2026-03-22T12:25:09.950Z bootstrapping ready leagues with history discovery
- 2026-03-22T12:27:06.197Z bootstrapped 190 ready leagues with scrape targets; missing_targets=2; writing initial tracker snapshot
- 2026-03-22T12:27:06.197Z ready leagues without targets: Basildon Table Tennis League; Colchester Table Tennis League
- 2026-03-22T12:27:06.202Z starting 1/190: Bath Table Tennis League (England / Avon), current_targets=4, history_targets=16
- 2026-03-22T12:37:06.210Z checkpoint (10 minute timer): completed=0, partial=0, in_progress=1, pending=189
- 2026-03-22T12:43:25.531Z completed 1/190: Bath Table Tennis League, current=4/4, history=16/16, overall=completed, jobs_processed=80, jobs_failed=0
- 2026-03-22T12:43:25.534Z starting 2/190: Bristol Table Tennis League (England / Avon), current_targets=7, history_targets=34
- 2026-03-22T12:47:06.216Z checkpoint (10 minute timer): completed=1, partial=0, in_progress=1, pending=188
- 2026-03-22T12:57:06.223Z checkpoint (10 minute timer): completed=1, partial=0, in_progress=1, pending=188
- 2026-03-22T13:07:06.230Z checkpoint (10 minute timer): completed=1, partial=0, in_progress=1, pending=188
- 2026-03-22T13:17:06.181Z checkpoint (10 minute timer): completed=1, partial=0, in_progress=1, pending=188
- 2026-03-22T13:27:06.176Z checkpoint (10 minute timer): completed=1, partial=0, in_progress=1, pending=188
- 2026-03-22T13:31:06.952Z completed 2/190: Bristol Table Tennis League, current=7/7, history=34/34, overall=completed, jobs_processed=163, jobs_failed=1
- 2026-03-22T13:31:06.952Z failure samples for Bristol Table Tennis League: processLogTask: {"logId":"e6becd9f-070b-4981-a02a-81aad72be16c","competitionId":"8f630049-7590-4f31-be37-da2b0663a66c","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      9,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      9,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  }
]
- 2026-03-22T13:31:06.955Z starting 3/190: Bedford Table Tennis League (England / Bedfordshire), current_targets=4, history_targets=21
- 2026-03-22T13:37:06.177Z checkpoint (10 minute timer): completed=2, partial=0, in_progress=1, pending=187
- 2026-03-22T13:47:06.205Z checkpoint (10 minute timer): completed=2, partial=0, in_progress=1, pending=187
- 2026-03-22T13:52:01.678Z completed 3/190: Bedford Table Tennis League, current=4/4, history=21/21, overall=completed, jobs_processed=100, jobs_failed=0
- 2026-03-22T13:52:01.680Z starting 4/190: Luton Table Tennis League (England / Bedfordshire), current_targets=1, history_targets=15
- 2026-03-22T13:52:40.272Z completed 4/190: Luton Table Tennis League, current=1/1, history=15/15, overall=completed, jobs_processed=68, jobs_failed=0
- 2026-03-22T13:52:40.274Z starting 5/190: Bracknell and Wokingham Table Tennis League (England / Berkshire), current_targets=3, history_targets=18
- 2026-03-22T13:53:46.748Z completed 5/190: Bracknell and Wokingham Table Tennis League, current=3/3, history=18/18, overall=completed, jobs_processed=100, jobs_failed=0
- 2026-03-22T13:53:46.749Z starting 6/190: Maidenhead Table Tennis League (England / Berkshire), current_targets=3, history_targets=9
- 2026-03-22T13:57:06.211Z checkpoint (10 minute timer): completed=5, partial=0, in_progress=1, pending=184
- 2026-03-22T13:59:56.379Z completed 6/190: Maidenhead Table Tennis League, current=3/3, history=9/9, overall=completed, jobs_processed=48, jobs_failed=0
- 2026-03-22T13:59:56.383Z starting 7/190: Newbury Table Tennis League (England / Berkshire), current_targets=3, history_targets=12
- 2026-03-22T14:03:40.420Z completed 7/190: Newbury Table Tennis League, current=3/3, history=12/12, overall=completed, jobs_processed=60, jobs_failed=0
- 2026-03-22T14:03:40.423Z starting 8/190: Reading & District Table Tennis Association (England / Berkshire), current_targets=4, history_targets=24
- 2026-03-22T14:07:06.213Z checkpoint (10 minute timer): completed=7, partial=0, in_progress=1, pending=182
- 2026-03-22T14:07:58.523Z completed 8/190: Reading & District Table Tennis Association, current=4/4, history=24/24, overall=completed, jobs_processed=770, jobs_failed=0
- 2026-03-22T14:07:58.524Z starting 9/190: Aylesbury Table Tennis League (England / Buckinghamshire), current_targets=5, history_targets=21
- 2026-03-22T14:17:06.192Z checkpoint (10 minute timer): completed=8, partial=0, in_progress=1, pending=181
- 2026-03-22T14:22:50.108Z completed 9/190: Aylesbury Table Tennis League, current=5/5, history=21/21, overall=completed, jobs_processed=103, jobs_failed=1
- 2026-03-22T14:22:50.109Z failure samples for Aylesbury Table Tennis League: processLogTask: {"logId":"978bf879-9725-4b9c-bb14-5d420978cdc5","competitionId":"430d453b-b983-4189-8f99-774f14eefe56","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: Fixture not found for rubber 8366406: matchExternalId=821866
- 2026-03-22T14:22:50.112Z starting 10/190: Chalfonts Table Tennis League (England / Buckinghamshire), current_targets=2, history_targets=11
- 2026-03-22T14:27:06.193Z checkpoint (10 minute timer): completed=9, partial=0, in_progress=1, pending=180
- 2026-03-22T14:30:20.931Z completed 10/190: Chalfonts Table Tennis League, current=2/2, history=11/11, overall=completed, jobs_processed=52, jobs_failed=0
- 2026-03-22T14:30:20.933Z starting 11/190: Chiltern Table Tennis League (England / Buckinghamshire), current_targets=2, history_targets=8
- 2026-03-22T14:35:27.569Z completed 11/190: Chiltern Table Tennis League, current=2/2, history=8/8, overall=completed, jobs_processed=40, jobs_failed=0
- 2026-03-22T14:35:27.575Z starting 12/190: High Wycombe Table Tennis League (England / Buckinghamshire), current_targets=4, history_targets=16
- 2026-03-22T14:37:06.188Z checkpoint (10 minute timer): completed=11, partial=0, in_progress=1, pending=178
- 2026-03-22T14:47:06.235Z checkpoint (10 minute timer): completed=11, partial=0, in_progress=1, pending=178
- 2026-03-22T14:49:00.838Z completed 12/190: High Wycombe Table Tennis League, current=4/4, history=16/16, overall=completed, jobs_processed=80, jobs_failed=0
- 2026-03-22T14:49:00.841Z starting 13/190: Cambridge Table Tennis League (England / Cambridgeshire), current_targets=4, history_targets=17
- 2026-03-22T14:57:06.236Z checkpoint (10 minute timer): completed=12, partial=0, in_progress=1, pending=177
- 2026-03-22T15:03:50.611Z completed 13/190: Cambridge Table Tennis League, current=4/4, history=17/17, overall=completed, jobs_processed=83, jobs_failed=1
- 2026-03-22T15:03:50.612Z failure samples for Cambridge Table Tennis League: processLogTask: {"logId":"0d434eba-8c7d-4d0b-85d1-c5a69064ea00","competitionId":"75759588-f991-406c-ab48-59e9d4efac57","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: Team not found for fixture 701848: home=51392 (undefined), away=51398 (cc831dfe-14ea-4e41-be45-d23a6784ed40)
- 2026-03-22T15:03:50.615Z starting 14/190: Ely & District Table Tennis League (England / Cambridgeshire), current_targets=3, history_targets=12
- 2026-03-22T15:07:06.246Z checkpoint (10 minute timer): completed=13, partial=0, in_progress=1, pending=176
- 2026-03-22T15:10:13.607Z completed 14/190: Ely & District Table Tennis League, current=3/3, history=12/12, overall=completed, jobs_processed=59, jobs_failed=1
- 2026-03-22T15:10:13.607Z failure samples for Ely & District Table Tennis League: processLogTask: {"logId":"1c67da40-23b1-4876-8ecd-83ba531ecc76","competitionId":"862d5d46-422e-4901-b7db-189ee60900b1","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      1,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      1,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      2,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      2,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      3,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      3,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      4,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      4,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      5,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      5,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      6,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      6,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      7,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      7,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      8,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      8,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  }
]
- 2026-03-22T15:10:13.608Z starting 15/190: Peterborough Table Tennis League (England / Cambridgeshire), current_targets=4, history_targets=11
- 2026-03-22T15:16:59.332Z completed 15/190: Peterborough Table Tennis League, current=4/4, history=11/11, overall=completed, jobs_processed=60, jobs_failed=0
- 2026-03-22T15:16:59.335Z starting 16/190: Chester and Ellesmere Port Table Tennis League (England / Cheshire), current_targets=4, history_targets=18
- 2026-03-22T15:17:06.237Z checkpoint (10 minute timer): completed=15, partial=0, in_progress=1, pending=174
- 2026-03-22T15:27:06.244Z checkpoint (10 minute timer): completed=15, partial=0, in_progress=1, pending=174
- 2026-03-22T15:27:44.573Z completed 16/190: Chester and Ellesmere Port Table Tennis League, current=4/4, history=18/18, overall=completed, jobs_processed=88, jobs_failed=0
- 2026-03-22T15:27:44.576Z starting 17/190: Crewe Table Tennis League (England / Cheshire), current_targets=8, history_targets=16
- 2026-03-22T15:32:38.743Z completed 17/190: Crewe Table Tennis League, current=8/8, history=16/16, overall=completed, jobs_processed=96, jobs_failed=0
- 2026-03-22T15:32:38.746Z starting 18/190: Glossop Table Tennis League (England / Cheshire), current_targets=3, history_targets=15
- 2026-03-22T15:37:06.245Z checkpoint (10 minute timer): completed=17, partial=0, in_progress=1, pending=172
- 2026-03-22T15:44:11.278Z completed 18/190: Glossop Table Tennis League, current=3/3, history=15/15, overall=completed, jobs_processed=66, jobs_failed=3
- 2026-03-22T15:44:11.279Z failure samples for Glossop Table Tennis League: Glossop Table Tennis League: matches Division 1: HTTP 500 fetching https://ttleagues-api.azurewebsites.net/api/divisions/1881/matches | Glossop Table Tennis League: matches Division 2: HTTP 500 fetching https://ttleagues-api.azurewebsites.net/api/divisions/1882/matches | Glossop Table Tennis League: matches Division 3: HTTP 500 fetching https://ttleagues-api.azurewebsites.net/api/divisions/1883/matches
- 2026-03-22T15:44:11.282Z starting 19/190: Halton Table Tennis League (England / Cheshire), current_targets=2, history_targets=5
- 2026-03-22T15:46:02.059Z completed 19/190: Halton Table Tennis League, current=2/2, history=5/5, overall=completed, jobs_processed=27, jobs_failed=1
- 2026-03-22T15:46:02.059Z failure samples for Halton Table Tennis League: processLogTask: {"logId":"2e68c86a-9041-4e64-80e9-6540392ae8f1","competitionId":"11de6317-f52c-47c2-9c20-0bee24dc9df9","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: Team not found for fixture 133804: home=9094 (0b106eae-6576-4bd8-83b3-048186845ee6), away=9088 (undefined)
- 2026-03-22T15:46:02.060Z starting 20/190: Mid-Cheshire Table Tennis League (England / Cheshire), current_targets=2, history_targets=11
- 2026-03-22T15:47:06.248Z checkpoint (10 minute timer): completed=19, partial=0, in_progress=1, pending=170
- 2026-03-22T15:53:21.745Z completed 20/190: Mid-Cheshire Table Tennis League, current=2/2, history=11/11, overall=completed, jobs_processed=52, jobs_failed=0
- 2026-03-22T15:53:21.749Z starting 21/190: Trafford Table Tennis League (England / Cheshire), current_targets=3, history_targets=15
- 2026-03-22T15:57:06.244Z checkpoint (10 minute timer): completed=20, partial=0, in_progress=1, pending=169
- 2026-03-22T16:04:04.445Z completed 21/190: Trafford Table Tennis League, current=3/3, history=15/15, overall=completed, jobs_processed=72, jobs_failed=0
- 2026-03-22T16:04:04.448Z starting 22/190: Wilmslow Table Tennis League (England / Cheshire), current_targets=3, history_targets=15
- 2026-03-22T16:07:06.246Z checkpoint (10 minute timer): completed=21, partial=0, in_progress=1, pending=168
- 2026-03-22T16:14:12.093Z completed 22/190: Wilmslow Table Tennis League, current=3/3, history=15/15, overall=completed, jobs_processed=72, jobs_failed=0
- 2026-03-22T16:14:12.095Z starting 23/190: Wirral Table Tennis League (England / Cheshire), current_targets=3, history_targets=14
- 2026-03-22T16:17:06.249Z checkpoint (10 minute timer): completed=22, partial=0, in_progress=1, pending=167
- 2026-03-22T16:25:57.255Z completed 23/190: Wirral Table Tennis League, current=3/3, history=14/14, overall=completed, jobs_processed=67, jobs_failed=1
- 2026-03-22T16:25:57.255Z failure samples for Wirral Table Tennis League: processLogTask: {"logId":"eca5a2f6-92d5-4a04-92d0-9560a2df82f6","competitionId":"958ee361-96c2-4ded-9790-4cf0933f7c3c","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      1,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      1,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      2,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      2,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      3,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      3,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      4,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      4,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      5,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      5,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      6,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      6,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      7,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      7,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      8,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      8,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      9,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      9,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  }
]
- 2026-03-22T16:25:57.258Z starting 24/190: Lancashire And Cheshire Table Tennis League (England / Cheshire|Lancashire), current_targets=3, history_targets=6
- 2026-03-22T16:27:06.248Z checkpoint (10 minute timer): completed=23, partial=0, in_progress=1, pending=166
- 2026-03-22T16:27:29.827Z completed 24/190: Lancashire And Cheshire Table Tennis League, current=3/3, history=6/6, overall=completed, jobs_processed=36, jobs_failed=0
- 2026-03-22T16:27:29.831Z starting 25/190: Cleveland Table Tennis League (England / Cleveland), current_targets=1, history_targets=3
- 2026-03-22T16:29:00.567Z completed 25/190: Cleveland Table Tennis League, current=1/1, history=3/3, overall=completed, jobs_processed=15, jobs_failed=1
- 2026-03-22T16:29:00.568Z failure samples for Cleveland Table Tennis League: processLogTask: {"logId":"420ad7ba-1182-4326-9502-d2e95f9594e8","competitionId":"b4bb2bf2-5e07-44a0-85d0-0af5922e81e9","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      1,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      1,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      5,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      5,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      8,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      8,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  }
]
- 2026-03-22T16:29:00.572Z starting 26/190: Middlesbrough Table Tennis League (England / Cleveland), current_targets=3, history_targets=6
- 2026-03-22T16:33:06.795Z completed 26/190: Middlesbrough Table Tennis League, current=3/3, history=6/6, overall=completed, jobs_processed=36, jobs_failed=0
- 2026-03-22T16:33:06.799Z starting 27/190: Stockton Table Tennis League (England / Cleveland), current_targets=3, history_targets=13
- 2026-03-22T16:37:06.249Z checkpoint (10 minute timer): completed=26, partial=0, in_progress=1, pending=163
- 2026-03-22T16:44:41.607Z completed 27/190: Stockton Table Tennis League, current=3/3, history=13/13, overall=completed, jobs_processed=64, jobs_failed=0
- 2026-03-22T16:44:41.610Z starting 28/190: North Cornwall Table Tennis League (England / Cornwall), current_targets=2, history_targets=16
- 2026-03-22T16:45:16.997Z completed 28/190: North Cornwall Table Tennis League, current=2/2, history=16/16, overall=completed, jobs_processed=72, jobs_failed=0
- 2026-03-22T16:45:17.004Z starting 29/190: West Cornwall Table Tennis League (England / Cornwall), current_targets=4, history_targets=14
- 2026-03-22T16:47:06.252Z checkpoint (10 minute timer): completed=28, partial=0, in_progress=1, pending=161
- 2026-03-22T16:57:06.228Z checkpoint (10 minute timer): completed=28, partial=0, in_progress=1, pending=161
- 2026-03-22T17:03:40.853Z completed 29/190: West Cornwall Table Tennis League, current=4/4, history=14/14, overall=completed, jobs_processed=72, jobs_failed=0
- 2026-03-22T17:03:40.856Z starting 30/190: Barrow Table Tennis League (England / Cumbria), current_targets=2, history_targets=0
- 2026-03-22T17:05:07.941Z completed 30/190: Barrow Table Tennis League, current=2/2, history=0/0, overall=completed, jobs_processed=8, jobs_failed=0
- 2026-03-22T17:05:07.944Z starting 31/190: Chesterfield Table Tennis League (England / Derbyshire), current_targets=4, history_targets=6
- 2026-03-22T17:07:06.222Z checkpoint (10 minute timer): completed=30, partial=0, in_progress=1, pending=159
- 2026-03-22T17:11:57.555Z completed 31/190: Chesterfield Table Tennis League, current=4/4, history=6/6, overall=completed, jobs_processed=39, jobs_failed=1
- 2026-03-22T17:11:57.555Z failure samples for Chesterfield Table Tennis League: processLogTask: {"logId":"c084cbb7-6bc1-45c4-8a95-964f0e871c5f","competitionId":"b3168bda-52a0-4652-92f3-a761ad87a789","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      4,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      4,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      5,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      5,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      6,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      6,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      7,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      7,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      8,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      8,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      9,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      9,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  }
]
- 2026-03-22T17:11:57.558Z starting 32/190: Derby & District Table Tennis Association (England / Derbyshire), current_targets=4, history_targets=21
- 2026-03-22T17:17:06.220Z checkpoint (10 minute timer): completed=31, partial=0, in_progress=1, pending=158
- 2026-03-22T17:25:49.418Z completed 32/190: Derby & District Table Tennis Association, current=4/4, history=21/21, overall=completed, jobs_processed=99, jobs_failed=1
- 2026-03-22T17:25:49.419Z failure samples for Derby & District Table Tennis Association: processLogTask: {"logId":"7e0a90fa-e093-4922-8302-a317130dc109","competitionId":"c9e9445d-8540-4885-93f6-7def8cce6ff7","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      5,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      5,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      6,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      6,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      7,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      7,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      8,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      8,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      9,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      9,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  }
]
- 2026-03-22T17:25:49.421Z starting 33/190: Matlock Table Tennis League (England / Derbyshire), current_targets=2, history_targets=10
- 2026-03-22T17:27:06.215Z checkpoint (10 minute timer): completed=32, partial=0, in_progress=1, pending=157
- 2026-03-22T17:34:36.937Z completed 33/190: Matlock Table Tennis League, current=2/2, history=10/10, overall=completed, jobs_processed=48, jobs_failed=0
- 2026-03-22T17:34:36.942Z starting 34/190: Exeter Table Tennis League (England / Devonshire), current_targets=4, history_targets=14
- 2026-03-22T17:37:06.258Z checkpoint (10 minute timer): completed=33, partial=0, in_progress=1, pending=156
- 2026-03-22T17:46:08.836Z completed 34/190: Exeter Table Tennis League, current=4/4, history=14/14, overall=completed, jobs_processed=71, jobs_failed=1
- 2026-03-22T17:46:08.837Z failure samples for Exeter Table Tennis League: processLogTask: {"logId":"1d8bd093-491f-42fb-b8ef-ccb1c88b1ecb","competitionId":"1806c25f-945b-417f-9fa2-f0afee75c99a","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      7,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      7,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      8,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      8,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      9,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      9,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  }
]
- 2026-03-22T17:46:08.841Z starting 35/190: South Devon and Torbay Table Tennis League (England / Devonshire), current_targets=4, history_targets=20
- 2026-03-22T17:47:06.262Z checkpoint (10 minute timer): completed=34, partial=0, in_progress=1, pending=155
- 2026-03-22T17:57:06.267Z checkpoint (10 minute timer): completed=34, partial=0, in_progress=1, pending=155
- 2026-03-22T17:59:33.414Z completed 35/190: South Devon and Torbay Table Tennis League, current=4/4, history=20/20, overall=completed, jobs_processed=95, jobs_failed=1
- 2026-03-22T17:59:33.415Z failure samples for South Devon and Torbay Table Tennis League: processLogTask: {"logId":"0ad3b39e-6d9c-4fad-ae84-ea19e29a0d58","competitionId":"1e55540c-f542-4d08-b6d9-247eece18e2d","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: Team not found for fixture 728019: home=57894 (604615c4-2a10-490f-bd6c-13edfc49808e), away=57946 (undefined)
- 2026-03-22T17:59:33.417Z starting 36/190: Blackmore Vale Table Tennis League (England / Dorset), current_targets=2, history_targets=2
- 2026-03-22T18:01:31.941Z completed 36/190: Blackmore Vale Table Tennis League, current=2/2, history=2/2, overall=completed, jobs_processed=16, jobs_failed=0
- 2026-03-22T18:01:31.945Z starting 37/190: Weymouth Table Tennis League (England / Dorset), current_targets=3, history_targets=15
- 2026-03-22T18:05:33.074Z completed 37/190: Weymouth Table Tennis League, current=3/3, history=15/15, overall=completed, jobs_processed=72, jobs_failed=0
- 2026-03-22T18:05:33.077Z starting 38/190: Darlington Table Tennis League (England / Durham), current_targets=2, history_targets=9
- 2026-03-22T18:07:06.254Z checkpoint (10 minute timer): completed=37, partial=0, in_progress=1, pending=152
- 2026-03-22T18:11:20.121Z completed 38/190: Darlington Table Tennis League, current=2/2, history=9/9, overall=completed, jobs_processed=44, jobs_failed=0
- 2026-03-22T18:11:20.126Z starting 39/190: Sunderland Table Tennis League (England / Durham), current_targets=3, history_targets=18
- 2026-03-22T18:17:06.256Z checkpoint (10 minute timer): completed=38, partial=0, in_progress=1, pending=151
- 2026-03-22T18:27:06.258Z checkpoint (10 minute timer): completed=38, partial=0, in_progress=1, pending=151
- 2026-03-22T18:37:06.260Z checkpoint (10 minute timer): completed=38, partial=0, in_progress=1, pending=151
- 2026-03-22T18:47:06.267Z checkpoint (10 minute timer): completed=38, partial=0, in_progress=1, pending=151
- 2026-03-22T18:57:06.270Z checkpoint (10 minute timer): completed=38, partial=0, in_progress=1, pending=151
- 2026-03-22T19:07:06.273Z checkpoint (10 minute timer): completed=38, partial=0, in_progress=1, pending=151
- 2026-03-22T19:17:06.281Z checkpoint (10 minute timer): completed=38, partial=0, in_progress=1, pending=151
- 2026-03-22T19:21:08.009Z completed 39/190: Sunderland Table Tennis League, current=3/3, history=18/18, overall=completed, jobs_processed=98, jobs_failed=301
- 2026-03-22T19:21:08.010Z failure samples for Sunderland Table Tennis League: scrapeUrlTask: {"url":"https://www.tabletennis365.com/Sunderland/Results/Winter_2014-15/Division_1/MatchCard/115285","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"a0175032-54d2-4857-8657-f5099a367ff9","tt365DataType":"matchcard","matchExternalId":"115285"}: HTTP 500 Internal Server Error when fetching https://www.tabletennis365.com/Sunderland/Results/Winter_2014-15/Division_1/MatchCard/115285 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Sunderland/Results/Winter_2014-15/Division_1/MatchCard/100874","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"a0175032-54d2-4857-8657-f5099a367ff9","tt365DataType":"matchcard","matchExternalId":"100874"}: HTTP 500 Internal Server Error when fetching https://www.tabletennis365.com/Sunderland/Results/Winter_2014-15/Division_1/MatchCard/100874 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Sunderland/Results/Winter_2014-15/Division_1/MatchCard/102436","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"a0175032-54d2-4857-8657-f5099a367ff9","tt365DataType":"matchcard","matchExternalId":"102436"}: HTTP 500 Internal Server Error when fetching https://www.tabletennis365.com/Sunderland/Results/Winter_2014-15/Division_1/MatchCard/102436 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Sunderland/Results/Winter_2014-15/Division_1/MatchCard/100164","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"a0175032-54d2-4857-8657-f5099a367ff9","tt365DataType":"matchcard","matchExternalId":"100164"}: HTTP 500 Internal Server Error when fetching https://www.tabletennis365.com/Sunderland/Results/Winter_2014-15/Division_1/MatchCard/100164 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Sunderland/Results/Winter_2014-15/Division_1/MatchCard/98818","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"a0175032-54d2-4857-8657-f5099a367ff9","tt365DataType":"matchcard","matchExternalId":"98818"}: HTTP 500 Internal Server Error when fetching https://www.tabletennis365.com/Sunderland/Results/Winter_2014-15/Division_1/MatchCard/98818
- 2026-03-22T19:21:08.013Z starting 40/190: Basildon Table Tennis League (England / Essex), current_targets=0, history_targets=0
- 2026-03-22T19:21:08.016Z completed 40/190: Basildon Table Tennis League, current=0/0, history=0/0, overall=partial, jobs_processed=0, jobs_failed=0
- 2026-03-22T19:21:08.018Z starting 41/190: Becontree Table Tennis League (England / Essex), current_targets=6, history_targets=7
- 2026-03-22T19:21:48.702Z completed 41/190: Becontree Table Tennis League, current=6/6, history=7/7, overall=completed, jobs_processed=52, jobs_failed=0
- 2026-03-22T19:21:48.705Z starting 42/190: Braintree Table Tennis League (England / Essex), current_targets=3, history_targets=14
- 2026-03-22T19:27:06.276Z checkpoint (10 minute timer): completed=40, partial=1, in_progress=1, pending=148
- 2026-03-22T19:35:19.282Z completed 42/190: Braintree Table Tennis League, current=3/3, history=14/14, overall=completed, jobs_processed=68, jobs_failed=0
- 2026-03-22T19:35:19.285Z starting 43/190: Brentwood Table Tennis League (England / Essex), current_targets=1, history_targets=0
- 2026-03-22T19:35:21.663Z completed 43/190: Brentwood Table Tennis League, current=1/1, history=0/0, overall=completed, jobs_processed=4, jobs_failed=0
- 2026-03-22T19:35:21.666Z starting 44/190: Burnham Table Tennis League (England / Essex), current_targets=3, history_targets=20
- 2026-03-22T19:37:06.277Z checkpoint (10 minute timer): completed=42, partial=1, in_progress=1, pending=146
- 2026-03-22T19:41:06.014Z completed 44/190: Burnham Table Tennis League, current=3/3, history=20/20, overall=completed, jobs_processed=950, jobs_failed=0
- 2026-03-22T19:41:06.016Z starting 45/190: Central Essex Summer League (England / Essex), current_targets=6, history_targets=38
- 2026-03-22T19:42:02.905Z completed 45/190: Central Essex Summer League, current=6/6, history=38/38, overall=completed, jobs_processed=180, jobs_failed=0
- 2026-03-22T19:42:02.907Z starting 46/190: Chelmsford Table Tennis League (England / Essex), current_targets=8, history_targets=58
- 2026-03-22T19:45:10.598Z completed 46/190: Chelmsford Table Tennis League, current=8/8, history=58/58, overall=completed, jobs_processed=289, jobs_failed=1
- 2026-03-22T19:45:10.598Z failure samples for Chelmsford Table Tennis League: processLogTask: {"logId":"2c741908-4be0-4954-93a6-31e064b310ac","competitionId":"f97384f0-a752-4281-a7ce-ac38cc48d443","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","tt365DataType":"standings"}: ON CONFLICT DO UPDATE command cannot affect row a second time
- 2026-03-22T19:45:10.600Z starting 47/190: Clacton & District Table Tennis League (England / Essex), current_targets=3, history_targets=15
- 2026-03-22T19:47:06.275Z checkpoint (10 minute timer): completed=45, partial=1, in_progress=1, pending=143
- 2026-03-22T19:56:37.314Z completed 47/190: Clacton & District Table Tennis League, current=3/3, history=15/15, overall=completed, jobs_processed=72, jobs_failed=0
- 2026-03-22T19:56:37.316Z starting 48/190: Colchester Table Tennis League (England / Essex), current_targets=0, history_targets=0
- 2026-03-22T19:56:37.317Z completed 48/190: Colchester Table Tennis League, current=0/0, history=0/0, overall=partial, jobs_processed=0, jobs_failed=0
- 2026-03-22T19:56:37.319Z starting 49/190: Harlow Table Tennis League (England / Essex), current_targets=2, history_targets=11
- 2026-03-22T19:57:06.246Z checkpoint (10 minute timer): completed=46, partial=2, in_progress=1, pending=141
- 2026-03-22T20:03:35.742Z completed 49/190: Harlow Table Tennis League, current=2/2, history=11/11, overall=completed, jobs_processed=52, jobs_failed=0
- 2026-03-22T20:03:35.745Z starting 50/190: Romford Table Tennis League (England / Essex), current_targets=4, history_targets=18
- 2026-03-22T20:07:06.244Z checkpoint (10 minute timer): completed=47, partial=2, in_progress=1, pending=140
- 2026-03-22T20:17:02.048Z completed 50/190: Romford Table Tennis League, current=4/4, history=18/18, overall=completed, jobs_processed=88, jobs_failed=0
- 2026-03-22T20:17:02.051Z starting 51/190: Waltham Forest Table Tennis League (England / Essex), current_targets=1, history_targets=0
- 2026-03-22T20:17:02.250Z completed 51/190: Waltham Forest Table Tennis League, current=1/1, history=0/0, overall=completed, jobs_processed=4, jobs_failed=0
- 2026-03-22T20:17:02.254Z starting 52/190: Cheltenham Table Tennis Association (England / Gloucestershire), current_targets=4, history_targets=14
- 2026-03-22T20:17:06.237Z checkpoint (10 minute timer): completed=49, partial=2, in_progress=1, pending=138
- 2026-03-22T20:23:38.973Z completed 52/190: Cheltenham Table Tennis Association, current=4/4, history=14/14, overall=completed, jobs_processed=72, jobs_failed=0
- 2026-03-22T20:23:38.976Z starting 53/190: Cirencester Table Tennis League (England / Gloucestershire), current_targets=3, history_targets=13
- 2026-03-22T20:27:06.229Z checkpoint (10 minute timer): completed=50, partial=2, in_progress=1, pending=137
- 2026-03-22T20:31:32.616Z completed 53/190: Cirencester Table Tennis League, current=3/3, history=13/13, overall=completed, jobs_processed=63, jobs_failed=1
- 2026-03-22T20:31:32.617Z failure samples for Cirencester Table Tennis League: processLogTask: {"logId":"b64c296e-0e70-4ee1-834d-3b0b9709e4dd","competitionId":"8eebd565-a30d-4d86-9fe3-013ea7954ec0","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      1,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      1,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      2,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      2,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      3,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      3,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      4,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      4,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  }
]
- 2026-03-22T20:31:32.619Z starting 54/190: Gloucester Table Tennis League (England / Gloucestershire), current_targets=3, history_targets=16
- 2026-03-22T20:37:06.281Z checkpoint (10 minute timer): completed=51, partial=2, in_progress=1, pending=136
- 2026-03-22T20:44:52.097Z completed 54/190: Gloucester Table Tennis League, current=3/3, history=16/16, overall=completed, jobs_processed=76, jobs_failed=0
- 2026-03-22T20:44:52.099Z starting 55/190: Stroud Table Tennis League (England / Gloucestershire), current_targets=4, history_targets=17
- 2026-03-22T20:47:06.279Z checkpoint (10 minute timer): completed=52, partial=2, in_progress=1, pending=135
- 2026-03-22T20:57:06.287Z checkpoint (10 minute timer): completed=52, partial=2, in_progress=1, pending=135
- 2026-03-22T21:03:18.020Z completed 55/190: Stroud Table Tennis League, current=4/4, history=17/17, overall=completed, jobs_processed=81, jobs_failed=3
- 2026-03-22T21:03:18.021Z failure samples for Stroud Table Tennis League: processLogTask: {"logId":"5191b50e-39a1-4258-b342-fb8bcafc232d","competitionId":"e3dd37d5-f213-4467-8418-5b461e3b4960","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      9,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      9,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  }
] | processLogTask: {"logId":"73e4c4d6-9f64-43dd-be18-177297f65c38","competitionId":"ea55b1a3-68ca-4dfb-aaeb-b246c2a2a074","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      9,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      9,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  }
] | processLogTask: {"logId":"8c289704-a891-455e-bacb-b5107fb181ad","competitionId":"6e0bb8e8-7dd5-43c0-aa30-1e8998d32ee6","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      2,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      2,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  }
]
- 2026-03-22T21:03:18.022Z starting 56/190: Andover Table Tennis League (England / Hampshire), current_targets=2, history_targets=10
- 2026-03-22T21:07:06.286Z checkpoint (10 minute timer): completed=53, partial=2, in_progress=1, pending=134
- 2026-03-22T21:08:32.777Z completed 56/190: Andover Table Tennis League, current=2/2, history=10/10, overall=completed, jobs_processed=47, jobs_failed=1
- 2026-03-22T21:08:32.777Z failure samples for Andover Table Tennis League: processLogTask: {"logId":"e1dd590e-ef02-499c-bd45-1baf550cd039","competitionId":"18713582-7979-43af-98da-f7b2909fbbff","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: Fixture not found for rubber 8692329: matchExternalId=855699
- 2026-03-22T21:08:32.780Z starting 57/190: Gosport and Fareham Table Tennis League (England / Hampshire), current_targets=2, history_targets=10
- 2026-03-22T21:16:24.871Z completed 57/190: Gosport and Fareham Table Tennis League, current=2/2, history=10/10, overall=completed, jobs_processed=48, jobs_failed=0
- 2026-03-22T21:16:24.873Z starting 58/190: Portsmouth Table Tennis League (England / Hampshire), current_targets=4, history_targets=18
- 2026-03-22T21:17:06.293Z checkpoint (10 minute timer): completed=55, partial=2, in_progress=1, pending=132
- 2026-03-22T21:25:24.112Z completed 58/190: Portsmouth Table Tennis League, current=4/4, history=18/18, overall=completed, jobs_processed=88, jobs_failed=0
- 2026-03-22T21:25:24.114Z starting 59/190: South East Hampshire Table Tennis League (England / Hampshire), current_targets=4, history_targets=8
- 2026-03-22T21:25:26.212Z completed 59/190: South East Hampshire Table Tennis League, current=4/4, history=8/8, overall=completed, jobs_processed=48, jobs_failed=0
- 2026-03-22T21:25:26.214Z starting 60/190: Winchester Table Tennis League (England / Hampshire), current_targets=2, history_targets=8
- 2026-03-22T21:25:30.757Z completed 60/190: Winchester Table Tennis League, current=2/2, history=8/8, overall=completed, jobs_processed=40, jobs_failed=0
- 2026-03-22T21:25:30.759Z starting 61/190: Hereford Table Tennis League (England / Herefordshire), current_targets=2, history_targets=10
- 2026-03-22T21:25:38.729Z completed 61/190: Hereford Table Tennis League, current=2/2, history=10/10, overall=completed, jobs_processed=48, jobs_failed=0
- 2026-03-22T21:25:38.736Z starting 62/190: Barnets Table Tennis League (England / Hertfordshire), current_targets=4, history_targets=26
- 2026-03-22T21:27:06.292Z checkpoint (10 minute timer): completed=59, partial=2, in_progress=1, pending=128
- 2026-03-22T21:34:07.600Z completed 62/190: Barnets Table Tennis League, current=4/4, history=26/26, overall=completed, jobs_processed=148, jobs_failed=34
- 2026-03-22T21:34:07.600Z failure samples for Barnets Table Tennis League: scrapeUrlTask: {"url":"https://www.tabletennis365.com/Barnets/Results/Winter_2020-21/Premier_Division/MatchCard/365018","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"33278f6b-137f-4901-b4c3-1ebc5630ae97","tt365DataType":"matchcard","matchExternalId":"365018"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/Barnets/Results/Winter_2020-21/Premier_Division/MatchCard/365018 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Barnets/Results/Winter_2020-21/Premier_Division/MatchCard/365020","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"33278f6b-137f-4901-b4c3-1ebc5630ae97","tt365DataType":"matchcard","matchExternalId":"365020"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/Barnets/Results/Winter_2020-21/Premier_Division/MatchCard/365020 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Barnets/Results/Winter_2020-21/Premier_Division/MatchCard/365016","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"33278f6b-137f-4901-b4c3-1ebc5630ae97","tt365DataType":"matchcard","matchExternalId":"365016"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/Barnets/Results/Winter_2020-21/Premier_Division/MatchCard/365016 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Barnets/Results/Winter_2020-21/Premier_Division/MatchCard/364815","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"33278f6b-137f-4901-b4c3-1ebc5630ae97","tt365DataType":"matchcard","matchExternalId":"364815"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/Barnets/Results/Winter_2020-21/Premier_Division/MatchCard/364815 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Barnets/Results/Winter_2020-21/Premier_Division/MatchCard/364813","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"33278f6b-137f-4901-b4c3-1ebc5630ae97","tt365DataType":"matchcard","matchExternalId":"364813"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/Barnets/Results/Winter_2020-21/Premier_Division/MatchCard/364813
- 2026-03-22T21:34:07.601Z starting 63/190: Hemel Hempstead Table Tennis League (England / Hertfordshire), current_targets=3, history_targets=20
- 2026-03-22T21:36:01.892Z completed 63/190: Hemel Hempstead Table Tennis League, current=3/3, history=20/20, overall=completed, jobs_processed=120, jobs_failed=0
- 2026-03-22T21:36:01.893Z starting 64/190: North Herts Table Tennis League (England / Hertfordshire), current_targets=4, history_targets=26
- 2026-03-22T21:37:06.292Z checkpoint (10 minute timer): completed=61, partial=2, in_progress=1, pending=126
- 2026-03-22T21:42:08.223Z completed 64/190: North Herts Table Tennis League, current=4/4, history=26/26, overall=completed, jobs_processed=1080, jobs_failed=2
- 2026-03-22T21:42:08.224Z failure samples for North Herts Table Tennis League: scrapeUrlTask: {"url":"https://www.tabletennis365.com/NorthHerts/Results/Winter_2014-15/Premier/MatchCard/108303","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"7390a83e-5fa3-46a2-af4c-903280942d32","tt365DataType":"matchcard","matchExternalId":"108303"}: HTTP 500 Internal Server Error when fetching https://www.tabletennis365.com/NorthHerts/Results/Winter_2014-15/Premier/MatchCard/108303 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/NorthHerts/Results/Winter_2015-16/Premier/MatchCard/142067","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"6f72ae88-d118-4514-a83f-ac93c7a414d3","tt365DataType":"matchcard","matchExternalId":"142067"}: HTTP 500 Internal Server Error when fetching https://www.tabletennis365.com/NorthHerts/Results/Winter_2015-16/Premier/MatchCard/142067
- 2026-03-22T21:42:08.226Z starting 65/190: St Albans, Hatfield & Welwyn Table Tennis League (England / Hertfordshire), current_targets=5, history_targets=20
- 2026-03-22T21:42:41.450Z completed 65/190: St Albans, Hatfield & Welwyn Table Tennis League, current=5/5, history=20/20, overall=completed, jobs_processed=100, jobs_failed=0
- 2026-03-22T21:42:41.453Z starting 66/190: Watford Table Tennis League (England / Hertfordshire), current_targets=4, history_targets=0
- 2026-03-22T21:43:07.558Z completed 66/190: Watford Table Tennis League, current=4/4, history=0/0, overall=completed, jobs_processed=15, jobs_failed=1
- 2026-03-22T21:43:07.558Z failure samples for Watford Table Tennis League: processLogTask: {"logId":"6a88ae5a-1bc6-4b38-84db-319f6ee8c3a2","competitionId":"c64f56ec-a21e-47a0-82a3-202fc30c55dd","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      7,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      7,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  }
]
- 2026-03-22T21:43:07.561Z starting 67/190: Isle of Wight Table Tennis League (England / Isle of Wight), current_targets=3, history_targets=10
- 2026-03-22T21:45:23.997Z completed 67/190: Isle of Wight Table Tennis League, current=3/3, history=10/10, overall=completed, jobs_processed=478, jobs_failed=0
- 2026-03-22T21:45:23.999Z starting 68/190: Ashford Table Tennis League (England / Kent), current_targets=4, history_targets=9
- 2026-03-22T21:45:30.209Z completed 68/190: Ashford Table Tennis League, current=4/4, history=9/9, overall=completed, jobs_processed=52, jobs_failed=0
- 2026-03-22T21:45:30.212Z starting 69/190: Bromley Table Tennis League (England / Kent), current_targets=3, history_targets=20
- 2026-03-22T21:46:53.796Z completed 69/190: Bromley Table Tennis League, current=3/3, history=20/20, overall=completed, jobs_processed=104, jobs_failed=0
- 2026-03-22T21:46:53.798Z starting 70/190: Folkestone Table Tennis League (England / Kent), current_targets=3, history_targets=12
- 2026-03-22T21:47:06.277Z checkpoint (10 minute timer): completed=67, partial=2, in_progress=1, pending=120
- 2026-03-22T21:47:07.123Z completed 70/190: Folkestone Table Tennis League, current=3/3, history=12/12, overall=completed, jobs_processed=60, jobs_failed=0
- 2026-03-22T21:47:07.126Z starting 71/190: Gravesend Table Tennis League (England / Kent), current_targets=2, history_targets=9
- 2026-03-22T21:47:11.436Z completed 71/190: Gravesend Table Tennis League, current=2/2, history=9/9, overall=completed, jobs_processed=44, jobs_failed=0
- 2026-03-22T21:47:11.440Z starting 72/190: Isle of Thanet Table Tennis League (England / Kent), current_targets=12, history_targets=6
- 2026-03-22T21:47:13.783Z completed 72/190: Isle of Thanet Table Tennis League, current=12/12, history=6/6, overall=completed, jobs_processed=72, jobs_failed=0
- 2026-03-22T21:47:13.786Z starting 73/190: Maidstone Table Tennis Association (England / Kent), current_targets=4, history_targets=24
- 2026-03-22T21:54:59.549Z completed 73/190: Maidstone Table Tennis Association, current=4/4, history=24/24, overall=completed, jobs_processed=850, jobs_failed=0
- 2026-03-22T21:54:59.550Z starting 74/190: Medway Towns Table Tennis League (England / Kent), current_targets=8, history_targets=6
- 2026-03-22T21:57:06.278Z checkpoint (10 minute timer): completed=71, partial=2, in_progress=1, pending=116
- 2026-03-22T22:01:42.384Z completed 74/190: Medway Towns Table Tennis League, current=8/8, history=6/6, overall=completed, jobs_processed=56, jobs_failed=0
- 2026-03-22T22:01:42.385Z starting 75/190: North West Kent Table Tennis League (England / Kent), current_targets=3, history_targets=15
- 2026-03-22T22:07:06.281Z checkpoint (10 minute timer): completed=72, partial=2, in_progress=1, pending=115
- 2026-03-22T22:17:06.278Z checkpoint (10 minute timer): completed=72, partial=2, in_progress=1, pending=115
- 2026-03-22T22:21:10.042Z completed 75/190: North West Kent Table Tennis League, current=3/3, history=15/15, overall=completed, jobs_processed=2966, jobs_failed=0
- 2026-03-22T22:21:10.043Z starting 76/190: Sevenoaks Table Tennis League (England / Kent), current_targets=7, history_targets=18
- 2026-03-22T22:26:12.202Z completed 76/190: Sevenoaks Table Tennis League, current=7/7, history=18/18, overall=completed, jobs_processed=100, jobs_failed=0
- 2026-03-22T22:26:12.205Z starting 77/190: Sittingbourne Table Tennis League (England / Kent), current_targets=4, history_targets=14
- 2026-03-22T22:27:06.262Z checkpoint (10 minute timer): completed=74, partial=2, in_progress=1, pending=113
- 2026-03-22T22:34:56.308Z completed 77/190: Sittingbourne Table Tennis League, current=4/4, history=14/14, overall=completed, jobs_processed=72, jobs_failed=0
- 2026-03-22T22:34:56.310Z starting 78/190: West Kent Table Tennis Association (England / Kent), current_targets=3, history_targets=11
- 2026-03-22T22:37:06.262Z checkpoint (10 minute timer): completed=75, partial=2, in_progress=1, pending=112
- 2026-03-22T22:41:13.015Z completed 78/190: West Kent Table Tennis Association, current=3/3, history=11/11, overall=completed, jobs_processed=56, jobs_failed=0
- 2026-03-22T22:41:13.016Z starting 79/190: Blackpool Table Tennis League (England / Lancashire), current_targets=3, history_targets=12
- 2026-03-22T22:47:06.301Z checkpoint (10 minute timer): completed=76, partial=2, in_progress=1, pending=111
- 2026-03-22T22:57:06.307Z checkpoint (10 minute timer): completed=76, partial=2, in_progress=1, pending=111
- 2026-03-22T22:57:17.200Z completed 79/190: Blackpool Table Tennis League, current=3/3, history=12/12, overall=completed, jobs_processed=60, jobs_failed=0
- 2026-03-22T22:57:17.204Z starting 80/190: Bolton Table Tennis League (England / Lancashire), current_targets=4, history_targets=20
- 2026-03-22T23:07:06.308Z checkpoint (10 minute timer): completed=77, partial=2, in_progress=1, pending=110
- 2026-03-22T23:17:06.314Z checkpoint (10 minute timer): completed=77, partial=2, in_progress=1, pending=110
- 2026-03-22T23:18:15.571Z completed 80/190: Bolton Table Tennis League, current=4/4, history=20/20, overall=completed, jobs_processed=96, jobs_failed=0
- 2026-03-22T23:18:15.577Z starting 81/190: Bury Table Tennis League (England / Lancashire), current_targets=3, history_targets=21
- 2026-03-22T23:27:06.271Z checkpoint (10 minute timer): completed=78, partial=2, in_progress=1, pending=109
- 2026-03-22T23:37:06.275Z checkpoint (10 minute timer): completed=78, partial=2, in_progress=1, pending=109
- 2026-03-22T23:46:29.961Z completed 81/190: Bury Table Tennis League, current=3/3, history=21/21, overall=completed, jobs_processed=4160, jobs_failed=0
- 2026-03-22T23:46:29.963Z starting 82/190: Lancaster and Morecambe Table Tennis League (England / Lancashire), current_targets=2, history_targets=12
- 2026-03-22T23:47:06.262Z checkpoint (10 minute timer): completed=79, partial=2, in_progress=1, pending=108
- 2026-03-22T23:57:06.314Z checkpoint (10 minute timer): completed=79, partial=2, in_progress=1, pending=108
- 2026-03-22T23:57:18.811Z completed 82/190: Lancaster and Morecambe Table Tennis League, current=2/2, history=12/12, overall=completed, jobs_processed=1448, jobs_failed=0
- 2026-03-22T23:57:18.812Z starting 83/190: Liverpool Table Tennis League (England / Lancashire), current_targets=5, history_targets=13
- 2026-03-23T00:06:08.026Z completed 83/190: Liverpool Table Tennis League, current=5/5, history=13/13, overall=completed, jobs_processed=70, jobs_failed=1
- 2026-03-23T00:06:08.026Z failure samples for Liverpool Table Tennis League: Liverpool Table Tennis League: matches FRANK MURPHY HANDICAP CUP: [
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      1,
      "matches",
      0,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      1,
      "matches",
      0,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      1,
      "matches",
      1,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      1,
      "matches",
      1,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      1,
      "matches",
      2,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      1,
      "matches",
      2,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      1,
      "matches",
      3,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      1,
      "matches",
      3,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      1,
      "matches",
      4,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      1,
      "matches",
      4,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      1,
      "matches",
      5,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      1,
      "matches",
      5,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      1,
      "matches",
      6,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      1,
      "matches",
      6,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      1,
      "matches",
      7,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      1,
      "matches",
      7,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      2,
      "matches",
      0,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      2,
      "matches",
      0,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      2,
      "matches",
      1,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      2,
      "matches",
      1,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      2,
      "matches",
      2,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      2,
      "matches",
      2,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      2,
      "matches",
      3,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      2,
      "matches",
      3,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      3,
      "matches",
      0,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      3,
      "matches",
      0,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      3,
      "matches",
      1,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      3,
      "matches",
      1,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      4,
      "matches",
      0,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      4,
      "matches",
      0,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      16,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      16,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      17,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      17,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      18,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      18,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      19,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      19,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      20,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      20,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      21,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      21,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      22,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      22,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      23,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      23,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      24,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      24,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      25,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      25,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      26,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      26,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      27,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      27,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      28,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      28,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      29,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      29,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      30,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      30,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  }
]
- 2026-03-23T00:06:08.027Z starting 84/190: Lytham St Annes Table Tennis League (England / Lancashire), current_targets=1, history_targets=5
- 2026-03-23T00:07:06.326Z checkpoint (10 minute timer): completed=81, partial=2, in_progress=1, pending=106
- 2026-03-23T00:11:14.555Z completed 84/190: Lytham St Annes Table Tennis League, current=1/1, history=5/5, overall=completed, jobs_processed=24, jobs_failed=0
- 2026-03-23T00:11:14.556Z starting 85/190: Manchester Table Tennis League (England / Lancashire), current_targets=2, history_targets=10
- 2026-03-23T00:16:30.598Z completed 85/190: Manchester Table Tennis League, current=2/2, history=10/10, overall=completed, jobs_processed=47, jobs_failed=1
- 2026-03-23T00:16:30.598Z failure samples for Manchester Table Tennis League: processLogTask: {"logId":"bfa190ec-d6ad-4584-a789-c86445c772d4","competitionId":"51811279-a4b9-4788-b0ed-ca757c6f8ed6","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      6,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      6,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  }
]
- 2026-03-23T00:16:30.600Z starting 86/190: Oldham Table Tennis League (England / Lancashire), current_targets=3, history_targets=22
- 2026-03-23T00:17:06.329Z checkpoint (10 minute timer): completed=83, partial=2, in_progress=1, pending=104
- 2026-03-23T00:27:06.330Z checkpoint (10 minute timer): completed=83, partial=2, in_progress=1, pending=104
- 2026-03-23T00:37:06.349Z checkpoint (10 minute timer): completed=83, partial=2, in_progress=1, pending=104
- 2026-03-23T00:46:38.210Z completed 86/190: Oldham Table Tennis League, current=3/3, history=22/22, overall=completed, jobs_processed=4451, jobs_failed=1
- 2026-03-23T00:46:38.211Z failure samples for Oldham Table Tennis League: processLogTask: {"logId":"f835b5d1-6d29-48ca-ab9a-a2cfc65b2447","competitionId":"52ca4fd0-c00c-4d94-a8cb-9c5599e31160","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","tt365DataType":"standings"}: ON CONFLICT DO UPDATE command cannot affect row a second time
- 2026-03-23T00:46:38.213Z starting 87/190: Preston Table Tennis League (England / Lancashire), current_targets=3, history_targets=11
- 2026-03-23T00:47:06.360Z checkpoint (10 minute timer): completed=84, partial=2, in_progress=1, pending=103
- 2026-03-23T00:51:55.666Z completed 87/190: Preston Table Tennis League, current=3/3, history=11/11, overall=completed, jobs_processed=56, jobs_failed=0
- 2026-03-23T00:51:55.668Z starting 88/190: Southport Table Tennis League (England / Lancashire), current_targets=4, history_targets=15
- 2026-03-23T00:57:06.367Z checkpoint (10 minute timer): completed=85, partial=2, in_progress=1, pending=102
- 2026-03-23T01:05:46.994Z completed 88/190: Southport Table Tennis League, current=4/4, history=15/15, overall=completed, jobs_processed=76, jobs_failed=0
- 2026-03-23T01:05:46.999Z starting 89/190: Warrington Table Tennis League (England / Lancashire), current_targets=3, history_targets=10
- 2026-03-23T01:07:06.372Z checkpoint (10 minute timer): completed=86, partial=2, in_progress=1, pending=101
- 2026-03-23T01:12:57.365Z completed 89/190: Warrington Table Tennis League, current=3/3, history=10/10, overall=completed, jobs_processed=52, jobs_failed=0
- 2026-03-23T01:12:57.366Z starting 90/190: Hinckley Table Tennis League (England / Leicestershire), current_targets=4, history_targets=14
- 2026-03-23T01:17:06.325Z checkpoint (10 minute timer): completed=87, partial=2, in_progress=1, pending=100
- 2026-03-23T01:17:26.658Z completed 90/190: Hinckley Table Tennis League, current=4/4, history=14/14, overall=completed, jobs_processed=72, jobs_failed=0
- 2026-03-23T01:17:26.659Z starting 91/190: Leicester Table Tennis League (England / Leicestershire), current_targets=5, history_targets=21
- 2026-03-23T01:27:06.318Z checkpoint (10 minute timer): completed=88, partial=2, in_progress=1, pending=99
- 2026-03-23T01:37:06.313Z checkpoint (10 minute timer): completed=88, partial=2, in_progress=1, pending=99
- 2026-03-23T01:39:38.073Z completed 91/190: Leicester Table Tennis League, current=5/5, history=21/21, overall=completed, jobs_processed=104, jobs_failed=0
- 2026-03-23T01:39:38.074Z starting 92/190: Loughborough Table Tennis League (England / Leicestershire), current_targets=4, history_targets=20
- 2026-03-23T01:47:06.348Z checkpoint (10 minute timer): completed=89, partial=2, in_progress=1, pending=98
- 2026-03-23T01:53:32.074Z completed 92/190: Loughborough Table Tennis League, current=4/4, history=20/20, overall=completed, jobs_processed=96, jobs_failed=0
- 2026-03-23T01:53:32.076Z starting 93/190: Boston Table Tennis League (England / Lincolnshire), current_targets=2, history_targets=8
- 2026-03-23T01:57:06.349Z checkpoint (10 minute timer): completed=90, partial=2, in_progress=1, pending=97
- 2026-03-23T02:02:44.991Z completed 93/190: Boston Table Tennis League, current=2/2, history=8/8, overall=completed, jobs_processed=40, jobs_failed=0
- 2026-03-23T02:02:44.992Z starting 94/190: Gainsborough Table Tennis League (England / Lincolnshire), current_targets=1, history_targets=7
- 2026-03-23T02:07:06.356Z checkpoint (10 minute timer): completed=91, partial=2, in_progress=1, pending=96
- 2026-03-23T02:09:25.849Z completed 94/190: Gainsborough Table Tennis League, current=1/1, history=7/7, overall=completed, jobs_processed=402, jobs_failed=30
- 2026-03-23T02:09:25.850Z failure samples for Gainsborough Table Tennis League: scrapeUrlTask: {"url":"https://www.tabletennis365.com/Gainsborough/Results/Spring_2018/Division_1/MatchCard/285198","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"2d5cb6d6-196d-4b67-a31b-2ff1b1dc9bb8","tt365DataType":"matchcard","matchExternalId":"285198"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/Gainsborough/Results/Spring_2018/Division_1/MatchCard/285198 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Gainsborough/Results/Spring_2018/Division_1/MatchCard/285120","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"2d5cb6d6-196d-4b67-a31b-2ff1b1dc9bb8","tt365DataType":"matchcard","matchExternalId":"285120"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/Gainsborough/Results/Spring_2018/Division_1/MatchCard/285120 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Gainsborough/Results/Spring_2018/Division_1/MatchCard/284913","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"2d5cb6d6-196d-4b67-a31b-2ff1b1dc9bb8","tt365DataType":"matchcard","matchExternalId":"284913"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/Gainsborough/Results/Spring_2018/Division_1/MatchCard/284913 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Gainsborough/Results/Spring_2018/Division_1/MatchCard/284798","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"2d5cb6d6-196d-4b67-a31b-2ff1b1dc9bb8","tt365DataType":"matchcard","matchExternalId":"284798"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/Gainsborough/Results/Spring_2018/Division_1/MatchCard/284798 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Gainsborough/Results/Spring_2018/Division_1/MatchCard/267591","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"2d5cb6d6-196d-4b67-a31b-2ff1b1dc9bb8","tt365DataType":"matchcard","matchExternalId":"267591"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/Gainsborough/Results/Spring_2018/Division_1/MatchCard/267591
- 2026-03-23T02:09:25.852Z starting 95/190: Grantham Table Tennis League (England / Lincolnshire), current_targets=3, history_targets=9
- 2026-03-23T02:17:06.357Z checkpoint (10 minute timer): completed=92, partial=2, in_progress=1, pending=95
- 2026-03-23T02:20:03.634Z completed 95/190: Grantham Table Tennis League, current=3/3, history=9/9, overall=completed, jobs_processed=48, jobs_failed=0
- 2026-03-23T02:20:03.635Z starting 96/190: Grimsby and Cleethorpes Table Tennis League (England / Lincolnshire), current_targets=4, history_targets=20
- 2026-03-23T02:27:06.361Z checkpoint (10 minute timer): completed=93, partial=2, in_progress=1, pending=94
- 2026-03-23T02:29:41.364Z completed 96/190: Grimsby and Cleethorpes Table Tennis League, current=4/4, history=20/20, overall=completed, jobs_processed=95, jobs_failed=1
- 2026-03-23T02:29:41.365Z failure samples for Grimsby and Cleethorpes Table Tennis League: processLogTask: {"logId":"abbcad9c-0e8c-4f9d-bf8b-6713a022d3f8","competitionId":"321cd0c5-cce0-419f-9a32-75ace7f76878","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      1,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      1,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      2,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      2,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      3,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      3,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      4,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      4,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      5,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      5,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      6,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      6,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      7,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      7,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      8,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      8,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  }
]
- 2026-03-23T02:29:41.367Z starting 97/190: Lincoln Table Tennis League (England / Lincolnshire), current_targets=1, history_targets=5
- 2026-03-23T02:33:51.463Z completed 97/190: Lincoln Table Tennis League, current=1/1, history=5/5, overall=completed, jobs_processed=24, jobs_failed=0
- 2026-03-23T02:33:51.464Z starting 98/190: Spalding Table Tennis League (England / Lincolnshire), current_targets=1, history_targets=0
- 2026-03-23T02:33:51.580Z completed 98/190: Spalding Table Tennis League, current=1/1, history=0/0, overall=completed, jobs_processed=4, jobs_failed=0
- 2026-03-23T02:33:51.581Z starting 99/190: Stamford and Rutland Table Tennis League (England / Lincolnshire), current_targets=3, history_targets=11
- 2026-03-23T02:37:06.368Z checkpoint (10 minute timer): completed=96, partial=2, in_progress=1, pending=91
- 2026-03-23T02:37:22.519Z completed 99/190: Stamford and Rutland Table Tennis League, current=3/3, history=11/11, overall=completed, jobs_processed=56, jobs_failed=0
- 2026-03-23T02:37:22.520Z starting 100/190: Central London Table Tennis League (England / London and Middlesex), current_targets=7, history_targets=0
- 2026-03-23T02:44:43.909Z completed 100/190: Central London Table Tennis League, current=7/7, history=0/0, overall=completed, jobs_processed=27, jobs_failed=1
- 2026-03-23T02:44:43.909Z failure samples for Central London Table Tennis League: processLogTask: {"logId":"0a1dd66b-f054-4df8-a90c-14b097d1639a","competitionId":"a2f19a1f-e26b-4042-960c-f9e05e857adb","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      2,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      2,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      4,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      4,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      6,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      6,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  }
]
- 2026-03-23T02:44:43.914Z starting 101/190: London Banks and Civil Service Table Tennis League (England / London and Middlesex), current_targets=3, history_targets=17
- 2026-03-23T02:47:06.368Z checkpoint (10 minute timer): completed=98, partial=2, in_progress=1, pending=89
- 2026-03-23T02:57:06.375Z checkpoint (10 minute timer): completed=98, partial=2, in_progress=1, pending=89
- 2026-03-23T03:05:21.649Z completed 101/190: London Banks and Civil Service Table Tennis League, current=3/3, history=17/17, overall=completed, jobs_processed=2174, jobs_failed=0
- 2026-03-23T03:05:21.651Z starting 102/190: North Middlesex Table Tennis League (England / London and Middlesex), current_targets=3, history_targets=20
- 2026-03-23T03:07:06.378Z checkpoint (10 minute timer): completed=99, partial=2, in_progress=1, pending=88
- 2026-03-23T03:17:06.385Z checkpoint (10 minute timer): completed=99, partial=2, in_progress=1, pending=88
- 2026-03-23T03:20:53.328Z completed 102/190: North Middlesex Table Tennis League, current=3/3, history=20/20, overall=completed, jobs_processed=2250, jobs_failed=0
- 2026-03-23T03:20:53.330Z starting 103/190: South and West Middlesex Table Tennis League (England / London and Middlesex), current_targets=2, history_targets=10
- 2026-03-23T03:27:06.386Z checkpoint (10 minute timer): completed=100, partial=2, in_progress=1, pending=87
- 2026-03-23T03:28:29.036Z completed 103/190: South and West Middlesex Table Tennis League, current=2/2, history=10/10, overall=completed, jobs_processed=48, jobs_failed=0
- 2026-03-23T03:28:29.037Z starting 104/190: Staines Table Tennis League (England / London and Middlesex), current_targets=3, history_targets=15
- 2026-03-23T03:37:06.387Z checkpoint (10 minute timer): completed=101, partial=2, in_progress=1, pending=86
- 2026-03-23T03:37:50.867Z completed 104/190: Staines Table Tennis League, current=3/3, history=15/15, overall=completed, jobs_processed=72, jobs_failed=0
- 2026-03-23T03:37:50.871Z starting 105/190: Wembley and Harrow Table Tennis League (England / London and Middlesex), current_targets=8, history_targets=25
- 2026-03-23T03:47:06.397Z checkpoint (10 minute timer): completed=102, partial=2, in_progress=1, pending=85
- 2026-03-23T03:57:06.392Z checkpoint (10 minute timer): completed=102, partial=2, in_progress=1, pending=85
- 2026-03-23T04:07:06.389Z checkpoint (10 minute timer): completed=102, partial=2, in_progress=1, pending=85
- 2026-03-23T04:17:06.400Z checkpoint (10 minute timer): completed=102, partial=2, in_progress=1, pending=85
- 2026-03-23T04:25:12.998Z completed 105/190: Wembley and Harrow Table Tennis League, current=8/8, history=25/25, overall=completed, jobs_processed=5312, jobs_failed=0
- 2026-03-23T04:25:13.000Z starting 106/190: Midland Table Tennis League (England / Non-County), current_targets=3, history_targets=13
- 2026-03-23T04:27:06.392Z checkpoint (10 minute timer): completed=103, partial=2, in_progress=1, pending=84
- 2026-03-23T04:27:32.215Z completed 106/190: Midland Table Tennis League, current=3/3, history=13/13, overall=completed, jobs_processed=64, jobs_failed=0
- 2026-03-23T04:27:32.217Z starting 107/190: Dereham Table Tennis League (England / Norfolk), current_targets=3, history_targets=13
- 2026-03-23T04:31:13.552Z completed 107/190: Dereham Table Tennis League, current=3/3, history=13/13, overall=completed, jobs_processed=64, jobs_failed=0
- 2026-03-23T04:31:13.554Z starting 108/190: Diss Table Tennis League (England / Norfolk), current_targets=2, history_targets=12
- 2026-03-23T04:37:06.392Z checkpoint (10 minute timer): completed=105, partial=2, in_progress=1, pending=82
- 2026-03-23T04:45:48.879Z completed 108/190: Diss Table Tennis League, current=2/2, history=12/12, overall=completed, jobs_processed=1830, jobs_failed=35
- 2026-03-23T04:45:48.880Z failure samples for Diss Table Tennis League: scrapeUrlTask: {"url":"https://www.tabletennis365.com/Diss/Results/Winter_2014-15/Premier_Division/MatchCard/103934","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"5b284281-56ac-4438-b27b-566525c7a2de","tt365DataType":"matchcard","matchExternalId":"103934"}: HTTP 500 Internal Server Error when fetching https://www.tabletennis365.com/Diss/Results/Winter_2014-15/Premier_Division/MatchCard/103934 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Diss/Results/Winter_2014-15/Premier_Division/MatchCard/103942","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"5b284281-56ac-4438-b27b-566525c7a2de","tt365DataType":"matchcard","matchExternalId":"103942"}: HTTP 500 Internal Server Error when fetching https://www.tabletennis365.com/Diss/Results/Winter_2014-15/Premier_Division/MatchCard/103942 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Diss/Results/Winter_2014-15/Premier_Division/MatchCard/100690","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"5b284281-56ac-4438-b27b-566525c7a2de","tt365DataType":"matchcard","matchExternalId":"100690"}: HTTP 500 Internal Server Error when fetching https://www.tabletennis365.com/Diss/Results/Winter_2014-15/Premier_Division/MatchCard/100690 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Diss/Results/Winter_2014-15/Premier_Division/MatchCard/96512","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"5b284281-56ac-4438-b27b-566525c7a2de","tt365DataType":"matchcard","matchExternalId":"96512"}: HTTP 500 Internal Server Error when fetching https://www.tabletennis365.com/Diss/Results/Winter_2014-15/Premier_Division/MatchCard/96512 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Diss/Results/Winter_2014-15/Premier_Division/MatchCard/92846","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"5b284281-56ac-4438-b27b-566525c7a2de","tt365DataType":"matchcard","matchExternalId":"92846"}: HTTP 500 Internal Server Error when fetching https://www.tabletennis365.com/Diss/Results/Winter_2014-15/Premier_Division/MatchCard/92846
- 2026-03-23T04:45:48.883Z starting 109/190: Fakenham & District Table Tennis League (England / Norfolk), current_targets=1, history_targets=0
- 2026-03-23T04:46:15.203Z completed 109/190: Fakenham & District Table Tennis League, current=1/1, history=0/0, overall=completed, jobs_processed=4, jobs_failed=0
- 2026-03-23T04:46:15.204Z starting 110/190: Great Yarmouth Table Tennis League (England / Norfolk), current_targets=2, history_targets=10
- 2026-03-23T04:47:06.391Z checkpoint (10 minute timer): completed=107, partial=2, in_progress=1, pending=80
- 2026-03-23T04:49:23.137Z completed 110/190: Great Yarmouth Table Tennis League, current=2/2, history=10/10, overall=completed, jobs_processed=48, jobs_failed=0
- 2026-03-23T04:49:23.138Z starting 111/190: North Norfolk Table Tennis League (England / Norfolk), current_targets=4, history_targets=13
- 2026-03-23T04:55:34.595Z completed 111/190: North Norfolk Table Tennis League, current=4/4, history=13/13, overall=completed, jobs_processed=68, jobs_failed=0
- 2026-03-23T04:55:34.596Z starting 112/190: Norwich Table Tennis League (England / Norfolk), current_targets=6, history_targets=23
- 2026-03-23T04:57:06.383Z checkpoint (10 minute timer): completed=109, partial=2, in_progress=1, pending=78
- 2026-03-23T05:01:25.870Z completed 112/190: Norwich Table Tennis League, current=6/6, history=23/23, overall=completed, jobs_processed=112, jobs_failed=2
- 2026-03-23T05:01:25.870Z failure samples for Norwich Table Tennis League: Norwich Table Tennis League: matches Division 1: [
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      6,
      "matches",
      0,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      14,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  }
] | Norwich Table Tennis League: matches Division 3: [
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      6,
      "matches",
      0,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      14,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  }
]
- 2026-03-23T05:01:25.871Z starting 113/190: Wymondham Table Tennis League (England / Norfolk), current_targets=2, history_targets=1
- 2026-03-23T05:03:13.439Z completed 113/190: Wymondham Table Tennis League, current=2/2, history=1/1, overall=completed, jobs_processed=12, jobs_failed=0
- 2026-03-23T05:03:13.441Z starting 114/190: Daventry Table Tennis League (England / Northamptonshire), current_targets=2, history_targets=6
- 2026-03-23T05:06:13.022Z completed 114/190: Daventry Table Tennis League, current=2/2, history=6/6, overall=completed, jobs_processed=30, jobs_failed=1
- 2026-03-23T05:06:13.022Z failure samples for Daventry Table Tennis League: Daventry Table Tennis League: matches Handicap: [
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      1,
      "matches",
      2,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      1,
      "matches",
      2,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      1,
      "matches",
      3,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      1,
      "matches",
      3,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      2,
      "matches",
      0,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      2,
      "matches",
      0,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      2,
      "matches",
      1,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      2,
      "matches",
      1,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      3,
      "matches",
      0,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      3,
      "matches",
      0,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      10,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      10,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      11,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      11,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      12,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      12,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      13,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      13,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      14,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      14,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  }
]
- 2026-03-23T05:06:13.024Z starting 115/190: Kettering Table Tennis League (England / Northamptonshire), current_targets=5, history_targets=22
- 2026-03-23T05:07:06.377Z checkpoint (10 minute timer): completed=112, partial=2, in_progress=1, pending=75
- 2026-03-23T05:17:06.381Z checkpoint (10 minute timer): completed=112, partial=2, in_progress=1, pending=75
- 2026-03-23T05:18:15.918Z completed 115/190: Kettering Table Tennis League, current=5/5, history=22/22, overall=completed, jobs_processed=108, jobs_failed=0
- 2026-03-23T05:18:15.920Z starting 116/190: Northampton Table Tennis League (England / Northamptonshire), current_targets=3, history_targets=14
- 2026-03-23T05:27:06.384Z checkpoint (10 minute timer): completed=113, partial=2, in_progress=1, pending=74
- 2026-03-23T05:30:48.816Z completed 116/190: Northampton Table Tennis League, current=3/3, history=14/14, overall=completed, jobs_processed=68, jobs_failed=0
- 2026-03-23T05:30:48.817Z starting 117/190: Towcester Table Tennis League (England / Northamptonshire), current_targets=3, history_targets=12
- 2026-03-23T05:37:06.391Z checkpoint (10 minute timer): completed=114, partial=2, in_progress=1, pending=73
- 2026-03-23T05:39:04.018Z completed 117/190: Towcester Table Tennis League, current=3/3, history=12/12, overall=completed, jobs_processed=59, jobs_failed=1
- 2026-03-23T05:39:04.018Z failure samples for Towcester Table Tennis League: processLogTask: {"logId":"24bd05a3-e481-487c-b714-f5aaff790111","competitionId":"2de18b98-e085-4e0d-bdaf-81968f29b7a2","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      0,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      0,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  }
]
- 2026-03-23T05:39:04.019Z starting 118/190: Wellingborough Table Tennis League (England / Northamptonshire), current_targets=2, history_targets=9
- 2026-03-23T05:43:24.880Z completed 118/190: Wellingborough Table Tennis League, current=2/2, history=9/9, overall=completed, jobs_processed=44, jobs_failed=0
- 2026-03-23T05:43:24.882Z starting 119/190: Northumbria Table Tennis League (England / Northumberland), current_targets=4, history_targets=10
- 2026-03-23T05:47:06.383Z checkpoint (10 minute timer): completed=116, partial=2, in_progress=1, pending=71
- 2026-03-23T05:51:58.316Z completed 119/190: Northumbria Table Tennis League, current=4/4, history=10/10, overall=completed, jobs_processed=56, jobs_failed=0
- 2026-03-23T05:51:58.318Z starting 120/190: Mansfield Table Tennis League (England / Nottinghamshire), current_targets=2, history_targets=10
- 2026-03-23T05:57:06.382Z checkpoint (10 minute timer): completed=117, partial=2, in_progress=1, pending=70
- 2026-03-23T05:58:00.281Z completed 120/190: Mansfield Table Tennis League, current=2/2, history=10/10, overall=completed, jobs_processed=48, jobs_failed=0
- 2026-03-23T05:58:00.285Z starting 121/190: Nottingham Table Tennis League (England / Nottinghamshire), current_targets=4, history_targets=12
- 2026-03-23T06:07:06.407Z checkpoint (10 minute timer): completed=118, partial=3, in_progress=1, pending=68
- 2026-03-23T06:12:58.523Z completed 121/190: Nottingham Table Tennis League, current=4/4, history=12/12, overall=completed, jobs_processed=64, jobs_failed=0
- 2026-03-23T06:12:58.525Z starting 122/190: Retford Table Tennis League (England / Nottinghamshire), current_targets=1, history_targets=5
- 2026-03-23T06:15:58.347Z completed 122/190: Retford Table Tennis League, current=1/1, history=5/5, overall=completed, jobs_processed=24, jobs_failed=0
- 2026-03-23T06:15:58.348Z starting 123/190: Table Tennis Nottingham (England / Nottinghamshire), current_targets=4, history_targets=12
- 2026-03-23T06:16:01.004Z completed 123/190: Table Tennis Nottingham, current=4/4, history=12/12, overall=completed, jobs_processed=64, jobs_failed=0
- 2026-03-23T06:16:01.007Z starting 124/190: Banbury Table Tennis League (England / Oxfordshire), current_targets=4, history_targets=15
- 2026-03-23T06:17:06.407Z checkpoint (10 minute timer): completed=121, partial=2, in_progress=1, pending=66
- 2026-03-23T06:22:51.810Z completed 124/190: Banbury Table Tennis League, current=4/4, history=15/15, overall=completed, jobs_processed=76, jobs_failed=0
- 2026-03-23T06:22:51.812Z starting 125/190: Didcot Table Tennis League (England / Oxfordshire), current_targets=3, history_targets=14
- 2026-03-23T06:27:06.417Z checkpoint (10 minute timer): completed=122, partial=2, in_progress=1, pending=65
- 2026-03-23T06:37:06.372Z checkpoint (10 minute timer): completed=122, partial=2, in_progress=1, pending=65
- 2026-03-23T06:38:22.654Z completed 125/190: Didcot Table Tennis League, current=3/3, history=14/14, overall=completed, jobs_processed=68, jobs_failed=0
- 2026-03-23T06:38:22.656Z starting 126/190: Oxford Table Tennis League (England / Oxfordshire), current_targets=3, history_targets=11
- 2026-03-23T06:45:48.722Z completed 126/190: Oxford Table Tennis League, current=3/3, history=11/11, overall=completed, jobs_processed=56, jobs_failed=0
- 2026-03-23T06:45:48.724Z starting 127/190: Oswestry Table Tennis League (England / Shropshire), current_targets=2, history_targets=10
- 2026-03-23T06:47:06.364Z checkpoint (10 minute timer): completed=124, partial=2, in_progress=1, pending=63
- 2026-03-23T06:52:02.057Z completed 127/190: Oswestry Table Tennis League, current=2/2, history=10/10, overall=completed, jobs_processed=48, jobs_failed=0
- 2026-03-23T06:52:02.059Z starting 128/190: Shrewsbury Table Tennis League (England / Shropshire), current_targets=3, history_targets=18
- 2026-03-23T06:57:06.356Z checkpoint (10 minute timer): completed=125, partial=2, in_progress=1, pending=62
- 2026-03-23T07:07:03.327Z completed 128/190: Shrewsbury Table Tennis League, current=3/3, history=18/18, overall=completed, jobs_processed=2242, jobs_failed=0
- 2026-03-23T07:07:03.328Z starting 129/190: Telford Table Tennis League (England / Shropshire), current_targets=2, history_targets=12
- 2026-03-23T07:07:06.348Z checkpoint (10 minute timer): completed=126, partial=2, in_progress=1, pending=61
- 2026-03-23T07:14:37.872Z completed 129/190: Telford Table Tennis League, current=2/2, history=12/12, overall=completed, jobs_processed=1134, jobs_failed=0
- 2026-03-23T07:14:37.873Z starting 130/190: Bridgwater Table Tennis League (England / Somerset), current_targets=3, history_targets=15
- 2026-03-23T07:17:06.395Z checkpoint (10 minute timer): completed=127, partial=2, in_progress=1, pending=60
- 2026-03-23T07:27:06.397Z checkpoint (10 minute timer): completed=127, partial=2, in_progress=1, pending=60
- 2026-03-23T07:29:23.412Z completed 130/190: Bridgwater Table Tennis League, current=3/3, history=15/15, overall=completed, jobs_processed=72, jobs_failed=0
- 2026-03-23T07:29:23.414Z starting 131/190: Mendip Table Tennis League (England / Somerset), current_targets=3, history_targets=7
- 2026-03-23T07:34:00.866Z completed 131/190: Mendip Table Tennis League, current=3/3, history=7/7, overall=completed, jobs_processed=40, jobs_failed=0
- 2026-03-23T07:34:00.867Z starting 132/190: West Somerset Table Tennis League (England / Somerset), current_targets=2, history_targets=1
- 2026-03-23T07:35:17.764Z completed 132/190: West Somerset Table Tennis League, current=2/2, history=1/1, overall=completed, jobs_processed=12, jobs_failed=0
- 2026-03-23T07:35:17.767Z starting 133/190: Yeovil & District Table Tennis League (England / Somerset), current_targets=3, history_targets=12
- 2026-03-23T07:37:06.402Z checkpoint (10 minute timer): completed=130, partial=2, in_progress=1, pending=57
- 2026-03-23T07:44:08.940Z completed 133/190: Yeovil & District Table Tennis League, current=3/3, history=12/12, overall=completed, jobs_processed=60, jobs_failed=0
- 2026-03-23T07:44:08.943Z starting 134/190: Potteries Table Tennis League (England / Staffordshire), current_targets=3, history_targets=11
- 2026-03-23T07:47:06.395Z checkpoint (10 minute timer): completed=131, partial=2, in_progress=1, pending=56
- 2026-03-23T07:52:45.639Z completed 134/190: Potteries Table Tennis League, current=3/3, history=11/11, overall=completed, jobs_processed=56, jobs_failed=0
- 2026-03-23T07:52:45.641Z starting 135/190: Stafford Table Tennis League (England / Staffordshire), current_targets=2, history_targets=6
- 2026-03-23T07:56:23.869Z completed 135/190: Stafford Table Tennis League, current=2/2, history=6/6, overall=completed, jobs_processed=32, jobs_failed=0
- 2026-03-23T07:56:23.870Z starting 136/190: Stone Table Tennis League (England / Staffordshire), current_targets=1, history_targets=5
- 2026-03-23T07:57:06.398Z checkpoint (10 minute timer): completed=133, partial=2, in_progress=1, pending=54
- 2026-03-23T07:59:46.474Z completed 136/190: Stone Table Tennis League, current=1/1, history=5/5, overall=completed, jobs_processed=24, jobs_failed=0
- 2026-03-23T07:59:46.477Z starting 137/190: Tamworth Table Tennis League (England / Staffordshire), current_targets=3, history_targets=15
- 2026-03-23T08:07:06.401Z checkpoint (10 minute timer): completed=134, partial=2, in_progress=1, pending=53
- 2026-03-23T08:13:58.083Z completed 137/190: Tamworth Table Tennis League, current=3/3, history=15/15, overall=completed, jobs_processed=72, jobs_failed=0
- 2026-03-23T08:13:58.084Z starting 138/190: Walsall Table Tennis League (England / Staffordshire), current_targets=3, history_targets=3
- 2026-03-23T08:17:06.405Z checkpoint (10 minute timer): completed=135, partial=2, in_progress=1, pending=52
- 2026-03-23T08:18:39.178Z completed 138/190: Walsall Table Tennis League, current=3/3, history=3/3, overall=completed, jobs_processed=23, jobs_failed=1
- 2026-03-23T08:18:39.178Z failure samples for Walsall Table Tennis League: processLogTask: {"logId":"d6ae9c64-8243-40c1-98e8-b9712c4ccd46","competitionId":"e34e5202-8eb3-418b-9f52-0c9836f0813e","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      5,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      5,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      6,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      6,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      7,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      7,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      8,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      8,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      9,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      9,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  }
]
- 2026-03-23T08:18:39.180Z starting 139/190: Wolverhampton & District Table Tennis Association (England / Staffordshire), current_targets=6, history_targets=21
- 2026-03-23T08:27:06.410Z checkpoint (10 minute timer): completed=136, partial=2, in_progress=1, pending=51
- 2026-03-23T08:37:06.421Z checkpoint (10 minute timer): completed=136, partial=2, in_progress=1, pending=51
- 2026-03-23T08:39:26.101Z completed 139/190: Wolverhampton & District Table Tennis Association, current=6/6, history=21/21, overall=completed, jobs_processed=2080, jobs_failed=0
- 2026-03-23T08:39:26.106Z starting 140/190: Bury St Edmunds Table Tennis League (England / Suffolk), current_targets=3, history_targets=15
- 2026-03-23T08:47:06.425Z checkpoint (10 minute timer): completed=137, partial=2, in_progress=1, pending=50
- 2026-03-23T08:50:06.597Z completed 140/190: Bury St Edmunds Table Tennis League, current=3/3, history=15/15, overall=completed, jobs_processed=72, jobs_failed=0
- 2026-03-23T08:50:06.599Z starting 141/190: Suffolk and Cambs Junior Table Tennis League (England / Suffolk), current_targets=2, history_targets=0
- 2026-03-23T08:50:27.454Z completed 141/190: Suffolk and Cambs Junior Table Tennis League, current=2/2, history=0/0, overall=completed, jobs_processed=8, jobs_failed=0
- 2026-03-23T08:50:27.455Z starting 142/190: Croydon Table Tennis League (England / Surrey), current_targets=3, history_targets=24
- 2026-03-23T08:57:06.427Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T09:07:06.437Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T09:17:06.431Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T09:27:06.425Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T09:37:06.433Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T09:47:06.447Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T09:57:06.453Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T10:07:06.454Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T10:17:06.458Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T10:27:06.425Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T10:37:06.423Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T10:47:06.426Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T10:57:06.400Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T11:07:06.393Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T11:17:06.388Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T11:27:06.446Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T11:37:06.457Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T11:47:06.467Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T11:57:06.475Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T12:07:06.426Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T12:17:06.426Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T12:27:06.424Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T12:37:06.435Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T12:47:06.434Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T12:57:06.429Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T13:07:06.467Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T13:17:06.472Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T13:27:06.478Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T13:37:06.481Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T13:47:06.475Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T13:57:06.480Z checkpoint (10 minute timer): completed=139, partial=2, in_progress=1, pending=48
- 2026-03-23T14:05:19.050Z completed 142/190: Croydon Table Tennis League, current=3/3, history=24/24, overall=completed, jobs_processed=110, jobs_failed=1754
- 2026-03-23T14:05:19.050Z failure samples for Croydon Table Tennis League: scrapeUrlTask: {"url":"https://www.tabletennis365.com/Croydon/Results/Croydon_Winter_League_2025-2026/Division_1/MatchCard/460407","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"f58e6d79-6a1a-4605-97c5-4f5943883351","tt365DataType":"matchcard","matchExternalId":"460407"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/Croydon/Results/Croydon_Winter_League_2025-2026/Division_1/MatchCard/460407 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Croydon/Results/Croydon_Winter_League_2025-2026/Division_1/MatchCard/460404","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"f58e6d79-6a1a-4605-97c5-4f5943883351","tt365DataType":"matchcard","matchExternalId":"460404"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/Croydon/Results/Croydon_Winter_League_2025-2026/Division_1/MatchCard/460404 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Croydon/Results/Croydon_Winter_League_2025-2026/Division_1/MatchCard/460402","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"f58e6d79-6a1a-4605-97c5-4f5943883351","tt365DataType":"matchcard","matchExternalId":"460402"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/Croydon/Results/Croydon_Winter_League_2025-2026/Division_1/MatchCard/460402 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Croydon/Results/Croydon_Winter_League_2025-2026/Division_1/MatchCard/460300","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"f58e6d79-6a1a-4605-97c5-4f5943883351","tt365DataType":"matchcard","matchExternalId":"460300"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/Croydon/Results/Croydon_Winter_League_2025-2026/Division_1/MatchCard/460300 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Croydon/Results/Croydon_Winter_League_2025-2026/Division_1/MatchCard/458936","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"f58e6d79-6a1a-4605-97c5-4f5943883351","tt365DataType":"matchcard","matchExternalId":"458936"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/Croydon/Results/Croydon_Winter_League_2025-2026/Division_1/MatchCard/458936
- 2026-03-23T14:05:19.052Z starting 143/190: Guildford Table Tennis League (England / Surrey), current_targets=5, history_targets=25
- 2026-03-23T14:07:06.478Z checkpoint (10 minute timer): completed=140, partial=2, in_progress=1, pending=47
- 2026-03-23T14:17:06.462Z checkpoint (10 minute timer): completed=140, partial=2, in_progress=1, pending=47
- 2026-03-23T14:22:53.081Z completed 143/190: Guildford Table Tennis League, current=5/5, history=25/25, overall=completed, jobs_processed=120, jobs_failed=0
- 2026-03-23T14:22:53.082Z starting 144/190: Haslemere Table Tennis League (England / Surrey), current_targets=3, history_targets=9
- 2026-03-23T14:27:06.460Z checkpoint (10 minute timer): completed=141, partial=2, in_progress=1, pending=46
- 2026-03-23T14:28:10.596Z completed 144/190: Haslemere Table Tennis League, current=3/3, history=9/9, overall=completed, jobs_processed=48, jobs_failed=0
- 2026-03-23T14:28:10.598Z starting 145/190: Reigate and Redhill Table Tennis League (England / Surrey), current_targets=4, history_targets=18
- 2026-03-23T14:37:06.462Z checkpoint (10 minute timer): completed=142, partial=2, in_progress=1, pending=45
- 2026-03-23T14:39:36.272Z completed 145/190: Reigate and Redhill Table Tennis League, current=4/4, history=18/18, overall=completed, jobs_processed=88, jobs_failed=0
- 2026-03-23T14:39:36.274Z starting 146/190: Thames Valley Table Tennis League (England / Surrey), current_targets=3, history_targets=15
- 2026-03-23T14:47:06.461Z checkpoint (10 minute timer): completed=143, partial=2, in_progress=1, pending=44
- 2026-03-23T14:51:21.425Z completed 146/190: Thames Valley Table Tennis League, current=3/3, history=15/15, overall=completed, jobs_processed=72, jobs_failed=0
- 2026-03-23T14:51:21.427Z starting 147/190: Wandsworth & District Table Tennis League (England / Surrey), current_targets=4, history_targets=6
- 2026-03-23T14:53:16.530Z completed 147/190: Wandsworth & District Table Tennis League, current=4/4, history=6/6, overall=completed, jobs_processed=38, jobs_failed=1
- 2026-03-23T14:53:16.530Z failure samples for Wandsworth & District Table Tennis League: Wandsworth & District Table Tennis League: matches IMS 2025: [
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      3,
      "matches",
      0,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      14,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  }
]
- 2026-03-23T14:53:16.531Z starting 148/190: Brighton Table Tennis League (England / Sussex), current_targets=4, history_targets=14
- 2026-03-23T14:57:06.474Z checkpoint (10 minute timer): completed=145, partial=2, in_progress=1, pending=42
- 2026-03-23T15:05:13.778Z completed 148/190: Brighton Table Tennis League, current=4/4, history=14/14, overall=completed, jobs_processed=72, jobs_failed=0
- 2026-03-23T15:05:13.779Z starting 149/190: Crawley and Horsham Table Tennis League (England / Sussex), current_targets=3, history_targets=15
- 2026-03-23T15:07:06.480Z checkpoint (10 minute timer): completed=146, partial=2, in_progress=1, pending=41
- 2026-03-23T15:17:06.482Z checkpoint (10 minute timer): completed=146, partial=2, in_progress=1, pending=41
- 2026-03-23T15:21:36.478Z completed 149/190: Crawley and Horsham Table Tennis League, current=3/3, history=15/15, overall=completed, jobs_processed=72, jobs_failed=0
- 2026-03-23T15:21:36.479Z starting 150/190: East Grinstead Table Tennis League (England / Sussex), current_targets=2, history_targets=8
- 2026-03-23T15:27:06.483Z checkpoint (10 minute timer): completed=147, partial=2, in_progress=1, pending=40
- 2026-03-23T15:27:41.123Z completed 150/190: East Grinstead Table Tennis League, current=2/2, history=8/8, overall=completed, jobs_processed=40, jobs_failed=0
- 2026-03-23T15:27:41.124Z starting 151/190: Eastbourne Table Tennis League (England / Sussex), current_targets=3, history_targets=14
- 2026-03-23T15:37:06.486Z checkpoint (10 minute timer): completed=148, partial=2, in_progress=1, pending=39
- 2026-03-23T15:39:57.299Z completed 151/190: Eastbourne Table Tennis League, current=3/3, history=14/14, overall=completed, jobs_processed=68, jobs_failed=0
- 2026-03-23T15:39:57.301Z starting 152/190: Hastings Table Tennis League (England / Sussex), current_targets=4, history_targets=15
- 2026-03-23T15:47:06.488Z checkpoint (10 minute timer): completed=149, partial=2, in_progress=1, pending=38
- 2026-03-23T15:56:20.043Z completed 152/190: Hastings Table Tennis League, current=4/4, history=15/15, overall=completed, jobs_processed=2242, jobs_failed=0
- 2026-03-23T15:56:20.045Z starting 153/190: Haywards Heath Table Tennis League (England / Sussex), current_targets=2, history_targets=17
- 2026-03-23T15:57:06.490Z checkpoint (10 minute timer): completed=150, partial=2, in_progress=1, pending=37
- 2026-03-23T16:07:06.492Z checkpoint (10 minute timer): completed=150, partial=2, in_progress=1, pending=37
- 2026-03-23T16:10:57.114Z completed 153/190: Haywards Heath Table Tennis League, current=2/2, history=17/17, overall=completed, jobs_processed=2470, jobs_failed=0
- 2026-03-23T16:10:57.116Z starting 154/190: Worthing Table Tennis League (England / Sussex), current_targets=4, history_targets=15
- 2026-03-23T16:17:06.496Z checkpoint (10 minute timer): completed=151, partial=2, in_progress=1, pending=36
- 2026-03-23T16:21:52.852Z completed 154/190: Worthing Table Tennis League, current=4/4, history=15/15, overall=completed, jobs_processed=76, jobs_failed=0
- 2026-03-23T16:21:52.853Z starting 155/190: Birmingham Solihull & District Table Tennis Association (England / Warwickshire), current_targets=5, history_targets=24
- 2026-03-23T16:27:06.500Z checkpoint (10 minute timer): completed=152, partial=2, in_progress=1, pending=35
- 2026-03-23T16:36:59.995Z completed 155/190: Birmingham Solihull & District Table Tennis Association, current=5/5, history=24/24, overall=completed, jobs_processed=115, jobs_failed=1
- 2026-03-23T16:36:59.995Z failure samples for Birmingham Solihull & District Table Tennis Association: processLogTask: {"logId":"6ffe1574-3e62-4c99-b63d-1ff47329581c","competitionId":"85e6c61c-86fb-44be-b9e6-741057b88eda","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: Team not found for fixture 1030110: home=85665 (50468402-bbe7-4ddc-b047-bfdf26f61bf3), away=85674 (undefined)
- 2026-03-23T16:36:59.997Z starting 156/190: Coventry Table Tennis League (England / Warwickshire), current_targets=6, history_targets=19
- 2026-03-23T16:37:06.499Z checkpoint (10 minute timer): completed=153, partial=2, in_progress=1, pending=34
- 2026-03-23T16:42:40.332Z completed 156/190: Coventry Table Tennis League, current=6/6, history=19/19, overall=completed, jobs_processed=100, jobs_failed=0
- 2026-03-23T16:42:40.334Z starting 157/190: Leamington Table Tennis League (England / Warwickshire), current_targets=6, history_targets=22
- 2026-03-23T16:47:06.483Z checkpoint (10 minute timer): completed=154, partial=2, in_progress=1, pending=33
- 2026-03-23T16:52:27.343Z completed 157/190: Leamington Table Tennis League, current=6/6, history=22/22, overall=completed, jobs_processed=112, jobs_failed=0
- 2026-03-23T16:52:27.345Z starting 158/190: Nuneaton Table Tennis League (England / Warwickshire), current_targets=3, history_targets=15
- 2026-03-23T16:57:06.467Z checkpoint (10 minute timer): completed=155, partial=2, in_progress=1, pending=32
- 2026-03-23T17:00:36.789Z completed 158/190: Nuneaton Table Tennis League, current=3/3, history=15/15, overall=completed, jobs_processed=71, jobs_failed=1
- 2026-03-23T17:00:36.790Z failure samples for Nuneaton Table Tennis League: processLogTask: {"logId":"eedb9898-fa2c-4c39-ba4c-084f765ce42e","competitionId":"d1105469-e7f5-4e0d-ac73-a007c58d028c","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      7,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      7,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  }
]
- 2026-03-23T17:00:36.791Z starting 159/190: Devizes Table Tennis League (England / Wiltshire), current_targets=3, history_targets=10
- 2026-03-23T17:07:06.464Z checkpoint (10 minute timer): completed=156, partial=2, in_progress=1, pending=31
- 2026-03-23T17:08:19.907Z completed 159/190: Devizes Table Tennis League, current=3/3, history=10/10, overall=completed, jobs_processed=52, jobs_failed=0
- 2026-03-23T17:08:19.908Z starting 160/190: Swindon Table Tennis League (England / Wiltshire), current_targets=3, history_targets=9
- 2026-03-23T17:13:27.354Z completed 160/190: Swindon Table Tennis League, current=3/3, history=9/9, overall=completed, jobs_processed=48, jobs_failed=0
- 2026-03-23T17:13:27.355Z starting 161/190: West Wilts Table Tennis League (England / Wiltshire), current_targets=4, history_targets=15
- 2026-03-23T17:17:06.500Z checkpoint (10 minute timer): completed=158, partial=2, in_progress=1, pending=29
- 2026-03-23T17:26:08.171Z completed 161/190: West Wilts Table Tennis League, current=4/4, history=15/15, overall=completed, jobs_processed=76, jobs_failed=0
- 2026-03-23T17:26:08.173Z starting 162/190: Bromsgrove Redditch & District Table Tennis League (England / Worcestershire), current_targets=3, history_targets=12
- 2026-03-23T17:27:06.503Z checkpoint (10 minute timer): completed=159, partial=2, in_progress=1, pending=28
- 2026-03-23T17:32:58.620Z completed 162/190: Bromsgrove Redditch & District Table Tennis League, current=3/3, history=12/12, overall=completed, jobs_processed=60, jobs_failed=0
- 2026-03-23T17:32:58.622Z starting 163/190: Dudley Table Tennis League (England / Worcestershire), current_targets=2, history_targets=6
- 2026-03-23T17:35:20.103Z completed 163/190: Dudley Table Tennis League, current=2/2, history=6/6, overall=completed, jobs_processed=31, jobs_failed=1
- 2026-03-23T17:35:20.104Z failure samples for Dudley Table Tennis League: processLogTask: {"logId":"4a7e9b5a-28a2-48d2-a6eb-a1b9a60de0c6","competitionId":"0b89f47c-7d5c-4f2c-b462-6b8e0ad428d5","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      1,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      1,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      2,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      2,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      3,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      3,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      4,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      4,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      5,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      5,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      6,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      6,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      7,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      7,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      8,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      8,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      9,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      9,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  }
]
- 2026-03-23T17:35:20.105Z starting 164/190: Evesham Table Tennis League (England / Worcestershire), current_targets=2, history_targets=10
- 2026-03-23T17:37:06.503Z checkpoint (10 minute timer): completed=161, partial=2, in_progress=1, pending=26
- 2026-03-23T17:42:35.440Z completed 164/190: Evesham Table Tennis League, current=2/2, history=10/10, overall=completed, jobs_processed=48, jobs_failed=0
- 2026-03-23T17:42:35.442Z starting 165/190: Kidderminster & District Table Tennis League (England / Worcestershire), current_targets=3, history_targets=17
- 2026-03-23T17:47:06.508Z checkpoint (10 minute timer): completed=162, partial=2, in_progress=1, pending=25
- 2026-03-23T17:57:06.503Z checkpoint (10 minute timer): completed=162, partial=2, in_progress=1, pending=25
- 2026-03-23T18:05:26.325Z completed 165/190: Kidderminster & District Table Tennis League, current=3/3, history=17/17, overall=completed, jobs_processed=3378, jobs_failed=0
- 2026-03-23T18:05:26.327Z starting 166/190: Malvern Table Tennis League (England / Worcestershire), current_targets=3, history_targets=11
- 2026-03-23T18:07:06.504Z checkpoint (10 minute timer): completed=163, partial=2, in_progress=1, pending=24
- 2026-03-23T18:15:40.738Z completed 166/190: Malvern Table Tennis League, current=3/3, history=11/11, overall=completed, jobs_processed=56, jobs_failed=0
- 2026-03-23T18:15:40.746Z starting 167/190: Worcester Table Tennis League (England / Worcestershire), current_targets=4, history_targets=12
- 2026-03-23T18:17:06.513Z checkpoint (10 minute timer): completed=164, partial=2, in_progress=1, pending=23
- 2026-03-23T18:24:28.526Z completed 167/190: Worcester Table Tennis League, current=4/4, history=12/12, overall=completed, jobs_processed=64, jobs_failed=0
- 2026-03-23T18:24:28.528Z starting 168/190: Barnsley Table Tennis League (England / Yorkshire), current_targets=1, history_targets=5
- 2026-03-23T18:27:06.511Z checkpoint (10 minute timer): completed=165, partial=2, in_progress=1, pending=22
- 2026-03-23T18:28:05.738Z completed 168/190: Barnsley Table Tennis League, current=1/1, history=5/5, overall=completed, jobs_processed=24, jobs_failed=0
- 2026-03-23T18:28:05.739Z starting 169/190: Bradford Table Tennis League (England / Yorkshire), current_targets=4, history_targets=13
- 2026-03-23T18:37:06.512Z checkpoint (10 minute timer): completed=166, partial=2, in_progress=1, pending=21
- 2026-03-23T18:39:09.378Z completed 169/190: Bradford Table Tennis League, current=4/4, history=13/13, overall=completed, jobs_processed=65, jobs_failed=2
- 2026-03-23T18:39:09.378Z failure samples for Bradford Table Tennis League: Bradford Table Tennis League: matches Theobould Handicap Competition 2025/26: [
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      0,
      "matches",
      0,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      0,
      "matches",
      0,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      0,
      "matches",
      1,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      0,
      "matches",
      1,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      0,
      "matches",
      2,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      0,
      "matches",
      2,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      0,
      "matches",
      3,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      0,
      "matches",
      3,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      1,
      "matches",
      0,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      1,
      "matches",
      0,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      1,
      "matches",
      1,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      1,
      "matches",
      1,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      2,
      "matches",
      0,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      2,
      "matches",
      0,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      6,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      6,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      7,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      7,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      8,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      8,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      9,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      9,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      10,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      10,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      11,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      11,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      12,
      "home"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      12,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  }
] | processLogTask: {"logId":"5a5a097a-63f8-429b-ae59-ddc0044ee4c9","competitionId":"548f24c4-8092-4c83-816b-88cc91de1673","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: Fixture not found for rubber 4895287: matchExternalId=475161
- 2026-03-23T18:39:09.379Z starting 170/190: Castleford and Pontefract Table Tennis League (England / Yorkshire), current_targets=2, history_targets=10
- 2026-03-23T18:45:19.104Z completed 170/190: Castleford and Pontefract Table Tennis League, current=2/2, history=10/10, overall=completed, jobs_processed=48, jobs_failed=0
- 2026-03-23T18:45:19.106Z starting 171/190: Dewsbury Table Tennis League (England / Yorkshire), current_targets=2, history_targets=0
- 2026-03-23T18:45:35.653Z completed 171/190: Dewsbury Table Tennis League, current=2/2, history=0/0, overall=completed, jobs_processed=7, jobs_failed=1
- 2026-03-23T18:45:35.653Z failure samples for Dewsbury Table Tennis League: processLogTask: {"logId":"10826724-04c0-4b39-9757-570271b6c537","competitionId":"34523f75-fb64-4b5a-a3cb-ca05b708f39a","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      2,
      "homeScore"
    ],
    "message": "Invalid input: expected number, received null"
  },
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      2,
      "awayScore"
    ],
    "message": "Invalid input: expected number, received null"
  }
]
- 2026-03-23T18:45:35.655Z starting 172/190: Doncaster Table Tennis League (England / Yorkshire), current_targets=1, history_targets=5
- 2026-03-23T18:47:06.510Z checkpoint (10 minute timer): completed=169, partial=2, in_progress=1, pending=18
- 2026-03-23T18:48:04.454Z completed 172/190: Doncaster Table Tennis League, current=1/1, history=5/5, overall=completed, jobs_processed=24, jobs_failed=0
- 2026-03-23T18:48:04.455Z starting 173/190: Halifax Table Tennis League (England / Yorkshire), current_targets=3, history_targets=25
- 2026-03-23T18:57:06.513Z checkpoint (10 minute timer): completed=170, partial=2, in_progress=1, pending=17
- 2026-03-23T19:07:06.521Z checkpoint (10 minute timer): completed=170, partial=2, in_progress=1, pending=17
- 2026-03-23T19:16:04.095Z completed 173/190: Halifax Table Tennis League, current=3/3, history=25/25, overall=completed, jobs_processed=4575, jobs_failed=2
- 2026-03-23T19:16:04.096Z failure samples for Halifax Table Tennis League: scrapeUrlTask: {"url":"https://www.tabletennis365.com/Halifax/Results/Winter_2014-15/Division_1/MatchCard/92351","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"ce276652-154c-4a37-8c1d-86ce3719ba01","tt365DataType":"matchcard","matchExternalId":"92351"}: HTTP 500 Internal Server Error when fetching https://www.tabletennis365.com/Halifax/Results/Winter_2014-15/Division_1/MatchCard/92351 | processLogTask: {"logId":"75a04f2f-04f6-4755-be45-f76d48f78410","competitionId":"1c2c4ffb-0aaf-4921-a794-ba1f2761fb9b","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","tt365DataType":"standings"}: ON CONFLICT DO UPDATE command cannot affect row a second time
- 2026-03-23T19:16:04.097Z starting 174/190: Harrogate Table Tennis League (England / Yorkshire), current_targets=5, history_targets=25
- 2026-03-23T19:17:06.520Z checkpoint (10 minute timer): completed=171, partial=2, in_progress=1, pending=16
- 2026-03-23T19:27:06.523Z checkpoint (10 minute timer): completed=171, partial=2, in_progress=1, pending=16
- 2026-03-23T19:37:06.532Z checkpoint (10 minute timer): completed=171, partial=2, in_progress=1, pending=16
- 2026-03-23T19:47:06.519Z checkpoint (10 minute timer): completed=171, partial=2, in_progress=1, pending=16
- 2026-03-23T19:57:06.524Z checkpoint (10 minute timer): completed=171, partial=2, in_progress=1, pending=16
- 2026-03-23T20:14:01.625Z checkpoint (10 minute timer): completed=171, partial=2, in_progress=1, pending=16
- 2026-03-23T20:31:53.619Z checkpoint (10 minute timer): completed=171, partial=2, in_progress=1, pending=16
- 2026-03-23T20:59:06.813Z checkpoint (10 minute timer): completed=171, partial=2, in_progress=1, pending=16
- 2026-03-23T21:09:06.803Z checkpoint (10 minute timer): completed=171, partial=2, in_progress=1, pending=16
- 2026-03-23T21:24:35.026Z checkpoint (10 minute timer): completed=171, partial=2, in_progress=1, pending=16
- 2026-03-23T21:41:07.613Z checkpoint (10 minute timer): completed=171, partial=2, in_progress=1, pending=16
- 2026-03-23T22:23:55.184Z checkpoint (10 minute timer): completed=171, partial=2, in_progress=1, pending=16
- 2026-03-23T22:46:47.947Z checkpoint (10 minute timer): completed=171, partial=2, in_progress=1, pending=16
- 2026-03-23T22:47:49.093Z completed 174/190: Harrogate Table Tennis League, current=5/5, history=25/25, overall=completed, jobs_processed=5272, jobs_failed=0
- 2026-03-23T22:47:49.095Z starting 175/190: Hull Table Tennis League (England / Yorkshire), current_targets=4, history_targets=24
- 2026-03-23T22:57:00.274Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T01:07:08.847Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T01:17:08.846Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T01:27:08.850Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T01:37:08.857Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T01:47:08.858Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T01:57:08.858Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T02:39:55.556Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T04:37:35.999Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T04:47:36.001Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T04:57:36.006Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T05:07:36.049Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T05:17:36.027Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T05:27:36.033Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T05:37:36.036Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T06:02:35.227Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T06:12:35.228Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T06:22:35.219Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T06:32:35.234Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T06:42:35.222Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T06:52:35.233Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T08:40:35.735Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T08:50:35.735Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T09:00:35.729Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T09:10:35.754Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T09:20:35.758Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T09:30:35.762Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T10:21:47.347Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T10:31:47.353Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T10:41:47.358Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T10:51:47.360Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T11:01:47.272Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T11:11:47.255Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T11:21:47.247Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T11:55:33.907Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T12:05:33.906Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T12:15:33.935Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T12:25:33.939Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T12:35:33.944Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T12:45:33.963Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T13:28:34.876Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T13:41:26.064Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T14:02:49.620Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T14:12:49.467Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T14:22:49.458Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T14:32:49.447Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T14:42:49.517Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T14:52:49.520Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T15:02:49.523Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T15:45:30.633Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T15:55:30.642Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T16:05:30.601Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T16:15:30.584Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T16:25:30.589Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T16:35:30.586Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T17:45:39.961Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T18:04:34.403Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T18:14:48.489Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T18:31:37.808Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T18:41:37.816Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T18:51:37.818Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T19:01:37.816Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T19:11:37.844Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T19:21:37.852Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T19:31:37.858Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T19:59:17.599Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T20:09:17.598Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T20:19:17.615Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T20:29:17.599Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T20:39:17.596Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T20:49:17.596Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T21:15:45.014Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T21:25:45.021Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T21:35:45.030Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T21:45:45.030Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T21:55:45.031Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T22:05:45.039Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T23:03:38.253Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T23:29:21.419Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T23:39:21.419Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T23:49:21.421Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-24T23:59:21.450Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T00:09:21.458Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T00:19:21.466Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T00:44:40.791Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T00:54:40.791Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T01:04:40.790Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T01:14:40.802Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T01:24:40.807Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T01:34:40.810Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T01:44:40.821Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T01:54:40.820Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T02:04:40.798Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T02:14:40.794Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T02:24:40.793Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T02:34:40.791Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T03:00:13.683Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T03:10:13.675Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T03:20:13.673Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T03:30:13.668Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T03:40:13.667Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T03:50:13.728Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T04:15:21.161Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T04:25:21.169Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T04:35:21.171Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T04:45:21.144Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T04:55:21.145Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T05:05:21.143Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T05:30:42.907Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T05:40:42.912Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T05:50:42.918Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T06:00:42.913Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T06:10:42.916Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T06:20:42.920Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T06:45:43.144Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T06:55:43.148Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T07:05:43.151Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T07:15:43.152Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T07:25:43.149Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T07:35:43.150Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T08:01:37.248Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T08:11:37.251Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T08:21:37.253Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T08:31:37.252Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T08:41:37.250Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T08:51:37.246Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T09:01:37.245Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T09:11:37.215Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T09:21:37.208Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T09:31:37.199Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T09:41:37.193Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T09:51:37.248Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T10:13:51.370Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T10:23:51.372Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T10:33:51.374Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T10:43:51.371Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T10:53:51.410Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T11:03:51.419Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T11:31:38.829Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T11:41:38.827Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T11:51:38.823Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T12:01:38.817Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T12:11:38.813Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T12:21:38.872Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T12:46:40.842Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T12:56:40.845Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T13:06:40.846Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T13:16:40.847Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T13:26:40.832Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T13:36:40.822Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T14:02:11.794Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T14:12:11.787Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T14:22:11.775Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T14:32:11.858Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T14:42:11.869Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T14:52:11.875Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T15:18:16.918Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T15:43:28.173Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T15:53:28.170Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T16:03:28.171Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T16:13:28.171Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T16:23:28.173Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T16:33:28.173Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T16:54:32.095Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T17:04:32.088Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T17:14:32.083Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T17:40:53.754Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T17:50:53.764Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T18:00:53.767Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T18:25:24.848Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T18:35:24.860Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T18:45:24.868Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T18:55:24.880Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T19:05:24.891Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T19:15:24.869Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T19:41:11.342Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T19:51:11.347Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T20:01:11.349Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T20:11:11.353Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T20:21:11.351Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T20:31:11.347Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T20:47:18.469Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T20:59:21.406Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T21:09:28.077Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T21:25:57.597Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T21:35:57.532Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T21:45:57.538Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T21:55:57.535Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T22:05:57.500Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T22:15:57.500Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T22:25:57.492Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T22:51:03.540Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T23:01:03.528Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T23:11:03.526Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T23:21:03.567Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T23:31:03.574Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-25T23:41:03.580Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T00:22:40.478Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T00:48:32.574Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T00:58:32.572Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T01:08:32.581Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T01:18:32.550Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T01:28:32.547Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T01:38:32.548Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T02:04:28.778Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T02:14:28.778Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T02:24:28.781Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T02:34:28.791Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T02:44:28.805Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T02:54:28.800Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T03:04:28.816Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T03:14:28.802Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T03:24:28.804Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T03:34:28.806Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T03:44:28.770Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T03:54:28.766Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T04:04:28.771Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T04:14:28.789Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T04:24:28.795Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T04:34:28.794Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T04:44:28.795Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T04:54:28.798Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T05:04:28.806Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T05:14:28.802Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T05:24:28.804Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T05:34:28.806Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T05:44:28.824Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T05:54:28.828Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T06:04:28.831Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T06:14:28.838Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T06:24:28.844Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T06:34:28.834Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T06:44:28.835Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T06:54:28.837Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T07:04:28.839Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T07:14:28.821Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T07:24:28.819Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T07:34:28.816Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T07:44:28.834Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T07:54:28.837Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T08:04:28.840Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T08:14:28.825Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T08:24:28.825Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T08:34:28.823Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T08:44:28.854Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T08:54:28.860Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T09:04:28.873Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T09:14:28.871Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T09:24:28.875Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T09:34:28.842Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T09:44:28.841Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T09:54:28.841Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T10:04:28.875Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T10:14:28.875Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T10:24:28.873Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T10:34:28.875Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T10:44:28.881Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T10:54:28.867Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T11:04:28.874Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T11:14:28.878Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T11:24:28.871Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T11:34:28.849Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T11:44:28.835Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T11:54:28.827Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T12:11:18.504Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T12:21:18.494Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T12:31:18.487Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T12:41:18.495Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T12:51:18.476Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T13:01:18.478Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T13:11:18.481Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T13:21:18.484Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T13:31:18.463Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T13:41:18.465Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T13:51:18.464Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T14:01:18.468Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T14:11:18.469Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T14:21:18.472Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T14:31:18.472Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T14:41:18.476Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T14:51:18.477Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T15:01:18.476Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T15:11:18.479Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T15:21:18.483Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T15:31:18.482Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T15:41:18.510Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T15:51:18.509Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T16:01:18.513Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T16:11:18.525Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T16:21:18.531Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T16:31:18.541Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T16:41:18.547Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T16:51:18.523Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T17:01:18.522Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T17:11:18.524Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T17:21:18.538Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T17:31:18.542Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T17:41:18.544Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T17:51:18.549Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T18:01:18.544Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T18:11:18.549Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T18:21:18.553Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T18:31:18.523Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T18:41:18.518Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T18:51:18.512Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T19:01:18.505Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T19:11:18.541Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T19:21:18.544Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T19:31:18.547Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T19:41:18.568Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T19:51:18.572Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T20:01:18.578Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T20:11:18.583Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T20:21:18.580Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T20:31:18.578Z checkpoint (10 minute timer): completed=172, partial=2, in_progress=1, pending=15
- 2026-03-26T20:35:55.638Z completed 175/190: Hull Table Tennis League, current=4/4, history=24/24, overall=completed, jobs_processed=6210, jobs_failed=0
- 2026-03-26T20:35:55.639Z starting 176/190: Keighley Table Tennis League (England / Yorkshire), current_targets=3, history_targets=4
- 2026-03-26T20:40:38.628Z completed 176/190: Keighley Table Tennis League, current=3/3, history=4/4, overall=completed, jobs_processed=28, jobs_failed=0
- 2026-03-26T20:40:38.629Z starting 177/190: Leeds Table Tennis League (England / Yorkshire), current_targets=7, history_targets=32
- 2026-03-26T20:41:18.569Z checkpoint (10 minute timer): completed=174, partial=2, in_progress=1, pending=13
- 2026-03-26T20:51:18.573Z checkpoint (10 minute timer): completed=174, partial=2, in_progress=1, pending=13
- 2026-03-26T20:58:52.612Z completed 177/190: Leeds Table Tennis League, current=7/7, history=32/32, overall=completed, jobs_processed=151, jobs_failed=3
- 2026-03-26T20:58:52.612Z failure samples for Leeds Table Tennis League: Leeds Table Tennis League: matches Division 1: [
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      3,
      "matches",
      0,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      14,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  }
] | Leeds Table Tennis League: matches Division 4: [
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "groups",
      3,
      "matches",
      0,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": [
      "matches",
      14,
      "away"
    ],
    "message": "Invalid input: expected object, received null"
  }
] | processLogTask: {"logId":"e41c7f7d-2a13-4dee-975e-07e1a29ef6af","competitionId":"b023b937-0ae9-4a78-a3ee-5f5b6da5ac32","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: Fixture not found for rubber 8651180: matchExternalId=851829
- 2026-03-26T20:58:52.614Z starting 178/190: Rotherham Table Tennis League (England / Yorkshire), current_targets=3, history_targets=17
- 2026-03-26T21:01:18.571Z checkpoint (10 minute timer): completed=175, partial=2, in_progress=1, pending=12
- 2026-03-26T21:11:18.574Z checkpoint (10 minute timer): completed=175, partial=2, in_progress=1, pending=12
- 2026-03-26T21:19:42.276Z completed 178/190: Rotherham Table Tennis League, current=3/3, history=17/17, overall=completed, jobs_processed=3436, jobs_failed=0
- 2026-03-26T21:19:42.279Z starting 179/190: Scarborough Table Tennis League (England / Yorkshire), current_targets=3, history_targets=14
- 2026-03-26T21:21:18.577Z checkpoint (10 minute timer): completed=176, partial=2, in_progress=1, pending=11
- 2026-03-26T21:27:01.565Z completed 179/190: Scarborough Table Tennis League, current=3/3, history=14/14, overall=completed, jobs_processed=68, jobs_failed=0
- 2026-03-26T21:27:01.566Z starting 180/190: Selby Table Tennis League (England / Yorkshire), current_targets=2, history_targets=8
- 2026-03-26T21:31:11.685Z completed 180/190: Selby Table Tennis League, current=2/2, history=8/8, overall=completed, jobs_processed=40, jobs_failed=0
- 2026-03-26T21:31:11.686Z starting 181/190: Wakefield Table Tennis League (England / Yorkshire), current_targets=2, history_targets=1
- 2026-03-26T21:31:18.577Z checkpoint (10 minute timer): completed=178, partial=2, in_progress=1, pending=9
- 2026-03-26T21:32:10.080Z completed 181/190: Wakefield Table Tennis League, current=2/2, history=1/1, overall=completed, jobs_processed=12, jobs_failed=0
- 2026-03-26T21:32:10.081Z starting 182/190: York Table Tennis League (England / Yorkshire), current_targets=5, history_targets=19
- 2026-03-26T21:41:18.589Z checkpoint (10 minute timer): completed=179, partial=2, in_progress=1, pending=8
- 2026-03-26T21:48:15.257Z completed 182/190: York Table Tennis League, current=5/5, history=19/19, overall=completed, jobs_processed=96, jobs_failed=0
- 2026-03-26T21:48:15.258Z starting 183/190: Dumfries Table Tennis League (Scotland / Dumfries and Galloway), current_targets=2, history_targets=13
- 2026-03-26T21:51:18.588Z checkpoint (10 minute timer): completed=180, partial=2, in_progress=1, pending=7
- 2026-03-26T21:55:20.866Z completed 183/190: Dumfries Table Tennis League, current=2/2, history=13/13, overall=completed, jobs_processed=1360, jobs_failed=0
- 2026-03-26T21:55:20.868Z starting 184/190: Perth Table Tennis Association (Scotland / Perth and Kinross), current_targets=2, history_targets=12
- 2026-03-26T22:01:18.598Z checkpoint (10 minute timer): completed=181, partial=2, in_progress=1, pending=6
- 2026-03-26T22:11:18.558Z checkpoint (10 minute timer): completed=181, partial=2, in_progress=1, pending=6
- 2026-03-26T22:20:08.226Z completed 184/190: Perth Table Tennis Association, current=2/2, history=12/12, overall=completed, jobs_processed=966, jobs_failed=108
- 2026-03-26T22:20:08.226Z failure samples for Perth Table Tennis Association: scrapeUrlTask: {"url":"https://www.tabletennis365.com/Perth/Results/Winter_2018_-_19/Division_1/MatchCard/341534","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"dac58267-af60-4d12-a946-02c06cf07e01","tt365DataType":"matchcard","matchExternalId":"341534"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/Perth/Results/Winter_2018_-_19/Division_1/MatchCard/341534 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Perth/Results/Winter_2018_-_19/Division_1/MatchCard/341536","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"dac58267-af60-4d12-a946-02c06cf07e01","tt365DataType":"matchcard","matchExternalId":"341536"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/Perth/Results/Winter_2018_-_19/Division_1/MatchCard/341536 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Perth/Results/Winter_2018_-_19/Division_1/MatchCard/341537","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"dac58267-af60-4d12-a946-02c06cf07e01","tt365DataType":"matchcard","matchExternalId":"341537"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/Perth/Results/Winter_2018_-_19/Division_1/MatchCard/341537 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Perth/Results/Winter_2018_-_19/Division_1/MatchCard/340040","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"dac58267-af60-4d12-a946-02c06cf07e01","tt365DataType":"matchcard","matchExternalId":"340040"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/Perth/Results/Winter_2018_-_19/Division_1/MatchCard/340040 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Perth/Results/Winter_2018_-_19/Division_1/MatchCard/340042","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"dac58267-af60-4d12-a946-02c06cf07e01","tt365DataType":"matchcard","matchExternalId":"340042"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/Perth/Results/Winter_2018_-_19/Division_1/MatchCard/340042
- 2026-03-26T22:20:08.229Z starting 185/190: West of Scotland Table Tennis League (Scotland / West of Scotland), current_targets=5, history_targets=21
- 2026-03-26T22:21:18.557Z checkpoint (10 minute timer): completed=182, partial=2, in_progress=1, pending=5
- 2026-03-26T22:31:18.555Z checkpoint (10 minute timer): completed=182, partial=2, in_progress=1, pending=5
- 2026-03-26T22:41:18.550Z checkpoint (10 minute timer): completed=182, partial=2, in_progress=1, pending=5
- 2026-03-26T22:51:18.541Z checkpoint (10 minute timer): completed=182, partial=2, in_progress=1, pending=5
- 2026-03-26T22:52:29.786Z completed 185/190: West of Scotland Table Tennis League, current=5/5, history=21/21, overall=completed, jobs_processed=3606, jobs_failed=0
- 2026-03-26T22:52:29.788Z starting 186/190: Cardiff & District Table Tennis League (Wales / Cardiff), current_targets=3, history_targets=16
- 2026-03-26T23:01:18.534Z checkpoint (10 minute timer): completed=183, partial=2, in_progress=1, pending=4
- 2026-03-26T23:11:18.545Z checkpoint (10 minute timer): completed=183, partial=2, in_progress=1, pending=4
- 2026-03-26T23:18:28.788Z completed 186/190: Cardiff & District Table Tennis League, current=3/3, history=16/16, overall=completed, jobs_processed=3186, jobs_failed=0
- 2026-03-26T23:18:28.790Z starting 187/190: Llandudno Table Tennis League (Wales / Conwy), current_targets=2, history_targets=12
- 2026-03-26T23:21:18.571Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-26T23:31:18.587Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-26T23:41:18.587Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-26T23:51:18.619Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T00:01:18.625Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T00:11:18.633Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T00:21:18.612Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T00:31:18.605Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T00:41:18.606Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T00:51:18.608Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T01:01:18.611Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T01:20:55.271Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T01:38:48.578Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T02:09:01.801Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T02:19:01.802Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T02:29:01.806Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T02:39:01.784Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T02:49:01.781Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T02:59:01.779Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T04:10:57.784Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T05:23:36.985Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T05:33:36.980Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T05:43:37.020Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T05:53:37.016Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T06:03:37.011Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T06:13:37.027Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T06:40:32.428Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T06:50:32.435Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T07:00:32.438Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T07:10:32.428Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T07:20:32.431Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T07:30:32.425Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T08:05:29.295Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T08:15:29.286Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T08:25:29.302Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T08:35:29.275Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T08:45:29.283Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T08:55:29.285Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T09:07:25.227Z checkpoint (10 minute timer): completed=184, partial=2, in_progress=1, pending=3
- 2026-03-27T09:08:48.226Z completed 187/190: Llandudno Table Tennis League, current=2/2, history=12/12, overall=completed, jobs_processed=918, jobs_failed=582
- 2026-03-27T09:08:48.226Z failure samples for Llandudno Table Tennis League: scrapeUrlTask: {"url":"https://www.tabletennis365.com/Llandudno/Results/Winter_2021-22/Division_One/MatchCard/386205","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"03200da6-1351-40cd-a0d2-e3f2f462154a","tt365DataType":"matchcard","matchExternalId":"386205"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/Llandudno/Results/Winter_2021-22/Division_One/MatchCard/386205 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Llandudno/Results/Winter_2021-22/Division_One/MatchCard/386054","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"03200da6-1351-40cd-a0d2-e3f2f462154a","tt365DataType":"matchcard","matchExternalId":"386054"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/Llandudno/Results/Winter_2021-22/Division_One/MatchCard/386054 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Llandudno/Results/Winter_2021-22/Division_One/MatchCard/378412","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"03200da6-1351-40cd-a0d2-e3f2f462154a","tt365DataType":"matchcard","matchExternalId":"378412"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/Llandudno/Results/Winter_2021-22/Division_One/MatchCard/378412 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Llandudno/Results/Winter_2021-22/Division_One/MatchCard/386073","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"03200da6-1351-40cd-a0d2-e3f2f462154a","tt365DataType":"matchcard","matchExternalId":"386073"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/Llandudno/Results/Winter_2021-22/Division_One/MatchCard/386073 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/Llandudno/Results/Winter_2021-22/Division_One/MatchCard/385406","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"03200da6-1351-40cd-a0d2-e3f2f462154a","tt365DataType":"matchcard","matchExternalId":"385406"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/Llandudno/Results/Winter_2021-22/Division_One/MatchCard/385406
- 2026-03-27T09:08:48.231Z starting 188/190: East Flintshire League (Wales / Flintshire), current_targets=4, history_targets=10
- 2026-03-27T09:14:05.244Z completed 188/190: East Flintshire League, current=4/4, history=10/10, overall=completed, jobs_processed=56, jobs_failed=0
- 2026-03-27T09:14:05.246Z starting 189/190: Gwent Table Tennis League (Wales / Gwent), current_targets=3, history_targets=13
- 2026-03-27T09:17:25.217Z checkpoint (10 minute timer): completed=186, partial=2, in_progress=1, pending=1
- 2026-03-27T09:27:25.218Z checkpoint (10 minute timer): completed=186, partial=2, in_progress=1, pending=1
- 2026-03-27T09:37:25.224Z checkpoint (10 minute timer): completed=186, partial=2, in_progress=1, pending=1
- 2026-03-27T09:47:25.228Z checkpoint (10 minute timer): completed=186, partial=2, in_progress=1, pending=1
- 2026-03-27T09:56:24.970Z completed 189/190: Gwent Table Tennis League, current=3/3, history=13/13, overall=completed, jobs_processed=2860, jobs_failed=132
- 2026-03-27T09:56:24.970Z failure samples for Gwent Table Tennis League: scrapeUrlTask: {"url":"https://www.tabletennis365.com/GwentTTC/Results/Summer_League_2023/Premier_Division/MatchCard/406122","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"270e2118-039c-4274-b2ac-d5af95a1213a","tt365DataType":"matchcard","matchExternalId":"406122"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/GwentTTC/Results/Summer_League_2023/Premier_Division/MatchCard/406122 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/GwentTTC/Results/Summer_League_2023/Premier_Division/MatchCard/406121","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"270e2118-039c-4274-b2ac-d5af95a1213a","tt365DataType":"matchcard","matchExternalId":"406121"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/GwentTTC/Results/Summer_League_2023/Premier_Division/MatchCard/406121 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/GwentTTC/Results/Summer_League_2023/Premier_Division/MatchCard/406120","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"270e2118-039c-4274-b2ac-d5af95a1213a","tt365DataType":"matchcard","matchExternalId":"406120"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/GwentTTC/Results/Summer_League_2023/Premier_Division/MatchCard/406120 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/GwentTTC/Results/Summer_League_2023/Premier_Division/MatchCard/406119","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"270e2118-039c-4274-b2ac-d5af95a1213a","tt365DataType":"matchcard","matchExternalId":"406119"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/GwentTTC/Results/Summer_League_2023/Premier_Division/MatchCard/406119 | scrapeUrlTask: {"url":"https://www.tabletennis365.com/GwentTTC/Results/Summer_League_2023/Premier_Division/MatchCard/406118","platformId":"fa72f61f-dfc6-4685-8b8d-3d42a74ef1f8","platformType":"tt365","competitionId":"270e2118-039c-4274-b2ac-d5af95a1213a","tt365DataType":"matchcard","matchExternalId":"406118"}: TT365 ajax match-card payload not found for https://www.tabletennis365.com/GwentTTC/Results/Summer_League_2023/Premier_Division/MatchCard/406118
- 2026-03-27T09:56:24.973Z starting 190/190: Pembrokeshire Table Tennis League (Wales / Pembrokeshire), current_targets=3, history_targets=2
- 2026-03-27T09:57:25.202Z checkpoint (10 minute timer): completed=187, partial=2, in_progress=1, pending=0
- 2026-03-27T09:58:10.584Z completed 190/190: Pembrokeshire Table Tennis League, current=3/3, history=2/2, overall=completed, jobs_processed=20, jobs_failed=0
- 2026-03-27T09:58:10.590Z checkpoint (run complete): completed=188, partial=2, in_progress=0, pending=0
- 2026-03-27T09:58:10.590Z scrape run finished successfully
