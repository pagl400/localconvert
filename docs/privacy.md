---
title: Privacy Policy
layout: default
permalink: /privacy/
---

# Privacy Policy — LocalConvert

_Effective: 2026-05-16_

LocalConvert is a file-conversion app built with privacy in mind. We do
not collect, store, transmit, or sell any personal information. The
entire conversion happens on your device.

## What we collect

**Nothing.** LocalConvert has no accounts, no login, no analytics, no
crash-reporting SDK, no advertising network, and no third-party
trackers. We do not have a server-side database of users. No file you
convert is ever uploaded anywhere.

## What stays on your device

The following data is kept locally on your device through the operating
system's standard key-value storage and never leaves the device:

- Your theme and quality preferences.
- Your conversion history (file names, source/target format, sizes, and
  timestamps) — only if "Keep conversion history" is enabled.
- Temporary files created during a conversion (deleted automatically
  after export if "Auto-clean temp files" is enabled).

This local data is deleted when you tap "Clear history" in the Settings
screen, when you disable history, or when you uninstall the app.

## What is sent over the internet

For the conversion itself, **nothing**. LocalConvert performs all
processing on your device using bundled open-source libraries (FFmpeg,
libvips, Ghostscript and similar) — no file content is sent anywhere.

The app may, depending on the install channel, make one kind of
unauthenticated HTTPS request:

1. **App updates (over-the-air)** — `u.expo.dev`. The Expo platform may
   deliver minor JavaScript updates to the app without a new App Store
   release. The request contains only the app version, platform, and a
   randomly generated install identifier — no user data and no file
   content.

The over-the-air channel is operated by [Expo](https://expo.dev/). Their
own data handling is described on their website.

## Permissions

LocalConvert asks only for the permissions strictly required for
on-device file access (Photos / Files / Documents). It does **not**
request network permissions for conversion purposes. The app works
fully offline.

## Children's privacy

The app is suitable for all ages and does not knowingly collect data
from anyone, including children under 16.

## Your rights

We do not process personal data, so the rights under the GDPR
(Articles 15 to 22, including access, rectification, erasure, and
objection) do not directly apply — there is no data on our side to
access, correct, or delete.

If you still have a question or concern about how the app works, contact
us using the address listed in the [Impressum](/localconvert/impressum/).

## Changes to this policy

We may update this policy if the app changes. The "Effective" date at
the top reflects the latest version. The version history is publicly
available in the source repository at
<https://github.com/pagl400/localconvert>.
