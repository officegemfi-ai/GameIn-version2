# What each screen costs on a big database

Made by `db/bench/compare.mjs` from runs of `db/bench/bench.mjs` (2026-11-10). See [README.md](README.md) for how to make it again and how to read it.

The database: 200,000 creators, 20,000 brands, 1,000,000 offers, 500,700 deals, 5,000,000 messages, 7,179,281 notifications; 7405 MB (Before stage one), 7752 MB (The migration alone (the app as it was)), 7753 MB (Stage one (migration and app)).

A cell is one screen: how long the person waits for it, and how many 8 kB pages the database touched for all of its requests. The times are from one machine (2 cores, 7 GB of memory: about a Supabase Large); the pages are the same on any machine, and on a small one each page that isn’t in memory is a read from disk.

The middle column is the app as it was before stage one, on the migrated database: what runs between applying the migration and publishing the app that goes with it. Most of its screens are already quick there. Two of its requests get slower at this size, because of how they are asked. The creator dashboard’s “ready to deliver” asks for deliverables without naming a deal, so the new access rules check every deliverable on GameIn one by one (2.5 s). And a search walks the directory in name order until it has a page of matches: all of it, when there are none (0.2 s). Stage one’s app asks for both another way. On the live database as it is today (five deals) neither can be felt; at this size the migration and the app would go out together.

## An ordinary brand (the middle of the range): 31 offers, 13 deals, 31 conversations, 62 notifications

| Screen | Before stage one | The migration alone (the app as it was) | Stage one (migration and app) |
|---|---|---|---|
| every page | 532 ms · 92,556 pages | 5 ms · 543 pages | 8 ms · 680 pages |
| dashboard | 228 ms · 101,250 pages | 4 ms · 946 pages | 6 ms · 1,375 pages |
| offers | 241 ms · 44,767 pages | 7 ms · 813 pages | 3 ms · 165 pages |
| one offer | 4 ms · 86 pages | 4 ms · 67 pages | 3 ms · 67 pages |
| deals | 160 ms · 54,454 pages | 4 ms · 698 pages | 6 ms · 518 pages |
| one deal | 318 ms · 86,729 pages | 5 ms · 145 pages | 4 ms · 145 pages |
| messages | 114 ms · 22,262 pages | 5 ms · 629 pages | 4 ms · 509 pages |
| one conversation | 4 ms · 103 pages | 4 ms · 103 pages | 3 ms · 103 pages |
| their longest conversation | 3 ms · 47 pages | 3 ms · 118 pages | 4 ms · 118 pages |
| payments | 197 ms · 70,237 pages | 4 ms · 347 pages | 5 ms · 348 pages |
| settings | 3 ms · 201 pages | 2 ms · 4 pages | 3 ms · 4 pages |
| offers, closed tab | (in the request above) | (in the request above) | 4 ms · 652 pages |
| deals, complete tab | (in the request above) | (in the request above) | 6 ms · 243 pages |

## An ordinary creator (the middle of the range): 2 offers, 0 deals, 2 conversations, 3 notifications

| Screen | Before stage one | The migration alone (the app as it was) | Stage one (migration and app) |
|---|---|---|---|
| every page | 154 ms · 33,619 pages | 4 ms · 58 pages | 6 ms · 194 pages |
| dashboard | 217 ms · 35,513 pages | 2.5 s · 6,033,856 pages | 4 ms · 53 pages |
| offers | 130 ms · 23,716 pages | 4 ms · 69 pages | 4 ms · 6 pages |
| one offer | 5 ms · 80 pages | 3 ms · 59 pages | 3 ms · 59 pages |
| deals | 3 ms · 6 pages | 2 ms · 6 pages | 3 ms · 3 pages |
| messages | 111 ms · 12,359 pages | 3 ms · 55 pages | 5 ms · 55 pages |
| one conversation | 5 ms · 109 pages | 4 ms · 101 pages | 3 ms · 101 pages |
| their longest conversation | 4 ms · 62 pages | 3 ms · 66 pages | 2 ms · 66 pages |
| wallet | 4 ms · 41 pages | 4 ms · 41 pages | 4 ms · 41 pages |
| packages | 3 ms · 9 pages | 2 ms · 9 pages | 2 ms · 9 pages |
| settings | 31 ms · 10,378 pages | 2 ms · 4 pages | 2 ms · 4 pages |
| offers, closed tab | (in the request above) | (in the request above) | 4 ms · 69 pages |
| deals, complete tab | (in the request above) | (in the request above) | 3 ms · 3 pages |

## Signed up today, nothing yet

| Screen | Before stage one | The migration alone (the app as it was) | Stage one (migration and app) |
|---|---|---|---|
| every page | 4 ms · 322 pages | 4 ms · 9 pages | 4 ms · 9 pages |

## The busiest creator on GameIn: 7,636 offers, 3,826 deals, 4,834 conversations, 22,789 notifications

| Screen | Before stage one | The migration alone (the app as it was) | Stage one (migration and app) |
|---|---|---|---|
| every page | 2.8 s · 271,225 pages | 14 ms · 5,482 pages | 24 ms · 7,392 pages |
| dashboard | 495 ms · 309,169 pages · **answer cut off at 1,000 rows** | 2.5 s · 6,430,602 pages · **answer cut off at 1,000 rows** | 107 ms · 234,327 pages |
| offers | 2.3 s | 248 ms · 196,471 pages | 4 ms · 1,397 pages |
| one offer | 4 ms · 86 pages | 3 ms · 63 pages | 3 ms · 63 pages |
| deals | 267 ms · 119,239 pages · **answer cut off at 1,000 rows** | 63 ms · 168,363 pages · **answer cut off at 1,000 rows** | 9 ms · 1,590 pages |
| one deal | 348 ms · 86,737 pages | 4 ms · 177 pages | 5 ms · 177 pages |
| messages | 971 ms · 90,991 pages | 7 ms · 2,016 pages | 5 ms · 515 pages |
| one conversation | 5 ms · 103 pages | 4 ms · 85 pages | 3 ms · 85 pages |
| their longest conversation | 5 ms · 69 pages | 4 ms · 924 pages | 4 ms · 924 pages |
| wallet | 955 ms · 318,474 pages | 364 ms · 480,417 pages | 353 ms · 480,417 pages |
| packages | 1 ms · 4 pages | 2 ms · 4 pages | 1 ms · 4 pages |
| settings | 44 ms · 20,046 pages | 1 ms · 4 pages | 1 ms · 4 pages |
| offers, closed tab | (in the request above) | (in the request above) | 4 ms · 649 pages |
| deals, complete tab | (in the request above) | (in the request above) | 9 ms · 1,688 pages |

## One person with a creator profile and six brands: 9,566 offers, 4,781 deals, 8,620 conversations, 71,436 notifications

| Screen | Before stage one | The migration alone (the app as it was) | Stage one (migration and app) |
|---|---|---|---|
| every page | 1.4 s · 926,106 pages · **answer cut off at 1,000 rows** | 35 ms · 26,835 pages · **answer cut off at 1,000 rows** | 30 ms · 28,804 pages |
| dashboard | 393 ms · 278,373 pages · **answer cut off at 1,000 rows** | 99 ms · 222,185 pages · **answer cut off at 1,000 rows** | 107 ms · 87,527 pages |
| offers | **fails: over the 8 s limit** | 325 ms · 246,101 pages | 4 ms · 1,388 pages |
| one offer | 4 ms · 83 pages | 3 ms · 47 pages | 2 ms · 47 pages |
| deals | 364 ms · 208,446 pages · **answer cut off at 1,000 rows** | 124 ms · 137,698 pages · **answer cut off at 1,000 rows** | 8 ms · 1,491 pages |
| one deal | 500 ms · 86,738 pages | 4 ms · 134 pages | 4 ms · 134 pages |
| messages | **fails: over the 8 s limit** | 11 ms · 1,713 pages | 4 ms · 437 pages |
| one conversation | 5 ms · 74 pages | 4 ms · 76 pages | 3 ms · 76 pages |
| their longest conversation | 5 ms · 49 pages | 3 ms · 892 pages | 4 ms · 892 pages |
| payments | 371 ms · 125,932 pages | 102 ms · 85,393 pages | 107 ms · 84,727 pages |
| settings | 139 ms · 114,755 pages | 1 ms · 4 pages | 2 ms · 4 pages |
| offers, closed tab | (in the request above) | (in the request above) | 4 ms · 636 pages |
| deals, complete tab | (in the request above) | (in the request above) | 8 ms · 1,639 pages |

## The busiest brand on GameIn (an agency): 36,886 offers, 18,685 deals, 29,068 conversations, 93,758 notifications

| Screen | Before stage one | The migration alone (the app as it was) | Stage one (migration and app) |
|---|---|---|---|
| every page | 1.8 s · 1,197,739 pages · **answer cut off at 1,000 rows** | 31 ms · 11,290 pages · **answer cut off at 1,000 rows** | 123 ms · 108,701 pages |
| dashboard | 626 ms · 342,517 pages · **answer cut off at 1,000 rows** | 427 ms · 393,343 pages · **answer cut off at 1,000 rows** | 409 ms · 334,569 pages |
| offers | **fails: over the 8 s limit** | **fails: over the 8 s limit** | 5 ms · 1,395 pages |
| one offer | 4 ms · 80 pages | 4 ms · 51 pages | 2 ms · 51 pages |
| deals | 638 ms · 261,915 pages · **answer cut off at 1,000 rows** | 407 ms · 61,626 pages · **answer cut off at 1,000 rows** | 6 ms · 1,355 pages |
| one deal | 408 ms · 86,729 pages | 8 ms · 113 pages | 5 ms · 113 pages |
| messages | **fails: over the 8 s limit** | 9 ms · 1,713 pages | 6 ms · 437 pages |
| one conversation | 5 ms · 85 pages | 5 ms · 95 pages | 5 ms · 95 pages |
| their longest conversation | 7 ms · 90 pages | 7 ms · 5,436 pages | 7 ms · 5,436 pages |
| payments | 572 ms · 231,291 pages | 462 ms · 332,627 pages | 407 ms · 331,964 pages |
| settings | 119 ms · 116,646 pages | 2 ms · 4 pages | 2 ms · 4 pages |
| offers, closed tab | (in the request above) | (in the request above) | 4 ms · 674 pages |
| deals, complete tab | (in the request above) | (in the request above) | 8 ms · 1,449 pages |

## GameIn staff: 31 offers, 13 deals, 31 conversations, 0 notifications

| Screen | Before stage one | The migration alone (the app as it was) | Stage one (migration and app) |
|---|---|---|---|
| every page | 1.5 s · 50,310 pages | 4 ms · 184 pages | 12 ms · 320 pages |
| dashboard | 1.6 s · 54,459 pages | 3 ms · 718 pages | 8 ms · 1,174 pages |
| offers | 2.4 s · 44,771 pages | 4 ms · 822 pages | 4 ms · 183 pages |
| one offer | 5 ms · 95 pages | 3 ms · 79 pages | 4 ms · 79 pages |
| deals | 1.5 s · 54,454 pages | 3 ms · 713 pages | 6 ms · 533 pages |
| one deal | 2.4 s · 86,729 pages | 4 ms · 169 pages | 4 ms · 169 pages |
| messages | 1.8 s · 23,218 pages | 6 ms · 635 pages | 5 ms · 515 pages |
| one conversation | 5 ms · 119 pages | 4 ms · 121 pages | 4 ms · 121 pages |
| their longest conversation | 4 ms · 58 pages | 4 ms · 130 pages | 4 ms · 130 pages |
| payments | 549 ms · 23,446 pages | 3 ms · 107 pages | 3 ms · 107 pages |
| settings | 2 ms · 67 pages | 2 ms · 4 pages | 6 ms · 4 pages |
| offers, closed tab | (in the request above) | (in the request above) | 5 ms · 661 pages |
| deals, complete tab | (in the request above) | (in the request above) | 5 ms · 258 pages |

## Public pages and search

| Request | Before stage one | The migration alone (the app as it was) | Stage one (migration and app) |
|---|---|---|---|
| landing page · featured creators | 126 ms · 7,478 pages | 2 ms · 33 pages | 3 ms · 33 pages |
| a creator’s page · the creator, by handle | 111 ms · 7,415 pages | 2 ms · 89 pages | 3 ms · 89 pages |
| directory · first page | 131 ms · 7,550 pages | 3 ms · 123 pages | 3 ms · 123 pages |
| directory · page 200 | 161 ms · 25,146 pages | 35 ms · 22,525 pages | 31 ms · 22,525 pages |
| directory · search "storm" (many) | 117 ms · 7,550 pages | 222 ms · 174,523 pages | 16 ms · 2,342 pages |
| directory · search "RoyalPanda 300" (a few) | 109 ms · 7,459 pages | 4 ms · 141 pages | 4 ms · 151 pages |
| directory · search, no match | 99 ms · 7,454 pages | 243 ms · 201,229 pages | 3 ms · 19 pages |
| directory · search "st" | 110 ms · 7,550 pages | 10 ms · 5,937 pages | 14 ms · 5,943 pages |
| new offer · find a brand "nova" | 19 ms · 209 pages | 12 ms · 11,432 pages | 3 ms · 279 pages |

## Moves

The slowest of each move across the people above (each is one transaction; measured, then rolled back).

| Move | Before stage one | The migration alone (the app as it was) | Stage one (migration and app) |
|---|---|---|---|
| send a message | 5 ms | 9 ms | 8 ms |
| send an offer | 6 ms | 6 ms | 4 ms |
| mark a conversation read | 3 ms | 3 ms | 2 ms |
| mark notifications read | 21 ms | 26 ms | 23 ms |
| accept an offer | 884 ms | 35 ms | 14 ms |
| fund escrow | 7 ms | 21 ms | 13 ms |
| approve proof | 4 ms | 4 ms | 4 ms |
| request a payout | 12 ms | 13 ms | 11 ms |

## Scheduled jobs

| Job | Before stage one | The migration alone (the app as it was) | Stage one (migration and app) |
|---|---|---|---|
| release what is due (every 10 s) | 1.0 s · 409,218 pages | 1 ms · 3 pages | 1 ms · 3 pages |
| expire old offers (every minute) | 1 ms · 2 pages | 1 ms · 2 pages | 1 ms · 2 pages |

## Many people at once

`db/bench/load.mjs`: 16 simulated people open the dashboard, offers, deals and messages one after another without a pause, as accounts picked at random (1 visit in 100 is one of the three busiest), for 40 seconds. The people, the API and the database share the machine’s two cores: a database with a server to itself serves more.

| | Before stage one | The migration alone (the app as it was) | Stage one (migration and app) |
|---|---|---|---|
| Screens served a second | 3.6 | 5.3 | 127.5 |
| Half the screens took under | 3.3 s | 460 ms | 104 ms |
| 95 in 100 took under | 10.5 s | 8.8 s | 272 ms |
| The slowest | 14.3 s (the person with seven seats, dashboard) | 16.4 s (an ordinary creator, dashboard) | 4.5 s (the busiest brand, dashboard) |
| Requests that failed | 13 of 478: 1 stopped at the time limit, 12 found no free connection for ten seconds | 50 of 764: 50 stopped at the time limit | none of 18,809 |
| Answers cut off at 1,000 rows | 2 | 3 | none |

## Every request

<details><summary>Before stage one</summary>

**the busiest brand on GameIn (an agency)**

| Request | Time | In the database | Pages | Rows | |
|---|---:|---:|---:|---:|---|
| every page · your seats | 6 ms | 3 ms | 322 | 1 | reads all of brand_members (33,338 rows) |
| every page · the bell | 1.8 s | 2.1 s | 1,088,853 | 30 |  |
| every page · badges | 834 ms | 2.1 s | 108,564 | 1000 | cut off at 1,000 rows; reads all of offers (999,659 rows) |
| dashboard · deals (latest 200) | 626 ms | 677 ms | 170,034 | 200 |  |
| dashboard · money of every deal | 407 ms | 421 ms | 91,881 | 1000 | cut off at 1,000 rows |
| dashboard · brand money | 525 ms | 555 ms | 80,602 | 1 | reads all of milestones (1,502,293 rows); reads all of payments (851,404 rows) |
| offers · offers (latest 200) |  |  |  |  | over the time limit |
| one offer · the offer | 4 ms | 1 ms | 58 | 1 |  |
| one offer · its versions | 2 ms | 1 ms | 22 | 2 |  |
| deals · deals (latest 200) | 638 ms | 653 ms | 170,034 | 200 |  |
| deals · money of every deal | 467 ms | 430 ms | 91,881 | 1000 | cut off at 1,000 rows |
| one deal · the deal | 408 ms | 405 ms | 54,212 | 1 |  |
| one deal · its money | 242 ms | 238 ms | 32,517 | 1 |  |
| messages · conversations (latest 100) |  |  |  |  | over the time limit |
| one conversation · the conversation | 5 ms | 1 ms | 32 | 1 |  |
| one conversation · its last 200 lines | 4 ms | 2 ms | 53 | 20 |  |
| their longest conversation · its last 200 lines | 7 ms | 8 ms | 90 | 200 |  |
| payments · brand money | 572 ms | 661 ms | 80,602 | 1 | reads all of milestones (1,502,293 rows); reads all of payments (851,404 rows) |
| payments · payments (latest 100) | 396 ms | 456 ms | 150,689 | 100 | reads all of payments (425,702 rows) |
| settings · your name | 119 ms | 87 ms | 116,646 | 1 |  |
| moves · send a message | 4 ms |  |  | 1 |  |
| moves · send an offer | 6 ms |  |  | 1 |  |
| moves · mark a conversation read | 3 ms |  |  | 1 |  |
| moves · mark notifications read | 21 ms |  |  | 1 |  |
| moves · accept an offer | 692 ms |  |  | 1 |  |
| moves · fund escrow | 7 ms |  |  | 1 |  |
| moves · approve proof | 4 ms |  |  | 1 |  |

**an ordinary brand (the middle of the range)**

| Request | Time | In the database | Pages | Rows | |
|---|---:|---:|---:|---:|---|
| every page · your seats | 7 ms | 4 ms | 322 | 1 | reads all of brand_members (33,338 rows) |
| every page · the bell | 4 ms | 2 ms | 751 | 30 |  |
| every page · badges | 532 ms | 495 ms | 91,483 | 8 | reads all of offers (625,704 rows); reads all of conversations (1,806,492 rows) |
| dashboard · deals (latest 200) | 129 ms | 135 ms | 21,829 | 13 |  |
| dashboard · money of every deal | 184 ms | 177 ms | 32,625 | 13 |  |
| dashboard · brand money | 228 ms | 323 ms | 46,796 | 1 | reads all of payments (851,404 rows) |
| offers · offers (latest 200) | 241 ms | 240 ms | 44,767 | 31 | reads all of offers (1,871,743 rows) |
| one offer · the offer | 4 ms | 2 ms | 62 | 1 |  |
| one offer · its versions | 3 ms | 1 ms | 24 | 4 |  |
| deals · deals (latest 200) | 120 ms | 117 ms | 21,829 | 13 |  |
| deals · money of every deal | 160 ms | 166 ms | 32,625 | 13 |  |
| one deal · the deal | 318 ms | 298 ms | 54,212 | 1 |  |
| one deal · its money | 169 ms | 163 ms | 32,517 | 1 |  |
| messages · conversations (latest 100) | 114 ms | 103 ms | 22,262 | 31 | reads all of conversations (904,338 rows) |
| one conversation · the conversation | 4 ms | 1 ms | 39 | 1 |  |
| one conversation · its last 200 lines | 4 ms | 1 ms | 64 | 24 |  |
| their longest conversation · its last 200 lines | 3 ms | 1 ms | 47 | 24 |  |
| payments · brand money | 197 ms | 210 ms | 46,796 | 1 | reads all of payments (851,404 rows) |
| payments · payments (latest 100) | 112 ms | 112 ms | 23,441 | 10 | reads all of payments (425,702 rows) |
| settings · your name | 3 ms | 1 ms | 201 | 1 |  |
| moves · send a message | 3 ms |  |  | 1 |  |
| moves · send an offer | 4 ms |  |  | 1 |  |
| moves · mark a conversation read | 2 ms |  |  | 1 |  |
| moves · mark notifications read | 2 ms |  |  | 1 |  |
| moves · accept an offer | 476 ms |  |  | 1 |  |
| moves · fund escrow | 5 ms |  |  | 1 |  |
| moves · approve proof | 2 ms |  |  | 1 |  |

**an ordinary creator (the middle of the range)**

| Request | Time | In the database | Pages | Rows | |
|---|---:|---:|---:|---:|---|
| every page · your seats | 4 ms | 3 ms | 319 | 1 | reads all of brand_members (33,338 rows) |
| every page · the bell | 4 ms | 1 ms | 46 | 3 |  |
| every page · badges | 154 ms | 127 ms | 33,254 | 0 | reads all of conversations (985,766 rows) |
| dashboard · deals (latest 200) | 3 ms | 1 ms | 3 | 0 |  |
| dashboard · money of every deal | 2 ms | 1 ms | 3 | 0 |  |
| dashboard · wallet | 3 ms | 2 ms | 32 | 1 |  |
| dashboard · ready to deliver | 217 ms | 231 ms | 35,466 | 0 | reads all of deliverables (1,502,293 rows) |
| dashboard · your packages | 3 ms | 1 ms | 9 | 2 |  |
| offers · offers (latest 200) | 130 ms | 115 ms | 23,716 | 2 | reads all of offers (1,000,511 rows) |
| one offer · the offer | 5 ms | 2 ms | 59 | 1 |  |
| one offer · its versions | 2 ms | 1 ms | 21 | 1 |  |
| deals · deals (latest 200) | 3 ms | 1 ms | 3 | 0 |  |
| deals · money of every deal | 2 ms | 1 ms | 3 | 0 |  |
| messages · conversations (latest 100) | 111 ms | 31 ms | 12,359 | 2 | reads all of conversations (162,989 rows) |
| one conversation · the conversation | 5 ms | 2 ms | 47 | 1 |  |
| one conversation · its last 200 lines | 4 ms | 1 ms | 62 | 8 |  |
| their longest conversation · its last 200 lines | 4 ms | 2 ms | 62 | 8 |  |
| wallet · wallet | 3 ms | 1 ms | 32 | 1 |  |
| wallet · wallet lines (latest 100) | 4 ms | 2 ms | 9 | 0 |  |
| packages · your packages | 3 ms | 1 ms | 9 | 2 |  |
| settings · your name | 31 ms | 21 ms | 10,378 | 1 |  |
| moves · send a message | 5 ms |  |  | 1 |  |
| moves · mark a conversation read | 3 ms |  |  | 1 |  |
| moves · mark notifications read | 4 ms |  |  | 1 |  |
| moves · request a payout | 6 ms |  |  |  | refused: Nothing to pay out yet |

**one person with a creator profile and six brands**

| Request | Time | In the database | Pages | Rows | |
|---|---:|---:|---:|---:|---|
| every page · your seats | 9 ms | 6 ms | 338 | 7 | reads all of brand_members (33,338 rows) |
| every page · the bell | 1.4 s | 1.6 s | 834,902 | 30 |  |
| every page · badges | 696 ms | 1.1 s | 90,866 | 1000 | cut off at 1,000 rows; reads all of offers (999,922 rows) |
| dashboard · deals (latest 200) | 283 ms | 304 ms | 63,985 | 200 |  |
| dashboard · money of every deal | 360 ms | 493 ms | 144,467 | 1000 | cut off at 1,000 rows |
| dashboard · brand money | 393 ms | 414 ms | 69,921 | 1 | reads all of payments (851,404 rows) |
| offers · offers (latest 200) |  |  |  |  | over the time limit |
| one offer · the offer | 4 ms | 1 ms | 60 | 1 |  |
| one offer · its versions | 2 ms | 1 ms | 23 | 1 |  |
| deals · deals (latest 200) | 293 ms | 320 ms | 63,985 | 200 |  |
| deals · money of every deal | 364 ms | 487 ms | 144,461 | 1000 | cut off at 1,000 rows |
| one deal · the deal | 500 ms | 484 ms | 54,218 | 1 |  |
| one deal · its money | 280 ms | 277 ms | 32,520 | 1 |  |
| messages · conversations (latest 100) |  |  |  |  | over the time limit |
| one conversation · the conversation | 5 ms | 2 ms | 32 | 1 |  |
| one conversation · its last 200 lines | 4 ms | 2 ms | 42 | 7 |  |
| their longest conversation · its last 200 lines | 5 ms | 2 ms | 49 | 200 |  |
| payments · brand money | 371 ms | 422 ms | 69,921 | 1 | reads all of payments (851,404 rows) |
| payments · payments (latest 100) | 209 ms | 219 ms | 56,011 | 100 | reads all of payments (425,702 rows) |
| settings · your name | 139 ms | 170 ms | 114,755 | 1 |  |
| moves · send a message | 3 ms |  |  | 1 |  |
| moves · send an offer | 4 ms |  |  | 1 |  |
| moves · mark a conversation read | 3 ms |  |  | 1 |  |
| moves · mark notifications read | 17 ms |  |  | 1 |  |
| moves · accept an offer | 884 ms |  |  | 1 |  |
| moves · fund escrow | 6 ms |  |  | 1 |  |
| moves · approve proof | 3 ms |  |  | 1 |  |

**signed up today, nothing yet**

| Request | Time | In the database | Pages | Rows | |
|---|---:|---:|---:|---:|---|
| every page · your seats | 4 ms | 2 ms | 318 | 0 | reads all of brand_members (33,338 rows) |
| every page · the bell | 3 ms | 1 ms | 4 | 0 |  |

**GameIn staff**

| Request | Time | In the database | Pages | Rows | |
|---|---:|---:|---:|---:|---|
| every page · your seats | 47 ms | 46 ms | 318 | 0 | reads all of brand_members (33,338 rows) |
| every page · the bell | 4 ms | 1 ms | 4 | 0 |  |
| every page · badges | 1.5 s | 2.1 s | 49,988 | 0 | reads all of offers (731,338 rows) |
| dashboard · deals (latest 200) | 1.0 s | 1.1 s | 21,829 | 13 |  |
| dashboard · money of every deal | 1.6 s | 1.7 s | 32,625 | 13 |  |
| dashboard · brand money | 2 ms | 1 ms | 5 | 0 |  |
| offers · offers (latest 200) | 2.4 s | 5.3 s | 44,771 | 31 | reads all of offers (1,871,743 rows) |
| one offer · the offer | 5 ms | 2 ms | 69 | 1 |  |
| one offer · its versions | 2 ms | 1 ms | 26 | 4 |  |
| deals · deals (latest 200) | 949 ms | 1.2 s | 21,829 | 13 |  |
| deals · money of every deal | 1.5 s | 1.6 s | 32,625 | 13 |  |
| one deal · the deal | 2.4 s | 2.9 s | 54,212 | 1 |  |
| one deal · its money | 1.5 s | 1.6 s | 32,517 | 1 |  |
| messages · conversations (latest 100) | 1.8 s | 4.0 s | 23,218 | 31 | reads all of conversations (981,357 rows) |
| one conversation · the conversation | 5 ms | 2 ms | 44 | 1 |  |
| one conversation · its last 200 lines | 5 ms | 4 ms | 75 | 24 |  |
| their longest conversation · its last 200 lines | 4 ms | 3 ms | 58 | 24 |  |
| payments · brand money | 2 ms | 1 ms | 5 | 0 |  |
| payments · payments (latest 100) | 549 ms | 566 ms | 23,441 | 10 | reads all of payments (425,702 rows) |
| settings · your name | 2 ms | 1 ms | 67 | 1 |  |

**the busiest creator on GameIn**

| Request | Time | In the database | Pages | Rows | |
|---|---:|---:|---:|---:|---|
| every page · your seats | 3 ms | 2 ms | 319 | 1 | reads all of brand_members (33,338 rows) |
| every page · the bell | 452 ms | 510 ms | 270,906 | 30 |  |
| every page · badges | 2.8 s |  |  | 855 |  |
| dashboard · deals (latest 200) | 206 ms | 215 ms | 64,028 | 200 |  |
| dashboard · money of every deal | 245 ms | 248 ms | 55,211 | 1000 | cut off at 1,000 rows |
| dashboard · wallet | 453 ms | 454 ms | 98,173 | 1 |  |
| dashboard · ready to deliver | 495 ms | 569 ms | 91,753 | 20 | reads all of deliverables (1,502,293 rows) |
| dashboard · your packages | 2 ms | 1 ms | 4 | 2 |  |
| offers · offers (latest 200) | 2.3 s |  |  | 200 |  |
| one offer · the offer | 4 ms | 1 ms | 63 | 1 |  |
| one offer · its versions | 2 ms | 1 ms | 23 | 2 |  |
| deals · deals (latest 200) | 222 ms | 248 ms | 64,028 | 200 |  |
| deals · money of every deal | 267 ms | 306 ms | 55,211 | 1000 | cut off at 1,000 rows |
| one deal · the deal | 348 ms | 437 ms | 54,217 | 1 |  |
| one deal · its money | 232 ms | 294 ms | 32,520 | 1 |  |
| messages · conversations (latest 100) | 971 ms | 3.0 s | 90,991 | 100 | reads all of conversations (983,563 rows) |
| one conversation · the conversation | 5 ms | 1 ms | 44 | 1 |  |
| one conversation · its last 200 lines | 3 ms | 2 ms | 59 | 4 |  |
| their longest conversation · its last 200 lines | 5 ms | 3 ms | 69 | 200 |  |
| wallet · wallet | 489 ms | 469 ms | 98,173 | 1 |  |
| wallet · wallet lines (latest 100) | 955 ms | 961 ms | 220,301 | 100 | reads all of deals (1,001,400 rows) |
| packages · your packages | 1 ms | 1 ms | 4 | 2 |  |
| settings · your name | 44 ms | 37 ms | 20,046 | 1 |  |
| moves · send a message | 3 ms |  |  | 1 |  |
| moves · mark a conversation read | 2 ms |  |  | 1 |  |
| moves · mark notifications read | 7 ms |  |  | 1 |  |
| moves · accept an offer | 628 ms |  |  | 1 |  |
| moves · request a payout | 12 ms |  |  | 1 |  |

**Public pages and search**

| Request | Time | In the database | Pages | Rows | |
|---|---:|---:|---:|---:|---|
| landing page · featured creators | 126 ms | 132 ms | 7,478 | 6 | reads all of creators (200,000 rows) |
| a creator’s page · the creator, by handle | 111 ms | 104 ms | 7,415 | 1 | reads all of creators (200,000 rows) |
| directory · first page | 131 ms | 152 ms | 7,550 | 24 | reads all of creators (200,000 rows) |
| directory · page 200 | 161 ms | 167 ms | 25,146 | 24 | reads all of creators (200,000 rows) |
| directory · search "storm" (many) | 117 ms | 122 ms | 7,550 | 24 | reads all of creators (200,000 rows) |
| directory · search "RoyalPanda 300" (a few) | 109 ms | 102 ms | 7,459 | 1 | reads all of creators (200,000 rows) |
| directory · search, no match | 99 ms | 98 ms | 7,454 | 0 | reads all of creators (200,000 rows) |
| directory · search "st" | 110 ms | 103 ms | 7,550 | 24 | reads all of creators (200,000 rows) |
| new offer · find a brand "nova" | 19 ms | 15 ms | 209 | 20 | reads all of brands (20,000 rows) |

</details>

<details><summary>The migration alone (the app as it was)</summary>

**the busiest brand on GameIn (an agency)**

| Request | Time | In the database | Pages | Rows | |
|---|---:|---:|---:|---:|---|
| every page · your seats | 4 ms | 1 ms | 12 | 1 |  |
| every page · the bell | 6 ms | 2 ms | 357 | 30 |  |
| every page · badges | 31 ms | 23 ms | 10,921 | 1000 | cut off at 1,000 rows |
| dashboard · deals (latest 200) | 13 ms | 7 ms | 4,255 | 200 |  |
| dashboard · money of every deal | 49 ms | 76 ms | 57,371 | 1000 | cut off at 1,000 rows |
| dashboard · brand money | 427 ms | 480 ms | 331,717 | 1 |  |
| offers · offers (latest 200) |  |  |  |  | over the time limit |
| one offer · the offer | 4 ms | 2 ms | 36 | 1 |  |
| one offer · its versions | 3 ms | 1 ms | 15 | 2 |  |
| deals · deals (latest 200) | 14 ms | 10 ms | 4,255 | 200 |  |
| deals · money of every deal | 407 ms | 80 ms | 57,371 | 1000 | cut off at 1,000 rows |
| one deal · the deal | 8 ms | 3 ms | 76 | 1 |  |
| one deal · its money | 4 ms | 1 ms | 37 | 1 |  |
| messages · conversations (latest 100) | 9 ms | 4 ms | 1,713 | 100 |  |
| one conversation · the conversation | 5 ms | 1 ms | 29 | 1 |  |
| one conversation · its last 200 lines | 4 ms | 1 ms | 66 | 20 |  |
| their longest conversation · its last 200 lines | 7 ms | 6 ms | 5,436 | 200 |  |
| payments · brand money | 462 ms | 491 ms | 331,717 | 1 |  |
| payments · payments (latest 100) | 6 ms | 3 ms | 910 | 100 |  |
| settings · your name | 2 ms | 1 ms | 4 | 1 |  |
| moves · send a message | 9 ms |  |  | 1 |  |
| moves · send an offer | 6 ms |  |  | 1 |  |
| moves · mark a conversation read | 3 ms |  |  | 1 |  |
| moves · mark notifications read | 26 ms |  |  | 1 |  |
| moves · accept an offer | 35 ms |  |  | 1 |  |
| moves · fund escrow | 21 ms |  |  | 1 |  |
| moves · approve proof | 4 ms |  |  | 1 |  |

**an ordinary brand (the middle of the range)**

| Request | Time | In the database | Pages | Rows | |
|---|---:|---:|---:|---:|---|
| every page · your seats | 3 ms | 1 ms | 12 | 1 |  |
| every page · the bell | 5 ms | 1 ms | 367 | 30 |  |
| every page · badges | 4 ms | 5 ms | 164 | 8 |  |
| dashboard · deals (latest 200) | 4 ms | 2 ms | 313 | 13 |  |
| dashboard · money of every deal | 3 ms | 2 ms | 385 | 13 |  |
| dashboard · brand money | 4 ms | 3 ms | 248 | 1 |  |
| offers · offers (latest 200) | 7 ms | 4 ms | 813 | 31 |  |
| one offer · the offer | 4 ms | 2 ms | 44 | 1 |  |
| one offer · its versions | 2 ms | 1 ms | 23 | 4 |  |
| deals · deals (latest 200) | 4 ms | 2 ms | 313 | 13 |  |
| deals · money of every deal | 3 ms | 2 ms | 385 | 13 |  |
| one deal · the deal | 5 ms | 3 ms | 96 | 1 |  |
| one deal · its money | 3 ms | 1 ms | 49 | 1 |  |
| messages · conversations (latest 100) | 5 ms | 2 ms | 629 | 31 |  |
| one conversation · the conversation | 4 ms | 1 ms | 29 | 1 |  |
| one conversation · its last 200 lines | 3 ms | 1 ms | 74 | 24 |  |
| their longest conversation · its last 200 lines | 3 ms | 2 ms | 118 | 24 |  |
| payments · brand money | 3 ms | 2 ms | 248 | 1 |  |
| payments · payments (latest 100) | 4 ms | 1 ms | 99 | 10 |  |
| settings · your name | 2 ms | 1 ms | 4 | 1 |  |
| moves · send a message | 8 ms |  |  | 1 |  |
| moves · send an offer | 5 ms |  |  | 1 |  |
| moves · mark a conversation read | 2 ms |  |  | 1 |  |
| moves · mark notifications read | 2 ms |  |  | 1 |  |
| moves · accept an offer | 28 ms |  |  | 1 |  |
| moves · fund escrow | 17 ms |  |  | 1 |  |
| moves · approve proof | 3 ms |  |  | 1 |  |

**an ordinary creator (the middle of the range)**

| Request | Time | In the database | Pages | Rows | |
|---|---:|---:|---:|---:|---|
| every page · your seats | 2 ms | 1 ms | 6 | 1 |  |
| every page · the bell | 4 ms | 1 ms | 46 | 3 |  |
| every page · badges | 4 ms | 2 ms | 6 | 0 |  |
| dashboard · deals (latest 200) | 3 ms | 1 ms | 3 | 0 |  |
| dashboard · money of every deal | 2 ms | 1 ms | 3 | 0 |  |
| dashboard · wallet | 4 ms | 1 ms | 32 | 1 |  |
| dashboard · ready to deliver | 2.5 s | 2.8 s | 6,033,809 | 0 | reads all of deliverables (1,502,293 rows) |
| dashboard · your packages | 2 ms | 1 ms | 9 | 2 |  |
| offers · offers (latest 200) | 4 ms | 2 ms | 69 | 2 |  |
| one offer · the offer | 3 ms | 2 ms | 45 | 1 |  |
| one offer · its versions | 2 ms | 1 ms | 14 | 1 |  |
| deals · deals (latest 200) | 2 ms | 1 ms | 3 | 0 |  |
| deals · money of every deal | 2 ms | 1 ms | 3 | 0 |  |
| messages · conversations (latest 100) | 3 ms | 1 ms | 55 | 2 |  |
| one conversation · the conversation | 4 ms | 1 ms | 35 | 1 |  |
| one conversation · its last 200 lines | 3 ms | 2 ms | 66 | 8 |  |
| their longest conversation · its last 200 lines | 3 ms | 2 ms | 66 | 8 |  |
| wallet · wallet | 4 ms | 2 ms | 32 | 1 |  |
| wallet · wallet lines (latest 100) | 4 ms | 2 ms | 9 | 0 |  |
| packages · your packages | 2 ms | 1 ms | 9 | 2 |  |
| settings · your name | 2 ms | 1 ms | 4 | 1 |  |
| moves · send a message | 9 ms |  |  | 1 |  |
| moves · mark a conversation read | 3 ms |  |  | 1 |  |
| moves · mark notifications read | 2 ms |  |  | 1 |  |
| moves · request a payout | 5 ms |  |  |  | refused: Nothing to pay out yet |

**one person with a creator profile and six brands**

| Request | Time | In the database | Pages | Rows | |
|---|---:|---:|---:|---:|---|
| every page · your seats | 2 ms | 1 ms | 28 | 7 |  |
| every page · the bell | 4 ms | 1 ms | 358 | 30 |  |
| every page · badges | 35 ms | 29 ms | 26,449 | 1000 | cut off at 1,000 rows |
| dashboard · deals (latest 200) | 13 ms | 7 ms | 4,288 | 200 |  |
| dashboard · money of every deal | 91 ms | 173 ms | 133,414 | 1000 | cut off at 1,000 rows |
| dashboard · brand money | 99 ms | 110 ms | 84,483 | 1 |  |
| offers · offers (latest 200) | 325 ms | 345 ms | 246,101 | 200 |  |
| one offer · the offer | 3 ms | 1 ms | 36 | 1 |  |
| one offer · its versions | 2 ms | 1 ms | 11 | 1 |  |
| deals · deals (latest 200) | 10 ms | 7 ms | 4,288 | 200 |  |
| deals · money of every deal | 124 ms | 136 ms | 133,410 | 1000 | cut off at 1,000 rows |
| one deal · the deal | 4 ms | 2 ms | 89 | 1 |  |
| one deal · its money | 2 ms | 1 ms | 45 | 1 |  |
| messages · conversations (latest 100) | 11 ms | 7 ms | 1,713 | 100 |  |
| one conversation · the conversation | 4 ms | 1 ms | 29 | 1 |  |
| one conversation · its last 200 lines | 3 ms | 1 ms | 47 | 7 |  |
| their longest conversation · its last 200 lines | 3 ms | 3 ms | 892 | 200 |  |
| payments · brand money | 102 ms | 100 ms | 84,483 | 1 |  |
| payments · payments (latest 100) | 4 ms | 2 ms | 910 | 100 |  |
| settings · your name | 1 ms | 1 ms | 4 | 1 |  |
| moves · send a message | 6 ms |  |  | 1 |  |
| moves · send an offer | 3 ms |  |  | 1 |  |
| moves · mark a conversation read | 2 ms |  |  | 1 |  |
| moves · mark notifications read | 18 ms |  |  | 1 |  |
| moves · accept an offer | 27 ms |  |  | 1 |  |
| moves · fund escrow | 13 ms |  |  | 1 |  |
| moves · approve proof | 4 ms |  |  | 1 |  |

**signed up today, nothing yet**

| Request | Time | In the database | Pages | Rows | |
|---|---:|---:|---:|---:|---|
| every page · your seats | 2 ms | 1 ms | 5 | 0 |  |
| every page · the bell | 4 ms | 1 ms | 4 | 0 |  |

**GameIn staff**

| Request | Time | In the database | Pages | Rows | |
|---|---:|---:|---:|---:|---|
| every page · your seats | 2 ms | 1 ms | 5 | 0 |  |
| every page · the bell | 4 ms | 1 ms | 4 | 0 |  |
| every page · badges | 3 ms | 4 ms | 175 | 0 |  |
| dashboard · deals (latest 200) | 3 ms | 1 ms | 319 | 13 |  |
| dashboard · money of every deal | 3 ms | 2 ms | 394 | 13 |  |
| dashboard · brand money | 2 ms | 1 ms | 5 | 0 |  |
| offers · offers (latest 200) | 4 ms | 3 ms | 822 | 31 |  |
| one offer · the offer | 3 ms | 2 ms | 53 | 1 |  |
| one offer · its versions | 3 ms | 1 ms | 26 | 4 |  |
| deals · deals (latest 200) | 3 ms | 2 ms | 319 | 13 |  |
| deals · money of every deal | 3 ms | 2 ms | 394 | 13 |  |
| one deal · the deal | 4 ms | 3 ms | 111 | 1 |  |
| one deal · its money | 2 ms | 1 ms | 58 | 1 |  |
| messages · conversations (latest 100) | 6 ms | 4 ms | 635 | 31 |  |
| one conversation · the conversation | 4 ms | 2 ms | 35 | 1 |  |
| one conversation · its last 200 lines | 2 ms | 2 ms | 86 | 24 |  |
| their longest conversation · its last 200 lines | 4 ms | 3 ms | 130 | 24 |  |
| payments · brand money | 2 ms | 1 ms | 5 | 0 |  |
| payments · payments (latest 100) | 3 ms | 1 ms | 102 | 10 |  |
| settings · your name | 2 ms | 1 ms | 4 | 1 |  |

**the busiest creator on GameIn**

| Request | Time | In the database | Pages | Rows | |
|---|---:|---:|---:|---:|---|
| every page · your seats | 2 ms | 1 ms | 6 | 1 |  |
| every page · the bell | 5 ms | 1 ms | 365 | 30 |  |
| every page · badges | 14 ms | 11 ms | 5,111 | 855 |  |
| dashboard · deals (latest 200) | 10 ms | 7 ms | 4,938 | 200 |  |
| dashboard · money of every deal | 65 ms | 174 ms | 163,431 | 1000 | cut off at 1,000 rows |
| dashboard · wallet | 129 ms | 134 ms | 173,726 | 1 |  |
| dashboard · ready to deliver | 2.5 s | 2.6 s | 6,088,503 | 20 | reads all of deliverables (1,502,293 rows) |
| dashboard · your packages | 2 ms | 1 ms | 4 | 2 |  |
| offers · offers (latest 200) | 248 ms | 220 ms | 196,471 | 200 |  |
| one offer · the offer | 3 ms | 1 ms | 45 | 1 |  |
| one offer · its versions | 2 ms | 1 ms | 18 | 2 |  |
| deals · deals (latest 200) | 11 ms | 13 ms | 4,938 | 200 |  |
| deals · money of every deal | 63 ms | 159 ms | 163,425 | 1000 | cut off at 1,000 rows |
| one deal · the deal | 4 ms | 3 ms | 115 | 1 |  |
| one deal · its money | 2 ms | 1 ms | 62 | 1 |  |
| messages · conversations (latest 100) | 7 ms | 6 ms | 2,016 | 100 |  |
| one conversation · the conversation | 4 ms | 1 ms | 35 | 1 |  |
| one conversation · its last 200 lines | 2 ms | 2 ms | 50 | 4 |  |
| their longest conversation · its last 200 lines | 4 ms | 2 ms | 924 | 200 |  |
| wallet · wallet | 108 ms | 121 ms | 173,726 | 1 |  |
| wallet · wallet lines (latest 100) | 364 ms | 300 ms | 306,691 | 100 |  |
| packages · your packages | 2 ms | 1 ms | 4 | 2 |  |
| settings · your name | 1 ms | 1 ms | 4 | 1 |  |
| moves · send a message | 8 ms |  |  | 1 |  |
| moves · mark a conversation read | 2 ms |  |  | 1 |  |
| moves · mark notifications read | 6 ms |  |  | 1 |  |
| moves · accept an offer | 17 ms |  |  | 1 |  |
| moves · request a payout | 13 ms |  |  | 1 |  |

**Public pages and search**

| Request | Time | In the database | Pages | Rows | |
|---|---:|---:|---:|---:|---|
| landing page · featured creators | 2 ms | 1 ms | 33 | 6 |  |
| a creator’s page · the creator, by handle | 2 ms | 1 ms | 89 | 1 |  |
| directory · first page | 3 ms | 1 ms | 123 | 24 |  |
| directory · page 200 | 35 ms | 34 ms | 22,525 | 24 |  |
| directory · search "storm" (many) | 222 ms | 223 ms | 174,523 | 24 |  |
| directory · search "RoyalPanda 300" (a few) | 4 ms | 1 ms | 141 | 1 |  |
| directory · search, no match | 243 ms | 238 ms | 201,229 | 0 |  |
| directory · search "st" | 10 ms | 7 ms | 5,937 | 24 |  |
| new offer · find a brand "nova" | 12 ms | 9 ms | 11,432 | 20 |  |

</details>

<details><summary>Stage one (migration and app)</summary>

**the busiest brand on GameIn (an agency)**

| Request | Time | In the database | Pages | Rows | |
|---|---:|---:|---:|---:|---|
| every page · your seats | 3 ms | 1 ms | 12 | 1 |  |
| every page · the bell | 5 ms | 1 ms | 357 | 30 |  |
| every page · badges | 123 ms | 135 ms | 108,332 | 3 |  |
| dashboard · what waits on you (first 20) | 3 ms | 4 ms | 229 | 20 |  |
| dashboard · active deals | 5 ms | 2 ms | 546 | 25 |  |
| dashboard · money of those deals | 4 ms | 1 ms | 809 | 25 |  |
| dashboard · deals to fund | 3 ms | 1 ms | 543 | 20 |  |
| dashboard · money of those deals | 3 ms | 2 ms | 721 | 20 |  |
| dashboard · brand money | 409 ms | 462 ms | 331,721 | 1 |  |
| offers · your turn | 5 ms | 2 ms | 753 | 25 |  |
| offers · waiting on them | 3 ms | 2 ms | 642 | 25 |  |
| offers, closed tab · closed | 4 ms | 2 ms | 674 | 25 |  |
| one offer · the offer | 2 ms | 1 ms | 36 | 1 |  |
| one offer · its versions | 2 ms | 1 ms | 15 | 2 |  |
| deals · active deals | 3 ms | 2 ms | 546 | 25 |  |
| deals · money of those deals | 3 ms | 2 ms | 809 | 25 |  |
| deals · how many are active | 4 ms |  |  | 11249 |  |
| deals, complete tab · finished deals | 4 ms | 2 ms | 568 | 25 |  |
| deals, complete tab · money of those deals | 4 ms | 3 ms | 881 | 25 |  |
| one deal · the deal | 5 ms | 3 ms | 76 | 1 |  |
| one deal · its money | 3 ms | 2 ms | 37 | 1 |  |
| messages · conversations | 6 ms | 3 ms | 437 | 25 |  |
| one conversation · the conversation | 3 ms | 1 ms | 29 | 1 |  |
| one conversation · its last 200 lines | 5 ms | 1 ms | 66 | 20 |  |
| their longest conversation · its last 200 lines | 7 ms | 4 ms | 5,436 | 200 |  |
| payments · brand money | 407 ms | 475 ms | 331,721 | 1 |  |
| payments · payments | 5 ms | 1 ms | 243 | 25 |  |
| settings · your name | 2 ms | 1 ms | 4 | 1 |  |
| moves · send a message | 7 ms |  |  | 1 |  |
| moves · send an offer | 4 ms |  |  | 1 |  |
| moves · mark a conversation read | 2 ms |  |  | 1 |  |
| moves · mark notifications read | 23 ms |  |  | 1 |  |
| moves · accept an offer | 14 ms |  |  | 1 |  |
| moves · fund escrow | 13 ms |  |  | 1 |  |
| moves · approve proof | 2 ms |  |  | 1 |  |

**an ordinary brand (the middle of the range)**

| Request | Time | In the database | Pages | Rows | |
|---|---:|---:|---:|---:|---|
| every page · your seats | 2 ms | 1 ms | 12 | 1 |  |
| every page · the bell | 4 ms | 1 ms | 367 | 30 |  |
| every page · badges | 8 ms | 5 ms | 301 | 3 |  |
| dashboard · what waits on you (first 20) | 3 ms | 3 ms | 165 | 8 |  |
| dashboard · active deals | 3 ms | 1 ms | 225 | 9 |  |
| dashboard · money of those deals | 3 ms | 2 ms | 293 | 9 |  |
| dashboard · deals to fund | 3 ms | 1 ms | 190 | 7 |  |
| dashboard · money of those deals | 2 ms | 1 ms | 253 | 7 |  |
| dashboard · brand money | 2 ms | 1 ms | 249 | 1 |  |
| offers · your turn | 2 ms | 2 ms | 102 | 3 |  |
| offers · waiting on them | 3 ms | 2 ms | 63 | 2 |  |
| offers, closed tab · closed | 4 ms | 3 ms | 652 | 25 |  |
| one offer · the offer | 3 ms | 2 ms | 44 | 1 |  |
| one offer · its versions | 2 ms | 1 ms | 23 | 4 |  |
| deals · active deals | 4 ms | 1 ms | 225 | 9 |  |
| deals · money of those deals | 2 ms | 1 ms | 293 | 9 |  |
| deals · how many are active | 3 ms |  |  | 9 |  |
| deals, complete tab · finished deals | 4 ms | 1 ms | 106 | 4 |  |
| deals, complete tab · money of those deals | 3 ms | 1 ms | 137 | 4 |  |
| one deal · the deal | 4 ms | 3 ms | 96 | 1 |  |
| one deal · its money | 2 ms | 1 ms | 49 | 1 |  |
| messages · conversations | 4 ms | 2 ms | 509 | 25 |  |
| one conversation · the conversation | 3 ms | 1 ms | 29 | 1 |  |
| one conversation · its last 200 lines | 3 ms | 2 ms | 74 | 24 |  |
| their longest conversation · its last 200 lines | 4 ms | 2 ms | 118 | 24 |  |
| payments · brand money | 5 ms | 3 ms | 249 | 1 |  |
| payments · payments | 4 ms | 2 ms | 99 | 10 |  |
| settings · your name | 3 ms | 1 ms | 4 | 1 |  |
| moves · send a message | 8 ms |  |  | 1 |  |
| moves · send an offer | 4 ms |  |  | 1 |  |
| moves · mark a conversation read | 2 ms |  |  | 1 |  |
| moves · mark notifications read | 2 ms |  |  | 1 |  |
| moves · accept an offer | 14 ms |  |  | 1 |  |
| moves · fund escrow | 11 ms |  |  | 1 |  |
| moves · approve proof | 4 ms |  |  | 1 |  |

**an ordinary creator (the middle of the range)**

| Request | Time | In the database | Pages | Rows | |
|---|---:|---:|---:|---:|---|
| every page · your seats | 2 ms | 1 ms | 6 | 1 |  |
| every page · the bell | 3 ms | 1 ms | 46 | 3 |  |
| every page · badges | 6 ms | 4 ms | 142 | 0 |  |
| dashboard · what waits on you (first 20) | 4 ms | 2 ms | 6 | 0 |  |
| dashboard · active deals | 3 ms | 1 ms | 3 | 0 |  |
| dashboard · wallet | 3 ms | 2 ms | 32 | 1 |  |
| dashboard · ready to deliver | 4 ms | 1 ms | 3 | 0 |  |
| dashboard · your packages | 3 ms | 1 ms | 9 | 2 |  |
| offers · your turn | 4 ms | 1 ms | 3 | 0 |  |
| offers · waiting on them | 2 ms | 1 ms | 3 | 0 |  |
| offers, closed tab · closed | 4 ms | 1 ms | 69 | 2 |  |
| one offer · the offer | 3 ms | 1 ms | 45 | 1 |  |
| one offer · its versions | 2 ms | 1 ms | 14 | 1 |  |
| deals · active deals | 3 ms | 1 ms | 3 | 0 |  |
| deals · how many are active | 2 ms |  |  | 0 |  |
| deals, complete tab · finished deals | 3 ms | 1 ms | 3 | 0 |  |
| messages · conversations | 5 ms | 1 ms | 55 | 2 |  |
| one conversation · the conversation | 3 ms | 1 ms | 35 | 1 |  |
| one conversation · its last 200 lines | 2 ms | 1 ms | 66 | 8 |  |
| their longest conversation · its last 200 lines | 2 ms | 2 ms | 66 | 8 |  |
| wallet · wallet | 3 ms | 2 ms | 32 | 1 |  |
| wallet · wallet lines | 4 ms | 2 ms | 9 | 0 |  |
| packages · your packages | 2 ms | 1 ms | 9 | 2 |  |
| settings · your name | 2 ms | 1 ms | 4 | 1 |  |
| moves · send a message | 8 ms |  |  | 1 |  |
| moves · mark a conversation read | 2 ms |  |  | 1 |  |
| moves · mark notifications read | 2 ms |  |  | 1 |  |
| moves · request a payout | 3 ms |  |  |  | refused: Nothing to pay out yet |

**one person with a creator profile and six brands**

| Request | Time | In the database | Pages | Rows | |
|---|---:|---:|---:|---:|---|
| every page · your seats | 2 ms | 1 ms | 28 | 7 |  |
| every page · the bell | 4 ms | 1 ms | 358 | 30 |  |
| every page · badges | 30 ms | 40 ms | 28,418 | 3 |  |
| dashboard · what waits on you (first 20) | 4 ms | 3 ms | 224 | 20 |  |
| dashboard · active deals | 5 ms | 2 ms | 595 | 25 |  |
| dashboard · money of those deals | 4 ms | 3 ms | 897 | 25 |  |
| dashboard · deals to fund | 4 ms | 2 ms | 570 | 20 |  |
| dashboard · money of those deals | 4 ms | 2 ms | 757 | 20 |  |
| dashboard · brand money | 107 ms | 108 ms | 84,484 | 1 |  |
| offers · your turn | 4 ms | 2 ms | 744 | 25 |  |
| offers · waiting on them | 4 ms | 2 ms | 644 | 25 |  |
| offers, closed tab · closed | 4 ms | 3 ms | 636 | 25 |  |
| one offer · the offer | 2 ms | 1 ms | 36 | 1 |  |
| one offer · its versions | 2 ms | 1 ms | 11 | 1 |  |
| deals · active deals | 4 ms | 2 ms | 594 | 25 |  |
| deals · money of those deals | 3 ms | 4 ms | 897 | 25 |  |
| deals · how many are active | 8 ms |  |  | 2894 |  |
| deals, complete tab · finished deals | 4 ms | 2 ms | 624 | 25 |  |
| deals, complete tab · money of those deals | 3 ms | 2 ms | 1,015 | 25 |  |
| one deal · the deal | 4 ms | 3 ms | 89 | 1 |  |
| one deal · its money | 2 ms | 1 ms | 45 | 1 |  |
| messages · conversations | 4 ms | 1 ms | 437 | 25 |  |
| one conversation · the conversation | 3 ms | 1 ms | 29 | 1 |  |
| one conversation · its last 200 lines | 2 ms | 1 ms | 47 | 7 |  |
| their longest conversation · its last 200 lines | 4 ms | 2 ms | 892 | 200 |  |
| payments · brand money | 107 ms | 103 ms | 84,484 | 1 |  |
| payments · payments | 4 ms | 2 ms | 243 | 25 |  |
| settings · your name | 2 ms | 1 ms | 4 | 1 |  |
| moves · send a message | 7 ms |  |  | 1 |  |
| moves · send an offer | 4 ms |  |  | 1 |  |
| moves · mark a conversation read | 2 ms |  |  | 1 |  |
| moves · mark notifications read | 19 ms |  |  | 1 |  |
| moves · accept an offer | 11 ms |  |  | 1 |  |
| moves · fund escrow | 12 ms |  |  | 1 |  |
| moves · approve proof | 3 ms |  |  | 1 |  |

**signed up today, nothing yet**

| Request | Time | In the database | Pages | Rows | |
|---|---:|---:|---:|---:|---|
| every page · your seats | 2 ms | 1 ms | 5 | 0 |  |
| every page · the bell | 4 ms | 1 ms | 4 | 0 |  |

**GameIn staff**

| Request | Time | In the database | Pages | Rows | |
|---|---:|---:|---:|---:|---|
| every page · your seats | 2 ms | 1 ms | 5 | 0 |  |
| every page · the bell | 3 ms | 1 ms | 4 | 0 |  |
| every page · badges | 12 ms | 7 ms | 311 | 0 |  |
| dashboard · what waits on you (first 20) | 4 ms | 6 ms | 175 | 0 |  |
| dashboard · active deals | 4 ms | 2 ms | 234 | 9 |  |
| dashboard · money of those deals | 4 ms | 2 ms | 302 | 9 |  |
| dashboard · deals to fund | 4 ms | 2 ms | 196 | 7 |  |
| dashboard · money of those deals | 3 ms | 2 ms | 262 | 7 |  |
| dashboard · brand money | 2 ms | 2 ms | 5 | 0 |  |
| offers · your turn | 4 ms | 3 ms | 111 | 3 |  |
| offers · waiting on them | 4 ms | 3 ms | 72 | 2 |  |
| offers, closed tab · closed | 5 ms | 4 ms | 661 | 25 |  |
| one offer · the offer | 4 ms | 2 ms | 53 | 1 |  |
| one offer · its versions | 2 ms | 1 ms | 26 | 4 |  |
| deals · active deals | 3 ms | 1 ms | 231 | 9 |  |
| deals · money of those deals | 2 ms | 1 ms | 302 | 9 |  |
| deals · how many are active | 2 ms |  |  | 9 |  |
| deals, complete tab · finished deals | 3 ms | 1 ms | 112 | 4 |  |
| deals, complete tab · money of those deals | 2 ms | 1 ms | 146 | 4 |  |
| one deal · the deal | 4 ms | 3 ms | 111 | 1 |  |
| one deal · its money | 3 ms | 1 ms | 58 | 1 |  |
| messages · conversations | 5 ms | 2 ms | 515 | 25 |  |
| one conversation · the conversation | 4 ms | 1 ms | 35 | 1 |  |
| one conversation · its last 200 lines | 4 ms | 3 ms | 86 | 24 |  |
| their longest conversation · its last 200 lines | 4 ms | 2 ms | 130 | 24 |  |
| payments · brand money | 2 ms | 1 ms | 5 | 0 |  |
| payments · payments | 3 ms | 1 ms | 102 | 10 |  |
| settings · your name | 6 ms | 1 ms | 4 | 1 |  |

**the busiest creator on GameIn**

| Request | Time | In the database | Pages | Rows | |
|---|---:|---:|---:|---:|---|
| every page · your seats | 2 ms | 1 ms | 6 | 1 |  |
| every page · the bell | 4 ms | 1 ms | 365 | 30 |  |
| every page · badges | 24 ms | 15 ms | 7,021 | 2 |  |
| dashboard · what waits on you (first 20) | 6 ms | 3 ms | 213 | 20 |  |
| dashboard · active deals | 5 ms | 3 ms | 678 | 25 |  |
| dashboard · money of those deals | 4 ms | 3 ms | 912 | 25 |  |
| dashboard · wallet | 107 ms | 171 ms | 173,726 | 1 |  |
| dashboard · ready to deliver | 41 ms | 40 ms | 58,794 | 20 |  |
| dashboard · your packages | 2 ms | 1 ms | 4 | 2 |  |
| offers · your turn | 4 ms | 3 ms | 662 | 25 |  |
| offers · waiting on them | 4 ms | 3 ms | 735 | 25 |  |
| offers, closed tab · closed | 4 ms | 3 ms | 649 | 25 |  |
| one offer · the offer | 3 ms | 2 ms | 45 | 1 |  |
| one offer · its versions | 2 ms | 1 ms | 18 | 2 |  |
| deals · active deals | 4 ms | 2 ms | 678 | 25 |  |
| deals · money of those deals | 3 ms | 2 ms | 912 | 25 |  |
| deals · how many are active | 9 ms |  |  | 2258 |  |
| deals, complete tab · finished deals | 5 ms | 3 ms | 688 | 25 |  |
| deals, complete tab · money of those deals | 4 ms | 3 ms | 1,000 | 25 |  |
| one deal · the deal | 5 ms | 4 ms | 115 | 1 |  |
| one deal · its money | 3 ms | 2 ms | 62 | 1 |  |
| messages · conversations | 5 ms | 2 ms | 515 | 25 |  |
| one conversation · the conversation | 3 ms | 1 ms | 35 | 1 |  |
| one conversation · its last 200 lines | 3 ms | 2 ms | 50 | 4 |  |
| their longest conversation · its last 200 lines | 4 ms | 3 ms | 924 | 200 |  |
| wallet · wallet | 138 ms | 119 ms | 173,726 | 1 |  |
| wallet · wallet lines | 353 ms | 254 ms | 306,691 | 25 |  |
| packages · your packages | 1 ms | 1 ms | 4 | 2 |  |
| settings · your name | 1 ms | 1 ms | 4 | 1 |  |
| moves · send a message | 6 ms |  |  | 1 |  |
| moves · mark a conversation read | 2 ms |  |  | 1 |  |
| moves · mark notifications read | 5 ms |  |  | 1 |  |
| moves · accept an offer | 12 ms |  |  | 1 |  |
| moves · request a payout | 11 ms |  |  | 1 |  |

**Public pages and search**

| Request | Time | In the database | Pages | Rows | |
|---|---:|---:|---:|---:|---|
| landing page · featured creators | 3 ms | 1 ms | 33 | 6 |  |
| a creator’s page · the creator, by handle | 3 ms | 1 ms | 89 | 1 |  |
| directory · first page | 3 ms | 1 ms | 123 | 24 |  |
| directory · page 200 | 31 ms | 38 ms | 22,525 | 24 |  |
| directory · search "storm" (many) | 16 ms | 13 ms | 2,342 | 24 |  |
| directory · search "RoyalPanda 300" (a few) | 4 ms | 2 ms | 151 | 1 |  |
| directory · search, no match | 3 ms | 1 ms | 19 | 0 |  |
| directory · search "st" | 14 ms | 12 ms | 5,943 | 24 |  |
| new offer · find a brand "nova" | 3 ms | 1 ms | 279 | 20 |  |

</details>
