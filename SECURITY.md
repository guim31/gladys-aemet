# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **The AEMET OpenData API key**, stored by Gladys in the integration
  configuration. It travels only in the `api_key` header of the requests to
  `https://opendata.aemet.es`, never in a URL, and is never written to the
  logs. The `datos` URLs AEMET returns are only followed when they point to
  `https://opendata.aemet.es/` itself.
- **`/data/aemet-state.json`**, the only file written: the master data of the
  configured towns (public), their nearest station, and the warnings already
  announced. No secret, no personal data.
- **The coordinates of the Gladys houses** (manifest `location: true`), read
  only when the user runs "Find the nearest town", to pick the nearest town.
  They are not stored nor sent anywhere: the search runs in the container
  against the public town list.
- **Network**: outgoing HTTPS to `opendata.aemet.es` only. No port is opened,
  nothing is listened to.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and AEMET OpenData.
