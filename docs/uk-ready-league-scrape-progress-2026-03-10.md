# UK Ready League Scrape Progress

Started: 2026-03-15T08:41:02.013Z

- Total ready leagues scheduled: 190
- Mode: isolated sequential scrape by league using an internal campaign queue
- Progress checkpoint cadence: every 10 minutes

## Log

- 2026-03-15T08:41:02.048Z shared queue snapshot (ignored by isolated campaign runner): total=1340, runnable=1277, deferred=0, exhausted=63
- 2026-03-15T08:41:02.048Z bootstrapping ready leagues with history discovery
- 2026-03-15T08:43:06.424Z bootstrapped 190 ready leagues with scrape targets; missing_targets=2; writing initial tracker snapshot
- 2026-03-15T08:43:06.427Z ready leagues without targets: Basildon Table Tennis League; Colchester Table Tennis League
- 2026-03-15T08:43:06.433Z starting 1/190: Bath Table Tennis League (England / Avon), current_targets=4, history_targets=16
- 2026-03-15T08:43:14.705Z completed 1/190: Bath Table Tennis League, current=4/4, history=16/16, overall=completed, jobs_processed=80, jobs_failed=0
- 2026-03-15T08:43:14.708Z starting 2/190: Bristol Table Tennis League (England / Avon), current_targets=7, history_targets=34
- 2026-03-15T08:44:39.671Z completed 2/190: Bristol Table Tennis League, current=7/7, history=34/34, overall=completed, jobs_processed=163, jobs_failed=1
- 2026-03-15T08:44:39.672Z failure samples for Bristol Table Tennis League: processLogTask: {"logId":"e6becd9f-070b-4981-a02a-81aad72be16c","competitionId":"8f630049-7590-4f31-be37-da2b0663a66c","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
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
- 2026-03-15T08:44:39.674Z starting 3/190: Bedford Table Tennis League (England / Bedfordshire), current_targets=4, history_targets=21
- 2026-03-15T08:44:45.755Z completed 3/190: Bedford Table Tennis League, current=4/4, history=21/21, overall=completed, jobs_processed=100, jobs_failed=0
- 2026-03-15T08:44:45.757Z starting 4/190: Luton Table Tennis League (England / Bedfordshire), current_targets=1, history_targets=15
- 2026-03-15T08:45:30.687Z completed 4/190: Luton Table Tennis League, current=1/1, history=15/15, overall=completed, jobs_processed=66, jobs_failed=0
- 2026-03-15T08:45:30.688Z starting 5/190: Bracknell and Wokingham Table Tennis League (England / Berkshire), current_targets=3, history_targets=18
- 2026-03-15T08:46:41.039Z completed 5/190: Bracknell and Wokingham Table Tennis League, current=3/3, history=18/18, overall=completed, jobs_processed=84, jobs_failed=0
- 2026-03-15T08:46:41.041Z starting 6/190: Maidenhead Table Tennis League (England / Berkshire), current_targets=3, history_targets=9
- 2026-03-15T08:46:45.184Z completed 6/190: Maidenhead Table Tennis League, current=3/3, history=9/9, overall=completed, jobs_processed=48, jobs_failed=0
- 2026-03-15T08:46:45.185Z starting 7/190: Newbury Table Tennis League (England / Berkshire), current_targets=3, history_targets=12
- 2026-03-15T08:46:46.977Z completed 7/190: Newbury Table Tennis League, current=3/3, history=12/12, overall=completed, jobs_processed=60, jobs_failed=0
- 2026-03-15T08:46:46.979Z starting 8/190: Reading & District Table Tennis Association (England / Berkshire), current_targets=4, history_targets=24
- 2026-03-15T08:50:59.738Z completed 8/190: Reading & District Table Tennis Association, current=4/4, history=24/24, overall=completed, jobs_processed=732, jobs_failed=0
- 2026-03-15T08:50:59.739Z starting 9/190: Aylesbury Table Tennis League (England / Buckinghamshire), current_targets=5, history_targets=21
- 2026-03-15T08:51:38.680Z completed 9/190: Aylesbury Table Tennis League, current=5/5, history=21/21, overall=completed, jobs_processed=103, jobs_failed=1
- 2026-03-15T08:51:38.680Z failure samples for Aylesbury Table Tennis League: processLogTask: {"logId":"978bf879-9725-4b9c-bb14-5d420978cdc5","competitionId":"430d453b-b983-4189-8f99-774f14eefe56","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: Fixture not found for rubber 8366406: matchExternalId=821866
- 2026-03-15T08:51:38.683Z starting 10/190: Chalfonts Table Tennis League (England / Buckinghamshire), current_targets=2, history_targets=11
- 2026-03-15T08:51:46.266Z completed 10/190: Chalfonts Table Tennis League, current=2/2, history=11/11, overall=completed, jobs_processed=52, jobs_failed=0
- 2026-03-15T08:51:46.267Z starting 11/190: Chiltern Table Tennis League (England / Buckinghamshire), current_targets=2, history_targets=8
- 2026-03-15T08:51:47.615Z completed 11/190: Chiltern Table Tennis League, current=2/2, history=8/8, overall=completed, jobs_processed=40, jobs_failed=0
- 2026-03-15T08:51:47.616Z starting 12/190: High Wycombe Table Tennis League (England / Buckinghamshire), current_targets=4, history_targets=16
- 2026-03-15T08:51:52.091Z completed 12/190: High Wycombe Table Tennis League, current=4/4, history=16/16, overall=completed, jobs_processed=80, jobs_failed=0
- 2026-03-15T08:51:52.093Z starting 13/190: Cambridge Table Tennis League (England / Cambridgeshire), current_targets=4, history_targets=17
- 2026-03-15T08:53:06.421Z checkpoint (10 minute timer): completed=12, partial=0, in_progress=1, pending=177
- 2026-03-15T08:53:27.263Z completed 13/190: Cambridge Table Tennis League, current=4/4, history=17/17, overall=completed, jobs_processed=83, jobs_failed=1
- 2026-03-15T08:53:27.263Z failure samples for Cambridge Table Tennis League: processLogTask: {"logId":"0d434eba-8c7d-4d0b-85d1-c5a69064ea00","competitionId":"75759588-f991-406c-ab48-59e9d4efac57","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: Team not found for fixture 701848: home=51392 (undefined), away=51398 (cc831dfe-14ea-4e41-be45-d23a6784ed40)
- 2026-03-15T08:53:27.266Z starting 14/190: Ely & District Table Tennis League (England / Cambridgeshire), current_targets=3, history_targets=12
- 2026-03-15T08:53:48.210Z completed 14/190: Ely & District Table Tennis League, current=3/3, history=12/12, overall=completed, jobs_processed=59, jobs_failed=1
- 2026-03-15T08:53:48.210Z failure samples for Ely & District Table Tennis League: processLogTask: {"logId":"1c67da40-23b1-4876-8ecd-83ba531ecc76","competitionId":"862d5d46-422e-4901-b7db-189ee60900b1","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
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
- 2026-03-15T08:53:48.212Z starting 15/190: Peterborough Table Tennis League (England / Cambridgeshire), current_targets=4, history_targets=11
- 2026-03-15T08:54:40.587Z completed 15/190: Peterborough Table Tennis League, current=4/4, history=11/11, overall=completed, jobs_processed=60, jobs_failed=0
- 2026-03-15T08:54:40.588Z starting 16/190: Chester and Ellesmere Port Table Tennis League (England / Cheshire), current_targets=4, history_targets=18
- 2026-03-15T08:54:44.661Z completed 16/190: Chester and Ellesmere Port Table Tennis League, current=4/4, history=18/18, overall=completed, jobs_processed=88, jobs_failed=0
- 2026-03-15T08:54:44.664Z starting 17/190: Crewe Table Tennis League (England / Cheshire), current_targets=8, history_targets=16
- 2026-03-15T08:54:47.222Z completed 17/190: Crewe Table Tennis League, current=8/8, history=16/16, overall=completed, jobs_processed=96, jobs_failed=0
- 2026-03-15T08:54:47.223Z starting 18/190: Glossop Table Tennis League (England / Cheshire), current_targets=3, history_targets=15
- 2026-03-15T08:55:29.892Z completed 18/190: Glossop Table Tennis League, current=3/3, history=15/15, overall=completed, jobs_processed=66, jobs_failed=3
- 2026-03-15T08:55:29.892Z failure samples for Glossop Table Tennis League: Glossop Table Tennis League: matches Division 1: HTTP 500 fetching https://ttleagues-api.azurewebsites.net/api/divisions/1881/matches | Glossop Table Tennis League: matches Division 2: HTTP 500 fetching https://ttleagues-api.azurewebsites.net/api/divisions/1882/matches | Glossop Table Tennis League: matches Division 3: HTTP 500 fetching https://ttleagues-api.azurewebsites.net/api/divisions/1883/matches
- 2026-03-15T08:55:29.895Z starting 19/190: Halton Table Tennis League (England / Cheshire), current_targets=2, history_targets=5
- 2026-03-15T08:56:07.947Z completed 19/190: Halton Table Tennis League, current=2/2, history=5/5, overall=completed, jobs_processed=27, jobs_failed=1
- 2026-03-15T08:56:07.947Z failure samples for Halton Table Tennis League: processLogTask: {"logId":"2e68c86a-9041-4e64-80e9-6540392ae8f1","competitionId":"11de6317-f52c-47c2-9c20-0bee24dc9df9","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: Team not found for fixture 133804: home=9094 (0b106eae-6576-4bd8-83b3-048186845ee6), away=9088 (undefined)
- 2026-03-15T08:56:07.948Z starting 20/190: Mid-Cheshire Table Tennis League (England / Cheshire), current_targets=2, history_targets=11
- 2026-03-15T08:56:17.005Z completed 20/190: Mid-Cheshire Table Tennis League, current=2/2, history=11/11, overall=completed, jobs_processed=52, jobs_failed=0
- 2026-03-15T08:56:17.005Z starting 21/190: Trafford Table Tennis League (England / Cheshire), current_targets=3, history_targets=15
- 2026-03-15T08:56:20.405Z completed 21/190: Trafford Table Tennis League, current=3/3, history=15/15, overall=completed, jobs_processed=72, jobs_failed=0
- 2026-03-15T08:56:20.407Z starting 22/190: Wilmslow Table Tennis League (England / Cheshire), current_targets=3, history_targets=15
- 2026-03-15T08:56:27.454Z completed 22/190: Wilmslow Table Tennis League, current=3/3, history=15/15, overall=completed, jobs_processed=70, jobs_failed=1
- 2026-03-15T08:56:27.454Z failure samples for Wilmslow Table Tennis League: Wilmslow Table Tennis League: matches DIVISION 1: [
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
- 2026-03-15T08:56:27.456Z starting 23/190: Wirral Table Tennis League (England / Cheshire), current_targets=3, history_targets=14
- 2026-03-15T08:57:06.522Z completed 23/190: Wirral Table Tennis League, current=3/3, history=14/14, overall=completed, jobs_processed=67, jobs_failed=1
- 2026-03-15T08:57:06.523Z failure samples for Wirral Table Tennis League: processLogTask: {"logId":"eca5a2f6-92d5-4a04-92d0-9560a2df82f6","competitionId":"958ee361-96c2-4ded-9790-4cf0933f7c3c","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
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
- 2026-03-15T08:57:06.525Z starting 24/190: Lancashire And Cheshire Table Tennis League (England / Cheshire|Lancashire), current_targets=3, history_targets=6
- 2026-03-15T08:57:12.944Z completed 24/190: Lancashire And Cheshire Table Tennis League, current=3/3, history=6/6, overall=completed, jobs_processed=36, jobs_failed=0
- 2026-03-15T08:57:12.946Z starting 25/190: Cleveland Table Tennis League (England / Cleveland), current_targets=1, history_targets=3
- 2026-03-15T08:57:33.184Z completed 25/190: Cleveland Table Tennis League, current=1/1, history=3/3, overall=completed, jobs_processed=15, jobs_failed=1
- 2026-03-15T08:57:33.184Z failure samples for Cleveland Table Tennis League: processLogTask: {"logId":"420ad7ba-1182-4326-9502-d2e95f9594e8","competitionId":"b4bb2bf2-5e07-44a0-85d0-0af5922e81e9","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
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
- 2026-03-15T08:57:33.187Z starting 26/190: Middlesbrough Table Tennis League (England / Cleveland), current_targets=3, history_targets=6
- 2026-03-15T08:57:34.397Z completed 26/190: Middlesbrough Table Tennis League, current=3/3, history=6/6, overall=completed, jobs_processed=36, jobs_failed=0
- 2026-03-15T08:57:34.399Z starting 27/190: Stockton Table Tennis League (England / Cleveland), current_targets=3, history_targets=13
- 2026-03-15T08:57:37.906Z completed 27/190: Stockton Table Tennis League, current=3/3, history=13/13, overall=completed, jobs_processed=64, jobs_failed=0
- 2026-03-15T08:57:37.908Z starting 28/190: North Cornwall Table Tennis League (England / Cornwall), current_targets=2, history_targets=16
- 2026-03-15T08:58:20.020Z completed 28/190: North Cornwall Table Tennis League, current=2/2, history=16/16, overall=completed, jobs_processed=72, jobs_failed=0
- 2026-03-15T08:58:20.027Z starting 29/190: West Cornwall Table Tennis League (England / Cornwall), current_targets=4, history_targets=14
- 2026-03-15T08:58:23.847Z completed 29/190: West Cornwall Table Tennis League, current=4/4, history=14/14, overall=completed, jobs_processed=72, jobs_failed=0
- 2026-03-15T08:58:23.848Z starting 30/190: Barrow Table Tennis League (England / Cumbria), current_targets=2, history_targets=0
- 2026-03-15T08:58:24.190Z completed 30/190: Barrow Table Tennis League, current=2/2, history=0/0, overall=completed, jobs_processed=8, jobs_failed=0
- 2026-03-15T08:58:24.193Z starting 31/190: Chesterfield Table Tennis League (England / Derbyshire), current_targets=4, history_targets=6
- 2026-03-15T08:59:06.835Z completed 31/190: Chesterfield Table Tennis League, current=4/4, history=6/6, overall=completed, jobs_processed=39, jobs_failed=1
- 2026-03-15T08:59:06.835Z failure samples for Chesterfield Table Tennis League: processLogTask: {"logId":"3bed307a-0e15-4839-a7c3-241249515a94","competitionId":"b3168bda-52a0-4652-92f3-a761ad87a789","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
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
- 2026-03-15T08:59:06.838Z starting 32/190: Derby & District Table Tennis Association (England / Derbyshire), current_targets=4, history_targets=21
- 2026-03-15T09:00:00.632Z completed 32/190: Derby & District Table Tennis Association, current=4/4, history=21/21, overall=completed, jobs_processed=99, jobs_failed=1
- 2026-03-15T09:00:00.633Z failure samples for Derby & District Table Tennis Association: processLogTask: {"logId":"7e0a90fa-e093-4922-8302-a317130dc109","competitionId":"c9e9445d-8540-4885-93f6-7def8cce6ff7","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
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
- 2026-03-15T09:00:00.636Z starting 33/190: Matlock Table Tennis League (England / Derbyshire), current_targets=2, history_targets=10
- 2026-03-15T09:00:03.796Z completed 33/190: Matlock Table Tennis League, current=2/2, history=10/10, overall=completed, jobs_processed=48, jobs_failed=0
- 2026-03-15T09:00:03.799Z starting 34/190: Exeter Table Tennis League (England / Devonshire), current_targets=4, history_targets=14
- 2026-03-15T09:01:08.745Z completed 34/190: Exeter Table Tennis League, current=4/4, history=14/14, overall=completed, jobs_processed=71, jobs_failed=1
- 2026-03-15T09:01:08.745Z failure samples for Exeter Table Tennis League: processLogTask: {"logId":"1d8bd093-491f-42fb-b8ef-ccb1c88b1ecb","competitionId":"1806c25f-945b-417f-9fa2-f0afee75c99a","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: [
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
- 2026-03-15T09:01:08.748Z starting 35/190: South Devon and Torbay Table Tennis League (England / Devonshire), current_targets=4, history_targets=20
- 2026-03-15T09:01:43.439Z completed 35/190: South Devon and Torbay Table Tennis League, current=4/4, history=20/20, overall=completed, jobs_processed=95, jobs_failed=1
- 2026-03-15T09:01:43.439Z failure samples for South Devon and Torbay Table Tennis League: processLogTask: {"logId":"0ad3b39e-6d9c-4fad-ae84-ea19e29a0d58","competitionId":"1e55540c-f542-4d08-b6d9-247eece18e2d","platformId":"c7560866-58f1-45f8-9406-570341fab522","platformType":"ttleagues-bundle"}: Team not found for fixture 728019: home=57894 (604615c4-2a10-490f-bd6c-13edfc49808e), away=57946 (undefined)
- 2026-03-15T09:01:43.441Z starting 36/190: Blackmore Vale Table Tennis League (England / Dorset), current_targets=2, history_targets=2
- 2026-03-15T09:01:44.158Z completed 36/190: Blackmore Vale Table Tennis League, current=2/2, history=2/2, overall=completed, jobs_processed=16, jobs_failed=0
- 2026-03-15T09:01:44.160Z starting 37/190: Weymouth Table Tennis League (England / Dorset), current_targets=3, history_targets=15
- 2026-03-15T09:01:46.920Z completed 37/190: Weymouth Table Tennis League, current=3/3, history=15/15, overall=completed, jobs_processed=72, jobs_failed=0
- 2026-03-15T09:01:46.921Z starting 38/190: Darlington Table Tennis League (England / Durham), current_targets=2, history_targets=9
- 2026-03-15T09:01:48.836Z completed 38/190: Darlington Table Tennis League, current=2/2, history=9/9, overall=completed, jobs_processed=44, jobs_failed=0
- 2026-03-15T09:01:48.839Z starting 39/190: Sunderland Table Tennis League (England / Durham), current_targets=3, history_targets=18
- 2026-03-15T09:03:06.403Z checkpoint (10 minute timer): completed=38, partial=0, in_progress=1, pending=151
- 2026-03-15T09:13:06.577Z checkpoint (10 minute timer): completed=38, partial=0, in_progress=1, pending=151
- 2026-03-15T09:23:06.584Z checkpoint (10 minute timer): completed=38, partial=0, in_progress=1, pending=151
- 2026-03-15T09:33:06.577Z checkpoint (10 minute timer): completed=38, partial=0, in_progress=1, pending=151
- 2026-03-15T09:43:06.579Z checkpoint (10 minute timer): completed=38, partial=0, in_progress=1, pending=151
