# Amethyst privacy notice

Last changed: 18 November 2026

This notice covers the Amethyst desktop app and the website amethyst.run. Amethyst is developed by Daniel Klecki. Contact: support@amethyst.run.

## The app

### What stays on your computer

Amethyst has no accounts and sends me nothing unless you say yes to the install count below: no usage statistics, no crash reports and no telemetry. What it keeps stays on your computer:

- settings, workspaces, chat history and usage figures in `%APPDATA%\Amethyst`;
- each project's notes and agent data in the project's `.amethyst` folder.

Uninstalling Amethyst may leave these folders behind. Delete them to remove that data.

### The install count

I'm one person building Amethyst, and I'd love to know how many people actually use it. So the app asks you once, in the welcome page (or, if you already had it, once after updating): "Can I count you?" Nothing is sent unless you say yes. You can change your answer any time in settings → updates → "count this install".

If you say yes, once a day the app sends amethyst.run one request with:

- the app's version (for example 0.9.3);
- four yes/no answers: is this the first time ever, did it just update, is it the first time this week, is it the first time this month.

That's all. No ID, no name, no computer name, nothing about your projects, agents or files. The four answers are how I count new users, updates, and weekly and monthly users without needing an ID: each install says "first this week" once a week, so adding those up gives the weekly users. The server adds 1 to a few daily, weekly and monthly counts, and keeps nothing else.

- I never store your IP address. To stop one network from flooding the counts, the server keeps, in memory only and only for the day, how many requests came from it, under the same kind of random-looking code as the website's visitor ID.
- The counts are kept up to 400 days, then deleted.
- Settings → general shows exactly what was sent last, and when.
- Once 100 or more people a month are counted, the website shows that monthly total, rounded down (for example "310+ people used Amethyst this month"). Only the total, nothing else.
- Railway, the host, keeps its own short request logs (see "The host" below).

### Update checks

Amethyst checks GitHub for a newer version when it starts, at 12:00 and when you open its settings, and downloads updates from GitHub. GitHub receives your IP address, the time and the files the updater asks for, under [GitHub's privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement). I don't receive any of it.

### GitHub features

When you use source control, Amethyst checks that GitHub can be reached and runs your own `git` and GitHub CLI (`gh`) with your own GitHub login. Pushes and new repositories go to GitHub under your account.

### AI agents

The agents you start in Amethyst, such as Claude Code, the Codex CLI and the Antigravity CLI, send your prompts and the files and command output they read to their providers (Anthropic, OpenAI or Google), under your account and their terms. When you ask Amethyst to write a commit message, it sends the changes you are committing to your Claude agent in the same way. Amethyst does not send any of this to me.

### Web pages

Pages you open in Amethyst's browser tabs load directly from their websites, as in any browser.

## The website

I keep simple visitor statistics for amethyst.run, to see how many people come by and what they look at. Nothing I keep says who you are.

### What I keep

- Daily counts: page views, visitors, new visitors and clicks on the Discord button.
- Which website sent you here, by its name only (for example github.com).
- A visitor ID, with the last day it was seen, so a returning visitor isn't counted as new.
- For 5 minutes after a page view: that page and the minute, to see how many people are on the site right now.

### The visitor ID

The server makes it from your network (your IP address without its last part), your browser's name and a secret value. It is a random-looking code that doesn't lead back to you, and I only use it for the counts above.

### What I don't keep or do

- I never store your IP address.
- No cookies, and nothing stored in your browser.
- No outside scripts, trackers, ads or analytics services.
- No profiles, and nothing shared or sold.

### How long I keep it

Counts are kept up to 400 days, and a visitor ID until 400 days after its last visit. Then they are deleted.

### The host

The site and the install count run on [Railway](https://railway.com). Like most hosts, Railway keeps its own short technical logs of the requests it handles, such as your IP address, browser name, the page and the time, for up to 30 days, to run and protect its service. I don't use those logs for counting. Railway's privacy policy: [railway.com/legal/privacy](https://railway.com/legal/privacy).

## Discord

The Discord buttons open the Amethyst server on [Discord](https://discord.com), under Discord's own privacy policy. If you write to me there, I see your Discord name and what you post, and I use it only to answer you and to improve Amethyst.

## Your rights

You can ask what I hold about you, and ask me to correct or delete it, by writing to support@amethyst.run. The app sends me nothing that identifies you (the install count has no ID) and the website keeps nothing that identifies you, so there is usually nothing to look up. You can also complain to Datatilsynet, the Norwegian Data Protection Authority, at [datatilsynet.no](https://www.datatilsynet.no).

## Changes

If Amethyst or the website starts sending or keeping something new, this notice will say so first, with a new date at the top.

Data controller: Daniel Klecki, support@amethyst.run.
