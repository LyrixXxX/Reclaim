# Reclaim testing backlog

Closed-testing submission: version code 4, app version 1.0.3, release name “Reclaim 4 (1.0.3) CT”. Keep that submitted AAB unchanged while it is in review.

## Ideas and improvements

Add new ideas here as they come up. Record what should change and why; decide priority before the next release.

## Tester reports

Record the app version, device, steps to reproduce, expected result, and actual result. Avoid including personal health data in this file.

## Release cautions

- Local APK builds are separate from the AAB submitted to Google Play. Building an APK does not update testers through Play.
- A Play-installed app may be signed with Google's app-signing key rather than the local APK's upload key. If Android rejects an in-place install, do not uninstall a data-bearing copy just to force it.
- A local APK with a version code higher than 4 may not be replaced by Play's version 4 when review completes. Use a spare device or a separate test app ID for experimental builds.
- Do not upload a new AAB to the closed-testing track just to test an idea locally. Bundle validated changes into a later numbered Play release.
