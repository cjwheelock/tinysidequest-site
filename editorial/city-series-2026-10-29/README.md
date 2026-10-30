# City article drafts

This branch saves the 20 approved city articles and their planned publication calendar. It does not publish them to tinysidequest.com. GitHub Pages publishes only the main branch.

- `drafts/`: one source JSON file per article, with its title, description, body and planned date.
- `drafts.html`: a readable collection of all 20 articles and the calendar; download and open locally.
- `calendar.json`: the approved order and planned dates, in America/New_York time.

Do not merge this entire branch into main. Each scheduled release publishes only its due article, updates the blog index and sitemap, and verifies the deployed result. The existing publisher reads its local queue and draft sources; this branch is their GitHub backup, not a separate publishing job. Dates in these source files are planned dates, not claims of completed publication.

Chicago uses the approved Opus draft and is scheduled for Saturday, October 31, 2026, at 9 a.m. Eastern. This replaces the earlier Chicago version and October 30 slot. The remaining 19 weekday dates are unchanged, beginning with Paris on Monday, November 2.
