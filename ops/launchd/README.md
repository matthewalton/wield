# launchd recipe — daily local push of personal skills

**Status:** v1 (2026-07-12), Baton #120

The local delivery leg (`wield push`, [docs/delivery.md](../../docs/delivery.md)) stamps
samples at push time, and the dashboard panels read the map through
`last_over_time(skill_meta[25h])` — so personal skills stay on the dashboard only while
the push re-runs at least daily. Scheduling is deliberately not the CLI's job
(src/push/decisions/0001); this directory holds the macOS scheduling recipe instead:
a LaunchAgent that runs `npm run push -- --root ~` from your wield checkout every day
at 09:17.

## Install

From the repo root:

```sh
sed -e "s|__WIELD_REPO__|$PWD|" \
    -e "s|__NODE_BIN__|$(dirname "$(command -v node)")|" \
    -e "s|__HOME__|$HOME|" \
    ops/launchd/com.wield.push.plist > ~/Library/LaunchAgents/com.wield.push.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.wield.push.plist
```

The `__NODE_BIN__` substitution bakes your node's bin directory into the job's `PATH` —
launchd starts jobs with a bare `PATH` and sources no shell profile, so an nvm- or
homebrew-installed node is invisible without it. Re-run the install after switching
node versions under nvm (the baked path pins the version).

## Secrets

The job reads the same gitignored `.env` the CI leg is seeded from
([docs/delivery.md §Secrets](../../docs/delivery.md)) out of the repo working
directory at run time. Nothing is copied into the plist or LaunchAgents — rotating
the token means editing `.env` only.

## Verify

Fire it once by hand and check the report:

```sh
launchctl kickstart gui/$(id -u)/com.wield.push
tail ~/Library/Logs/wield-push.log
```

A healthy run ends with the push slice's series-count report naming the endpoint
(PUSH-9). Exit codes and failure messages are the CLI's own
([src/push/SPEC.md](../../src/push/SPEC.md)); the log carries both stdout and stderr.

## Missed runs

launchd is kinder than cron on a laptop: a `StartCalendarInterval` run missed while
the machine was **asleep** fires once on wake. A run missed while the machine was
**powered off** is skipped entirely — after a multi-day shutdown, kickstart by hand
(or just wait for the next 09:17) and expect the panels blank until then, per the
freshness rules in docs/delivery.md.

## Uninstall

```sh
launchctl bootout gui/$(id -u)/com.wield.push
rm ~/Library/LaunchAgents/com.wield.push.plist
```
