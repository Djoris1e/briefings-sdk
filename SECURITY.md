# Security policy

## Scope

Security fixes target the current source on the default branch of this
repository. Include the exact Git commit when reporting a problem.

## Report a vulnerability

Report privately to the repository maintainers through GitHub private
vulnerability reporting on this repository: open the repository's **Security**
tab and choose **Report a vulnerability**. Do not open a public issue,
discussion or pull request containing exploit details, credentials, customer
data or an unannounced vulnerability.

Include the affected commit, impact, reproduction steps and any suggested
mitigation. Maintainers will validate the report and coordinate a fix and any
disclosure; there is no guaranteed response time.

For the server controls a host must put around `createBriefingHandler`
(authentication, provider credentials, request limits, media policy, logging),
read the [integration security guide](docs/security.md).
